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
      <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-6 text-center dark:bg-zinc-950">
        <p className="text-red-600 dark:text-red-400">
          Couldn&apos;t load outlets: {error.message}
        </p>
      </main>
    );
  }

  return <TabletApp outlets={outlets ?? []} />;
}
