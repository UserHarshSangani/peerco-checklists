"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { BottomTabBar } from "./bottom-tab-bar";

// The shell shared by every management-role screen: a permanent sidebar at
// lg and up, a topbar + nav drawer + bottom tab bar below that. Outlets
// pages use this too but without an outlet picker (they manage every
// outlet at once, so filtering by one isn't meaningful there).
export function AppFrame({
  role,
  userName,
  outletPicker,
  children,
}: {
  role: string | null;
  userName: string;
  outletPicker?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-bg">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar role={role} userName={userName} />
        {outletPicker}
        <div className="flex flex-1 flex-col pb-16 lg:pb-0">{children}</div>
        <BottomTabBar />
      </div>
    </div>
  );
}
