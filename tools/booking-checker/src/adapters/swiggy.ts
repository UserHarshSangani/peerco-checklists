import type { Page } from "playwright";
import { isOn15MinuteGrid, kolkataMidnightUnixSeconds, to24Hour } from "../time.js";
import { captureScreenshotUnder1MB, saveScreenshotLocally, uploadScreenshot } from "../screenshot.js";
import type { DateResult, DueSource, WindowLabel } from "../types.js";
import type { Adapter, AdapterContext } from "./types.js";

const TIME_TEXT_RE = /^\d{1,2}:\d{2}\s?(AM|PM)$/i;
const WINDOW_LABEL_RE = /^(\d{1,2}:\d{2}\s?[AP]M)\s+to\s+(\d{1,2}:\d{2}\s?[AP]M)$/i;
const SOLD_OUT_RE = /sold out|not available|unavailable|fully booked/i;
const BLOCK_KEYWORDS = [
  "captcha",
  "unusual traffic",
  "access denied",
  "are you a human",
  "verify you are human",
  "automated queries",
];

type MealName = "Lunch" | "Dinner";
type Boundary = { top: number; bottom: number };
type MealSection = {
  present: boolean;
  windowLabel: WindowLabel | null;
  slots: string[];
  skipped: number;
  totalSeen: number;
};

function buildDateUrl(sourceUrl: string, dateStr: string): string {
  const url = new URL(sourceUrl);
  url.searchParams.set("date", String(kolkataMidnightUnixSeconds(dateStr)));
  url.searchParams.set("subPage", "DINEOUT_COMBINED_DEALS_V2");
  url.searchParams.set("datesCount", "5");
  return url.toString();
}

async function detectBlock(page: Page): Promise<string | null> {
  const title = (await page.title().catch(() => "")).toLowerCase();
  const bodyText = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
  const haystack = `${title} ${bodyText}`;
  for (const keyword of BLOCK_KEYWORDS) {
    if (haystack.includes(keyword)) return keyword;
  }
  return null;
}

// Scoped by visible position between the "Number of guest(s)" and "When are
// you visiting?" headings, not by class name (both can change; the labels
// and layout order are far more stable).
async function selectPartySize(page: Page, partySize: number): Promise<void> {
  const heading = page.getByText("Number of guest(s)", { exact: true }).first();
  await heading.waitFor({ state: "visible", timeout: 20_000 });
  const headingBox = await heading.boundingBox();
  if (!headingBox) throw new Error("Guest-size selector not found");

  const nextHeading = page.getByText("When are you visiting?", { exact: true }).first();
  const nextBox = (await nextHeading.count()) > 0 ? await nextHeading.boundingBox() : null;
  const bottom = nextBox && nextBox.y > headingBox.y ? nextBox.y : headingBox.y + 400;

  const candidates = page.getByText(new RegExp(`^${partySize}$`), { exact: true });
  const count = await candidates.count();
  for (let i = 0; i < count; i++) {
    const el = candidates.nth(i);
    const box = await el.boundingBox();
    if (box && box.y > headingBox.y && box.y < bottom) {
      await el.click();
      return;
    }
  }
  throw new Error(`No guest-size option found for party size ${partySize}`);
}

async function getMealBoundary(page: Page, meal: MealName): Promise<Boundary | null> {
  const heading = page.getByText(meal, { exact: true }).first();
  if ((await heading.count()) === 0) return null;
  const box = await heading.boundingBox();
  if (!box) return null;

  if (meal === "Lunch") {
    const dinnerHeading = page.getByText("Dinner", { exact: true }).first();
    const dinnerBox = (await dinnerHeading.count()) > 0 ? await dinnerHeading.boundingBox() : null;
    const bottom = dinnerBox && dinnerBox.y > box.y ? dinnerBox.y : box.y + 3000;
    return { top: box.y, bottom };
  }

  // Dinner is the last section before the "Booking option for ..." panel —
  // use that as a tight lower bound when present, else a generous fallback.
  const marker = page.getByText(/^Booking option for/i).first();
  const markerBox = (await marker.count()) > 0 ? await marker.boundingBox() : null;
  const bottom = markerBox && markerBox.y > box.y ? markerBox.y : box.y + 3000;
  return { top: box.y, bottom };
}

async function countTimeNodesInBand(page: Page, bounds: Boundary): Promise<number> {
  const nodes = page.getByText(TIME_TEXT_RE);
  const count = await nodes.count();
  let seen = 0;
  for (let i = 0; i < count; i++) {
    const box = await nodes.nth(i).boundingBox();
    if (box && box.y >= bounds.top && box.y < bounds.bottom) seen += 1;
  }
  return seen;
}

async function readWindowLabel(page: Page, meal: MealName, bounds: Boundary): Promise<WindowLabel | null> {
  const nodes = page.getByText(WINDOW_LABEL_RE);
  const count = await nodes.count();
  for (let i = 0; i < count; i++) {
    const el = nodes.nth(i);
    const box = await el.boundingBox();
    if (!box || box.y < bounds.top || box.y >= bounds.bottom) continue;
    const text = (await el.innerText()).trim();
    const match = text.match(WINDOW_LABEL_RE);
    if (!match) continue;
    const from = to24Hour(match[1]);
    const to = to24Hour(match[2]);
    if (from && to) return { name: meal, from, to };
  }
  return null;
}

