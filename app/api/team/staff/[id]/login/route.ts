import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { fail, requireStaffAccess } from "@/lib/team/server-access";
import { staffLoginEmail } from "@/lib/team/validate";

export const runtime = "nodejs";

// Long enough that the account can be suspended for good.
const BAN_FOREVER = "876000h";

type SetLoginReply = { ok: boolean; reason?: string };

// Turns a staff member's phone login on or off. Staff sign in with their
// mobile number and their tablet PIN; the auth user behind it has a random
// password nobody knows and an address that never receives mail.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireStaffAccess(id, "manage");
  if (access instanceof NextResponse) return access;

  let body: { enabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("invalid_body");
  }
  if (typeof body.enabled !== "boolean") return fail("invalid_body");
  const enable = body.enabled;

  // Read with the caller's own session (RLS) — confirms they can see this person.
  const { data: profile } = await access.supabase
    .from("staff_profiles")
    .select("mobile, auth_user_id")
    .eq("staff_id", id)
    .maybeSingle();
  const { data: staff } = await access.supabase.from("staff").select("name, active").eq("id", id).maybeSingle();
  if (!profile || !staff) return fail("no_profile");
  if (enable && !profile.mobile) return fail("no_mobile");
  if (enable && !staff.active) return fail("inactive");

  let service;
  try {
    service = createServiceRoleClient();
  } catch {
    return fail("not_configured", 500);
  }

  let authUserId: string | null = profile.auth_user_id;
  let createdNow = false;

  if (enable && !authUserId) {
    const { data: created, error } = await service.auth.admin.createUser({
      email: staffLoginEmail(id),
      password: randomBytes(32).toString("base64url"),
      email_confirm: true,
      user_metadata: { full_name: staff.name },
    });
    if (error || !created.user) {
      console.error("[team/login] createUser failed:", error?.code);
      return fail("create_failed", 500);
    }
    authUserId = created.user.id;
    createdNow = true;

    const { error: profileError } = await service.from("profiles").insert({
      id: authUserId,
      full_name: staff.name,
      role: "staff",
      organization_id: access.organizationId,
    });
    if (profileError) {
      await service.auth.admin.deleteUser(authUserId);
      return fail("create_failed", 500);
    }
  }

  const { data, error } = await service.rpc("team_set_staff_login", {
    p_staff: id,
    p_auth_user: authUserId,
    p_enabled: enable,
    p_actor: access.userId,
  });
  const reply = data as SetLoginReply | null;
  if (error || !reply?.ok) {
    if (createdNow && authUserId) await service.auth.admin.deleteUser(authUserId);
    return fail(reply?.reason ?? "save_failed", reply?.reason ? 409 : 500);
  }

  // Suspending the auth user ends any session the next time it refreshes;
  // the database already stops showing them anything (login_enabled = false).
  if (authUserId && !createdNow) {
    await service.auth.admin.updateUserById(authUserId, { ban_duration: enable ? "none" : BAN_FOREVER });
  }

  return NextResponse.json({ ok: true, enabled: enable });
}
