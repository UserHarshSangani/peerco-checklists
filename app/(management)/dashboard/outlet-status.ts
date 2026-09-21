import { AlertCircle, AlertTriangle, CheckCircle2, Circle, type LucideIcon } from "lucide-react";
import type { PillTone } from "@/components/ui/status-pill";
import type { OutletStatus, OverviewOutlet } from "./types";

export const STATUS_CONFIG: Record<
  OutletStatus,
  { label: string; tone: PillTone; icon: LucideIcon; rank: number }
> = {
  needs_action: { label: "Needs action", tone: "danger", icon: AlertTriangle, rank: 0 },
  attention: { label: "Attention", tone: "warning", icon: AlertCircle, rank: 1 },
  not_started: { label: "Not started", tone: "neutral", icon: Circle, rank: 2 },
  on_track: { label: "On track", tone: "success", icon: CheckCircle2, rank: 3 },
};

// Worst-first — surfaces outlets needing attention at the top of the table.
export function sortOutletsBySeverity(outlets: OverviewOutlet[]): OverviewOutlet[] {
  return [...outlets].sort((a, b) => {
    const rankDiff = STATUS_CONFIG[a.status].rank - STATUS_CONFIG[b.status].rank;
    if (rankDiff !== 0) return rankDiff;
    return (a.completion_pct ?? -1) - (b.completion_pct ?? -1);
  });
}
