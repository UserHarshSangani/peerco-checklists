// Only allow redirects to paths on this site, so a crafted email link can't
// bounce someone to another domain after signing them in.
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}
