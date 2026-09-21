import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Always load tools/booking-checker/.env by its own path, regardless of the
// directory this is invoked from (npm run vs. a cron job vs. launchd).
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(here, "..", ".env") });

export type Config = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

// Never logs the values themselves — only whether they're present.
export function loadConfig(): Config {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Copy tools/booking-checker/.env.example to tools/booking-checker/.env " +
        "and fill in the values from your Supabase project settings (never commit this file).",
    );
    process.exit(1);
  }

  return { supabaseUrl, supabaseServiceRoleKey };
}
