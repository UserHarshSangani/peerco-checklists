import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { unwrapOne } from "@/lib/supabase/embed";
import { ManagementShell } from "./management-shell";
import type { ManagedOutlet } from "./outlet-context";

export default async function ManagementLayout({
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

  if (!profile || profile.role === "device") {
    redirect("/tablet");
  }

  const { data: outletRows, error } = await supabase
    .from("outlets")
    .select("id, name, organizations(name)")
    .order("name");

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 p-6 text-center dark:bg-zinc-950">
        <p className="text-red-600 dark:text-red-400">
          Couldn&apos;t load outlets: {error.message}
        </p>
      </div>
    );
  }

  const outlets: ManagedOutlet[] = (outletRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    organizationName: unwrapOne(row.organizations)?.name ?? null,
  }));

  return <ManagementShell outlets={outlets}>{children}</ManagementShell>;
}
