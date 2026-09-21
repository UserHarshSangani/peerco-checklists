"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, BOTTOM_TAB_HREFS, BOTTOM_TAB_LABELS } from "./nav-items";

// The condensed 4-item bar shown on phones/tablets for management roles.
// Device/tablet logins never render this — they have their own /tablet
// header and no bottom bar at all.
export function BottomTabBar() {
  const pathname = usePathname();
  const items = BOTTOM_TAB_HREFS.map((href) => ({
    href,
    label: BOTTOM_TAB_LABELS[href],
    icon: NAV_ITEMS.find((item) => item.href === href)!.icon,
  }));

  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface lg:hidden"
      aria-label="Primary"
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium ${
              active ? "text-accent" : "text-muted"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
