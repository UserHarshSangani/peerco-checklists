"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeForRole } from "@/lib/roles";

export type LoginErrorCode =
  | "missing_credentials"
  | "invalid_credentials"
  | "no_profile";

export type LoginState = { errorCode: LoginErrorCode | null };

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { errorCode: "missing_credentials" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { errorCode: "invalid_credentials" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { errorCode: "no_profile" };
  }

  redirect(homeForRole(profile.role));
}
