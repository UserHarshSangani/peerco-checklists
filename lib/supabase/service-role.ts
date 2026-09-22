import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Full-privilege client, bypassing RLS entirely — never import this from
// anything that can run in the browser. The `server-only` import above
// makes that a build error, not just a convention: bundling this file into
// a Client Component fails `next build` rather than silently shipping the
// service role key to the browser.
//
// Only ever construct this AFTER the caller's own session has been read
// server-side (via lib/supabase/server.ts) and their profiles.role has
// been confirmed to be 'peerco_admin'. This client trusts nothing about
// who's calling it — that check has to happen before this is ever built.
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — admin account creation is unavailable.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
