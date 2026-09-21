import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeForRole, isOutletAdminRole } from "@/lib/roles";
import { AppFrame } from "@/app/(management)/app-frame";

export default async function OutletsLayout({
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

  if (!profile || !isOutletAdminRole(profile.role)) {
    redirect(homeForRole(profile?.role));
  }

  const userName = profile.full_name || user.email || "Account";

  return (
    <AppFrame role={profile.role} userName={userName}>
      {children}
    </AppFrame>
  );
}
