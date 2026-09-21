"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayInKolkata } from "@/lib/date";
import { sanitizeDecimalInput } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { CountSheetItem, EntryLists, Outlet, WastageReason } from "@/lib/types";
import type { LocationPayload } from "@/lib/geolocation";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PhotoCapture, isPhotoUploaded, type ItemPhotoState } from "../photo-capture";
import { ItemPickerModal } from "./item-picker";
import { StockSubmitFlow, type StockSubmitOutcome } from "./stock-submit-flow";

const REASON_LABEL_KEY: Record<WastageReason, TranslationKey> = {
  spoilage: "tablet.wastage.reason.spoilage",
  prep_waste: "tablet.wastage.reason.prep_waste",
  breakage: "tablet.wastage.reason.breakage",
  staff_meal: "tablet.wastage.reason.staff_meal",
  complimentary: "tablet.wastage.reason.complimentary",
  other: "tablet.wastage.reason.other",
};

type Entry = {
  localId: string;
  item_id: string;
  name: string;
  unit: string;
  quantity: string;
  reason: WastageReason | "";
  note: string;
};

function TopBar({ onBack, title }: { onBack: () => void; title: string }) {
  const { t } = useLanguage();
  return (
    <div className="border-b border-border bg-surface px-4 py-3 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 min-h-[40px] text-sm font-medium text-muted hover:text-text"
      >
        ‹ {t("common.back")}
      </button>
      <p className="truncate text-lg font-semibold text-text">{title}</p>
    </div>
  );
}

export function WastageFlow({
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
  const [entries, setEntries] = useState<Entry[]>([]);
  const [photos, setPhotos] = useState<Record<string, ItemPhotoState>>({});
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [showSubmitFlow, setShowSubmitFlow] = useState(false);

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

  function addEntry(item: CountSheetItem) {
    setEntries((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        item_id: item.item_id,
        name: item.name,
        unit: item.unit,
        quantity: "",
        reason: "",
        note: "",
      },
    ]);
    setShowItemPicker(false);
  }

  function updateEntry(localId: string, patch: Partial<Entry>) {
    setEntries((prev) =>
      prev.map((entry) => (entry.localId === localId ? { ...entry, ...patch } : entry)),
    );
  }

  function removeEntry(localId: string) {
    setEntries((prev) => prev.filter((entry) => entry.localId !== localId));
    setPhotos((prev) => {
      const next = { ...prev };
      delete next[localId];
      return next;
    });
  }

  function setPhotoFor(localId: string, state: ItemPhotoState | undefined) {
    setPhotos((prev) => {
      const next = { ...prev };
      if (state) next[localId] = state;
      else delete next[localId];
      return next;
    });
  }

  const canSubmit =
    entries.length > 0 &&
    entries.every((entry) => {
      const n = Number(entry.quantity);
      const quantityOk = entry.quantity.trim() !== "" && Number.isFinite(n) && n > 0;
      const reasonOk = entry.reason !== "";
      const noteOk = entry.reason !== "other" || entry.note.trim() !== "";
      return quantityOk && reasonOk && noteOk;
    });

  async function handleRpcSubmit(
    staffId: string,
    pin: string,
    location: LocationPayload,
  ): Promise<StockSubmitOutcome> {
    const { data, error } = await supabase.rpc("log_wastage", {
      p_outlet_id: outlet.id,
      p_staff_id: staffId,
      p_pin: pin,
      p_business_date: businessDate,
      p_entries: entries.map((entry) => {
        const photo = photos[entry.localId];
        return {
          item_id: entry.item_id,
          quantity: Number(entry.quantity),
          reason: entry.reason,
          note: entry.note.trim() || null,
          photo_path: isPhotoUploaded(photo) ? photo.path : null,
        };
      }),
      p_location: location,
    });
    if (error) return { ok: false, reason: "bad_request" };
    return data as StockSubmitOutcome;
  }

  if (loadError) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <TopBar onBack={onExit} title={t("tablet.wastage.title")} />
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
        <TopBar onBack={onExit} title={t("tablet.wastage.title")} />
        <main className="flex-1 p-4 sm:p-6">
          <SkeletonList rows={4} rowClassName="h-16" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <TopBar onBack={onExit} title={t("tablet.wastage.title")} />

      <main className="flex-1 p-4 pb-32 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-text">
            {t("tablet.stock.items")}
          </h3>
          <button
            type="button"
            onClick={() => setShowItemPicker(true)}
            className="min-h-[40px] rounded-full bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            {t("tablet.wastage.addEntry")}
          </button>
        </div>

        {entries.length === 0 && (
          <EmptyState title={t("tablet.wastage.noEntriesYet")} />
        )}

        <ul className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li
              key={entry.localId}
              className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-base font-medium text-text">
                  {entry.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeEntry(entry.localId)}
                  className="text-sm font-medium text-danger"
                >
                  {t("tablet.stock.removeItem")}
                </button>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <span className="text-sm text-muted">
                    {t("tablet.stock.quantityLabel")}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={entry.quantity}
                    onChange={(event) =>
                      updateEntry(entry.localId, {
                        quantity: sanitizeDecimalInput(event.target.value),
                      })
                    }
                    placeholder="0"
                    className="w-20 rounded-lg border border-border bg-bg px-3 py-2 text-right text-base text-text focus:border-accent focus:outline-none"
                  />
                  <span className="text-sm text-muted">{entry.unit}</span>
                </label>
              </div>

              <p className="mb-1 text-sm font-medium text-muted">
                {t("tablet.wastage.reasonLabel")}
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                {lists.wastage_reasons.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => updateEntry(entry.localId, { reason })}
                    className={`min-h-[40px] rounded-full px-4 py-2 text-sm font-medium ring-1 ring-border ${
                      entry.reason === reason
                        ? "bg-accent text-white"
                        : "bg-bg text-text"
                    }`}
                  >
                    {t(REASON_LABEL_KEY[reason])}
                  </button>
                ))}
              </div>

              {entry.reason === "other" && (
                <div className="mb-3">
                  <input
                    type="text"
                    value={entry.note}
                    onChange={(event) =>
                      updateEntry(entry.localId, { note: event.target.value })
                    }
                    placeholder={t("tablet.wastage.notePlaceholder")}
                    className="w-full rounded-lg border border-border bg-bg px-4 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  {!entry.note.trim() && (
                    <p className="mt-1 text-sm text-danger">
                      {t("tablet.wastage.noteRequiredHint")}
                    </p>
                  )}
                </div>
              )}
              {entry.reason !== "other" && (
                <div className="mb-3">
                  <input
                    type="text"
                    value={entry.note}
                    onChange={(event) =>
                      updateEntry(entry.localId, { note: event.target.value })
                    }
                    placeholder={t("tablet.stock.notePlaceholder")}
                    className="w-full rounded-lg border border-border bg-bg px-4 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                </div>
              )}

              <PhotoCapture
                outletId={outlet.id}
                businessDate={businessDate}
                state={photos[entry.localId]}
                onChange={(state) => setPhotoFor(entry.localId, state)}
              />
            </li>
          ))}
        </ul>
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
          items={lists.items}
          excludeIds={new Set()}
          onPick={addEntry}
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
