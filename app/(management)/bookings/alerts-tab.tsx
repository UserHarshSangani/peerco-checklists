"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateLabel, formatRelativeTime } from "@/lib/date";
import { useToast } from "@/components/ui/toast";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { alertMessage, ALERT_KIND_LABEL } from "./alert-message";
import { PLATFORM_LABEL } from "./types";
import type { BookingAlert, BookingSource } from "./types";

type Filter = "open" | "acknowledged" | "resolved";

function reasonMessage(reason: string): string {
  if (reason === "not_open") return "This alert was already handled.";
  return "You don't have permission to do that.";
}

export function AlertsTab({
  outletId,
  sources,
  refreshToken,
}: {
  outletId: string;
  sources: BookingSource[];
  refreshToken: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { showError, showSuccess } = useToast();
  const [filter, setFilter] = useState<Filter>("open");
  const [alerts, setAlerts] = useState<BookingAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [acking, setAcking] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("booking_alerts")
        .select("*")
        .eq("outlet_id", outletId)
        .eq("status", filter)
        .order("last_seen_at", { ascending: false });
      if (cancelled) return;
      setAlerts((data as BookingAlert[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, outletId, filter, refreshToken]);

  async function acknowledge(alertId: string) {
    setAcking(alertId);
    const { data, error } = await supabase.rpc("acknowledge_booking_alert", {
      p_alert_id: alertId,
      p_note: noteDraft[alertId]?.trim() || null,
    });
    setAcking(null);
    if (error) {
      showError("Something went wrong. Please try again.");
      return;
    }
    const response = data as { ok: boolean; reason?: string };
    if (!response.ok) {
      showError(reasonMessage(response.reason ?? ""));
      return;
    }
    showSuccess("Alert acknowledged.");
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }

  const filters: { id: Filter; label: string }[] = [
    { id: "open", label: "Open" },
    { id: "acknowledged", label: "Acknowledged" },
    { id: "resolved", label: "Resolved" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 rounded-full bg-surface p-1 ring-1 ring-border w-fit">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`min-h-[36px] rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filter === f.id ? "bg-accent text-accent-fg" : "text-muted hover:text-text"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonList rows={3} rowClassName="h-20" />
      ) : alerts.length === 0 ? (
        <EmptyState title="No alerts" description={`No ${filter} booking alerts.`} />
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((alert) => {
            const source = sources.find((s) => s.id === alert.source_id);
            return (
              <div key={alert.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <StatusPill tone={filter === "resolved" ? "neutral" : "danger"}>
                    {ALERT_KIND_LABEL[alert.kind]}
                  </StatusPill>
                  <span className="text-xs text-muted">
                    {source ? `${PLATFORM_LABEL[source.platform]}${source.label ? ` — ${source.label}` : ""}` : "Unknown source"}
                  </span>
                </div>
                <p className="mb-2 text-sm text-text">{alertMessage(alert)}</p>
                <p className="mb-2 text-xs text-muted">
                  First seen {formatDateLabel(alert.first_seen_at.slice(0, 10))} · Last seen{" "}
                  {formatRelativeTime(alert.last_seen_at)}
                </p>
                {alert.ack_by_name && (
                  <p className="mb-2 text-xs text-muted">
                    Acknowledged by {alert.ack_by_name}
                    {alert.ack_at ? ` · ${formatRelativeTime(alert.ack_at)}` : ""}
                    {alert.ack_note ? ` — "${alert.ack_note}"` : ""}
                  </p>
                )}
                {filter === "open" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={noteDraft[alert.id] ?? ""}
                      onChange={(event) =>
                        setNoteDraft((prev) => ({ ...prev, [alert.id]: event.target.value }))
                      }
                      placeholder="Optional note"
                      className="min-h-[36px] flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      loading={acking === alert.id}
                      onClick={() => acknowledge(alert.id)}
                    >
                      Acknowledge
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
