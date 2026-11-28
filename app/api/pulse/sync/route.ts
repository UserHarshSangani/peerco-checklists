import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { addDays, syncOutlet, type PulseLink } from "@/lib/pulse/sync";
import { todayInKolkata } from "@/lib/date";

export const runtime = "nodejs";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_DAYS = new Set([7, 30, 90]);

// POST { outlet_id, days }  "Sync from Pulse" button: pull the last 7 / 30 / 90 days (to
// yesterday) for an outlet the caller can manage, import them and recompute variance.
export async function POST(request: Request) {
  // 1. Who is asking, from THEIR session. Seeing the link row through RLS
  //    (can_manage_outlet) is what allows the sync.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const outletId = String(body?.outlet_id ?? "");
  const days = Number(body?.days ?? 7);
  if (!UUID.test(outletId) || !ALLOWED_DAYS.has(days)) {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const { data: link, error } = await supabase
    .from("outlet_pulse_links")
    .select("outlet_id, pulse_client_id, pulse_client_name, pulse_outlet")
    .eq("outlet_id", outletId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  if (!link) return NextResponse.json({ ok: false, reason: "not_linked" }, { status: 404 });

  // 2. Only now the service-role client, for the import itself.
  const to = addDays(todayInKolkata(), -1);
  const from = addDays(to, -(days - 1));
  const result = await syncOutlet(createServiceRoleClient(), link as PulseLink, from, to, user.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
