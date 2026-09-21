import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeForRole, isOutletAdminRole } from "@/lib/roles";
import { Nav } from "@/app/(management)/nav";

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
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !isOutletAdminRole(profile.role)) {
    redirect(homeForRole(profile?.role));
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <Nav role={profile.role} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
