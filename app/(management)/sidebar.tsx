"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_SIGNOFF } from "@/lib/brand";
import { NAV_GROUPS, navItemsForRole } from "./nav-items";
import { Wordmark } from "./wordmark";

export function Sidebar({ role }: { role: string | null }) {
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <aside className="safe-top hidden w-64 shrink-0 flex-col bg-sidebar px-4 py-6 text-sidebar-fg lg:flex">
      <div className="mb-8 px-2">
        <Wordmark tone="on-dark" />
      </div>

      <nav className="flex-1 overflow-y-auto">
        {NAV_GROUPS.map((group) => {
          const groupItems = items.filter((item) => item.group === group);
          if (groupItems.length === 0) return null;
          return (
            <div key={group} className="mb-6">
              <p className="mb-2 px-3 text-xs font-semibold tracking-widest text-sidebar-fg/60">
                {group}
              </p>
              <ul className="flex flex-col gap-1">
                {groupItems.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${
                          active
                            ? "bg-sidebar-pressed text-sidebar-fg"
                            : "text-sidebar-fg/80 hover:bg-sidebar-pressed/60 hover:text-sidebar-fg"
                        }`}
                      >
                        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <p className="font-hand px-2 pt-4 text-xl text-sidebar-fg/80">{APP_SIGNOFF}</p>
    </aside>
  );
}
