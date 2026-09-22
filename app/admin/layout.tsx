import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeForRole } from "@/lib/roles";
import { AppFrame } from "@/app/(management)/app-frame";

// peerco_admin only — every other signed-in role (including owner) is sent
// to their own home page, not /login, since they do have a valid account,
// just not this one.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "peerco_admin") {
    redirect(homeForRole(profile?.role));
  }

  const userName = profile.full_name || user.email || "Account";

  return (
    <AppFrame role={profile.role} userName={userName}>
      {children}
    </AppFrame>
  );
}
