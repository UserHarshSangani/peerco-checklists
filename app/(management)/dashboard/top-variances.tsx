import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { formatRupees } from "@/lib/format";
import { IconCircle } from "@/components/ui/icon-circle";
import { EmptyState } from "@/components/ui/empty-state";
import { Sparkline } from "./sparkline";
import type { OverviewVariance } from "./types";

export function TopVariances({ variances }: { variances: OverviewVariance[] }) {
  if (variances.length === 0) {
    return <EmptyState title="No open variances" />;
  }

  return (
    <ul className="flex flex-col gap-3">
      {variances.map((variance, index) => {
        const isShortage = variance.variance_qty > 0;
        return (
          <li key={`${variance.item}-${variance.outlet}-${index}`}>
            <Link
              href="/variance"
              className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-border/20"
            >
              <IconCircle
                icon={<span className="text-sm font-bold">{variance.item[0]?.toUpperCase()}</span>}
                tone={isShortage ? "danger" : "warning"}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{variance.item}</p>
                <p className="truncate text-xs text-muted">{variance.outlet}</p>
              </div>
              <Sparkline values={variance.series.map((point) => point.qty)} />
              <div className="shrink-0 text-right">
                <p
                  className={`flex items-center justify-end gap-1 text-sm font-semibold ${
                    isShortage ? "text-danger" : "text-warning"
                  }`}
                >
                  {isShortage ? (
                    <TrendingUp className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="h-4 w-4" aria-hidden="true" />
                  )}
                  {variance.variance_pct != null
                    ? `${variance.variance_pct > 0 ? "+" : ""}${variance.variance_pct}%`
                    : isShortage
                      ? "Shortage"
                      : "Surplus"}
                </p>
                <p className="text-xs text-muted">
                  {variance.variance_value != null ? formatRupees(Math.abs(variance.variance_value)) : "—"}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
