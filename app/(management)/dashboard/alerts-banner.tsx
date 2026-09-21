import { AlertTriangle, Clock } from "lucide-react";
import type { OverviewAlert } from "./types";

export function AlertsBanner({ alerts }: { alerts: OverviewAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((alert, index) => {
        const overdue = alert.kind === "overdue";
        const minutes = Math.abs(alert.minutes);
        return (
          <div
            key={`${alert.outlet_id}-${alert.template}-${index}`}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium ${
              overdue
                ? "bg-danger-bg text-danger-fg"
                : "bg-warning-bg text-warning-fg"
            }`}
          >
            {overdue ? (
              <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
            ) : (
              <Clock className="h-5 w-5 shrink-0" aria-hidden="true" />
            )}
            <span>
              {overdue
                ? `${alert.template} at ${alert.outlet} is ${minutes} min overdue`
                : `${alert.template} at ${alert.outlet} is due in ${minutes} min`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
