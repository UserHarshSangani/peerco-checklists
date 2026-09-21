# booking-checker

A standalone Node + Playwright tool that checks booking-platform slots (Swiggy Dineout first) and submits snapshots to Supabase via `submit_booking_snapshot`. It is **not** part of the Next.js app — it has its own `package.json`, is excluded from the app's `tsconfig.json` and ESLint config, and never touches the Vercel deploy.

It is the only place in this codebase allowed to use the Supabase **service role key**. The Next.js app must never see it.

## Setup

1. Install dependencies (this also downloads a headless Chromium build, ~250MB the first time):

   ```bash
   cd tools/booking-checker
   npm install
   ```

2. Create your local, git-ignored env file from the template:

   ```bash
   cp .env.example .env
   ```

3. Open `tools/booking-checker/.env` in an editor and fill in:
   - `SUPABASE_URL` — same value as the app's `NEXT_PUBLIC_SUPABASE_URL`.
   - `SUPABASE_SERVICE_ROLE_KEY` — from Supabase dashboard → Project Settings → API. **Never commit this file, paste it into chat, or log it.** `.env` is already in `.gitignore`.

## Dry-run first

Always start with `--dry-run`. It reads the database (to find due sources) but **writes nothing** — no `submit_booking_snapshot` calls, no Storage uploads. Screenshots are saved locally to `tools/booking-checker/out/` (also git-ignored) instead.

```bash
npm run check -- --dry-run
```

Read the output: for each date it prints the Lunch and Dinner window labels and slot counts, the first and last slot, and anything it couldn't parse or had to skip. Once that looks right for a source, run it for real:

```bash
npm run check
```

Useful flags:

```bash
npm run check -- --dry-run --platform swiggy --days 2   # limit scope while testing
npm run check -- --dry-run --include-inactive           # also dry-run inactive sources
```

- `--platform <platform>` — only check sources for that platform (`--source` still works as an alias).
- `--days <n>` — cap how many of each source's `days_ahead` days to check.
- `--include-inactive` — also read sources where `active = false` (database mode only; still respects the due-time check).

## Watching it work (no database needed)

**Direct mode** checks one URL you give it directly, with no database read and no Supabase contact at all — `tools/booking-checker/.env` is never opened. It always implies `--dry-run` (there's no real source to write a snapshot to):

```bash
npm run check -- --dry-run --headed --platform swiggy \
  --url "https://www.swiggy.com/restaurants/835403/dineout/book" \
  --days 2 --party-size 2
```

- `--url <url>` — the booking page to check directly. Requires `--platform`.
- `--party-size <n>` — party size to select (defaults to 2 in direct mode).
- `--headed` — opens a real, visible Chromium window instead of running headless, so you can watch it pick the guest count, load each date, and click the Lunch and Dinner tabs.
- `--slowmo <ms>` — adds a delay after every Playwright action. Defaults to 600ms automatically when `--headed` is set (0 otherwise); pass it explicitly to override either way.

Direct mode works the same in database mode too — add `--url`/`--headed`/`--slowmo` to a normal run to watch a real due source instead of the whole batch.

## What it does

- Reads `booking_sources` where `method = 'auto'` (plus `active = true` unless `--include-inactive` is set), keeping only sources that are due (`last_checked_at` is null or older than `check_every_hours`). Skipped entirely in direct mode.
- For each due source, checks `robots.txt` first. If the path is disallowed, it stops for that source (and, on a real run, submits a single `blocked` snapshot with error `robots.txt disallows`).
- Platforms without an adapter yet (everything except `swiggy`) are logged as "no adapter yet" and skipped — no error, no snapshot.
- The Swiggy adapter runs one shared Chromium context for the whole invocation, waits at least 3 seconds between page navigations, reads both the Lunch and Dinner tabs (clicking Dinner explicitly, since it isn't always pre-rendered), skips disabled/sold-out slots, and stops the **entire run** the moment it detects a CAPTCHA / access-denied / "unusual traffic" page — never retries around it.
- If a date's page renders zero time buttons, or a bookable time isn't on a 15-minute grid, that date is submitted as `failed` with a screenshot rather than a false empty `ok`.
- Screenshots: a real run captures one screenshot per source (storage-conscious) and reuses it for every date's snapshot. A dry run — direct mode or otherwise — captures and prints one screenshot path per date instead, saved locally under `tools/booking-checker/out/`, so each date can be inspected on its own.

It never adds proxies, stealth/fingerprint-evasion plugins, rotating IPs, or CAPTCHA solving, and it never increases its own request frequency. If a site blocks it, it stops and reports that — it does not try to work around the block.

## Running it every 3 hours

`check_every_hours` on most sources defaults to 3, so a schedule that runs roughly that often keeps sources from going stale. Either of these works; pick whichever you're already comfortable maintaining.

### cron (simplest)

```bash
crontab -e
```

Add:

```
0 */3 * * * cd /path/to/peerco-checklists/tools/booking-checker && /usr/local/bin/node node_modules/.bin/tsx src/index.ts >> out/checker.log 2>&1
```

Adjust the `node` path to match `which node` on your machine, and the repo path to your actual checkout.

### macOS launchd (more reliable across reboots)

Create `~/Library/LaunchAgents/com.peerco.booking-checker.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.peerco.booking-checker</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>node_modules/.bin/tsx</string>
    <string>src/index.ts</string>
  </array>
  <key>WorkingDirectory</key><string>/path/to/peerco-checklists/tools/booking-checker</string>
  <key>StartInterval</key><integer>10800</integer>
  <key>StandardOutPath</key><string>out/checker.log</string>
  <key>StandardErrorPath</key><string>out/checker.log</string>
</dict>
</plist>
```

Load it with:

```bash
launchctl load ~/Library/LaunchAgents/com.peerco.booking-checker.plist
```

### A sleeping laptop misses runs

Both cron and launchd only fire while the machine is awake. If the laptop is asleep when a run is due, that run is simply skipped — it does not queue up or run late, and it does not "catch up" with extra checks once the machine wakes (which is also the right behavior, since more-frequent checking is explicitly out of scope). For a schedule that needs to survive sleep, this tool would need to run somewhere that stays on — that's a deliberate non-goal for now, not an oversight.

## EazyDiner discovery (no adapter yet)

```bash
npm run discover -- --platform eazydiner
```

Opens the EazyDiner link from `booking_sources` in a **headed** browser, checks `robots.txt`, and prints whether slots are visible, which network response(s) look like they carry slot data (URL path and JSON key shape only — never response values), and whether a login is required. It writes nothing to the database and builds no adapter.
