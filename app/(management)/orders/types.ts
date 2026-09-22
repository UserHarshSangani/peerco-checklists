export type DraftStatus = "draft" | "approved" | "dismissed";

export type LineReason =
  | "shortage"
  | "sufficient_stock"
  | "no_recent_count"
  | "no_par_no_forecast";

export type ForecastBasis = "same_weekday" | "recent_days" | null;

export type OrderDraft = {
  id: string;
  outlet_id: string;
  business_date: string;
  status: DraftStatus;
  created_by: string | null;
  created_at: string;
  approved_by_name: string | null;
  approved_at: string | null;
  dismissed_at: string | null;
  notes: string | null;
};

export type OrderDraftLine = {
  id: string;
  draft_id: string;
  outlet_id: string;
  item_id: string | null;
  item_name: string;
  unit: string;
  vendor_id: string | null;
  vendor_name: string;
  current_stock: number | null;
  last_count_date: string | null;
  daily_forecast: number | null;
  forecast_basis: ForecastBasis;
  forecast_samples: number | null;
  par_level: number | null;
  lead_time_days: number;
  target_qty: number | null;
  order_unit: string | null;
  order_unit_size: number;
  suggested_units: number | null;
  suggested_qty: number;
  order_qty: number;
  include: boolean;
  reason: LineReason;
  note: string | null;
};

// Reason ordering within a vendor group — shortage first, as required, with
// the other "needs attention" reasons ahead of a plain "stocked" line.
export const REASON_SORT_ORDER: Record<LineReason, number> = {
  shortage: 0,
  no_recent_count: 1,
  no_par_no_forecast: 2,
  sufficient_stock: 3,
};

export const NO_VENDOR_LABEL = "No vendor assigned";
