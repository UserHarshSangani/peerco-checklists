import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

type Body = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

function valid(body: Body): body is { endpoint: string; keys: { p256dh: string; auth: string } } {
  return (
    typeof body.endpoint === "string" && body.endpoint.startsWith("https://") && body.endpoint.length <= 1000 &&
    typeof body.keys?.p256dh === "string" && body.keys.p256dh.length <= 200 &&
    typeof body.keys?.auth === "string" && body.keys.auth.length <= 100
  );
}

// Saves this phone's push subscription for the signed-in person. A phone
// handed to someone else moves to them (the endpoint is unique).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!valid(body)) return NextResponse.json({ ok: false, reason: "bad_subscription" }, { status: 400 });

  const admin = createServiceRoleClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      profile_id: data.user.id,
      endpoint: body.endpoint,
      keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Turns alerts off on this phone.
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Body;
  if (typeof body.endpoint !== "string") return NextResponse.json({ ok: false }, { status: 400 });
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
