"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageSwitcher } from "@/components/language/language-switcher";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";

const LINKS: { href: string; labelKey: TranslationKey }[] = [
  { href: "/dashboard", labelKey: "nav.dashboard" },
  { href: "/history", labelKey: "nav.history" },
  { href: "/staff", labelKey: "nav.staff" },
  { href: "/checklists", labelKey: "nav.checklists" },
];

export function Nav() {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <header className="safe-top flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-4 text-lg font-semibold text-text">
          PeerCo Checklists
        </p>
        <nav className="flex flex-wrap gap-1">
          {LINKS.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-accent text-white"
                    : "text-muted hover:bg-border/40 hover:text-text"
                }`}
              >
                {t(link.labelKey)}
              </Link>
            );
          })}
          <Link
            href="/tablet"
            className="rounded-full px-4 py-2 text-sm font-medium text-muted transition hover:bg-border/40 hover:text-text"
          >
            {t("nav.tablet")}
          </Link>
        </nav>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <LanguageSwitcher />
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  );
}
