export type BookingPlatform = "zomato" | "swiggy" | "eazydiner" | "google" | "website" | "other";

export type DueSource = {
  id: string;
  outlet_id: string;
  outlet_name: string;
  platform: BookingPlatform;
  label: string | null;
  url: string;
  method: "auto" | "manual";
  party_size: number;
  days_ahead: number;
  check_every_hours: number;
  active: boolean;
  last_checked_at: string | null;
};

export type WindowLabel = { name: string; from: string; to: string };

export type SnapshotStatus = "ok" | "failed" | "blocked";

export type DateResult = {
  targetDate: string;
  status: SnapshotStatus;
  slots: string[];
  windowLabels: WindowLabel[];
  error?: string;
  skippedCount?: number;
  screenshotPath?: string;
};
