import { runCheck, type CheckOptions } from "./check.js";

function parseArgs(argv: string[]): CheckOptions {
  const options: CheckOptions = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--source") options.source = argv[++i];
    else if (arg === "--days") options.days = Number(argv[++i]);
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  if (options.days !== undefined && (!Number.isFinite(options.days) || options.days < 1)) {
    console.error("--days must be a positive number");
    process.exit(1);
  }
  return options;
}

runCheck(parseArgs(process.argv.slice(2))).catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
