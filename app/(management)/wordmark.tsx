import Link from "next/link";

// "PeerCo" in the bold display serif, "Daybook" beneath it in the same
// serif at a smaller size — the one place the two words of the product
// name are hardcoded together as a lockup, matching how a wordmark works
// everywhere else in the brand (see lib/brand.ts for the plain-text name).
export function Wordmark({
  tone = "on-light",
  href,
}: {
  tone?: "on-light" | "on-dark";
  href?: string;
}) {
  const textClass = tone === "on-dark" ? "text-sidebar-fg" : "text-text";
  const subClass = tone === "on-dark" ? "text-sidebar-fg/70" : "text-muted";

  const content = (
    <span className="font-serif leading-none">
      <span className={`block text-2xl font-bold ${textClass}`}>PeerCo</span>
      <span className={`block text-base font-semibold ${subClass}`}>Daybook</span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block">
        {content}
      </Link>
    );
  }
  return content;
}
