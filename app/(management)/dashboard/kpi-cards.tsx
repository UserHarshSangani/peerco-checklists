import Link from "next/link";
import { CheckCircle2, ListChecks, Scale, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { ProgressBar } from "@/components/ui/progress-bar";
import { InfoTooltip } from "./info-tooltip";
import { DeltaIndicator } from "./delta-indicator";
import type { OverviewKpis } from "./types";

export function KpiCards({ kpis }: { kpis: OverviewKpis }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <IconCircle icon={<CheckCircle2 className="h-full w-full" />} tone="success" />
          <InfoTooltip text="Checklists due by now (or already submitted) that have been completed, as a share of everything due today." />
        </div>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">
          Checklist completion
        </p>
        {kpis.completion_pct == null ? (
          <p className="mt-1 text-sm text-muted">Nothing due yet</p>
        ) : (
          <>
            <p className="mt-1 text-2xl font-bold text-text">{kpis.completion_pct}%</p>
            <ProgressBar value={kpis.completion_pct} className="my-2" />
            <DeltaIndicator
              current={kpis.completion_pct}
              previous={kpis.last_week.completion_pct}
              higherIsBetter
              suffix=" pts"
            />
          </>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <IconCircle icon={<ListChecks className="h-full w-full" />} tone="warning" />
          <InfoTooltip text="Checklist items marked not done in checklists that have already been submitted." />
        </div>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">
          Missed items
        </p>
        <p className="mt-1 text-2xl font-bold text-text">{kpis.missed_items}</p>
        <DeltaIndicator
          current={kpis.missed_items}
          previous={kpis.last_week.missed_items}
          higherIsBetter={false}
        />
        {kpis.overdue > 0 && (
          <p className="mt-1 text-xs font-medium text-danger">
            {kpis.overdue} checklist{kpis.overdue === 1 ? "" : "s"} overdue
          </p>
        )}
      </Card>

      <Link href="/variance">
        <Card className="h-full transition hover:bg-border/20">
          <div className="mb-3 flex items-center justify-between">
            <IconCircle icon={<Scale className="h-full w-full" />} tone="danger" />
            <InfoTooltip text="Open shortage/surplus flags from stock variance, not yet acknowledged, over the selected date range." />
          </div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            Variance alerts
          </p>
          <p className="mt-1 text-2xl font-bold text-text">{kpis.open_variance_flags}</p>
        </Card>
      </Link>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <IconCircle icon={<Users className="h-full w-full" />} tone="info" />
          <InfoTooltip text="Active staff members across the selected outlet(s)." />
        </div>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">
          Active staff
        </p>
        <p className="mt-1 text-2xl font-bold text-text">{kpis.active_staff}</p>
      </Card>
    </div>
  );
}
