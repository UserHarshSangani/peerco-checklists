"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addDaysToDateString, formatDateLabel, formatRelativeTime, todayInKolkata } from "@/lib/date";
import { fetchSignedPhotoUrls } from "@/lib/photo-signed-urls";
import { StatusPill } from "@/components/ui/status-pill";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { dayStatus } from "./day-status";
import { describeDay } from "./hours-helpers";
import { PLATFORM_LABEL } from "./types";
import type { BookingAlert, BookingSnapshot, BookingSource, OutletClosure, OutletHourRow } from "./types";

export function SlotsTab({
  outletId,
  sources,
  refreshToken,
  onEnterSlots,
}: {
  outletId: string;
  sources: BookingSource[];
  refreshToken: number;
  onEnterSlots: (sourceId: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState<OutletHourRow[]>([]);
  const [closures, setClosures] = useState<OutletClosure[]>([]);
  const [snapshots, setSnapshots] = useState<BookingSnapshot[]>([]);
  const [alerts, setAlerts] = useState<BookingAlert[]>([]);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>({});

  const effectiveSourceId = sourceId || sources[0]?.id || "";
  const source = sources.find((s) => s.id === effectiveSourceId);

  useEffect(() => {
    if (!source) {
      Promise.resolve().then(() => setLoading(false));
      return;
    }
    let cancelled = false;

    async function load() {
      setLoading(true);
      const fromDate = addDaysToDateString(todayInKolkata(), -1);
      const toDate = addDaysToDateString(todayInKolkata(), source!.days_ahead);

      const [hoursRes, closuresRes, snapshotsRes, alertsRes] = await Promise.all([
        supabase.from("outlet_hours").select("*").eq("outlet_id", outletId),
        supabase.from("outlet_closures").select("*").eq("outlet_id", outletId),
        supabase
          .from("booking_snapshots")
          .select("*")
          .eq("source_id", source!.id)
          .gte("target_date", fromDate)
          .lte("target_date", toDate)
          .order("checked_at", { ascending: false }),
        supabase
          .from("booking_alerts")
          .select("*")
          .eq("source_id", source!.id)
          .in("status", ["open", "acknowledged"]),
      ]);

      if (cancelled) return;

      setHours((hoursRes.data as OutletHourRow[]) ?? []);
      setClosures((closuresRes.data as OutletClosure[]) ?? []);

      const bySourceDate = new Map<string, BookingSnapshot>();
      for (const row of (snapshotsRes.data as BookingSnapshot[]) ?? []) {
        if (!bySourceDate.has(row.target_date)) bySourceDate.set(row.target_date, row);
      }
      setSnapshots(Array.from(bySourceDate.values()));
      setAlerts((alertsRes.data as BookingAlert[]) ?? []);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, outletId, source, refreshToken]);

  async function toggleExpand(dateStr: string, screenshotPath: string | null) {
    if (expandedDate === dateStr) {
      setExpandedDate(null);
      return;
    }
    setExpandedDate(dateStr);
    if (screenshotPath && !screenshotUrls[screenshotPath]) {
      const urls = await fetchSignedPhotoUrls(supabase, [screenshotPath]);
      setScreenshotUrls((prev) => ({ ...prev, ...urls }));
    }
  }

  if (sources.length === 0) {
    return (
      <EmptyState
        title="No booking sources yet"
        description="Add a source in Sources and hours to start tracking slots."
      />
    );
  }

  const days = source
    ? Array.from({ length: source.days_ahead }, (_, i) => addDaysToDateString(todayInKolkata(), i))
    : [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <select
          value={effectiveSourceId}
          onChange={(event) => {
            setSourceId(event.target.value);
            setExpandedDate(null);
          }}
          className="min-h-[44px] rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text focus:border-accent focus:outline-none"
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {PLATFORM_LABEL[s.platform]}
              {s.label ? ` — ${s.label}` : ""}
            </option>
          ))}
        </select>
        {source && (
          <Button type="button" variant="secondary" onClick={() => onEnterSlots(source.id)}>
            Enter slots
          </Button>
        )}
      </div>

      {loading ? (
        <SkeletonList rows={5} rowClassName="h-16" />
      ) : (
        <div className="flex flex-col gap-2">
          {days.map((dateStr) => {
            const snapshot = snapshots.find((s) => s.target_date === dateStr);
            const dayAlerts = alerts.filter((a) => a.target_date === dateStr);
            const status = dayStatus(snapshot, dayAlerts);
            const description = describeDay(dateStr, hours, closures);
            const Icon = status.icon;
            const expanded = expandedDate === dateStr;
            const slots = (snapshot?.slots ?? []).map((s) => s.slice(0, 5));
            const outsideAlert = dayAlerts.find((a) => a.kind === "slot_outside_hours" && a.status !== "resolved");
            const offending = new Set(
              ((outsideAlert?.details.offending as string[] | undefined) ?? []).map((s) => s.slice(0, 5)),
            );

            return (
              <div key={dateStr} className="rounded-2xl border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => toggleExpand(dateStr, snapshot?.screenshot_path ?? null)}
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
                >
                  <div className="w-28 shrink-0">
                    <p className="text-sm font-semibold text-text">{formatDateLabel(dateStr)}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-muted">{description.text}</p>
                  </div>
                  <div className="shrink-0 text-sm text-muted">
                    {slots.length > 0
                      ? `${slots.length} slot${slots.length === 1 ? "" : "s"} (${slots[0]}–${slots[slots.length - 1]})`
                      : snapshot
                        ? "0 slots"
                        : "—"}
                  </div>
                  <div className="shrink-0 text-xs text-muted">
                    {snapshot
                      ? `${formatRelativeTime(snapshot.checked_at)} · ${snapshot.entry_method}`
                      : "Not checked"}
                  </div>
                  <StatusPill tone={status.tone} icon={<Icon className="h-3.5 w-3.5" />}>
                    {status.label}
                  </StatusPill>
                  {expanded ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  )}
                </button>

                {expanded && (
                  <div className="border-t border-border px-4 py-4">
                    {snapshot ? (
                      <>
                        {slots.length > 0 ? (
                          <div className="mb-3 flex flex-wrap gap-1.5">
                            {slots.map((slot) => (
                              <span
                                key={slot}
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  offending.has(slot)
                                    ? "bg-danger-bg text-danger-fg"
                                    : "bg-success-bg text-success-fg"
                                }`}
                              >
                                {slot}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mb-3 text-sm text-muted">No slots recorded.</p>
                        )}

                        {snapshot.party_size && (
                          <p className="mb-3 flex items-center gap-1.5 text-sm text-muted">
                            <Users className="h-4 w-4" aria-hidden="true" />
                            Party size {snapshot.party_size}
                          </p>
                        )}

                        {snapshot.window_labels && snapshot.window_labels.length > 0 && (
                          <div className="mb-3 flex flex-wrap gap-1.5">
                            {snapshot.window_labels.map((w, i) => (
                              <span
                                key={i}
                                className="rounded-full bg-info-bg px-2.5 py-1 text-xs font-semibold text-info-fg"
                              >
                                {w.name ? `${w.name}: ` : ""}
                                {w.from}–{w.to}
                              </span>
                            ))}
                          </div>
                        )}

                        {snapshot.status !== "ok" && snapshot.error && (
                          <p className="mb-3 text-sm text-danger">{snapshot.error}</p>
                        )}

                        {snapshot.screenshot_path && (
                          screenshotUrls[snapshot.screenshot_path] ? (
                            // eslint-disable-next-line @next/next/no-img-element -- private-bucket signed URL, not an optimizable remote asset
                            <img
                              src={screenshotUrls[snapshot.screenshot_path]}
                              alt="Booking screenshot"
                              className="max-h-64 rounded-xl ring-1 ring-border"
                            />
                          ) : (
                            <p className="text-sm text-muted">Loading screenshot…</p>
                          )
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted">No check recorded for this day yet.</p>
                    )}
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
