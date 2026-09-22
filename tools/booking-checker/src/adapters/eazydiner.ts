import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isOn15MinuteGrid, normalizeApiTime, to24Hour } from "../time.js";
import { isPathAllowed, USER_AGENT } from "../robots.js";
import type { DateResult, DueSource, WindowLabel } from "../types.js";
import type { Adapter, AdapterContext } from "./types.js";

// Discovered via `npm run discover -- --platform eazydiner`: the page at
// booking_sources.url (www.eazydiner.com/booking/slots?...) is a client
// shell — the actual slot data comes from this separate API host.
const API_HOST = "https://force.eazydiner.com";

// Empirically verified (2026-09-22) against the live endpoint: the same
// date requested with time=12:00 PM, time=08:00 PM and time=06:00 AM
// returned byte-identical meal_periods and slot_timings (only the
// unrelated `is_selected` flag differed). `time` only preselects a slot in
// EazyDiner's own UI — it does not filter availability — so a single fixed
// value is safe to reuse for every request.
const FIXED_TIME = "12:00 PM";

type ApiSlotTiming = {
  text?: unknown;
  value?: unknown;
  confirmed_inventory?: unknown;
};

type ApiMealPeriod = {
  name?: unknown;
  from?: unknown;
  to?: unknown;
  display_time_range?: unknown;
};

type ApiResponse = {
  data?: {
    meal_periods?: unknown;
    slot_timings?: unknown;
    alert_message?: unknown;
  };
};

function extractActionUrl(sourceUrl: string): string {
  const actionUrl = new URL(sourceUrl).searchParams.get("actionUrl");
  if (!actionUrl) {
    throw new Error("Source URL is missing an actionUrl query parameter — cannot determine the restaurant slug");
  }
  return actionUrl;
}

function buildGetSlotsUrl(actionUrl: string, partySize: number, dateStr: string): string {
  const url = new URL(`${API_HOST}/web/2.0/restaurants/${actionUrl}/getSlots`);
  url.searchParams.set("deal_types", "postpaid");
  url.searchParams.set("date", dateStr);
  url.searchParams.set("pax", String(partySize));
  url.searchParams.set("time", FIXED_TIME);
  url.searchParams.set("request_screen", "rdv_main");
  url.searchParams.set("medium", "web");
  return url.toString();
}

