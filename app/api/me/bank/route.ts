import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { encryptText, readKey } from "@/lib/team/bank-crypto";
import { fail } from "@/lib/team/server-access";
import { normalizeAccountNumber, normalizeIfsc } from "@/lib/team/validate";

export const runtime = "nodejs";

// A staff member asks to change their own bank details. The account number
// is encrypted here; the change waits for someone allowed to see pay to
// approve it, so a stolen PIN can't quietly redirect salary.
export async function POST(request: Request) {
  // 1. Who is calling, from their own session — never from the body.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("unauthenticated", 401);

  const { data: me } = await supabase
    .from("staff_profiles")
    .select("staff_id")
    .eq("auth_user_id", user.id)
    .eq("login_enabled", true)
    .maybeSingle();
  if (!me) return fail("forbidden", 403);

  let body: { holder?: unknown; account_number?: unknown; ifsc?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("invalid_body");
  }
  const holder = typeof body.holder === "string" ? body.holder.trim() : "";
  const account = typeof body.account_number === "string" ? normalizeAccountNumber(body.account_number) : null;
  const ifsc = typeof body.ifsc === "string" ? normalizeIfsc(body.ifsc) : null;
  if (!holder || holder.length > 120) return fail("invalid_holder");
  if (!account) return fail("invalid_account");
  if (!ifsc) return fail("invalid_ifsc");

  let encrypted: string;
  try {
    encrypted = encryptText(account, readKey());
  } catch (error) {
    console.error("[me/bank] encryption unavailable:", (error as Error).message);
    return fail("not_configured", 500);
  }

  // 2. Only the server may file the request (the RPC is service-role only).
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("team_request_bank_change", {
    p_staff: me.staff_id,
    p_holder: holder,
    p_account_enc: encrypted,
    p_last4: account.slice(-4),
    p_ifsc: ifsc,
  });
  const reply = data as { ok?: boolean } | null;
  if (error || !reply?.ok) return fail("save_failed", 500);

  return NextResponse.json({ ok: true, last4: account.slice(-4), ifsc });
}
