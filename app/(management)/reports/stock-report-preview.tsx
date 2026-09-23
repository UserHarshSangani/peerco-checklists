"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRupees } from "@/lib/format";
import { formatTimeKolkata } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHead, TableBody, Th, Td } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import {
  businessDateToExcelDate,
  buildSheet,
  downloadWorkbook,
  kolkataInstantToExcelDate,
  reportFilename,
  type SheetColumn,
} from "@/lib/reports/excel";
import { fetchStockReport } from "./stock-report";
import type { StockCountRow, StockReceiptRow, StockReport, WastageRow } from "./types";

const PREVIEW_ROWS = 20;
type SubTab = "counts" | "receipts" | "wastage";

const COUNT_COLUMNS: SheetColumn<StockCountRow>[] = [
  { header: "Date", type: "date", get: (r) => businessDateToExcelDate(r.date) },
  { header: "Outlet", type: "text", get: (r) => r.outlet },
  { header: "Kind", type: "text", get: (r) => r.kind },
  { header: "Item", type: "text", get: (r) => r.item },
  { header: "Unit", type: "text", get: (r) => r.unit },
  { header: "Quantity", type: "number", get: (r) => r.quantity },
  { header: "Note", type: "text", get: (r) => r.note ?? "" },
  { header: "Staff", type: "text", get: (r) => r.staff },
  { header: "Submitted at", type: "datetime", get: (r) => kolkataInstantToExcelDate(r.submittedAt) },
  { header: "Location status", type: "text", get: (r) => r.locationStatus },
];

const RECEIPT_COLUMNS: SheetColumn<StockReceiptRow>[] = [
  { header: "Date", type: "date", get: (r) => businessDateToExcelDate(r.date) },
  { header: "Outlet", type: "text", get: (r) => r.outlet },
  { header: "Vendor", type: "text", get: (r) => r.vendor },
  { header: "Invoice ref", type: "text", get: (r) => r.invoiceRef ?? "" },
  { header: "Item", type: "text", get: (r) => r.item },
  { header: "Unit", type: "text", get: (r) => r.unit },
  { header: "Quantity", type: "number", get: (r) => r.quantity },
  { header: "Unit cost (₹)", type: "currency", get: (r) => r.unitCost },
  { header: "Line total (₹)", type: "currency", get: (r) => r.lineTotal },
  { header: "Staff", type: "text", get: (r) => r.staff },
  { header: "Submitted at", type: "datetime", get: (r) => kolkataInstantToExcelDate(r.submittedAt) },
];

const WASTAGE_COLUMNS: SheetColumn<WastageRow>[] = [
  { header: "Date", type: "date", get: (r) => businessDateToExcelDate(r.date) },
  { header: "Outlet", type: "text", get: (r) => r.outlet },
  { header: "Item", type: "text", get: (r) => r.item },
  { header: "Unit", type: "text", get: (r) => r.unit },
  { header: "Quantity", type: "number", get: (r) => r.quantity },
  { header: "Reason", type: "text", get: (r) => r.reason },
  { header: "Note", type: "text", get: (r) => r.note ?? "" },
  { header: "Staff", type: "text", get: (r) => r.staff },
  { header: "Logged at", type: "datetime", get: (r) => kolkataInstantToExcelDate(r.loggedAt) },
  { header: "Location status", type: "text", get: (r) => r.locationStatus },
];

