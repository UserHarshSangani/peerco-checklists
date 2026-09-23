import type { createClient } from "@/lib/supabase/client";
import { fetchStaffNames } from "@/lib/staff-names";
import { locationStatusLabel } from "@/lib/reports/location-label";
import type { StockCountRow, StockReceiptRow, StockReport, WastageRow } from "./types";

type Supabase = ReturnType<typeof createClient>;

const WASTAGE_REASON_LABEL: Record<string, string> = {
  spoilage: "Spoilage",
  prep_waste: "Prep waste",
  breakage: "Breakage",
  staff_meal: "Staff meal",
  complimentary: "Complimentary",
  other: "Other",
};

function kindLabel(kind: string): "Opening" | "Closing" {
  return kind === "closing" ? "Closing" : "Opening";
}

export async function fetchStockReport(
  supabase: Supabase,
  outletIds: string[],
  outletNameById: Map<string, string>,
  from: string,
  to: string,
): Promise<StockReport> {
  if (outletIds.length === 0) return { counts: [], receipts: [], wastage: [] };

  const [countsRes, receiptsRes, wastageRes] = await Promise.all([
    supabase
      .from("stock_counts")
      .select("id, outlet_id, kind, business_date, staff_id, submitted_at, location_status")
      .in("outlet_id", outletIds)
      .gte("business_date", from)
      .lte("business_date", to),
    supabase
      .from("stock_receipts")
      .select(
        "id, outlet_id, business_date, vendor_name, invoice_ref, staff_id, submitted_at",
      )
      .in("outlet_id", outletIds)
      .gte("business_date", from)
      .lte("business_date", to),
    supabase
      .from("wastage_entries")
      .select(
        "outlet_id, business_date, item_name, unit, quantity, reason, note, staff_id, logged_at, location_status",
      )
      .in("outlet_id", outletIds)
      .gte("business_date", from)
      .lte("business_date", to),
  ]);

  if (countsRes.error) throw countsRes.error;
  if (receiptsRes.error) throw receiptsRes.error;
  if (wastageRes.error) throw wastageRes.error;

  const countHeaders = countsRes.data ?? [];
  const receiptHeaders = receiptsRes.data ?? [];
  const wastageEntries = wastageRes.data ?? [];

  const countIds = countHeaders.map((row) => row.id);
  const receiptIds = receiptHeaders.map((row) => row.id);

  const [countLinesRes, receiptLinesRes] = await Promise.all([
    countIds.length > 0
      ? supabase
          .from("stock_count_lines")
          .select("count_id, item_name, unit, quantity, note")
          .in("count_id", countIds)
      : Promise.resolve({ data: [], error: null }),
    receiptIds.length > 0
      ? supabase
          .from("stock_receipt_lines")
          .select("receipt_id, item_name, unit, quantity, unit_cost, note")
          .in("receipt_id", receiptIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (countLinesRes.error) throw countLinesRes.error;
  if (receiptLinesRes.error) throw receiptLinesRes.error;

  const staffIds = [
    ...countHeaders.map((row) => row.staff_id),
    ...receiptHeaders.map((row) => row.staff_id),
    ...wastageEntries.map((row) => row.staff_id),
  ];
  const staffNames = await fetchStaffNames(supabase, staffIds);

  const countById = new Map(countHeaders.map((row) => [row.id, row]));
  const counts: StockCountRow[] = (countLinesRes.data ?? []).flatMap((line) => {
    const header = countById.get(line.count_id);
    if (!header) return [];
    return [
      {
        date: header.business_date,
        outlet: outletNameById.get(header.outlet_id) ?? "",
        kind: kindLabel(header.kind),
        item: line.item_name,
        unit: line.unit,
        quantity: line.quantity,
        note: line.note,
        staff: staffNames[header.staff_id] ?? "Unknown staff",
        submittedAt: header.submitted_at,
        locationStatus: locationStatusLabel(header.location_status),
      },
    ];
  });

  const receiptById = new Map(receiptHeaders.map((row) => [row.id, row]));
  const receipts: StockReceiptRow[] = (receiptLinesRes.data ?? []).flatMap((line) => {
    const header = receiptById.get(line.receipt_id);
    if (!header) return [];
    const unitCost = line.unit_cost;
    return [
      {
        date: header.business_date,
        outlet: outletNameById.get(header.outlet_id) ?? "",
        vendor: header.vendor_name,
        invoiceRef: header.invoice_ref,
        item: line.item_name,
        unit: line.unit,
        quantity: line.quantity,
        unitCost,
        lineTotal: unitCost != null ? Math.round(line.quantity * unitCost * 100) / 100 : null,
        staff: staffNames[header.staff_id] ?? "Unknown staff",
        submittedAt: header.submitted_at,
      },
    ];
  });

  const wastage: WastageRow[] = wastageEntries.map((entry) => ({
    date: entry.business_date,
    outlet: outletNameById.get(entry.outlet_id) ?? "",
    item: entry.item_name,
    unit: entry.unit,
    quantity: entry.quantity,
    reason: WASTAGE_REASON_LABEL[entry.reason] ?? entry.reason,
    note: entry.note,
    staff: staffNames[entry.staff_id] ?? "Unknown staff",
    loggedAt: entry.logged_at,
    locationStatus: locationStatusLabel(entry.location_status),
  }));

  counts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  receipts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  wastage.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return { counts, receipts, wastage };
}