async function readTimeSlots(
  page: Page,
  bounds: Boundary,
): Promise<{ slots: string[]; skipped: number; totalSeen: number }> {
  const nodes = page.getByText(TIME_TEXT_RE);
  const count = await nodes.count();
  const slots: string[] = [];
  let skipped = 0;
  let totalSeen = 0;

  for (let i = 0; i < count; i++) {
    const el = nodes.nth(i);
    const box = await el.boundingBox();
    if (!box || box.y < bounds.top || box.y >= bounds.bottom) continue;
    const rawText = (await el.innerText()).trim();
    if (!TIME_TEXT_RE.test(rawText)) continue;
    totalSeen += 1;

    const container = el.locator("xpath=..").first();
    const containerText = await container.innerText().catch(() => rawText);
    const disabledByText = SOLD_OUT_RE.test(containerText);
    const disabledByStyle = await el
      .evaluate((node) => {
        const style = window.getComputedStyle(node as Element);
        return style.pointerEvents === "none" || Number(style.opacity) < 0.6;
      })
      .catch(() => false);

    if (disabledByText || disabledByStyle) {
      skipped += 1;
      continue;
    }

    const time24 = to24Hour(rawText);
    if (time24) slots.push(time24);
    else skipped += 1;
  }

  return { slots: Array.from(new Set(slots)).sort(), skipped, totalSeen };
}

async function readMeal(page: Page, meal: MealName): Promise<MealSection> {
  let bounds = await getMealBoundary(page, meal);
  if (!bounds) return { present: false, windowLabel: null, slots: [], skipped: 0, totalSeen: 0 };

  let seen = await countTimeNodesInBand(page, bounds);
  if (seen === 0) {
    // Tab may not be rendered yet — click it and give it a moment (do not
    // assume either tab is already loaded).
    const heading = page.getByText(meal, { exact: true }).first();
    await heading.click().catch(() => undefined);
    await page.waitForTimeout(1200);
    bounds = (await getMealBoundary(page, meal)) ?? bounds;
    seen = await countTimeNodesInBand(page, bounds);
  }

  const windowLabel = await readWindowLabel(page, meal, bounds);
  const { slots, skipped, totalSeen } = await readTimeSlots(page, bounds);
  return { present: true, windowLabel, slots, skipped, totalSeen };
}

async function checkOneDate(
  page: Page,
  source: DueSource,
  dateStr: string,
): Promise<{ result: DateResult; blocked: boolean }> {
  const url = buildDateUrl(source.url, dateStr);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(1500); // let the client-rendered app settle

  const blockedKeyword = await detectBlock(page);
  if (blockedKeyword) {
    return {
      blocked: true,
      result: {
        targetDate: dateStr,
        status: "blocked",
        slots: [],
        windowLabels: [],
        error: `Blocked: page mentions "${blockedKeyword}"`,
      },
    };
  }

  try {
    await selectPartySize(page, source.party_size);
  } catch (err) {
    console.warn(`  [swiggy] could not set party size: ${(err as Error).message}`);
  }

  const lunch = await readMeal(page, "Lunch");
  const dinner = await readMeal(page, "Dinner");

  const totalSeen = lunch.totalSeen + dinner.totalSeen;
  const totalSkipped = lunch.skipped + dinner.skipped;
  const slots = Array.from(new Set([...lunch.slots, ...dinner.slots])).sort();
  const windowLabels = [lunch.windowLabel, dinner.windowLabel].filter(
    (w): w is WindowLabel => w !== null,
  );

  if (totalSkipped > 0) {
    console.log(`  [swiggy] ${dateStr}: skipped ${totalSkipped} unavailable slot(s)`);
  }

  if (totalSeen === 0) {
    return {
      blocked: false,
      result: {
        targetDate: dateStr,
        status: "failed",
        slots: [],
        windowLabels: [],
        error: "No time buttons found on the page — layout may have changed",
      },
    };
  }

  const offGrid = slots.find((t) => !isOn15MinuteGrid(t));
  if (offGrid) {
    return {
      blocked: false,
      result: {
        targetDate: dateStr,
        status: "failed",
        slots: [],
        windowLabels: [],
        error: `Slot "${offGrid}" is not on a 15-minute grid`,
      },
    };
  }

  return {
    blocked: false,
    result: { targetDate: dateStr, status: "ok", slots, windowLabels, skippedCount: totalSkipped },
  };
}

async function checkSource(source: DueSource, dates: string[], ctx: AdapterContext): Promise<DateResult[]> {
  const results: DateResult[] = [];
  let screenshotPath: string | null = null;

  async function captureOnce() {
    if (screenshotPath !== null) return;
    const buffer = await captureScreenshotUnder1MB(ctx.page);
    if (ctx.dryRun) {
      screenshotPath = await saveScreenshotLocally(
        buffer,
        ctx.outDir,
        `${source.platform}-${source.id}-${Date.now()}.jpg`,
      );
    } else {
      screenshotPath = await uploadScreenshot(ctx.supabase, source.outlet_id, buffer);
    }
  }

  for (const dateStr of dates) {
    await ctx.onBeforeNavigate();
    const { result, blocked } = await checkOneDate(ctx.page, source, dateStr);
    await captureOnce().catch((err) => {
      console.warn(`  [swiggy] screenshot failed: ${(err as Error).message}`);
    });
    result.screenshotPath = screenshotPath ?? undefined;
    results.push(result);

    if (blocked) {
      console.log(`  [swiggy] blocked on ${dateStr} — stopping the run`);
      break;
    }
  }

  return results;
}

export const swiggyAdapter: Adapter = {
  platform: "swiggy",
  checkSource,
};
