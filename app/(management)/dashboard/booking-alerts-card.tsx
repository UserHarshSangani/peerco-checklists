"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateLabel } from "@/lib/date";
import { EmptyState } from "@/components/ui/empty-state";
import { IconCircle } from "@/components/ui/icon-circle";
import { Skeleton } from "@/components/ui/skeleton";
import { ALERT_KIND_LABEL } from "../bookings/alert-message";
import type { BookingAlert } from "../bookings/types";
import type { ManagedOutlet } from "../outlet-context";

export function BookingAlertsCard({ outlets }: { outlets: ManagedOutlet[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [alerts, setAlerts] = useState<BookingAlert[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [{ data }, { count: total }] = await Promise.all([
        supabase
          .from("booking_alerts")
          .select("*")
          .eq("status", "open")
          .order("last_seen_at", { ascending: false })
          .limit(3),
        supabase
          .from("booking_alerts")
          .select("id", { count: "exact", head: true })
          .eq("status", "open"),
      ]);
      if (cancelled) return;
      setAlerts((data as BookingAlert[]) ?? []);
      setCount(total ?? 0);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  function outletName(outletId: string): string {
    return outlets.find((o) => o.id === outletId)?.name ?? "Outlet";
  }

  return (
    <div className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-border">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-serif text-base font-bold text-text">Booking slot alerts</h3>
        {count > 0 && (
          <span className="rounded-full bg-danger-bg px-2.5 py-1 text-xs font-semibold text-danger-fg">
            {count} open
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : alerts.length === 0 ? (
        <EmptyState title="No booking issues" />
      ) : (
        <ul className="flex flex-col gap-3">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <Link
                href="/bookings"
                className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-border/20"
              >
                <IconCircle icon={<CalendarClock className="h-4 w-4" />} tone="danger" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{outletName(alert.outlet_id)}</p>
                  <p className="truncate text-xs text-muted">{ALERT_KIND_LABEL[alert.kind]}</p>
                </div>
                {alert.target_date && (
                  <p className="shrink-0 text-xs text-muted">{formatDateLabel(alert.target_date)}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link href="/bookings" className="mt-3 block text-sm font-medium text-accent underline">
        View all bookings
      </Link>
    </div>
  );
}
