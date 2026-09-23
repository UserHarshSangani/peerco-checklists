"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRupees } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHead, TableBody, Th, Td } from "@/components/ui/table";
import {
  businessDateToExcelDate,
  buildAoaSheet,
  buildSheet,
  downloadWorkbook,
  reportFilename,
  type SheetColumn,
} from "@/lib/reports/excel";
import { fetchVarianceReport } from "./variance-report";
import type { VarianceReport, VarianceReportRow } from "./types";

const PREVIEW_ROWS = 20;

const MAIN_COLUMNS: SheetColumn<VarianceReportRow>[] = [
  { header: "Date", type: "date", get: (r) => businessDateToExcelDate(r.date) },
  { header: "Outlet", type: "text", get: (r) => r.outlet },
  { header: "Item", type: "text", get: (r) => r.item },
  { header: "Unit", type: "text", get: (r) => r.unit },
  { header: "Opening qty", type: "number", get: (r) => r.openingQty },
  { header: "Opening source", type: "text", get: (r) => r.openingSource ?? "" },
  { header: "Received qty", type: "number", get: (r) => r.receivedQty },
  { header: "Closing qty", type: "number", get: (r) => r.closingQty },
  { header: "Actual usage", type: "number", get: (r) => r.actualUsage },
  { header: "Sold usage", type: "number", get: (r) => r.soldUsage },
  { header: "Wastage", type: "number", get: (r) => r.wastage },
  { header: "Variance qty", type: "number", get: (r) => r.varianceQty },
  { header: "Variance value (₹)", type: "currency", get: (r) => r.varianceValue },
  { header: "Status", type: "text", get: (r) => r.status },
  { header: "Acknowledged", type: "text", get: (r) => (r.acknowledged ? "Yes" : "No") },
  { header: "Ack reason", type: "text", get: (r) => r.ackReason ?? "" },
  { header: "Ack by", type: "text", get: (r) => r.ackBy ?? "" },
  { header: "Ack note", type: "text", get: (r) => r.ackNote ?? "" },
];

function buildSummarySheet(report: VarianceReport) {
  const rows: (string | number | Date | null)[][] = [
    ["Total shortage value (₹)", Math.round(report.totalShortageValue * 100) / 100],
    ["Total surplus value (₹)", Math.round(report.totalSurplusValue * 100) / 100],
    [],
    ["Top 10 items by variance value"],
    ["Item", "Outlet", "Total variance qty", "Total variance value (₹)"],
    ...report.topItems.map((item) => [
      item.item,
      item.outlet,
      Math.round(item.varianceQty * 1000) / 1000,
      Math.round(item.varianceValue * 100) / 100,
    ]),
  ];
  const currencyCells = [
    { row: 0, col: 1 },
    { row: 1, col: 1 },
    ...report.topItems.map((_, index) => ({ row: 5 + index, col: 3 })),
  ];
  return buildAoaSheet(rows, currencyCells);
}

export function VarianceReportPreview({
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
  const [report, setReport] = useState<VarianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // No sync setLoading(true)/setLoadError(null) here — the parent remounts
  // this component (via `key`) on every param change, so `loading`/
  // `loadError`'s useState defaults already start each mount correctly.
  useEffect(() => {
    let cancelled = false;
    fetchVarianceReport(supabase, outletIds, outletNameById, from, to)
      .then((result) => {
        if (cancelled) return;
        setReport(result);
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
    if (!report) return;
    const ws = buildSheet(report.rows, MAIN_COLUMNS);
    const summaryWs = buildSummarySheet(report);
    downloadWorkbook(
      [
        { name: "Variance", ws },
        { name: "Summary", ws: summaryWs },
      ],
      reportFilename("Variance", outletLabel, from, to),
    );
  }

  if (loading) return <SkeletonList rows={6} rowClassName="h-12" />;
  if (loadError) {
    return <p className="text-danger">Couldn&apos;t load this report: {loadError}</p>;
  }

  const rows = report?.rows ?? [];

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
                <Th>Item</Th>
                <Th>Status</Th>
                <Th>Variance qty</Th>
                <Th>Variance value</Th>
                <Th>Acknowledged</Th>
              </tr>
            </TableHead>
            <TableBody>
              {rows.slice(0, PREVIEW_ROWS).map((row, index) => (
                <tr key={index}>
                  <Td className="whitespace-nowrap">{row.date}</Td>
                  <Td className="whitespace-nowrap">{row.outlet}</Td>
                  <Td className="whitespace-nowrap">{row.item}</Td>
                  <Td className="whitespace-nowrap capitalize">{row.status}</Td>
                  <Td className="whitespace-nowrap">
                    {row.varianceQty != null ? `${row.varianceQty} ${row.unit}` : "—"}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {row.varianceValue != null ? formatRupees(row.varianceValue) : "—"}
                  </Td>
                  <Td className="whitespace-nowrap">{row.acknowledged ? "Yes" : "No"}</Td>
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
