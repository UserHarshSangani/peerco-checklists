import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSettings, type TeamSettings } from "./registry";

// Loads an outlet's effective Team settings (defaults + overrides). Works
// with the browser or server client; RLS limits it to managers/owners/admin.
export async function getTeamSettings(supabase: SupabaseClient, outletId: string): Promise<TeamSettings> {
  const { data, error } = await supabase
    .from("outlet_settings")
    .select("key, value")
    .eq("outlet_id", outletId);
  if (error) throw new Error(error.message);
  return resolveSettings(data ?? []);
}
