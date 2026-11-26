import { NextResponse } from "next/server";
import { encryptText, readKey } from "@/lib/team/bank-crypto";
import { fail, requireStaffAccess } from "@/lib/team/server-access";
import { normalizeAccountNumber, normalizeIfsc } from "@/lib/team/validate";

export const runtime = "nodejs";

// Saves bank details. The account number is encrypted here and never
// returned; only the last four digits are readable afterwards.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireStaffAccess(id, "pay");
  if (access instanceof NextResponse) return access;

  let body: { holder?: unknown; account_number?: unknown; ifsc?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("invalid_body");
  }
  const holder = typeof body.holder === "string" ? body.holder.trim() : "";
  const account = typeof body.account_number === "string" ? normalizeAccountNumber(body.account_number) : null;
  const ifsc = typeof body.ifsc === "string" ? normalizeIfsc(body.ifsc) : null;
  if (!holder) return fail("invalid_holder");
  if (!account) return fail("invalid_account");
  if (!ifsc) return fail("invalid_ifsc");

  let encrypted: string;
  try {
    encrypted = encryptText(account, readKey());
  } catch (error) {
    console.error("[team/bank] encryption unavailable:", (error as Error).message);
    return fail("not_configured", 500);
  }

  const { error } = await access.supabase.rpc("team_set_bank_account", {
    p_staff: id,
    p_holder: holder,
    p_account_enc: encrypted,
    p_last4: account.slice(-4),
    p_ifsc: ifsc,
  });
  if (error) return fail("save_failed", 500);

  return NextResponse.json({ ok: true, last4: account.slice(-4), ifsc });
}
