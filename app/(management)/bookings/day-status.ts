import {
  AlertTriangle,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import type { PillTone } from "@/components/ui/status-pill";
import type { BookingAlert, BookingSnapshot } from "./types";

export type DayStatusId =
  | "ok"
  | "outside_hours"
  | "closed_day"
  | "no_slots"
  | "check_failed"
  | "not_checked";

export type DayStatus = {
  id: DayStatusId;
  label: string;
  tone: PillTone;
  icon: LucideIcon;
};

// Alerts already reflect exactly what the server's rules engine judged for
// this source+date (re-evaluated on every snapshot), so day status is read
// from them rather than re-implementing the rules client-side — except
// "check failed", which comes straight from the snapshot's own status.
export function dayStatus(
  snapshot: BookingSnapshot | undefined,
  dayAlerts: BookingAlert[],
): DayStatus {
  if (!snapshot) {
    return { id: "not_checked", label: "Not checked", tone: "neutral", icon: HelpCircle };
  }
  if (snapshot.status !== "ok") {
    return { id: "check_failed", label: "Check failed", tone: "danger", icon: AlertTriangle };
  }
  const openAlerts = dayAlerts.filter((a) => a.status !== "resolved");
  const closedDay = openAlerts.find((a) => a.kind === "slot_on_closed_day");
  if (closedDay) {
    return {
      id: "closed_day",
      label: "Slots on closed day",
      tone: "danger",
      icon: CircleSlash,
    };
  }
  const outsideHours = openAlerts.find((a) => a.kind === "slot_outside_hours");
  if (outsideHours) {
    const offending = (outsideHours.details.offending as string[] | undefined) ?? [];
    return {
      id: "outside_hours",
      label: `Outside hours (${offending.length})`,
      tone: "danger",
      icon: CircleAlert,
    };
  }
  const noSlots = openAlerts.find((a) => a.kind === "no_slots_when_open");
  if (noSlots) {
    return { id: "no_slots", label: "No slots", tone: "warning", icon: CircleAlert };
  }
  return { id: "ok", label: "OK", tone: "success", icon: CircleCheck };
}
