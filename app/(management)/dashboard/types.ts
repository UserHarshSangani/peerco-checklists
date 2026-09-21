export type OutletStatus = "on_track" | "attention" | "needs_action" | "not_started";

export type OverviewKpis = {
  outlets: number;
  expected: number;
  done: number;
  completion_pct: number | null;
  overdue: number;
  missed_items: number;
  photos: number;
  open_variance_flags: number;
  outside_location: number;
  active_staff: number;
  last_week: { completion_pct: number | null; missed_items: number };
};

export type OverviewOutlet = {
  outlet_id: string;
  name: string;
  brand: string;
  organization_id: string;
  expected: number;
  done: number;
  completion_pct: number | null;
  overdue: number;
  items_total: number;
  missed_items: number;
  photos: number;
  open_variance_flags: number;
  outside_location: number;
  status: OutletStatus;
};

export type OverviewTrendPoint = {
  date: string;
  expected: number;
  done: number;
  completion_pct: number | null;
};

export type OverviewVarianceSeriesPoint = { date: string; qty: number };

export type OverviewVariance = {
  item: string;
  outlet: string;
  unit: string;
  variance_qty: number;
  variance_value: number | null;
  variance_pct: number | null;
  days_flagged: number;
  series: OverviewVarianceSeriesPoint[];
};

export type OverviewAlert = {
  kind: "overdue" | "upcoming";
  outlet_id: string;
  outlet: string;
  template: string;
  due_time: string;
  minutes: number;
};

export type OverviewActivityType = "checklist" | "stock_count" | "receipt" | "wastage";

export type OverviewActivity = {
  type: OverviewActivityType;
  id: string;
  ts: string;
  outlet: string;
  staff: string;
  title: string;
  detail?: string;
  items_done?: number;
  items_total?: number;
  photo_count?: number;
  photos: string[];
  location_status: string;
};

export type OverviewData = {
  date: string;
  is_today: boolean;
  kpis: OverviewKpis;
  outlets: OverviewOutlet[];
  trend: OverviewTrendPoint[];
  top_variances: OverviewVariance[];
  alerts: OverviewAlert[];
  activity: OverviewActivity[];
};

export type OverviewResponse =
  | ({ ok: true } & OverviewData)
  | { ok: false; reason: string };
