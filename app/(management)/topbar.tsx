"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { formatDateLabel, todayInKolkata } from "@/lib/date";
import { roleLabel } from "@/lib/roles";
import { Avatar } from "@/components/ui/avatar";
import { NavDrawer } from "./nav-drawer";
import { Wordmark } from "./wordmark";

export function Topbar({
  role,
  userName,
}: {
  role: string | null;
  userName: string;
}) {
  const [showNav, setShowNav] = useState(false);

  return (
    <>
      <header className="safe-top flex min-h-16 items-center gap-4 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => setShowNav(true)}
          aria-label="Open navigation"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-text hover:bg-border/30 lg:hidden"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>

        <div className="lg:hidden">
          <Wordmark />
        </div>

        <p className="hidden text-sm font-medium text-muted lg:block">
          {formatDateLabel(todayInKolkata())}
        </p>

        <div className="ml-auto flex items-center gap-3">
          <Avatar name={userName} size="sm" />
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-text">{userName}</p>
            <p className="text-xs text-muted">{roleLabel(role)}</p>
          </div>
        </div>
      </header>

      {showNav && <NavDrawer role={role} onClose={() => setShowNav(false)} />}
    </>
  );
}
