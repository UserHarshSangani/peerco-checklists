"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatQuantity, formatRupees } from "@/lib/format";
import { formatDateLabel } from "@/lib/date";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { parseSalesCsv, type SalesPreview } from "./csv-parser";

type ImportSuccess = {
  ok: true;
  import_id: string;
  rows_saved: number;
  date_from: string;
  date_to: string;
  units: number;
  revenue: number | null;
  new_pos_items: number;
  unmapped: { pos_name: string; units: number }[];
};

type ImportFailure = { ok: false; reason: string; count?: number };
type ImportResponse = ImportSuccess | ImportFailure;

const CHANNEL_LABEL: Record<string, string> = {
  dine_in: "Dine in",
  pickup: "Pickup",
  zomato: "Zomato",
  swiggy: "Swiggy",
  delivery_other: "Other delivery",
  unknown: "Unknown",
};

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(to) - Date.parse(from)) / 86_400_000,
  );
}

function reasonMessage(result: ImportFailure): string {
  switch (result.reason) {
    case "not_allowed":
      return "You don't have permission to import sales for this outlet.";
    case "bad_rows":
      return `${result.count ?? "Some"} row(s) in this file have invalid data.`;
    case "range_too_long":
      return "This file covers more than 92 days. Please split it into smaller files.";
    default:
      return "Something went wrong reading this file. Please try again.";
  }
}

export function ImportModal({
  outletId,
  onClose,
  onImported,
}: {
  outletId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SalesPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function handleFileSelected(file: File) {
    setFileName(file.name);
    setPreview(null);
    setParseError(null);
    setResult(null);
    setParsing(true);
    const { preview: parsed, error } = await parseSalesCsv(file);
    setParsing(false);
    if (error) {
      setParseError(error);
      return;
    }
    setPreview(parsed);
  }

  const rangeTooLong = preview
    ? daysBetween(preview.dateFrom, preview.dateTo) > 92
    : false;

  async function handleConfirm() {
    if (!preview) return;
    setImporting(true);
    const { data, error } = await supabase.rpc("import_pos_sales", {
      p_outlet_id: outletId,
      p_rows: preview.rows,
      p_source_name: fileName,
    });
    setImporting(false);
    if (error) {
      setResult({ ok: false, reason: "bad_request" });
      return;
    }
    const response = data as ImportResponse;
    setResult(response);
    if (response.ok) onImported();
  }

  return (
    <Modal
      onClose={onClose}
      title="Import sales"
      panelClassName="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-surface p-6 shadow-xl outline-none"
    >
      {result?.ok ? (
        <SuccessView result={result} onClose={onClose} />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Upload the Petpooja &quot;Order Summary Item Report&quot; CSV. It&apos;s
            processed entirely in your browser and never uploaded anywhere.
          </p>

          <div>
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full bg-bg px-4 text-sm font-medium text-text ring-1 ring-border">
              Choose CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void handleFileSelected(file);
                }}
              />
            </label>
            {fileName && <span className="ml-3 text-sm text-muted">{fileName}</span>}
          </div>

          {parsing && <p className="text-sm text-muted">Reading file…</p>}
          {parseError && <p className="text-danger">{parseError}</p>}

          {preview && (
            <div className="flex flex-col gap-3 rounded-2xl bg-bg p-4">
              <p className="text-sm text-text">
                {formatDateLabel(preview.dateFrom)} –{" "}
                {formatDateLabel(preview.dateTo)} · {preview.invoiceCount}{" "}
                invoice(s)
              </p>
              <p className="text-sm text-text">
                {formatQuantity(preview.unitsSold)} unit(s) sold,{" "}
                {formatQuantity(preview.unitsCancelled)} cancelled,{" "}
                {formatRupees(preview.revenue)} revenue
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-muted">
                {Object.entries(preview.unitsByChannel)
                  .filter(([, units]) => units > 0)
                  .map(([channel, units]) => (
                    <span
                      key={channel}
                      className="rounded-full bg-surface px-3 py-1 ring-1 ring-border"
                    >
                      {CHANNEL_LABEL[channel]}: {formatQuantity(units)}
                    </span>
                  ))}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
                  Top items
                </p>
                <ul className="flex flex-col gap-0.5 text-sm text-text">
                  {preview.topItems.map((item) => (
                    <li key={item.name} className="flex justify-between gap-3">
                      <span className="truncate">{item.name}</span>
                      <span className="shrink-0 text-muted">
                        {formatQuantity(item.units)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-sm font-medium text-warning">
                Importing replaces any existing sales for these dates at this
                outlet.
              </p>
              {rangeTooLong && (
                <p className="text-sm font-medium text-danger">
                  This file covers more than 92 days. Please split it into
                  smaller files.
                </p>
              )}
            </div>
          )}

          {result && !result.ok && (
            <p className="text-danger">{reasonMessage(result)}</p>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!preview || rangeTooLong}
              loading={importing}
              onClick={handleConfirm}
              className="flex-1"
            >
              Confirm import
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SuccessView({
  result,
  onClose,
}: {
  result: ImportSuccess;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-text">
        {result.rows_saved} row(s) saved · {formatQuantity(result.units)}{" "}
        unit(s) · {formatRupees(result.revenue ?? 0)} revenue ·{" "}
        {result.new_pos_items} new POS item(s).
      </p>

      {result.unmapped.length > 0 && (
        <div className="rounded-2xl bg-warning/10 p-4">
          <p className="mb-2 text-sm font-semibold text-warning">
            These POS names aren&apos;t mapped to a recipe yet:
          </p>
          <ul className="mb-3 flex flex-col gap-1 text-sm text-warning">
            {result.unmapped.map((item) => (
              <li key={item.pos_name} className="flex justify-between gap-3">
                <span>{item.pos_name}</span>
                <span>{formatQuantity(item.units)} unit(s)</span>
              </li>
            ))}
          </ul>
          <Link
            href="/mapping"
            className="text-sm font-medium text-accent underline"
          >
            Go to Mapping
          </Link>
        </div>
      )}

      <Button type="button" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}
