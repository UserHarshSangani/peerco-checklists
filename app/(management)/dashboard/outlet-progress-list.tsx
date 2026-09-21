import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { STATUS_CONFIG, sortOutletsBySeverity } from "./outlet-status";
import type { OverviewOutlet } from "./types";

// The mobile/tablet stand-in for OutletTable — a stack of progress bars
// instead of a table, same severity-first ordering.
export function OutletProgressList({
  outlets,
  isAdmin,
  onSelectOutlet,
}: {
  outlets: OverviewOutlet[];
  isAdmin: boolean;
  onSelectOutlet: (outletId: string) => void;
}) {
  if (outlets.length === 0) {
    return <EmptyState title="No outlets to show." />;
  }

  const sorted = sortOutletsBySeverity(outlets);

  return (
    <ul className="flex flex-col gap-3">
      {sorted.map((outlet) => {
        const status = STATUS_CONFIG[outlet.status];
        const StatusIcon = status.icon;
        return (
          <li key={outlet.outlet_id}>
            <button
              type="button"
              onClick={() => onSelectOutlet(outlet.outlet_id)}
              className="w-full rounded-2xl bg-surface p-4 text-left shadow-sm ring-1 ring-border"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-text">{outlet.name}</p>
                  {isAdmin && <p className="text-xs text-muted">{outlet.brand}</p>}
                </div>
                <StatusPill tone={status.tone} icon={<StatusIcon className="h-full w-full" />}>
                  {status.label}
                </StatusPill>
              </div>
              <ProgressBar value={outlet.completion_pct ?? 0} className="mb-1" />
              <p className="text-xs text-muted">
                {outlet.completion_pct == null ? "—" : `${outlet.completion_pct}%`} ·{" "}
                {outlet.missed_items} missed · {outlet.overdue} overdue
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
