import { createClient } from "@/lib/supabase/server";

async function getSupabaseStatus() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.getSession();
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Supabase connection works" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message: `Supabase connection failed: ${message}` };
  }
}

export default async function Home() {
  const status = await getSupabaseStatus();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          PeerCo Checklists
        </h1>
        <p
          className={`text-sm ${
            status.ok
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {status.message}
        </p>
      </main>
    </div>
  );
}
