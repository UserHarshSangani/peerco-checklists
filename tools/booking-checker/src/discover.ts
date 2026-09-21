// Discovery only — never builds an adapter and never writes to the
// database. Opens the platform's booking page in a HEADED browser, reports
// whether slots are visible, which network response(s) look like they carry
// slot data (URL path + JSON key shape only — never response values, which
// could include personal data), and whether a login is required.

import { chromium } from "playwright";
import { loadConfig } from "./config.js";
import { createServiceClient } from "./supabase-client.js";
import { isPathAllowed, USER_AGENT } from "./robots.js";

const TIME_TEXT_RE = /^\d{1,2}:\d{2}\s?(AM|PM)$/i;
const LOGIN_TEXT_RE = /\b(log ?in|sign ?in)\b/i;

type CapturedResponse = { url: string; status: number; shape: unknown };

function summarizeShape(value: unknown, depth: number): unknown {
  if (depth > 3 || value === null || typeof value !== "object") return typeof value;
  if (Array.isArray(value)) {
    return `array(${value.length})${value.length ? `[0]=${JSON.stringify(summarizeShape(value[0], depth + 1))}` : ""}`;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    out[key] = summarizeShape((value as Record<string, unknown>)[key], depth + 1);
  }
  return out;
}

function parseArgs(argv: string[]): { platform?: string } {
  const options: { platform?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--platform") options.platform = argv[++i];
  }
  return options;
}

async function main() {
  const { platform } = parseArgs(process.argv.slice(2));
  if (!platform) {
    console.error("Usage: npm run discover -- --platform <platform>");
    process.exit(1);
  }

  const config = loadConfig();
  const supabase = createServiceClient(config);

  const { data, error } = await supabase
    .from("booking_sources")
    .select("id, url, outlet_id, outlets(name)")
    .eq("platform", platform)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`Could not read booking_sources: ${error.message}`);
    process.exit(1);
  }
  if (!data) {
    console.log(`No active "${platform}" source found in booking_sources.`);
    return;
  }

  console.log(`Discovering "${platform}" — ${data.url}\n`);

  const robots = await isPathAllowed(data.url, new URL(data.url).pathname, USER_AGENT);
  if (!robots.allowed) {
    console.log("robots.txt disallows this path. Stopping — no page will be opened.");
    return;
  }
  console.log("robots.txt: allowed.\n");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();

  const captured: CapturedResponse[] = [];
  page.on("response", async (response) => {
    const contentType = response.headers()["content-type"] ?? "";
    if (!contentType.includes("application/json")) return;
    try {
      const json = await response.json();
      captured.push({
        url: new URL(response.url()).pathname + new URL(response.url()).search,
        status: response.status(),
        shape: summarizeShape(json, 0),
      });
    } catch {
      // Not parseable JSON — ignore.
    }
  });

  await page.goto(data.url, { waitUntil: "networkidle", timeout: 45_000 }).catch(() => {
    console.log("(page did not reach networkidle within 45s — continuing with what loaded)");
  });
  await page.waitForTimeout(3000);

  // A couple of gentle interactions in case slot data is fetched lazily
  // rather than embedded in the initial page load.
  const secondDate = page.locator("text=/\\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/").nth(1);
  if ((await secondDate.count()) > 0) {
    await secondDate.click().catch(() => undefined);
    await page.waitForTimeout(2000);
  }

  const timeNodes = page.getByText(TIME_TEXT_RE);
  const slotCount = await timeNodes.count();
  const slotsVisible = slotCount > 0;

  const loginNodes = page.getByText(LOGIN_TEXT_RE);
  const loginPromptPresent = (await loginNodes.count()) > 0;

  console.log("— Findings —");
  console.log(`Time-slot-shaped text elements found on the page: ${slotCount}`);
  console.log(`Slots visible without any extra action: ${slotsVisible ? "yes" : "no"}`);
  console.log(
    `A "Login"/"Sign in" prompt is present: ${loginPromptPresent ? "yes" : "no"}` +
      (slotsVisible ? " (but slots render without needing to use it)" : ""),
  );

  console.log(`\nJSON responses captured during load (${captured.length}):`);
  const seenUrls = new Set<string>();
  for (const entry of captured) {
    if (seenUrls.has(entry.url)) continue;
    seenUrls.add(entry.url);
    console.log(`\n  ${entry.status}  ${entry.url}`);
    console.log(`  shape: ${JSON.stringify(entry.shape).slice(0, 500)}`);
  }
  if (captured.length === 0) {
    console.log("  (none — slot data may be embedded in the initial HTML/SSR payload rather than a separate call)");
  }

  console.log(
    "\nNo adapter was built. If one of the responses above looks like the slots endpoint, " +
      "that's the starting point for a future EazyDiner adapter.",
  );

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
