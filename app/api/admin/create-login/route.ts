import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { generateTemporaryPassword } from "@/lib/admin/generate-password";

export const runtime = "nodejs";

const CREATABLE_ROLES = ["owner", "manager", "device"] as const;
type CreatableRole = (typeof CREATABLE_ROLES)[number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CreateLoginBody = {
  role?: unknown;
  full_name?: unknown;
  email?: unknown;
  organization_id?: unknown;
  outlet_ids?: unknown;
};

function badRequest(reason: string, message: string) {
  return NextResponse.json({ ok: false, reason, message }, { status: 400 });
}

// Best-effort rollback so a failed profile/outlet_users insert never
// leaves an orphaned auth login with no profile behind. Never touches or
// logs the password.
async function rollbackAuthUser(serviceClient: SupabaseClient, userId: string) {
  const { error } = await serviceClient.auth.admin.deleteUser(userId);
  if (error) {
    console.error(`[create-login] failed to roll back orphaned auth user ${userId}:`, error.message);
  }
}

export async function POST(request: Request) {
  // 1. Who is calling, according to THEIR OWN cookie-based session — never
  // anything the request body claims about itself.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });
  }

  const { data: callerProfile, error: callerProfileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (callerProfileError || callerProfile?.role !== "peerco_admin") {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }

  // 2. Parse and validate input. role/full_name/email/organization_id are
  // required; outlet_ids only matters for manager/device.
  let body: CreateLoginBody;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid_body", "Request body must be JSON.");
  }

  const role = body.role;
  if (typeof role !== "string" || !CREATABLE_ROLES.includes(role as CreatableRole)) {
    return badRequest("invalid_role", "role must be one of owner, manager, device.");
  }

  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  if (!fullName) {
    return badRequest("invalid_full_name", "full_name is required.");
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email)) {
    return badRequest("invalid_email", "email is not a valid email address.");
  }

  const organizationId = typeof body.organization_id === "string" ? body.organization_id : "";
  if (!organizationId) {
    return badRequest("invalid_organization", "organization_id is required.");
  }

  const rawOutletIds = Array.isArray(body.outlet_ids) ? body.outlet_ids : [];
  const outletIds = Array.from(
    new Set(rawOutletIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
  );
  const needsOutlets = role === "manager" || role === "device";
  if (needsOutlets && outletIds.length === 0) {
    return badRequest("invalid_outlets", "At least one outlet is required for this role.");
  }

  // 3. Confirm organization_id and every outlet_id are real and consistent
  // with each other, using the caller's own (already-verified-admin)
  // session — peerco_admin can read every organization and outlet.
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();

  if (orgError || !org) {
    return badRequest("invalid_organization", "organization_id does not exist.");
  }

  if (needsOutlets) {
    const { data: outletRows, error: outletError } = await supabase
      .from("outlets")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id", outletIds);

    if (outletError || (outletRows ?? []).length !== outletIds.length) {
      return badRequest(
        "invalid_outlets",
        "One or more outlet_ids do not belong to this organization.",
      );
    }
  }

  // 4. Everything is validated and the caller is a confirmed admin — only
  // now does the service role key ever get touched.
  let serviceClient;
  try {
    serviceClient = createServiceRoleClient();
  } catch (error) {
    console.error("[create-login] service role client unavailable:", error);
    return NextResponse.json(
      { ok: false, reason: "server_error", message: "Account creation is not configured." },
      { status: 500 },
    );
  }
  const temporaryPassword = generateTemporaryPassword();

  const { data: created, error: createUserError } = await serviceClient.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createUserError || !created?.user) {
    const message = createUserError?.message?.toLowerCase() ?? "";
    const isDuplicate =
      createUserError?.code === "email_exists" ||
      message.includes("already been registered") ||
      message.includes("already exists");
    if (isDuplicate) {
      return NextResponse.json({ ok: false, reason: "email_exists" }, { status: 409 });
    }
    return NextResponse.json(
      { ok: false, reason: "create_failed", message: createUserError?.message ?? "Unknown error." },
      { status: 500 },
    );
  }

  const newUserId = created.user.id;

  // 5. Profile + outlet assignments. If either fails, remove the auth user
  // we just created so we never leave a login with no profile behind.
  const { error: profileError } = await serviceClient.from("profiles").insert({
    id: newUserId,
    full_name: fullName,
    role,
    organization_id: organizationId,
  });

  if (profileError) {
    await rollbackAuthUser(serviceClient, newUserId);
    return NextResponse.json(
      { ok: false, reason: "create_failed", message: profileError.message },
      { status: 500 },
    );
  }

  if (needsOutlets) {
    const { error: outletUsersError } = await serviceClient
      .from("outlet_users")
      .insert(outletIds.map((outletId) => ({ profile_id: newUserId, outlet_id: outletId })));

    if (outletUsersError) {
      await rollbackAuthUser(serviceClient, newUserId);
      return NextResponse.json(
        { ok: false, reason: "create_failed", message: outletUsersError.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    email,
    temporary_password: temporaryPassword,
    user_id: newUserId,
  });
}
