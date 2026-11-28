import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listPulseBrands } from "@/lib/pulse/sync";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function caller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isAdmin: false };
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return { supabase, user, isAdmin: data?.role === "peerco_admin" };
}

// GET ?outlet_id=…  The outlet's Pulse link and last sync (RLS: anyone who can manage the
// outlet). PeerCo admins also get the Pulse brands and outlets to link to.
export async function GET(request: Request) {
  const { supabase, user, isAdmin } = await caller();
  if (!user) return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });
  const outletId = new URL(request.url).searchParams.get("outlet_id") ?? "";
  if (!UUID.test(outletId)) return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });

  const { data: link, error } = await supabase
    .from("outlet_pulse_links")
    .select(
      "outlet_id, pulse_client_id, pulse_client_name, pulse_outlet, auto_sync, last_synced_at, last_sync_ok, last_sync_message",
    )
    .eq("outlet_id", outletId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });

  let brands = null;
  let brandsError = null;
  if (isAdmin) {
    try {
      brands = await listPulseBrands();
    } catch (e) {
      brandsError = e instanceof Error ? e.message : String(e);
    }
  }
  return NextResponse.json({ ok: true, link, canEdit: isAdmin, brands, brandsError });
}

// PUT  Link (or re-link) an outlet. PeerCo admins only; RLS enforces it too.
export async function PUT(request: Request) {
  const { supabase, user, isAdmin } = await caller();
  if (!user) return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const outletId = String(body?.outlet_id ?? "");
  const clientId = String(body?.pulse_client_id ?? "");
  const clientName = String(body?.pulse_client_name ?? "").trim();
  const outlet = typeof body?.pulse_outlet === "string" && body.pulse_outlet.trim() ? body.pulse_outlet.trim() : null;
  if (!UUID.test(outletId) || !UUID.test(clientId) || !clientName || clientName.length > 200 || (outlet?.length ?? 0) > 200) {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const { error } = await supabase.from("outlet_pulse_links").upsert(
    {
      outlet_id: outletId,
      pulse_client_id: clientId,
      pulse_client_name: clientName,
      pulse_outlet: outlet,
      auto_sync: body?.auto_sync !== false,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "outlet_id" },
  );
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// DELETE ?outlet_id=…  Unlink. Imported sales stay.
export async function DELETE(request: Request) {
  const { supabase, user, isAdmin } = await caller();
  if (!user) return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  const outletId = new URL(request.url).searchParams.get("outlet_id") ?? "";
  if (!UUID.test(outletId)) return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  const { error } = await supabase.from("outlet_pulse_links").delete().eq("outlet_id", outletId);
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
