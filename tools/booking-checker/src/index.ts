import { runCheck, type CheckOptions } from "./check.js";

function parseArgs(argv: string[]): CheckOptions {
  const options: CheckOptions = {
    dryRun: false,
    includeInactive: false,
    headed: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--headed") options.headed = true;
    else if (arg === "--include-inactive") options.includeInactive = true;
    else if (arg === "--platform" || arg === "--source") options.platform = argv[++i];
    else if (arg === "--days") options.days = Number(argv[++i]);
    else if (arg === "--slowmo") options.slowMo = Number(argv[++i]);
    else if (arg === "--url") options.url = argv[++i];
    else if (arg === "--party-size") options.partySize = Number(argv[++i]);
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  if (options.days !== undefined && (!Number.isFinite(options.days) || options.days < 1)) {
    console.error("--days must be a positive number");
    process.exit(1);
  }
  if (options.slowMo !== undefined && (!Number.isFinite(options.slowMo) || options.slowMo < 0)) {
    console.error("--slowmo must be a non-negative number of milliseconds");
    process.exit(1);
  }
  if (options.partySize !== undefined && (!Number.isFinite(options.partySize) || options.partySize < 1)) {
    console.error("--party-size must be a positive number");
    process.exit(1);
  }
  if (options.url) {
    if (!options.platform) {
      console.error("--url requires --platform (e.g. --platform swiggy)");
      process.exit(1);
    }
    if (!options.dryRun) {
      console.error(
        "--url (direct mode) only supports --dry-run — there is no database source to write a real snapshot to.",
      );
      process.exit(1);
    }
  }

  return options;
}

runCheck(parseArgs(process.argv.slice(2))).catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
