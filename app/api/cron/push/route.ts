import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { flushPush } from "@/lib/team/push-send";

export const runtime = "nodejs";

// Sends phone pushes for new notifications. Called every minute by the
// database (pg_net, "Authorization: Bearer $PUSH_FLUSH_SECRET") and by the
// app right after an action that creates notifications (any signed-in
// user). It only ever sends what's already waiting, to its own recipients.
async function handle(request: Request) {
  const auth = request.headers.get("authorization");
  const secrets = [process.env.PUSH_FLUSH_SECRET, process.env.CRON_SECRET].filter(Boolean);
  let allowed = secrets.some((s) => auth === `Bearer ${s}`);
  if (!allowed) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    allowed = Boolean(data.user);
  }
  if (!allowed) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    return NextResponse.json({ ok: true, ...(await flushPush()) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
