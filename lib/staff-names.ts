import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

// Looks up staff display names in bulk. Only ever selects id/name — never
// pin_hash, never select("*") on staff.
export async function fetchStaffNames(
  supabase: Supabase,
  staffIds: string[],
): Promise<Record<string, string>> {
  const uniqueIds = Array.from(new Set(staffIds));
  if (uniqueIds.length === 0) return {};

  const { data, error } = await supabase
    .from("staff")
    .select("id, name")
    .in("id", uniqueIds);

  if (error || !data) return {};
  return Object.fromEntries(data.map((row) => [row.id, row.name]));
}
