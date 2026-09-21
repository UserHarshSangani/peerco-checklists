import type { VarianceStatus } from "./reasons";

export type VarianceRow = {
  id: string;
  business_date: string;
  item_id: string | null;
  item_name: string;
  unit: string;
  opening_qty: number | null;
  opening_source: "opening_count" | "previous_closing" | null;
  received_qty: number;
  closing_qty: number | null;
  actual_usage_qty: number | null;
  sold_usage_qty: number;
  wastage_qty: number;
  gap_before_wastage_qty: number | null;
  variance_qty: number | null;
  tolerance_qty: number | null;
  cost_per_unit: number | null;
  variance_value: number | null;
  overnight_gap_qty: number | null;
  status: VarianceStatus;
  ack_status: "not_required" | "open" | "acknowledged";
  ack_reason: string | null;
  ack_note: string | null;
  ack_by_name: string | null;
  ack_at: string | null;
};
