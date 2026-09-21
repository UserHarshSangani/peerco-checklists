"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeKolkata } from "@/lib/date";
import { formatQuantity, formatRupees } from "@/lib/format";
import { fetchStaffNames } from "@/lib/staff-names";
import { fetchSignedPhotoUrls } from "@/lib/photo-signed-urls";
import { useLanguage } from "@/lib/i18n/language-context";
import { LocationBadge, type LocationStatus } from "@/components/location-badge";
import { Modal } from "@/components/ui/modal";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

type ReceiptLine = {
  item_name: string;
  unit: string;
  quantity: number;
  unit_cost: number | null;
  note: string | null;
};

type Receipt = {
  id: string;
  vendor_name: string;
  invoice_ref: string | null;
  notes: string | null;
  photo_path: string | null;
  staff_id: string;
  submitted_at: string;
  location_status: LocationStatus;
  distance_from_outlet_m: number | null;
  lines: ReceiptLine[];
};

export function ReceiptsTab({ outletId, date }: { outletId: string; date: string }) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: rows, error } = await supabase
        .from("stock_receipts")
        .select(
          "id, vendor_name, invoice_ref, notes, photo_path, staff_id, submitted_at, location_status, distance_from_outlet_m",
        )
        .eq("outlet_id", outletId)
        .eq("business_date", date)
        .order("submitted_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        setLoading(false);
        setLoadError(error.message);
        return;
      }

      const receiptRows = rows ?? [];
      const ids = receiptRows.map((row) => row.id);
      const linesByReceipt: Record<string, ReceiptLine[]> = {};
      if (ids.length > 0) {
        const { data: lines, error: linesError } = await supabase
          .from("stock_receipt_lines")
          .select("receipt_id, item_name, unit, quantity, unit_cost, note")
          .in("receipt_id", ids);
        if (cancelled) return;
        if (linesError) {
          setLoading(false);
          setLoadError(linesError.message);
          return;
        }
        for (const line of lines ?? []) {
          const list = linesByReceipt[line.receipt_id] ?? [];
          list.push({
            item_name: line.item_name,
            unit: line.unit,
            quantity: line.quantity,
            unit_cost: line.unit_cost,
            note: line.note,
          });
          linesByReceipt[line.receipt_id] = list;
        }
      }

      const names = await fetchStaffNames(
        supabase,
        receiptRows.map((row) => row.staff_id),
      );
      const urls = await fetchSignedPhotoUrls(
        supabase,
        receiptRows
          .map((row) => row.photo_path)
          .filter((path): path is string => !!path),
      );
      if (cancelled) return;

      setReceipts(
        receiptRows.map((row) => ({
          id: row.id,
          vendor_name: row.vendor_name,
          invoice_ref: row.invoice_ref,
          notes: row.notes,
          photo_path: row.photo_path,
          staff_id: row.staff_id,
          submitted_at: row.submitted_at,
          location_status: row.location_status as LocationStatus,
          distance_from_outlet_m: row.distance_from_outlet_m,
          lines: linesByReceipt[row.id] ?? [],
        })),
      );
      setStaffNames(names);
      setPhotoUrls(urls);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, outletId, date]);

  if (loading) return <SkeletonList rows={4} rowClassName="h-24" />;
  if (loadError) {
    return (
      <p className="text-danger">
        {t("stock.loadError", { error: loadError })}
      </p>
    );
  }
  if (receipts.length === 0) {
    return <EmptyState title={t("stock.noReceipts")} />;
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {receipts.map((receipt) => (
          <div
            key={receipt.id}
            className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border"
          >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-text">
                  {receipt.vendor_name}
                </p>
                {receipt.invoice_ref && (
                  <p className="text-sm text-muted">
                    {t("stock.invoiceRef", { ref: receipt.invoice_ref })}
                  </p>
                )}
                <p className="mt-1 text-sm text-muted">
                  {t("manager.submittedAt", {
                    name: staffNames[receipt.staff_id] ?? "—",
                    time: formatTimeKolkata(receipt.submitted_at),
                  })}
                </p>
              </div>
              <LocationBadge
                status={receipt.location_status}
                distanceM={receipt.distance_from_outlet_m}
              />
            </div>

            <ul className="mb-3 flex flex-col gap-1">
              {receipt.lines.map((line, index) => (
                <li
                  key={index}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg px-3 py-2 text-sm"
                >
                  <span className="text-text">
                    {line.item_name} — {formatQuantity(line.quantity)} {line.unit}
                  </span>
                  <span className="text-muted">
                    {line.unit_cost != null ? formatRupees(line.unit_cost) : "—"}
                  </span>
                </li>
              ))}
            </ul>

            {receipt.notes && (
              <p className="mb-3 text-sm text-muted">
                {t("manager.note", { note: receipt.notes })}
              </p>
            )}

            {receipt.photo_path && (
              <div>
                {photoUrls[receipt.photo_path] ? (
                  <button
                    type="button"
                    onClick={() => setViewerUrl(photoUrls[receipt.photo_path!])}
                    aria-label={t("manager.viewPhoto")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not an optimizable static asset */}
                    <img
                      src={photoUrls[receipt.photo_path]}
                      alt={t("manager.viewPhoto")}
                      className="h-16 w-16 rounded-lg object-cover ring-1 ring-border transition hover:opacity-80"
                    />
                  </button>
                ) : (
                  <p className="text-sm text-muted">
                    {t("manager.photoUnavailable")}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {viewerUrl && (
        <Modal
          onClose={() => setViewerUrl(null)}
          panelClassName="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-surface p-2 shadow-xl outline-none"
        >
          <div className="flex justify-end p-2">
            <button
              type="button"
              onClick={() => setViewerUrl(null)}
              className="min-h-[40px] text-sm font-medium text-muted hover:text-text"
            >
              {t("common.close")}
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not an optimizable static asset */}
          <img
            src={viewerUrl}
            alt={t("manager.viewPhoto")}
            className="max-h-[75vh] w-full rounded-2xl object-contain"
          />
        </Modal>
      )}
    </>
  );
}
