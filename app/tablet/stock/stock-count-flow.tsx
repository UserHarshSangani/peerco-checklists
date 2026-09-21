"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { lastDatesInKolkata } from "@/lib/date";
import type { LocationPayload } from "@/lib/geolocation";
import { sanitizeDecimalInput } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/language-context";
import type { CountSheetItem, Outlet } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  StockSubmitFlow,
  reasonNeedsReload,
  type StockSubmitOutcome,
} from "./stock-submit-flow";

type Kind = "opening" | "closing";

function currentHourIST(): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
}

type Draft = { quantities: Record<string, string>; notes: Record<string, string> };

function draftKey(outletId: string, kind: Kind, businessDate: string): string {
  return `peerco:stock-count-draft:${outletId}:${kind}:${businessDate}`;
}

function readDraft(key: string): Draft {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { quantities: {}, notes: {} };
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return { quantities: parsed.quantities ?? {}, notes: parsed.notes ?? {} };
  } catch {
    return { quantities: {}, notes: {} };
  }
}

function writeDraft(key: string, draft: Draft) {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // ignore — draft persistence is a convenience, not a requirement
  }
}

function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function isValidQuantity(raw: string | undefined): boolean {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === ".") return false;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0;
}

export function StockCountFlow({
  outlet,
  onExit,
}: {
  outlet: Outlet;
  onExit: () => void;
}) {
  const { t } = useLanguage();
  const [kind, setKind] = useState<Kind | null>(null);

  if (!kind) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <TopBar onBack={onExit} title={t("tablet.stock.countTitle")} />
        <main className="flex-1 p-4 sm:p-6">
          <h2 className="mb-6 text-xl font-semibold text-text">
            {t("tablet.stock.chooseKind")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setKind("opening")}
              className="min-h-24 rounded-2xl bg-surface p-6 text-left text-xl font-medium text-text shadow-sm ring-1 ring-border transition hover:bg-border/20 active:scale-[0.98]"
            >
              {t("manager.kindOpening")}
            </button>
            <button
              type="button"
              onClick={() => setKind("closing")}
              className="min-h-24 rounded-2xl bg-surface p-6 text-left text-xl font-medium text-text shadow-sm ring-1 ring-border transition hover:bg-border/20 active:scale-[0.98]"
            >
              {t("manager.kindClosing")}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <CountSheetScreen
      key={kind}
      outlet={outlet}
      kind={kind}
      onBack={() => setKind(null)}
      onExit={onExit}
    />
  );
}

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

function CountSheetScreen({
  outlet,
  kind,
  onBack,
  onExit,
}: {
  outlet: Outlet;
  kind: Kind;
  onBack: () => void;
  onExit: () => void;
}) {
  const [today, yesterday] = useMemo(() => lastDatesInKolkata(2), []);
  const [dateChoice, setDateChoice] = useState<"today" | "yesterday">(() =>
    kind === "closing" && currentHourIST() < 5 ? "yesterday" : "today",
  );
  const businessDate = dateChoice === "today" ? today : yesterday;

  return (
    <CountSheetForDate
      key={businessDate}
      outlet={outlet}
      kind={kind}
      businessDate={businessDate}
      dateChoice={dateChoice}
      onChangeDateChoice={setDateChoice}
      onBack={onBack}
      onExit={onExit}
    />
  );
}

