"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDaysToDateString, formatDateLabel } from "@/lib/date";
import { formatQuantity, formatRupees } from "@/lib/format";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  NOT_EVALUATED_EXPLANATION,
  STATUS_BADGE_CLASSNAME,
  STATUS_LABEL,
  type VarianceStatus,
} from "./reasons";
import { DetailModal } from "./detail-modal";
import type { VarianceRow } from "./types";

const EVALUATED_STATUSES: VarianceStatus[] = ["shortage", "surplus", "explained", "ok"];
const NOT_EVALUATED_STATUSES: VarianceStatus[] = [
  "missing_count",
  "missing_sales",
  "no_recipe",
];

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDaysToDateString(cursor, 1);
  }
  return dates;
}

export function VarianceTable({
  outletId,
  from,
  to,
}: {
  outletId: string;
  from: string;
  to: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<VarianceRow[]>([]);
  const [missingSalesDays, setMissingSalesDays] = useState(0);
  const [missingCountDays, setMissingCountDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(true);
  const [statusFilters, setStatusFilters] = useState<Set<VarianceStatus>>(
    new Set(EVALUATED_STATUSES),
  );
  const [ackFilter, setAckFilter] = useState<"all" | "open" | "acknowledged">("all");
  const [showNotEvaluated, setShowNotEvaluated] = useState(false);
  const [detailRow, setDetailRow] = useState<VarianceRow | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);

    const [resultsRes, salesRes, countsRes] = await Promise.all([
      supabase
        .from("variance_results")
        .select(
          "id, business_date, item_id, item_name, unit, opening_qty, opening_source, received_qty, closing_qty, actual_usage_qty, sold_usage_qty, wastage_qty, gap_before_wastage_qty, variance_qty, tolerance_qty, cost_per_unit, variance_value, overnight_gap_qty, status, ack_status, ack_reason, ack_note, ack_by_name, ack_at",
        )
        .eq("outlet_id", outletId)
        .gte("business_date", from)
        .lte("business_date", to)
        .order("business_date", { ascending: false }),
      supabase
        .from("pos_sales_daily")
        .select("business_date")
        .eq("outlet_id", outletId)
        .gte("business_date", from)
        .lte("business_date", to),
      supabase
        .from("stock_counts")
        .select("business_date")
        .eq("outlet_id", outletId)
        .gte("business_date", from)
        .lte("business_date", to),
    ]);

    setLoading(false);
    if (resultsRes.error) {
      setLoadError(resultsRes.error.message);
      return;
    }
    setRows((resultsRes.data ?? []) as VarianceRow[]);

    const salesDates = new Set((salesRes.data ?? []).map((row) => row.business_date));
    const countDates = new Set((countsRes.data ?? []).map((row) => row.business_date));
    const days = dateRange(from, to);
    setMissingSalesDays(days.filter((day) => !salesDates.has(day)).length);
    setMissingCountDays(days.filter((day) => !countDates.has(day)).length);
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setRecomputing(true);
      await supabase.rpc("recompute_variance_range", {
        p_outlet_id: outletId,
        p_from: from,
        p_to: to,
      });
      if (cancelled) return;
      setRecomputing(false);
      await load();
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, outletId, from, to]);

  function toggleStatusFilter(status: VarianceStatus) {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const openFlags = rows.filter((row) => row.ack_status === "open").length;
  const shortageValue = rows
    .filter((row) => row.status === "shortage")
    .reduce((sum, row) => sum + Math.abs(row.variance_value ?? 0), 0);
  const surplusValue = rows
    .filter((row) => row.status === "surplus")
    .reduce((sum, row) => sum + Math.abs(row.variance_value ?? 0), 0);

  const visibleRows = rows.filter((row) => {
    if (NOT_EVALUATED_STATUSES.includes(row.status)) return showNotEvaluated;
    if (!statusFilters.has(row.status)) return false;
    if (
      ackFilter !== "all" &&
      (row.status === "shortage" || row.status === "surplus") &&
      row.ack_status !== ackFilter
    ) {
      return false;
    }
    return true;
  });

  const groupedByDate = new Map<string, VarianceRow[]>();
  for (const row of visibleRows) {
    const list = groupedByDate.get(row.business_date) ?? [];
    list.push(row);
    groupedByDate.set(row.business_date, list);
  }
  const dates = Array.from(groupedByDate.keys()).sort((a, b) => (a < b ? 1 : -1));

  if (loading || recomputing) return <SkeletonList rows={5} rowClassName="h-16" />;
  if (loadError) {
    return <p className="text-danger">Couldn&apos;t load variance: {loadError}</p>;
  }

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="Open flags" value={String(openFlags)} />
        <SummaryCard label="Shortage value" value={formatRupees(shortageValue)} tone="danger" />
        <SummaryCard label="Surplus value" value={formatRupees(surplusValue)} tone="warning" />
        <SummaryCard label="Days missing sales" value={String(missingSalesDays)} />
        <SummaryCard label="Days missing counts" value={String(missingCountDays)} />
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {EVALUATED_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => toggleStatusFilter(status)}
            className={`min-h-[36px] rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-border ${
              statusFilters.has(status) ? STATUS_BADGE_CLASSNAME[status] : "text-muted"
            }`}
          >
            {STATUS_LABEL[status]}
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
        {(["all", "open", "acknowledged"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setAckFilter(value)}
            className={`min-h-[36px] rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-border ${
              ackFilter === value ? "bg-accent text-accent-fg" : "text-muted"
            }`}
          >
            {value === "all" ? "All" : value === "open" ? "Open" : "Acknowledged"}
          </button>
        ))}
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={showNotEvaluated}
          onChange={(event) => setShowNotEvaluated(event.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        Show not evaluated
      </label>
      <p className="mb-6 text-xs text-muted">
        Items counted weekly are not evaluated on days without a count.
      </p>

      {dates.length === 0 ? (
        <EmptyState title="Nothing matches these filters." />
      ) : (
        <div className="flex flex-col gap-6">
          {dates.map((date) => (
            <div key={date}>
              <h3 className="mb-2 text-sm font-semibold text-muted">
                {formatDateLabel(date)}
              </h3>
              <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-border">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left font-semibold text-muted">Item</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted">
                        Actual usage
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-muted">
                        Expected usage
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-muted">
                        Variance
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-muted">
                        Value
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-muted">Ack</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(groupedByDate.get(date) ?? []).map((row) => {
                      const expected =
                        row.sold_usage_qty != null && row.wastage_qty != null
                          ? row.sold_usage_qty + row.wastage_qty
                          : null;
                      return (
                        <tr
                          key={row.id}
                          onClick={() => setDetailRow(row)}
                          className="cursor-pointer border-b border-border last:border-0 hover:bg-border/10"
                        >
                          <td className="px-4 py-3 whitespace-nowrap text-text">
                            {row.item_name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASSNAME[row.status]}`}
                              title={NOT_EVALUATED_EXPLANATION[row.status]}
                            >
                              {STATUS_LABEL[row.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted">
                            {row.actual_usage_qty != null
                              ? `${formatQuantity(row.actual_usage_qty)} ${row.unit}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted">
                            {expected != null ? `${formatQuantity(expected)} ${row.unit}` : "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted">
                            {row.variance_qty != null
                              ? `${formatQuantity(row.variance_qty)} ${row.unit}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted">
                            {row.variance_value != null ? formatRupees(row.variance_value) : "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.ack_status === "acknowledged" && (
                              <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
                                Acknowledged
                              </span>
                            )}
                            {row.ack_status === "open" && (
                              <span className="rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning">
                                Open
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {detailRow && (
        <DetailModal
          row={detailRow}
          onClose={() => setDetailRow(null)}
          onAcknowledged={() => {
            setDetailRow(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "warning";
}) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold ${
          tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-text"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
