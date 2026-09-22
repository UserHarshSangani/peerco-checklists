import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadConfig } from "./config.js";
import { createServiceClient, type ServiceClient } from "./supabase-client.js";
import { isPathAllowed, USER_AGENT } from "./robots.js";
import { getAdapter } from "./adapters/index.js";
import { addDays, todayInKolkata } from "./time.js";
import type { DateResult, DueSource, WindowLabel } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(here, "..", "out");

export type CheckOptions = {
  dryRun: boolean;
  platform?: string;
  days?: number;
  includeInactive: boolean;
  headed: boolean;
  slowMo?: number;
  // Presence of `url` selects direct mode: no database read, no .env, no
  // Supabase contact at all — just this one URL, checked and printed.
  url?: string;
  partySize?: number;
};

type BookingSourceRow = {
  id: string;
  outlet_id: string;
  platform: string;
  label: string | null;
  url: string;
  method: string;
  party_size: number;
  days_ahead: number;
  check_every_hours: number;
  active: boolean;
  last_checked_at: string | null;
  outlets: { name: string } | { name: string }[] | null;
};

function isDue(row: Pick<BookingSourceRow, "last_checked_at" | "check_every_hours">): boolean {
  if (!row.last_checked_at) return true;
  const dueAt = new Date(row.last_checked_at).getTime() + row.check_every_hours * 3_600_000;
  return Date.now() >= dueAt;
}

function outletName(row: BookingSourceRow): string {
  const outlet = Array.isArray(row.outlets) ? row.outlets[0] : row.outlets;
  return outlet?.name ?? "Unknown outlet";
}

function buildDirectSource(options: CheckOptions): DueSource {
  return {
    id: "direct",
    outlet_id: "direct",
    outlet_name: "(direct mode — no outlet)",
    platform: options.platform as DueSource["platform"],
    label: null,
    url: options.url!,
    method: "auto",
    party_size: options.partySize ?? 2,
    days_ahead: options.days ?? 1,
    check_every_hours: 3,
    active: true,
    last_checked_at: null,
  };
}

async function fetchDueSources(
  supabase: ServiceClient,
  platformFilter: string | undefined,
  includeInactive: boolean,
): Promise<DueSource[]> {
  let query = supabase.from("booking_sources").select("*, outlets(name)").eq("method", "auto");
  if (!includeInactive) query = query.eq("active", true);
  if (platformFilter) query = query.eq("platform", platformFilter);

  const { data, error } = await query;
  if (error) throw new Error(`Could not read booking_sources: ${error.message}`);

  return ((data as BookingSourceRow[] | null) ?? []).filter(isDue).map((row) => ({
    id: row.id,
    outlet_id: row.outlet_id,
    outlet_name: outletName(row),
    platform: row.platform as DueSource["platform"],
    label: row.label,
    url: row.url,
    method: row.method as DueSource["method"],
    party_size: row.party_size,
    days_ahead: row.days_ahead,
    check_every_hours: row.check_every_hours,
    active: row.active,
    last_checked_at: row.last_checked_at,
  }));
}

function sourceLabel(source: DueSource): string {
  return `${source.platform}${source.label ? ` (${source.label})` : ""} — ${source.outlet_name}`;
}

function windowSlots(slots: string[], window: WindowLabel): string[] {
  return slots.filter((t) => t >= window.from && t < window.to);
}

function printDryRunResult(result: DateResult) {
  console.log(`  ${result.targetDate} [${result.status}]`);
  if (result.windowLabels.length === 0) {
    console.log("    No meal-period windows found.");
  }
  for (const window of result.windowLabels) {
    console.log(
      `    ${window.name}: ${window.from}-${window.to} — ${windowSlots(result.slots, window).length} slot(s)`,
    );
  }
  if (result.slots.length > 0) {
    console.log(`    First: ${result.slots[0]}  Last: ${result.slots[result.slots.length - 1]}`);
  }
  if (result.skippedCount) {
    console.log(`    Skipped/unavailable: ${result.skippedCount}`);
  }
  if (result.error) {
    console.log(`    Error: ${result.error}`);
  }
  if (result.screenshotPath) {
    console.log(`    Screenshot saved locally: ${result.screenshotPath}`);
  }
}

function logRpcResult(dateStr: string, data: unknown, error: { message: string } | null) {
  if (error) {
    console.log(`  ${dateStr}: RPC error — ${error.message}`);
    return;
  }
  const res = data as {
    ok: boolean;
    reason?: string;
    slots?: number;
    alerts?: { opened: number; resolved: number; raised: string[] };
  };
  if (!res.ok) {
    console.log(`  ${dateStr}: rejected — ${res.reason}`);
    return;
  }
  const raised = res.alerts?.raised?.length ? `, raised: ${res.alerts.raised.join(", ")}` : "";
  const resolved = res.alerts?.resolved ? `, resolved: ${res.alerts.resolved}` : "";
  console.log(`  ${dateStr}: ok — ${res.slots} slot(s)${raised}${resolved}`);
}