// A plain JSON GET, not a Playwright page. Retries only on network-level
// failures (DNS, connection reset, timeout) — a non-2xx HTTP response is
// returned as-is and handled by the caller, not retried.
async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/json, text/plain, */*",
          referer: "https://www.eazydiner.com/",
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function saveDebugJson(outDir: string, filename: string, rawText: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, filename);
  await writeFile(filePath, rawText);
  return filePath;
}

// meal_periods' from/to already come back as 24-hour "HH:MM:SS" in every
// sample seen, but display_time_range ("12:00 PM to 04:30 PM") is kept as a
// fallback in case a future response omits from/to.
function parseMealPeriods(mealPeriods: unknown): { labels: WindowLabel[]; malformed: number } {
  if (!Array.isArray(mealPeriods)) return { labels: [], malformed: -1 };

  const labels: WindowLabel[] = [];
  let malformed = 0;

  for (const entry of mealPeriods) {
    if (!entry || typeof entry !== "object") {
      malformed += 1;
      continue;
    }
    const e = entry as ApiMealPeriod;
    const name = typeof e.name === "string" && e.name.trim() ? e.name.trim() : null;
    let from = typeof e.from === "string" ? normalizeApiTime(e.from) : null;
    let to = typeof e.to === "string" ? normalizeApiTime(e.to) : null;

    if ((!from || !to) && typeof e.display_time_range === "string") {
      const parts = e.display_time_range.split(/\s+to\s+/i);
      if (parts.length === 2) {
        from = from ?? to24Hour(parts[0].trim());
        to = to ?? to24Hour(parts[1].trim());
      }
    }

    if (name && from && to) labels.push({ name, from, to });
    else malformed += 1;
  }

  return { labels, malformed };
}

// Only confirmed_inventory > 0 is bookable; 0 means sold out. `value` is
// already 24-hour ("13:00:00"); `text` (12-hour "01:00 PM") is a fallback.
function parseSlotTimings(
  slotTimings: unknown,
): { slots: string[]; excluded: number; unparsed: number; totalSeen: number } | null {
  if (!Array.isArray(slotTimings)) return null;

  const slots: string[] = [];
  let excluded = 0;
  let unparsed = 0;

  for (const entry of slotTimings) {
    if (!entry || typeof entry !== "object") {
      unparsed += 1;
      continue;
    }
    const e = entry as ApiSlotTiming;
    const inventory = typeof e.confirmed_inventory === "number" ? e.confirmed_inventory : null;
    if (inventory === null) {
      unparsed += 1;
      continue;
    }
    if (inventory <= 0) {
      excluded += 1;
      continue;
    }

    const rawTime = typeof e.value === "string" ? e.value : typeof e.text === "string" ? e.text : null;
    const time24 = rawTime ? normalizeApiTime(rawTime) : null;
    if (time24) slots.push(time24);
    else unparsed += 1;
  }

  return { slots: Array.from(new Set(slots)).sort(), excluded, unparsed, totalSeen: slotTimings.length };
}

function extractAlertMessage(alertMessage: unknown): string | null {
  if (alertMessage === null || alertMessage === undefined) return null;
  if (typeof alertMessage === "string") return alertMessage.trim() || null;
  if (typeof alertMessage === "object") {
    const obj = alertMessage as Record<string, unknown>;
    for (const key of ["text", "message", "title", "description"]) {
      const value = obj[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    try {
      return JSON.stringify(alertMessage);
    } catch {
      return "alert_message present";
    }
  }
  return null;
}

async function checkOneDate(
  actionUrl: string,
  source: DueSource,
  dateStr: string,
  outDir: string,
  saveRaw: boolean,
): Promise<DateResult> {
  const url = buildGetSlotsUrl(actionUrl, source.party_size, dateStr);

  let response: Response;
  let rawText: string;
  try {
    response = await fetchWithRetry(url);
    rawText = await response.text();
  } catch (err) {
    return {
      targetDate: dateStr,
      status: "failed",
      slots: [],
      windowLabels: [],
      error: `Network error calling getSlots: ${(err as Error).message}`,
    };
  }

  if (saveRaw) {
    await saveDebugJson(outDir, `eazydiner-${source.id}-${dateStr}-raw.json`, rawText)
      .then((filePath) => console.log(`  [eazydiner] raw JSON saved for debugging: ${filePath}`))
      .catch((err) => console.warn(`  [eazydiner] could not save debug JSON: ${(err as Error).message}`));
  }

  if (response.status !== 200) {
    return {
      targetDate: dateStr,
      status: "failed",
      slots: [],
      windowLabels: [],
      error: `getSlots returned HTTP ${response.status}`,
    };
  }

  let json: ApiResponse;
  try {
    json = JSON.parse(rawText);
  } catch {
    return {
      targetDate: dateStr,
      status: "failed",
      slots: [],
      windowLabels: [],
      error: "getSlots response was not valid JSON",
    };
  }

  const data = json?.data;
  if (!data || typeof data !== "object") {
    return { targetDate: dateStr, status: "failed", slots: [], windowLabels: [], error: "getSlots response is missing data" };
  }

  const { labels: windowLabels, malformed: mealMalformed } = parseMealPeriods(data.meal_periods);
  if (mealMalformed === -1 || windowLabels.length === 0) {
    return {
      targetDate: dateStr,
      status: "failed",
      slots: [],
      windowLabels: [],
      error: "meal_periods missing or malformed — layout/contract may have changed",
    };
  }

  const slotResult = parseSlotTimings(data.slot_timings);
  if (!slotResult) {
    return {
      targetDate: dateStr,
      status: "failed",
      slots: [],
      windowLabels: [],
      error: "slot_timings missing or malformed — layout/contract may have changed",
    };
  }
  if (slotResult.excluded > 0) {
    console.log(`  [eazydiner] ${dateStr}: excluded ${slotResult.excluded} sold-out slot(s)`);
  }
  if (slotResult.unparsed > 0) {
    console.log(
      `  [eazydiner] ${dateStr}: could not parse ${slotResult.unparsed} slot_timings entr${slotResult.unparsed === 1 ? "y" : "ies"}`,
    );
  }

  const offGrid = slotResult.slots.find((t) => !isOn15MinuteGrid(t));
  if (offGrid) {
    return {
      targetDate: dateStr,
      status: "failed",
      slots: [],
      windowLabels: [],
      error: `Slot "${offGrid}" is not on a reasonable time grid`,
    };
  }

  const alertText = extractAlertMessage(data.alert_message);

  return {
    targetDate: dateStr,
    status: "ok",
    slots: slotResult.slots,
    windowLabels,
    skippedCount: slotResult.excluded,
    error: alertText ?? undefined,
  };
}

async function checkSource(source: DueSource, dates: string[], ctx: AdapterContext): Promise<DateResult[]> {
  let actionUrl: string;
  try {
    actionUrl = extractActionUrl(source.url);
  } catch (err) {
    const message = (err as Error).message;
    return dates.map((dateStr) => ({
      targetDate: dateStr,
      status: "failed" as const,
      slots: [],
      windowLabels: [],
      error: message,
    }));
  }

  // A plain JSON call, but robots.txt still governs it — checked here
  // (rather than only at the check.ts level, which only ever sees
  // booking_sources.url's own www.eazydiner.com origin) because the real
  // request goes to a different host, force.eazydiner.com.
  const sampleUrl = buildGetSlotsUrl(actionUrl, source.party_size, dates[0]);
  const robots = await isPathAllowed(sampleUrl, new URL(sampleUrl).pathname, USER_AGENT);
  if (!robots.allowed) {
    console.log(
      `  [eazydiner] robots.txt on ${new URL(sampleUrl).origin} disallows this path — stopping for this source`,
    );
    return [
      { targetDate: dates[0], status: "blocked", slots: [], windowLabels: [], error: "robots.txt disallows" },
    ];
  }

  const results: DateResult[] = [];
  let savedRaw = false;

  for (const dateStr of dates) {
    await ctx.onBeforeNavigate();
    const result = await checkOneDate(actionUrl, source, dateStr, ctx.outDir, !savedRaw);
    savedRaw = true;
    results.push(result);
  }

  return results;
}

export const eazydinerAdapter: Adapter = {
  platform: "eazydiner",
  checkSource,
};
