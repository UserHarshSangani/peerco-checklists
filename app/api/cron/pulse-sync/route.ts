import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { addDays, syncOutlet, type PulseLink } from "@/lib/pulse/sync";
import { todayInKolkata } from "@/lib/date";

export const runtime = "nodejs";
export const maxDuration = 300;

// Daily Vercel cron: for every outlet linked to PeerCo Pulse with auto-sync on, pull the last
// 7 days of POS item sales (up to yesterday) and recompute variance. Re-pulling a week each
// morning picks up days that were uploaded to Pulse late. Vercel sends
// "Authorization: Bearer $CRON_SECRET"; anything else is refused.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const { data: links, error } = await service
    .from("outlet_pulse_links")
    .select("outlet_id, pulse_client_id, pulse_client_name, pulse_outlet")
    .eq("auto_sync", true);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const to = addDays(todayInKolkata(), -1);
  const from = addDays(to, -6);
  const results = [];
  for (const link of (links ?? []) as PulseLink[]) {
    const r = await syncOutlet(service, link, from, to, null);
    results.push({ outlet_id: link.outlet_id, ok: r.ok, message: r.message });
  }
  return NextResponse.json({ ok: results.every((r) => r.ok), from, to, results });
}