export function StockReportPreview({
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
  const [report, setReport] = useState<StockReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("counts");

  // No sync setLoading(true)/setLoadError(null) here — the parent remounts
  // this component (via `key`) on every param change, so `loading`/
  // `loadError`'s useState defaults already start each mount correctly.
  useEffect(() => {
    let cancelled = false;
    fetchStockReport(supabase, outletIds, outletNameById, from, to)
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
    downloadWorkbook(
      [
        { name: "Counts", ws: buildSheet(report.counts, COUNT_COLUMNS) },
        { name: "Receipts", ws: buildSheet(report.receipts, RECEIPT_COLUMNS) },
        { name: "Wastage", ws: buildSheet(report.wastage, WASTAGE_COLUMNS) },
      ],
      reportFilename("Stock", outletLabel, from, to),
    );
  }

  if (loading) return <SkeletonList rows={6} rowClassName="h-12" />;
  if (loadError) {
    return <p className="text-danger">Couldn&apos;t load this report: {loadError}</p>;
  }

  const counts = report?.counts ?? [];
  const receipts = report?.receipts ?? [];
  const wastage = report?.wastage ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { id: "counts", label: `Counts (${counts.length})` },
            { id: "receipts", label: `Receipts (${receipts.length})` },
            { id: "wastage", label: `Wastage (${wastage.length})` },
          ]}
          value={subTab}
          onChange={setSubTab}
        />
        <Button type="button" disabled={loading} onClick={handleDownload}>
          Download Excel
        </Button>
      </div>

      {subTab === "counts" &&
        (counts.length === 0 ? (
          <EmptyState title="No data for this range." />
        ) : (
          <>
            <Table>
              <TableHead>
                <tr>
                  <Th>Date</Th>
                  <Th>Outlet</Th>
                  <Th>Kind</Th>
                  <Th>Item</Th>
                  <Th>Quantity</Th>
                  <Th>Staff</Th>
                  <Th>Location</Th>
                </tr>
              </TableHead>
              <TableBody>
                {counts.slice(0, PREVIEW_ROWS).map((row, index) => (
                  <tr key={index}>
                    <Td className="whitespace-nowrap">{row.date}</Td>
                    <Td className="whitespace-nowrap">{row.outlet}</Td>
                    <Td className="whitespace-nowrap">{row.kind}</Td>
                    <Td className="whitespace-nowrap">{row.item}</Td>
                    <Td className="whitespace-nowrap">
                      {row.quantity} {row.unit}
                    </Td>
                    <Td className="whitespace-nowrap">{row.staff}</Td>
                    <Td className="whitespace-nowrap">{row.locationStatus}</Td>
                  </tr>
                ))}
              </TableBody>
            </Table>
            {counts.length > PREVIEW_ROWS && (
              <p className="mt-2 text-xs text-muted">
                +{counts.length - PREVIEW_ROWS} more rows in the downloaded file
              </p>
            )}
          </>
        ))}

      {subTab === "receipts" &&
        (receipts.length === 0 ? (
          <EmptyState title="No data for this range." />
        ) : (
          <>
            <Table>
              <TableHead>
                <tr>
                  <Th>Date</Th>
                  <Th>Outlet</Th>
                  <Th>Vendor</Th>
                  <Th>Item</Th>
                  <Th>Quantity</Th>
                  <Th>Line total</Th>
                  <Th>Staff</Th>
                </tr>
              </TableHead>
              <TableBody>
                {receipts.slice(0, PREVIEW_ROWS).map((row, index) => (
                  <tr key={index}>
                    <Td className="whitespace-nowrap">{row.date}</Td>
                    <Td className="whitespace-nowrap">{row.outlet}</Td>
                    <Td className="whitespace-nowrap">{row.vendor}</Td>
                    <Td className="whitespace-nowrap">{row.item}</Td>
                    <Td className="whitespace-nowrap">
                      {row.quantity} {row.unit}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {row.lineTotal != null ? formatRupees(row.lineTotal) : "—"}
                    </Td>
                    <Td className="whitespace-nowrap">{row.staff}</Td>
                  </tr>
                ))}
              </TableBody>
            </Table>
            {receipts.length > PREVIEW_ROWS && (
              <p className="mt-2 text-xs text-muted">
                +{receipts.length - PREVIEW_ROWS} more rows in the downloaded file
              </p>
            )}
          </>
        ))}

      {subTab === "wastage" &&
        (wastage.length === 0 ? (
          <EmptyState title="No data for this range." />
        ) : (
          <>
            <Table>
              <TableHead>
                <tr>
                  <Th>Date</Th>
                  <Th>Outlet</Th>
                  <Th>Item</Th>
                  <Th>Quantity</Th>
                  <Th>Reason</Th>
                  <Th>Staff</Th>
                  <Th>Logged at</Th>
                </tr>
              </TableHead>
              <TableBody>
                {wastage.slice(0, PREVIEW_ROWS).map((row, index) => (
                  <tr key={index}>
                    <Td className="whitespace-nowrap">{row.date}</Td>
                    <Td className="whitespace-nowrap">{row.outlet}</Td>
                    <Td className="whitespace-nowrap">{row.item}</Td>
                    <Td className="whitespace-nowrap">
                      {row.quantity} {row.unit}
                    </Td>
                    <Td className="whitespace-nowrap">{row.reason}</Td>
                    <Td className="whitespace-nowrap">{row.staff}</Td>
                    <Td className="whitespace-nowrap">{formatTimeKolkata(row.loggedAt)}</Td>
                  </tr>
                ))}
              </TableBody>
            </Table>
            {wastage.length > PREVIEW_ROWS && (
              <p className="mt-2 text-xs text-muted">
                +{wastage.length - PREVIEW_ROWS} more rows in the downloaded file
              </p>
            )}
          </>
        ))}
    </div>
  );
}
