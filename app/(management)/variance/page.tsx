"use client";

import { useState } from "react";
import { addDaysToDateString, todayInKolkata } from "@/lib/date";
import { useOutletContext } from "../outlet-context";
import { Button } from "@/components/ui/button";
import { VarianceTable } from "./variance-table";

const MAX_RANGE_DAYS = 31;

function defaultRange(): { from: string; to: string } {
  const yesterday = addDaysToDateString(todayInKolkata(), -1);
  return { from: addDaysToDateString(yesterday, -6), to: yesterday };
}

export default function VariancePage() {
  const { selectedOutlet } = useOutletContext();
  const initial = defaultRange();
  const [fromInput, setFromInput] = useState(initial.from);
  const [toInput, setToInput] = useState(initial.to);
  const [appliedRange, setAppliedRange] = useState(initial);
  const [recalcToken, setRecalcToken] = useState(0);

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">Choose an outlet to see its variance.</p>
      </main>
    );
  }

  // Mirrors recompute_variance_range's own check exactly (p_to - p_from > 31)
  // so the UI never blocks a range the RPC would actually accept.
  const spanDays = Math.round(
    (Date.parse(toInput) - Date.parse(fromInput)) / 86_400_000,
  );
  const rangeInvalid =
    !fromInput || !toInput || toInput < fromInput || spanDays > MAX_RANGE_DAYS;

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-xl font-semibold text-text">Variance</h2>
        <div className="flex flex-wrap items-end gap-3">
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => setRecalcToken((n) => n + 1)}
          >
            Recalculate
          </Button>
        </div>
      </div>

      {rangeInvalid && (
        <p className="mb-4 text-sm font-medium text-danger">
          Choose a range of at most {MAX_RANGE_DAYS} days.
        </p>
      )}

      <VarianceTable
        key={`${selectedOutlet.id}-${appliedRange.from}-${appliedRange.to}-${recalcToken}`}
        outletId={selectedOutlet.id}
        from={appliedRange.from}
        to={appliedRange.to}
      />
    </main>
  );
}
