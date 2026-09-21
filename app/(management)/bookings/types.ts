export type BookingPlatform =
  | "zomato"
  | "swiggy"
  | "eazydiner"
  | "google"
  | "website"
  | "other";

export type OutletHourRow = {
  id: string;
  outlet_id: string;
  weekday: number;
  shift: number;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
  last_booking_time: string | null;
};

export type OutletClosure = {
  id: string;
  outlet_id: string;
  date_from: string;
  date_to: string;
  reason: string | null;
};

export type BookingSource = {
  id: string;
  outlet_id: string;
  platform: BookingPlatform;
  label: string | null;
  url: string;
  method: "auto" | "manual";
  party_size: number;
  days_ahead: number;
  check_every_hours: number;
  active: boolean;
  last_checked_at: string | null;
  last_status: "ok" | "failed" | "blocked" | null;
  last_error: string | null;
};

export type WindowLabel = { name?: string; from?: string; to?: string };

export type BookingSnapshot = {
  id: string;
  source_id: string;
  outlet_id: string;
  checked_at: string;
  target_date: string;
  party_size: number | null;
  slots: string[];
  window_labels: WindowLabel[] | null;
  status: "ok" | "failed" | "blocked";
  error: string | null;
  screenshot_path: string | null;
  entry_method: "auto" | "manual";
};

export type AlertKind =
  | "slot_outside_hours"
  | "slot_on_closed_day"
  | "no_slots_when_open"
  | "window_outside_hours"
  | "check_failed"
  | "check_stale"
  | "hours_missing";

export type BookingAlert = {
  id: string;
  outlet_id: string;
  source_id: string;
  kind: AlertKind;
  target_date: string | null;
  details: Record<string, unknown>;
  status: "open" | "acknowledged" | "resolved";
  first_seen_at: string;
  last_seen_at: string;
  ack_by_name: string | null;
  ack_note: string | null;
  ack_at: string | null;
  resolved_at: string | null;
};

export const PLATFORM_LABEL: Record<BookingPlatform, string> = {
  zomato: "Zomato",
  swiggy: "Swiggy Dineout",
  eazydiner: "EazyDiner",
  google: "Google Reserve",
  website: "Website",
  other: "Other",
};
