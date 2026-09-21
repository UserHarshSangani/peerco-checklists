import { formatDateLabel } from "@/lib/date";
import type { AlertKind, BookingAlert } from "./types";

export const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  slot_outside_hours: "Slots outside hours",
  slot_on_closed_day: "Slots on closed day",
  no_slots_when_open: "No slots shown",
  window_outside_hours: "Window outside hours",
  check_failed: "Check failed",
  check_stale: "Check overdue",
  hours_missing: "Hours not set",
};

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// Renders the exact plain-language sentence for each alert kind, from its
// `details` payload (shape documented in private.apply_booking_rules /
// private.raise_booking_alert).
export function alertMessage(alert: BookingAlert): string {
  const d = alert.details as Record<string, unknown>;
  const dateLabel = alert.target_date ? formatDateLabel(alert.target_date) : null;

  switch (alert.kind) {
    case "slot_outside_hours": {
      const offending = ((d.offending as string[] | undefined) ?? []).map((t) => t.slice(0, 5));
      const allowed = (d.allowed as { from: string; to: string }[] | undefined) ?? [];
      const allowedText = allowed.map((w) => `${w.from.slice(0, 5)}-${w.to.slice(0, 5)}`).join(", ");
      return `Booking slots shown at ${joinWithAnd(offending)}${dateLabel ? ` on ${dateLabel}` : ""}, outside ${
        allowedText || "opening hours"
      }`;
    }
    case "slot_on_closed_day": {
      const reason = d.reason === "holiday_closure" ? "a holiday closure" : "a closed day";
      return `Slots shown on ${reason}${dateLabel ? ` (${dateLabel})` : ""}`;
    }
    case "no_slots_when_open":
      return `No slots shown on a day the outlet is open${dateLabel ? ` (${dateLabel})` : ""}`;
    case "window_outside_hours":
      return `Platform window ends after closing time${dateLabel ? ` (${dateLabel})` : ""}`;
    case "check_failed":
      return `Last check failed${d.error ? `: ${d.error}` : ""}`;
    case "check_stale": {
      const hours = d.threshold_hours as number | undefined;
      return `No check for ${hours ?? "several"} hours`;
    }
    case "hours_missing":
      return "Opening hours are not set";
    default:
      return "Booking issue detected";
  }
}
