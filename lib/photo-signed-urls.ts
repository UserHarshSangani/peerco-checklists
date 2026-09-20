import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

const BUCKET = "checklist-photos";
const EXPIRY_SECONDS = 60 * 60; // 1 hour

// Storage is private (tablet logins can upload but not read back); managers
// view photos only through short-lived signed URLs, generated in bulk for
// whatever answers are currently on screen. Never a public URL.
export async function fetchSignedPhotoUrls(
  supabase: Supabase,
  paths: string[],
): Promise<Record<string, string>> {
  const uniquePaths = Array.from(new Set(paths));
  if (uniquePaths.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(uniquePaths, EXPIRY_SECONDS);

  if (error || !data) return {};
  return Object.fromEntries(
    data
      .filter(
        (entry): entry is typeof entry & { path: string; signedUrl: string } =>
          !entry.error && !!entry.path && !!entry.signedUrl,
      )
      .map((entry) => [entry.path, entry.signedUrl]),
  );
}
