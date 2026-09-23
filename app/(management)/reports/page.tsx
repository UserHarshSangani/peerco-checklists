"use client";

import { useMemo, useState } from "react";
import { addDaysToDateString, todayInKolkata } from "@/lib/date";
import { useOutletContext } from "../outlet-context";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { ChecklistCompliancePreview } from "./checklist-compliance-preview";
import { VarianceReportPreview } from "./variance-report-preview";
import { StockReportPreview } from "./stock-report-preview";
import type { ReportType } from "./types";

const MAX_RANGE_DAYS = 92;
const ALL_OUTLETS = "all";

function defaultRange(): { from: string; to: string } {
  const today = todayInKolkata();
  return { from: addDaysToDateString(today, -6), to: today };
}

const REPORT_TABS: { id: ReportType; label: string }[] = [
  { id: "checklist", label: "Checklist Compliance" },
  { id: "variance", label: "Variance" },
  { id: "stock", label: "Stock" },
];

export default function ReportsPage() {
  const { outlets, selectedOutlet } = useOutletContext();
  const initial = defaultRange();

  const [outletChoice, setOutletChoice] = useState<string>(selectedOutlet?.id ?? ALL_OUTLETS);
  const [fromInput, setFromInput] = useState(initial.from);
  const [toInput, setToInput] = useState(initial.to);
  const [appliedRange, setAppliedRange] = useState(initial);
  const [reportType, setReportType] = useState<ReportType>("checklist");

  const outletNameById = useMemo(
    () => new Map(outlets.map((outlet) => [outlet.id, outlet.name])),
    [outlets],
  );

  if (outlets.length === 0) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">Choose an outlet to see its reports.</p>
      </main>
    );
  }

  const outletIds = outletChoice === ALL_OUTLETS ? outlets.map((outlet) => outlet.id) : [outletChoice];
  const outletLabel =
    outletChoice === ALL_OUTLETS ? "All outlets" : (outletNameById.get(outletChoice) ?? "");

  const spanDays = Math.round(
    (Date.parse(toInput) - Date.parse(fromInput)) / 86_400_000,
  );
  const rangeInvalid =
    !fromInput || !toInput || toInput < fromInput || spanDays > MAX_RANGE_DAYS;

  const previewKey = `${outletIds.join(",")}-${appliedRange.from}-${appliedRange.to}`;

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-serif text-xl font-bold text-text">Reports</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm text-muted">
            Outlet
            <select
              value={outletChoice}
              onChange={(event) => setOutletChoice(event.target.value)}
              className="mt-1 min-h-[40px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            >
              {outlets.length > 1 && <option value={ALL_OUTLETS}>All outlets</option>}
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm text-muted">
            From
            <input
              type="date"
              value={fromInput}
              max={todayInKolkata()}
              onChange={(event) => setFromInput(event.target.value)}
              className="mt-1 min-h-[40px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-sm text-muted">
            To
            <input
              type="date"
              value={toInput}
              max={todayInKolkata()}
              onChange={(event) => setToInput(event.target.value)}
              className="mt-1 min-h-[40px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            />
          </label>
          <Button
            type="button"
            disabled={rangeInvalid}
            onClick={() => setAppliedRange({ from: fromInput, to: toInput })}
          >
            Apply
          </Button>
        </div>
      </div>

      {rangeInvalid && (
        <p className="mb-4 text-sm font-medium text-danger">
          Choose a range of at most {MAX_RANGE_DAYS} days, with an end date no earlier than the start date.
        </p>
      )}

      <div className="mb-4">
        <Tabs tabs={REPORT_TABS} value={reportType} onChange={setReportType} />
      </div>

      {reportType === "checklist" && (
        <ChecklistCompliancePreview
          key={`checklist-${previewKey}`}
          outletIds={outletIds}
          outletNameById={outletNameById}
          outletLabel={outletLabel}
          from={appliedRange.from}
          to={appliedRange.to}
        />
      )}
      {reportType === "variance" && (
        <VarianceReportPreview
          key={`variance-${previewKey}`}
          outletIds={outletIds}
          outletNameById={outletNameById}
          outletLabel={outletLabel}
          from={appliedRange.from}
          to={appliedRange.to}
        />
      )}
      {reportType === "stock" && (
        <StockReportPreview
          key={`stock-${previewKey}`}
          outletIds={outletIds}
          outletNameById={outletNameById}
          outletLabel={outletLabel}
          from={appliedRange.from}
          to={appliedRange.to}
        />
      )}
    </main>
  );
}
