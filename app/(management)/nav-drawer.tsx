"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer } from "@/components/ui/modal";
import { NAV_GROUPS, navItemsForRole } from "./nav-items";
import { Wordmark } from "./wordmark";

// The full grouped nav as a bottom sheet, for narrower screens where the
// permanent sidebar (lg and up) isn't shown — reuses the same item/grouping
// data so the two never drift apart.
export function NavDrawer({
  role,
  badgeCounts = {},
  onClose,
}: {
  role: string | null;
  badgeCounts?: Record<string, number>;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <Drawer onClose={onClose} panelClassName="safe-bottom max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-xl outline-none">
      <div className="mb-4">
        <Wordmark />
      </div>
      {NAV_GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div key={group} className="mb-5">
            <p className="mb-2 text-xs font-semibold tracking-widest text-muted">
              {group}
            </p>
            <ul className="flex flex-col gap-1">
              {groupItems.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                const badge = badgeCounts[item.href];
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-medium transition ${
                        active ? "bg-accent/15 text-accent" : "text-text hover:bg-border/30"
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span className="flex-1">{item.label}</span>
                      {!!badge && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-fg px-1.5 text-xs font-semibold text-white">
                          {badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </Drawer>
  );
}
