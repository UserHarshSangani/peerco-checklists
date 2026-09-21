"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayInKolkata } from "@/lib/date";
import { sanitizeDecimalInput } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/language-context";
import type { CountSheetItem, EntryListVendor, EntryLists, Outlet } from "@/lib/types";
import type { LocationPayload } from "@/lib/geolocation";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PhotoCapture, isPhotoUploaded, type ItemPhotoState } from "../photo-capture";
import { StaffChip } from "../staff-chip";
import { ItemPickerModal } from "./item-picker";
import { StockSubmitFlow, type StockSubmitOutcome } from "./stock-submit-flow";

type ReceiptLine = {
  item_id: string;
  name: string;
  unit: string;
  quantity: string;
  unitCost: string;
};

function TopBar({ onBack, title }: { onBack: () => void; title: string }) {
  const { t } = useLanguage();
  return (
    <div className="border-b border-border bg-surface px-4 py-3 sm:px-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] text-sm font-medium text-muted hover:text-text"
        >
          ‹ {t("common.back")}
        </button>
        <StaffChip />
      </div>
      <p className="truncate font-serif text-lg font-bold text-text">{title}</p>
    </div>
  );
}

export function GoodsReceivedFlow({
  outlet,
  onExit,
}: {
  outlet: Outlet;
  onExit: () => void;
}) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const businessDate = useMemo(() => todayInKolkata(), []);
  const [lists, setLists] = useState<EntryLists | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vendor, setVendor] = useState<EntryListVendor | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("get_entry_lists", { p_outlet_id: outlet.id })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLoadError(error.message);
          return;
        }
        setLists(data as EntryLists);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, outlet.id]);

  if (loadError) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <TopBar onBack={onExit} title={t("tablet.receipt.title")} />
        <main className="flex flex-1 items-center justify-center p-6 text-center">
          <p className="text-danger">
            {t("tablet.stock.loadEntryListsError", { error: loadError })}
          </p>
        </main>
      </div>
    );
  }

  if (!lists) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <TopBar onBack={onExit} title={t("tablet.receipt.title")} />
        <main className="flex-1 p-4 sm:p-6">
          <SkeletonList rows={5} rowClassName="h-16" />
        </main>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <TopBar onBack={onExit} title={t("tablet.receipt.title")} />
        <main className="flex-1 p-4 sm:p-6">
          <h2 className="mb-6 text-xl font-semibold text-text">
            {t("tablet.receipt.chooseVendor")}
          </h2>
          {lists.vendors.length === 0 && (
            <EmptyState title={t("tablet.receipt.noVendors")} />
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {lists.vendors.map((v) => (
              <button
                key={v.vendor_id}
                type="button"
                onClick={() => setVendor(v)}
                className="min-h-20 rounded-2xl bg-surface p-6 text-left text-xl font-medium text-text shadow-sm ring-1 ring-border transition hover:bg-border/20 active:scale-[0.98]"
              >
                {v.name}
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <ReceiptForm
      key={vendor.vendor_id}
      outlet={outlet}
      businessDate={businessDate}
      vendor={vendor}
      items={lists.items}
      onBack={() => setVendor(null)}
      onExit={onExit}
    />
  );
}

function ReceiptForm({
  outlet,
  businessDate,
  vendor,
  items,
  onBack,
  onExit,
}: {
  outlet: Outlet;
  businessDate: string;
  vendor: EntryListVendor;
  items: CountSheetItem[];
  onBack: () => void;
  onExit: () => void;
}) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [invoiceRef, setInvoiceRef] = useState("");
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<ItemPhotoState | undefined>(undefined);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [showSubmitFlow, setShowSubmitFlow] = useState(false);

  function addLine(item: CountSheetItem) {
    setLines((prev) => [
      ...prev,
      { item_id: item.item_id, name: item.name, unit: item.unit, quantity: "", unitCost: "" },
    ]);
    setShowItemPicker(false);
  }

  function updateLine(itemId: string, patch: Partial<ReceiptLine>) {
    setLines((prev) =>
      prev.map((line) => (line.item_id === itemId ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(itemId: string) {
    setLines((prev) => prev.filter((line) => line.item_id !== itemId));
  }

  const canSubmit =
    lines.length > 0 &&
    lines.every((line) => {
      const n = Number(line.quantity);
      return line.quantity.trim() !== "" && Number.isFinite(n) && n > 0;
    });

  async function handleRpcSubmit(
    staffId: string,
    pin: string,
    location: LocationPayload,
  ): Promise<StockSubmitOutcome> {
    const { data, error } = await supabase.rpc("submit_receipt", {
      p_outlet_id: outlet.id,
      p_staff_id: staffId,
      p_pin: pin,
      p_business_date: businessDate,
      p_vendor_id: vendor.vendor_id,
      p_invoice_ref: invoiceRef.trim() || null,
      p_lines: lines.map((line) => ({
        item_id: line.item_id,
        quantity: Number(line.quantity),
        unit_cost: line.unitCost.trim() ? Number(line.unitCost) : null,
        note: null,
      })),
      p_notes: notes.trim() || null,
      p_photo_path: isPhotoUploaded(photo) ? photo.path : null,
      p_location: location,
    });
    if (error) return { ok: false, reason: "bad_request" };
    return data as StockSubmitOutcome;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <div className="border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[40px] text-sm font-medium text-muted hover:text-text"
          >
            ‹ {t("common.back")}
          </button>
          <StaffChip />
        </div>
        <p className="truncate font-serif text-lg font-bold text-text">
          {t("tablet.receipt.title")}
        </p>
        <p className="text-sm text-muted">{vendor.name}</p>
      </div>

      <main className="flex-1 p-4 pb-32 sm:p-6">
        <label
          htmlFor="invoice-ref"
          className="mb-1 block text-sm font-medium text-muted"
        >
          {t("tablet.receipt.invoiceRefLabel")}
        </label>
        <input
          id="invoice-ref"
          type="text"
          value={invoiceRef}
          onChange={(event) => setInvoiceRef(event.target.value)}
          className="mb-6 w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
        />

        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-text">
            {t("tablet.stock.items")}
          </h3>
          <button
            type="button"
            onClick={() => setShowItemPicker(true)}
            className="min-h-[40px] rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
          >
            {t("tablet.stock.addItem")}
          </button>
        </div>

        {lines.length === 0 && (
          <EmptyState title={t("tablet.receipt.noItemsYet")} />
        )}

        <ul className="flex flex-col gap-3">
          {lines.map((line) => (
            <li
              key={line.item_id}
              className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-base font-medium text-text">
                  {line.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeLine(line.item_id)}
                  className="text-sm font-medium text-danger"
                >
                  {t("tablet.stock.removeItem")}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex flex-1 items-center gap-2">
                  <span className="text-sm text-muted">
                    {t("tablet.stock.quantityLabel")}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(line.item_id, {
                        quantity: sanitizeDecimalInput(event.target.value),
                      })
                    }
                    placeholder="0"
                    className="w-20 rounded-lg border border-border bg-bg px-3 py-2 text-right text-base text-text focus:border-accent focus:outline-none"
                  />
                  <span className="text-sm text-muted">{line.unit}</span>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-sm text-muted">
                    {t("tablet.receipt.unitCostLabel")}
                  </span>
                  <span className="text-sm text-muted">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={line.unitCost}
                    onChange={(event) =>
                      updateLine(line.item_id, {
                        unitCost: sanitizeDecimalInput(event.target.value),
                      })
                    }
                    placeholder="0"
                    className="w-24 rounded-lg border border-border bg-bg px-3 py-2 text-right text-base text-text focus:border-accent focus:outline-none"
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6">
          <p className="mb-2 text-sm font-medium text-muted">
            {t("tablet.receipt.photoLabel")}
          </p>
          <PhotoCapture
            outletId={outlet.id}
            businessDate={businessDate}
            state={photo}
            onChange={setPhoto}
          />
        </div>

        <div className="mt-6">
          <label
            htmlFor="receipt-notes"
            className="mb-2 block text-sm font-medium text-muted"
          >
            {t("tablet.notesLabel")}
          </label>
          <textarea
            id="receipt-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-muted focus:border-accent focus:outline-none"
            placeholder={t("tablet.notesPlaceholder")}
          />
        </div>
      </main>

      <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 p-4 backdrop-blur">
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => setShowSubmitFlow(true)}
          className="mx-auto block w-full max-w-md"
        >
          {t("tablet.submit")}
        </Button>
      </div>

      {showItemPicker && (
        <ItemPickerModal
          items={items}
          excludeIds={new Set(lines.map((line) => line.item_id))}
          onPick={addLine}
          onClose={() => setShowItemPicker(false)}
        />
      )}

      {showSubmitFlow && (
        <StockSubmitFlow
          outlet={outlet}
          onClose={() => setShowSubmitFlow(false)}
          onSuccess={onExit}
          onSubmit={handleRpcSubmit}
        />
      )}
    </div>
  );
}
