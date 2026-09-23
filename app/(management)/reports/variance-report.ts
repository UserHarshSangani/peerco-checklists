import type { createClient } from "@/lib/supabase/client";
import type { VarianceReport, VarianceReportRow, VarianceTopItem } from "./types";

type Supabase = ReturnType<typeof createClient>;

// Rows in these statuses aren't real variance yet (nothing to evaluate
// against) — excluded from the main sheet, same as the /variance screen's
// default filter, but never an error if a range happens to have none of
// the other statuses either.
const EXCLUDED_STATUSES = ["missing_count", "missing_sales", "no_recipe"];

export async function fetchVarianceReport(
  supabase: Supabase,
  outletIds: string[],
  outletNameById: Map<string, string>,
  from: string,
  to: string,
): Promise<VarianceReport> {
  if (outletIds.length === 0) {
    return { rows: [], totalShortageValue: 0, totalSurplusValue: 0, topItems: [] };
  }

  const { data, error } = await supabase
    .from("variance_results")
    .select(
      "outlet_id, business_date, item_name, unit, opening_qty, opening_source, received_qty, closing_qty, actual_usage_qty, sold_usage_qty, wastage_qty, variance_qty, variance_value, status, ack_status, ack_reason, ack_note, ack_by_name",
    )
    .in("outlet_id", outletIds)
    .gte("business_date", from)
    .lte("business_date", to)
    .order("business_date", { ascending: false });

  if (error) throw error;
  // Filtered client-side rather than with .not(...,"in",...) so an empty
  // result (or a range with none of the excluded statuses) never risks a
  // filter-syntax edge case — just an empty array either way.
  const results = (data ?? []).filter(
    (row) => !EXCLUDED_STATUSES.includes(row.status),
  );

  const rows: VarianceReportRow[] = results.map((row) => ({
    date: row.business_date,
    outlet: outletNameById.get(row.outlet_id) ?? "",
    item: row.item_name,
    unit: row.unit,
    openingQty: row.opening_qty,
    openingSource: row.opening_source,
    receivedQty: row.received_qty,
    closingQty: row.closing_qty,
    actualUsage: row.actual_usage_qty,
    soldUsage: row.sold_usage_qty,
    wastage: row.wastage_qty,
    varianceQty: row.variance_qty,
    varianceValue: row.variance_value,
    status: row.status,
    acknowledged: row.ack_status === "acknowledged",
    ackReason: row.ack_reason,
    ackBy: row.ack_by_name,
    ackNote: row.ack_note,
  }));

  const totalShortageValue = results
    .filter((row) => row.status === "shortage")
    .reduce((sum, row) => sum + Math.abs(row.variance_value ?? 0), 0);
  const totalSurplusValue = results
    .filter((row) => row.status === "surplus")
    .reduce((sum, row) => sum + Math.abs(row.variance_value ?? 0), 0);

  const byItemOutlet = new Map<string, VarianceTopItem>();
  for (const row of rows) {
    const key = `${row.item}:${row.outlet}`;
    const existing = byItemOutlet.get(key) ?? {
      item: row.item,
      outlet: row.outlet,
      varianceQty: 0,
      varianceValue: 0,
    };
    existing.varianceQty += row.varianceQty ?? 0;
    existing.varianceValue += row.varianceValue ?? 0;
    byItemOutlet.set(key, existing);
  }
  const topItems = Array.from(byItemOutlet.values())
    .sort((a, b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue))
    .slice(0, 10);

  return { rows, totalShortageValue, totalSurplusValue, topItems };
}
