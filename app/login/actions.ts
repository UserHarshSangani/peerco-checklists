"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

// All roles land on /tablet for now; kept as a map so redirects can diverge
// by role later without touching the call site.
const ROLE_REDIRECTS: Record<string, string> = {
  device: "/tablet",
  peerco_admin: "/tablet",
  manager: "/tablet",
  owner: "/tablet",
};

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: "Incorrect email or password." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { error: "No profile is set up for this account." };
  }

  redirect(ROLE_REDIRECTS[profile.role] ?? "/tablet");
}
