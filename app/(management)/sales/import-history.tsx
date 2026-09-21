"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateLabel, formatTimeKolkata } from "@/lib/date";
import { formatQuantity, formatRupees } from "@/lib/format";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

type ImportRow = {
  id: string;
  imported_at: string;
  source_name: string | null;
  date_from: string;
  date_to: string;
  row_count: number;
  units_total: number;
  revenue_total: number | null;
};

export function ImportHistory({ outletId }: { outletId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("pos_imports")
      .select(
        "id, imported_at, source_name, date_from, date_to, row_count, units_total, revenue_total",
      )
      .eq("outlet_id", outletId)
      .order("imported_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          setLoadError(error.message);
          return;
        }
        setRows(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, outletId]);

  if (loading) return <SkeletonList rows={3} rowClassName="h-14" />;
  if (loadError) {
    return <p className="text-danger">Couldn&apos;t load import history: {loadError}</p>;
  }
  if (rows.length === 0) {
    return <EmptyState title="No sales imports yet." />;
  }

  return (
    <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-border">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-left font-semibold text-muted">When</th>
            <th className="px-4 py-3 text-left font-semibold text-muted">File</th>
            <th className="px-4 py-3 text-left font-semibold text-muted">
              Date range
            </th>
            <th className="px-4 py-3 text-left font-semibold text-muted">Units</th>
            <th className="px-4 py-3 text-left font-semibold text-muted">
              Revenue
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 whitespace-nowrap text-text">
                {formatDateLabel(row.imported_at.slice(0, 10))}{" "}
                {formatTimeKolkata(row.imported_at)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted">
                {row.source_name ?? "—"}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted">
                {formatDateLabel(row.date_from)} – {formatDateLabel(row.date_to)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted">
                {formatQuantity(row.units_total)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted">
                {row.revenue_total != null ? formatRupees(row.revenue_total) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
