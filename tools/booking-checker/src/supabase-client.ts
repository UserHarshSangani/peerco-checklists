import { createClient } from "@supabase/supabase-js";
import type { Config } from "./config.js";

// The ONLY place in this codebase allowed to use the service role key. It
// bypasses RLS entirely, which is exactly what a headless, unauthenticated
// checker needs to read every outlet's booking_sources and submit snapshots
// with entry_method='auto'. Never import this client from the Next.js app.
export function createServiceClient(config: Config) {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type ServiceClient = ReturnType<typeof createServiceClient>;
