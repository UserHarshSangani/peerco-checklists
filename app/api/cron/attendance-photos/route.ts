import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { SETTINGS } from "@/lib/team/settings/registry";

export const runtime = "nodejs";

const BUCKET = "attendance-photos";
const BATCH = 500;

// Daily Vercel cron: deletes check-in selfies older than each outlet's
// attendance.photo_retention_days and clears the event's photo_path.
// The attendance record itself is kept. Vercel sends
// "Authorization: Bearer $CRON_SECRET"; anything else is refused.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const [{ data: outlets, error: outletsError }, { data: overrides, error: settingsError }] = await Promise.all([
    supabase.from("outlets").select("id"),
    supabase.from("outlet_settings").select("outlet_id, value").eq("key", "attendance.photo_retention_days"),
  ]);
  if (outletsError || settingsError) {
    return NextResponse.json({ ok: false, error: (outletsError ?? settingsError)!.message }, { status: 500 });
  }

  const def = SETTINGS["attendance.photo_retention_days"];
  const daysFor = new Map((overrides ?? []).map((o) => [o.outlet_id as string, Number(o.value)]));
  let removed = 0;
  const failures: string[] = [];

  for (const { id } of outlets ?? []) {
    const raw = daysFor.get(id);
    const days = Number.isInteger(raw) && raw! >= def.min && raw! <= def.max ? raw! : def.default;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

    for (;;) {
      const { data: events, error } = await supabase
        .from("attendance_events")
        .select("id, photo_path")
        .eq("outlet_id", id)
        .not("photo_path", "is", null)
        .lt("at", cutoff)
        .limit(BATCH);
      if (error) {
        failures.push(`${id}: ${error.message}`);
        break;
      }
      if (!events?.length) break;

      const { error: removeError } = await supabase.storage.from(BUCKET).remove(events.map((e) => e.photo_path as string));
      if (removeError) {
        failures.push(`${id}: ${removeError.message}`);
        break;
      }
      const { error: updateError } = await supabase
        .from("attendance_events")
        .update({ photo_path: null })
        .in("id", events.map((e) => e.id));
      if (updateError) {
        failures.push(`${id}: ${updateError.message}`);
        break;
      }
      removed += events.length;
      if (events.length < BATCH) break;
    }
  }

  if (failures.length) console.error("[cron/attendance-photos]", failures);
  return NextResponse.json({ ok: failures.length === 0, removed, failures: failures.length });
}