export async function runCheck(options: CheckOptions): Promise<void> {
  const direct = !!options.url;
  console.log(
    `Booking checker — ${options.dryRun ? "DRY RUN (no database writes)" : "real run"}` +
      (direct ? " — direct mode (no database access, .env not read)" : ""),
  );

  let supabase: ServiceClient | null = null;
  let sources: DueSource[];

  if (direct) {
    sources = [buildDirectSource(options)];
    console.log(`Checking ${options.platform} directly at ${options.url}\n`);
  } else {
    const config = loadConfig();
    supabase = createServiceClient(config);

    sources = await fetchDueSources(supabase, options.platform, options.includeInactive);
    if (sources.length === 0) {
      console.log("No due sources found (nothing active, auto, and past its check_every_hours).");
      return;
    }
    console.log(`${sources.length} source(s) due for a check.\n`);
  }

  const headless = !options.headed;
  const slowMo = options.slowMo ?? (options.headed ? 600 : undefined);
  const browser = await chromium.launch({ headless, slowMo });
  const context = await browser.newContext({ viewport: { width: 1366, height: 4000 }, userAgent: USER_AGENT });
  const page = await context.newPage();

  let lastNavigationAt = 0;
  async function onBeforeNavigate() {
    const elapsed = Date.now() - lastNavigationAt;
    if (lastNavigationAt > 0 && elapsed < 3000) {
      await new Promise((resolve) => setTimeout(resolve, 3000 - elapsed));
    }
    lastNavigationAt = Date.now();
  }

  let okCount = 0;
  let failedCount = 0;
  let blockedCount = 0;
  let skippedSources = 0;
  let stopEverything = false;

  try {
    for (const source of sources) {
      if (stopEverything) break;
      const label = sourceLabel(source);

      const adapter = getAdapter(source.platform);
      if (!adapter) {
        console.log(`[${source.platform}] ${label}: no adapter yet — skipping`);
        skippedSources += 1;
        continue;
      }

      const robots = await isPathAllowed(source.url, new URL(source.url).pathname, USER_AGENT);
      if (!robots.allowed) {
        console.log(`[${source.platform}] ${label}: robots.txt disallows this path — stopping for this source`);
        blockedCount += 1;
        if (!options.dryRun) {
          // Only reachable in database mode — direct mode always implies
          // --dry-run (enforced in index.ts), so `supabase` is set here.
          const { data, error } = await supabase!.rpc("submit_booking_snapshot", {
            p_source_id: source.id,
            p_target_date: todayInKolkata(),
            p_slots: [],
            p_status: "blocked",
            p_error: "robots.txt disallows",
            p_window_labels: null,
            p_screenshot_path: null,
            p_party_size: source.party_size,
          });
          logRpcResult(todayInKolkata(), data, error);
        }
        continue;
      }

      const days = Math.max(1, Math.min(options.days ?? source.days_ahead, source.days_ahead));
      const dates = Array.from({ length: days }, (_, i) => addDays(todayInKolkata(), i));
      console.log(`[${source.platform}] ${label}: checking ${dates.length} date(s)`);

      const results = await adapter.checkSource(source, dates, {
        page,
        supabase,
        dryRun: options.dryRun,
        outDir: OUT_DIR,
        onBeforeNavigate,
      });

      for (const result of results) {
        if (result.status === "ok") okCount += 1;
        else if (result.status === "failed") failedCount += 1;
        else blockedCount += 1;

        if (options.dryRun) {
          printDryRunResult(result);
        } else {
          const { data, error } = await supabase!.rpc("submit_booking_snapshot", {
            p_source_id: source.id,
            p_target_date: result.targetDate,
            p_slots: result.slots,
            p_status: result.status,
            p_error: result.error ?? null,
            p_window_labels: result.windowLabels.length > 0 ? result.windowLabels : null,
            p_screenshot_path: result.screenshotPath ?? null,
            p_party_size: source.party_size,
          });
          logRpcResult(result.targetDate, data, error);
        }

        // A live block (CAPTCHA / access-denied / unusual traffic) stops the
        // whole run, not just this source — robots.txt disallows only stop
        // the one source, handled separately above.
        if (result.status === "blocked" && !result.error?.startsWith("robots.txt")) {
          stopEverything = true;
        }
      }
      console.log("");
    }
  } finally {
    await context.close();
    await browser.close();
  }

  console.log("— Summary —");
  console.log(
    `ok: ${okCount}  failed: ${failedCount}  blocked: ${blockedCount}  sources without an adapter: ${skippedSources}`,
  );
  if (stopEverything) {
    console.log("Stopped early after a live block was detected.");
  }
}
