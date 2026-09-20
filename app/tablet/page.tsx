import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TabletApp } from "./tablet-app";

export default async function TabletPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: outlets, error } = await supabase
    .from("outlets")
    .select("id, name")
    .eq("active", true)
    .order("name");

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg p-6 text-center">
        <p className="text-danger">
          Couldn&apos;t load outlets: {error.message}
        </p>
      </main>
    );
  }

  return <TabletApp outlets={outlets ?? []} />;
}
