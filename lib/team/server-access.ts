import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type StaffAccess = {
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
  outletId: string;
  organizationId: string;
  canManage: boolean;
  canSeePay: boolean;
};

type AccessRow = {
  found: boolean;
  outlet_id?: string;
  organization_id?: string;
  can_manage?: boolean;
  can_see_pay?: boolean;
};

// Reads the caller from their own cookie session and asks the database what
// they may do for this staff member. Returns a ready error response when
// they're signed out, the person doesn't exist, or `need` isn't met.
export async function requireStaffAccess(
  staffId: string,
  need: "manage" | "pay",
): Promise<StaffAccess | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });

  const { data, error } = await supabase.rpc("team_my_access", { p_staff: staffId });
  const access = data as AccessRow | null;
  if (error || !access?.found) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });

  const allowed = need === "pay" ? access.can_see_pay : access.can_manage;
  if (!allowed) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });

  return {
    userId: user.id,
    supabase,
    outletId: access.outlet_id!,
    organizationId: access.organization_id!,
    canManage: Boolean(access.can_manage),
    canSeePay: Boolean(access.can_see_pay),
  };
}

export function fail(reason: string, status = 400) {
  return NextResponse.json({ ok: false, reason }, { status });
}
