"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeKolkata } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHead, TableBody, Th, Td } from "@/components/ui/table";
import {
  businessDateToExcelDate,
  buildSheet,
  downloadWorkbook,
  kolkataInstantToExcelDate,
  reportFilename,
  timeOfDayToDate,
  type SheetColumn,
} from "@/lib/reports/excel";
import { fetchChecklistComplianceReport } from "./checklist-compliance";
import type { ChecklistComplianceRow, ChecklistSummaryRow } from "./types";

const PREVIEW_ROWS = 20;

const MAIN_COLUMNS: SheetColumn<ChecklistComplianceRow>[] = [
  { header: "Date", type: "date", get: (r) => businessDateToExcelDate(r.date) },
  { header: "Outlet", type: "text", get: (r) => r.outlet },
  { header: "Checklist", type: "text", get: (r) => r.checklist },
  { header: "Kind", type: "text", get: (r) => r.kind },
  { header: "Due time", type: "time", get: (r) => (r.dueTime ? timeOfDayToDate(r.dueTime) : null) },
  { header: "Submitted", type: "text", get: (r) => (r.submitted ? "Yes" : "No") },
  { header: "Submitted by", type: "text", get: (r) => r.submittedBy ?? "" },
  {
    header: "Submitted at",
    type: "datetime",
    get: (r) => (r.submittedAt ? kolkataInstantToExcelDate(r.submittedAt) : null),
  },
  { header: "Items total", type: "number", get: (r) => r.itemsTotal },
  { header: "Items done", type: "number", get: (r) => r.itemsDone },
  { header: "Items missed", type: "number", get: (r) => r.itemsMissed },
  { header: "Missed items", type: "text", get: (r) => r.missedItems },
  { header: "Location status", type: "text", get: (r) => r.locationStatus },
];

const SUMMARY_COLUMNS: SheetColumn<ChecklistSummaryRow>[] = [
  { header: "Outlet", type: "text", get: (r) => r.outlet },
  { header: "Completion %", type: "number", get: (r) => r.completionPct },
  { header: "Total missed items", type: "number", get: (r) => r.totalMissedItems },
  { header: "Total checklists submitted", type: "number", get: (r) => r.totalSubmitted },
  { header: "Total checklists expected", type: "number", get: (r) => r.totalExpected },
];

export function ChecklistCompliancePreview({
  outletIds,
  outletNameById,
  outletLabel,
  from,
  to,
}: {
  outletIds: string[];
  outletNameById: Map<string, string>;
  outletLabel: string;
  from: string;
  to: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<ChecklistComplianceRow[]>([]);
  const [summary, setSummary] = useState<ChecklistSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // No sync setLoading(true)/setLoadError(null) here — the parent remounts
  // this component (via `key`) on every param change, so `loading`/
  // `loadError`'s useState defaults already start each mount correctly.
  useEffect(() => {
    let cancelled = false;
    fetchChecklistComplianceReport(supabase, outletIds, outletNameById, from, to)
      .then((report) => {
        if (cancelled) return;
        setRows(report.rows);
        setSummary(report.summary);
        setLoading(false);
      })
      .catch((error: { message?: string }) => {
        if (cancelled) return;
        setLoadError(error.message ?? "Something went wrong. Please try again.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, outletIds.join(","), from, to]);

  function handleDownload() {
    const ws = buildSheet(rows, MAIN_COLUMNS);
    const summaryWs = buildSheet(summary, SUMMARY_COLUMNS);
    downloadWorkbook(
      [
        { name: "Checklist Compliance", ws },
        { name: "Summary", ws: summaryWs },
      ],
      reportFilename("ChecklistCompliance", outletLabel, from, to),
    );
  }

  if (loading) return <SkeletonList rows={6} rowClassName="h-12" />;
  if (loadError) {
    return <p className="text-danger">Couldn&apos;t load this report: {loadError}</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {rows.length} row{rows.length === 1 ? "" : "s"} in this range
        </p>
        <Button type="button" disabled={loading} onClick={handleDownload}>
          Download Excel
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No data for this range." />
      ) : (
        <>
          <Table>
            <TableHead>
              <tr>
                <Th>Date</Th>
                <Th>Outlet</Th>
                <Th>Checklist</Th>
                <Th>Submitted</Th>
                <Th>Submitted by</Th>
                <Th>Items done</Th>
                <Th>Items missed</Th>
                <Th>Location</Th>
              </tr>
            </TableHead>
            <TableBody>
              {rows.slice(0, PREVIEW_ROWS).map((row, index) => (
                <tr key={index}>
                  <Td className="whitespace-nowrap">{row.date}</Td>
                  <Td className="whitespace-nowrap">{row.outlet}</Td>
                  <Td className="whitespace-nowrap">{row.checklist}</Td>
                  <Td className="whitespace-nowrap">
                    <span className={row.submitted ? "text-success" : "text-danger"}>
                      {row.submitted ? "Yes" : "No"}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">{row.submittedBy ?? "—"}</Td>
                  <Td className="whitespace-nowrap">
                    {row.itemsDone != null ? `${row.itemsDone}/${row.itemsTotal}` : "—"}
                  </Td>
                  <Td className="whitespace-nowrap">{row.itemsMissed ?? "—"}</Td>
                  <Td className="whitespace-nowrap">
                    {row.submittedAt ? formatTimeKolkata(row.submittedAt) : ""}{" "}
                    {row.locationStatus}
                  </Td>
                </tr>
              ))}
            </TableBody>
          </Table>
          {rows.length > PREVIEW_ROWS && (
            <p className="mt-2 text-xs text-muted">
              +{rows.length - PREVIEW_ROWS} more rows in the downloaded file
            </p>
          )}
        </>
      )}
    </div>
  );
}
