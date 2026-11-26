"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type ForgotStatus = "idle" | "sent" | "missing_email" | "too_many" | "failed";
export type ForgotState = { status: ForgotStatus };

export async function requestPasswordReset(
  _prevState: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { status: "missing_email" };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const redirectTo = `${proto}://${host}/auth/confirm?next=/reset-password`;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  // Same answer whether or not the email has an account, so this form can't
  // be used to find out who is registered.
  if (error) {
    if (error.status === 429) return { status: "too_many" };
    console.error("resetPasswordForEmail failed", error.status, error.code);
    return { status: "failed" };
  }
  return { status: "sent" };
}