function CountSheetForDate({
  outlet,
  kind,
  businessDate,
  dateChoice,
  onChangeDateChoice,
  onBack,
  onExit,
}: {
  outlet: Outlet;
  kind: Kind;
  businessDate: string;
  dateChoice: "today" | "yesterday";
  onChangeDateChoice: (choice: "today" | "yesterday") => void;
  onBack: () => void;
  onExit: () => void;
}) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<CountSheetItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteOpenIds, setNoteOpenIds] = useState<Set<string>>(new Set());
  const [showSubmitFlow, setShowSubmitFlow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("get_count_sheet", {
        p_outlet_id: outlet.id,
        p_business_date: businessDate,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLoadError(error.message);
          return;
        }
        const rows = (data ?? []) as CountSheetItem[];
        setLoadError(null);
        setItems(rows);
        const key = draftKey(outlet.id, kind, businessDate);
        const draft = readDraft(key);
        const validIds = new Set(rows.map((row) => row.item_id));
        setQuantities(
          Object.fromEntries(
            Object.entries(draft.quantities).filter(([id]) =>
              validIds.has(id),
            ),
          ),
        );
        setNotes(
          Object.fromEntries(
            Object.entries(draft.notes).filter(([id]) => validIds.has(id)),
          ),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, outlet.id, kind, businessDate, retryToken]);

  useEffect(() => {
    if (!items) return;
    writeDraft(draftKey(outlet.id, kind, businessDate), { quantities, notes });
  }, [items, outlet.id, kind, businessDate, quantities, notes]);

  function setQuantity(itemId: string, raw: string) {
    setQuantities((prev) => ({ ...prev, [itemId]: sanitizeDecimalInput(raw) }));
  }

  function setNote(itemId: string, note: string) {
    setNotes((prev) => ({ ...prev, [itemId]: note }));
  }

  function toggleNoteOpen(itemId: string) {
    setNoteOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  const grouped = useMemo(() => {
    const map = new Map<string, CountSheetItem[]>();
    for (const item of items ?? []) {
      const category = item.category ?? t("tablet.stock.uncategorized");
      const list = map.get(category) ?? [];
      list.push(item);
      map.set(category, list);
    }
    return Array.from(map.entries());
  }, [items, t]);

  const doneCount = (items ?? []).filter((item) =>
    isValidQuantity(quantities[item.item_id]),
  ).length;
  const totalCount = items?.length ?? 0;
  const allDone = totalCount > 0 && doneCount === totalCount;

  async function handleRpcSubmit(
    staffId: string,
    pin: string,
    location: LocationPayload,
  ): Promise<StockSubmitOutcome> {
    const { data, error } = await supabase.rpc("submit_stock_count", {
      p_outlet_id: outlet.id,
      p_kind: kind,
      p_staff_id: staffId,
      p_pin: pin,
      p_business_date: businessDate,
      p_lines: (items ?? []).map((item) => ({
        item_id: item.item_id,
        quantity: Number(quantities[item.item_id]),
        note: notes[item.item_id]?.trim() || null,
      })),
      p_location: location,
    });
    if (error) return { ok: false, reason: "bad_request" };
    return data as StockSubmitOutcome;
  }

  function handleFailure(reason: string) {
    if (reasonNeedsReload(reason)) {
      setRetryToken((n) => n + 1);
    }
  }

  function handleSuccess() {
    clearDraft(draftKey(outlet.id, kind, businessDate));
    onExit();
  }

  const title =
    kind === "opening"
      ? t("tablet.stock.openingCount")
      : t("tablet.stock.closingCount");

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <div className="border-b border-border bg-surface px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 min-h-[40px] text-sm font-medium text-muted hover:text-text"
        >
          ‹ {t("common.back")}
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="truncate text-lg font-semibold text-text">{title}</p>
          <div className="flex overflow-hidden rounded-full ring-1 ring-border">
            <button
              type="button"
              onClick={() => onChangeDateChoice("today")}
              className={`min-h-[36px] px-4 text-sm font-medium ${
                dateChoice === "today"
                  ? "bg-accent text-white"
                  : "bg-surface text-muted"
              }`}
            >
              {t("tablet.stock.today")}
            </button>
            <button
              type="button"
              onClick={() => onChangeDateChoice("yesterday")}
              className={`min-h-[36px] px-4 text-sm font-medium ${
                dateChoice === "yesterday"
                  ? "bg-accent text-white"
                  : "bg-surface text-muted"
              }`}
            >
              {t("tablet.stock.yesterday")}
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 p-4 pb-32 sm:p-6">
        {items === null && !loadError && <SkeletonList rows={6} rowClassName="h-16" />}
        {loadError && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-danger">
              {t("tablet.stock.loadSheetError", { error: loadError })}
            </p>
            <Button type="button" onClick={() => setRetryToken((n) => n + 1)}>
              {t("common.retry")}
            </Button>
          </div>
        )}
        {items !== null && !loadError && items.length === 0 && (
          <EmptyState title={t("tablet.stock.noItemsToCount")} />
        )}

        {items !== null && !loadError && items.length > 0 && (
          <div className="flex flex-col gap-4">
            {grouped.map(([category, categoryItems]) => (
              <div key={category}>
                <div className="sticky top-0 z-10 -mx-4 bg-bg/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
                  <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">
                    {category}
                  </h3>
                </div>
                <ul className="flex flex-col gap-3 pt-2">
                  {categoryItems.map((item) => {
                    const noteVisible =
                      noteOpenIds.has(item.item_id) ||
                      !!notes[item.item_id]?.trim();
                    return (
                      <li
                        key={item.item_id}
                        className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex-1 text-base font-medium text-text">
                            {item.name}
                          </span>
                          <span className="shrink-0 text-sm text-muted">
                            {item.unit}
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={quantities[item.item_id] ?? ""}
                            onChange={(event) =>
                              setQuantity(item.item_id, event.target.value)
                            }
                            placeholder="0"
                            className="w-24 shrink-0 rounded-lg border border-border bg-bg px-3 py-2 text-right text-lg text-text focus:border-accent focus:outline-none"
                          />
                        </div>
                        {noteVisible ? (
                          <input
                            type="text"
                            value={notes[item.item_id] ?? ""}
                            onChange={(event) =>
                              setNote(item.item_id, event.target.value)
                            }
                            placeholder={t("tablet.stock.notePlaceholder")}
                            className="mt-3 w-full rounded-lg border border-border bg-bg px-4 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleNoteOpen(item.item_id)}
                            className="mt-2 text-sm font-medium text-muted hover:text-text"
                          >
                            {t("tablet.stock.addNote")}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </main>

      {items !== null && !loadError && items.length > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 p-4 backdrop-blur">
          <p className="mb-2 text-center text-sm font-medium text-muted">
            {t("tablet.stock.countedProgress", {
              done: doneCount,
              total: totalCount,
            })}
          </p>
          <Button
            type="button"
            disabled={!allDone}
            onClick={() => setShowSubmitFlow(true)}
            className="mx-auto block w-full max-w-md"
          >
            {t("tablet.submit")}
          </Button>
        </div>
      )}

      {showSubmitFlow && (
        <StockSubmitFlow
          outlet={outlet}
          onClose={() => setShowSubmitFlow(false)}
          onSuccess={handleSuccess}
          onSubmit={handleRpcSubmit}
          onFailure={handleFailure}
        />
      )}
    </div>
  );
}
