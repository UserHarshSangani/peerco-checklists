"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
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
  const supabase = useMemo(() => createClient(), []);
  const [openBookingAlerts, setOpenBookingAlerts] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("booking_alerts")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .then(({ count }) => {
        if (cancelled) return;
        setOpenBookingAlerts(count ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const badgeCounts: Record<string, number> = {};
  if (openBookingAlerts > 0) badgeCounts["/bookings"] = openBookingAlerts;

  return (
    <div className="flex min-h-dvh bg-bg">
      <Sidebar role={role} badgeCounts={badgeCounts} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar role={role} userName={userName} badgeCounts={badgeCounts} />
        {outletPicker}
        <div className="flex flex-1 flex-col pb-16 lg:pb-0">{children}</div>
        <BottomTabBar />
      </div>
    </div>
  );
}
