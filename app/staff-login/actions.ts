"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isValidPin, normalizeMobile } from "@/lib/team/validate";

export type StaffLoginState = {
  error: "missing" | "invalid" | "locked" | "unavailable" | null;
  lockedUntil?: string;
};

type CheckReply = { ok: boolean; reason?: string; auth_user_id?: string; locked_until?: string };

// Mobile + PIN sign-in for staff. The PIN check (with the same lockout as
// the tablet) runs in the database; on success the server mints a normal
// Supabase session for that staff member's login.
export async function staffLogin(_prev: StaffLoginState, formData: FormData): Promise<StaffLoginState> {
  const mobile = normalizeMobile(String(formData.get("mobile") ?? ""));
  const pin = String(formData.get("pin") ?? "").trim();
  if (!mobile || !isValidPin(pin)) return { error: "missing" };

  let service;
  try {
    service = createServiceRoleClient();
  } catch {
    return { error: "unavailable" };
  }

  const { data, error } = await service.rpc("team_staff_login_check", { p_mobile: mobile, p_pin: pin });
  const reply = data as CheckReply | null;
  if (error || !reply) return { error: "unavailable" };
  if (!reply.ok) {
    return reply.reason === "locked" ? { error: "locked", lockedUntil: reply.locked_until } : { error: "invalid" };
  }

  const { data: authUser } = await service.auth.admin.getUserById(reply.auth_user_id!);
  const email = authUser.user?.email;
  if (!email) return { error: "unavailable" };

  // generateLink only creates the token; nothing is emailed.
  const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return { error: "unavailable" };

  const supabase = await createClient();
  const { error: otpError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (otpError) return { error: "unavailable" };

  redirect("/me");
}
