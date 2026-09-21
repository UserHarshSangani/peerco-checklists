"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import { useToast } from "@/components/ui/toast";
import type { InventoryItemRow, OutletItemRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

type RowDraft = {
  par: string;
  max: string;
  leadTime: string;
  active: boolean;
  trackVariance: boolean;
  tolerancePct: string;
  toleranceQty: string;
};

function draftFromOutletItem(row: OutletItemRow | undefined): RowDraft {
  return {
    par: row?.par_level != null ? String(row.par_level) : "",
    max: row?.max_level != null ? String(row.max_level) : "",
    leadTime: row ? String(row.lead_time_days) : "1",
    active: row?.active ?? true,
    trackVariance: row?.track_variance ?? true,
    tolerancePct: row ? String(row.variance_tolerance_pct) : "5",
    toleranceQty: row ? String(row.variance_tolerance_qty) : "0",
  };
}

export function OutletSettingsTab({
  outletId,
  organizationId,
}: {
  outletId: string;
  organizationId: string;
}) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<InventoryItemRow[]>([]);
  const [stocked, setStocked] = useState<Record<string, OutletItemRow>>({});
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [addingAll, setAddingAll] = useState(false);
  const [search, setSearch] = useState("");

  async function fetchAll() {
    return Promise.all([
      supabase
        .from("inventory_items")
        .select(
          "id, name, category, count_unit, order_unit, order_unit_size, cost_per_unit, vendor_id, count_frequency, active, recipe_unit, recipe_factor",
        )
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("outlet_items")
        .select(
          "outlet_id, item_id, par_level, max_level, lead_time_days, active, track_variance, variance_tolerance_pct, variance_tolerance_qty",
        )
        .eq("outlet_id", outletId),
    ]);
  }

  function applyData(
    itemsData: InventoryItemRow[],
    outletItemsData: OutletItemRow[],
  ) {
    setItems(itemsData);
    const map: Record<string, OutletItemRow> = {};
    for (const row of outletItemsData) map[row.item_id] = row;
    setStocked(map);
    setDrafts(
      Object.fromEntries(
        itemsData.map((item) => [item.id, draftFromOutletItem(map[item.id])]),
      ),
    );
  }

  useEffect(() => {
    let cancelled = false;
    fetchAll().then(([itemsRes, outletItemsRes]) => {
      if (cancelled) return;
      setLoading(false);
      if (itemsRes.error) {
        setLoadError(itemsRes.error.message);
        return;
      }
      if (outletItemsRes.error) {
        setLoadError(outletItemsRes.error.message);
        return;
      }
      applyData(itemsRes.data ?? [], outletItemsRes.data ?? []);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId, organizationId]);

  async function refresh() {
    const [itemsRes, outletItemsRes] = await fetchAll();
    if (itemsRes.error || outletItemsRes.error) {
      showError((itemsRes.error ?? outletItemsRes.error)!.message);
      return;
    }
    applyData(itemsRes.data ?? [], outletItemsRes.data ?? []);
  }

  async function toggleStocked(item: InventoryItemRow) {
    setSavingId(item.id);
    const { error } = stocked[item.id]
      ? await supabase
          .from("outlet_items")
          .delete()
          .eq("outlet_id", outletId)
          .eq("item_id", item.id)
      : await supabase
          .from("outlet_items")
          .insert({ outlet_id: outletId, item_id: item.id, active: true });
    setSavingId(null);
    if (error) {
      showError(error.message);
      return;
    }
    await refresh();
  }

  function updateDraft(itemId: string, patch: Partial<RowDraft>) {
    setDrafts((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  async function saveRow(item: InventoryItemRow) {
    const draft = drafts[item.id];
    const leadTime = Number(draft.leadTime);
    if (!Number.isFinite(leadTime) || leadTime < 0 || leadTime > 60) {
      showError(t("catalog.outletSettings.leadTimeError"));
      return;
    }
    const tolerancePct = Number(draft.tolerancePct);
    if (!Number.isFinite(tolerancePct) || tolerancePct < 0) {
      showError("Tolerance % must be 0 or more.");
      return;
    }
    const toleranceQty = Number(draft.toleranceQty);
    if (!Number.isFinite(toleranceQty) || toleranceQty < 0) {
      showError("Tolerance quantity must be 0 or more.");
      return;
    }
    setSavingId(item.id);
    const { error } = await supabase
      .from("outlet_items")
      .update({
        par_level: draft.par.trim() ? Number(draft.par) : null,
        max_level: draft.max.trim() ? Number(draft.max) : null,
        lead_time_days: leadTime,
        active: draft.active,
        track_variance: draft.trackVariance,
        variance_tolerance_pct: tolerancePct,
        variance_tolerance_qty: toleranceQty,
      })
      .eq("outlet_id", outletId)
      .eq("item_id", item.id);
    setSavingId(null);
    if (error) {
      showError(error.message);
      return;
    }
    showSuccess(t("catalog.outletSettings.saved"));
    await refresh();
  }

  async function addAllItems() {
    const toAdd = items
      .filter((item) => !stocked[item.id])
      .map((item) => ({ outlet_id: outletId, item_id: item.id, active: true }));
    if (toAdd.length === 0) return;
    setAddingAll(true);
    const { error } = await supabase.from("outlet_items").insert(toAdd);
    setAddingAll(false);
    if (error) {
      showError(error.message);
      return;
    }
    await refresh();
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        (item.category ?? "").toLowerCase().includes(query),
    );
  }, [items, search]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("catalog.searchItemsPlaceholder")}
          className="min-h-[44px] w-full max-w-xs rounded-lg border border-border bg-surface px-4 py-2 text-base text-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <Button
          type="button"
          variant="secondary"
          loading={addingAll}
          onClick={addAllItems}
        >
          {t("catalog.outletSettings.addAll")}
        </Button>
      </div>

      {loading && <SkeletonList rows={4} rowClassName="h-14" />}
      {loadError && (
        <p className="text-danger">
          {t("catalog.loadItemsError", { error: loadError })}
        </p>
      )}
      {!loading && !loadError && filtered.length === 0 && (
        <EmptyState title={t("catalog.noItemsYet")} />
      )}

      {!loading && !loadError && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-border">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  {t("common.nameLabel")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  {t("catalog.outletSettings.stockedHere")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  {t("catalog.outletSettings.parLevel")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  {t("catalog.outletSettings.maxLevel")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  {t("catalog.outletSettings.leadTimeDays")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  {t("manager.active")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  Track variance
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  Tolerance %
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  Tolerance qty
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const isStocked = !!stocked[item.id];
                const draft = drafts[item.id] ?? draftFromOutletItem(undefined);
                return (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap text-text">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted">{item.count_unit}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        disabled={savingId === item.id}
                        onClick={() => toggleStocked(item)}
                        className={`min-h-[36px] rounded-full px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                          isStocked
                            ? "bg-success/15 text-success"
                            : "bg-border/50 text-muted"
                        }`}
                      >
                        {isStocked
                          ? t("catalog.outletSettings.stocked")
                          : t("catalog.outletSettings.notStocked")}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        disabled={!isStocked}
                        value={draft.par}
                        onChange={(event) =>
                          updateDraft(item.id, { par: event.target.value })
                        }
                        className="w-24 rounded-lg border border-border bg-bg px-3 py-2 text-text focus:border-accent focus:outline-none disabled:opacity-40"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        disabled={!isStocked}
                        value={draft.max}
                        onChange={(event) =>
                          updateDraft(item.id, { max: event.target.value })
                        }
                        className="w-24 rounded-lg border border-border bg-bg px-3 py-2 text-text focus:border-accent focus:outline-none disabled:opacity-40"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        max="60"
                        disabled={!isStocked}
                        value={draft.leadTime}
                        onChange={(event) =>
                          updateDraft(item.id, { leadTime: event.target.value })
                        }
                        className="w-20 rounded-lg border border-border bg-bg px-3 py-2 text-text focus:border-accent focus:outline-none disabled:opacity-40"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        disabled={!isStocked}
                        checked={draft.active}
                        onChange={(event) =>
                          updateDraft(item.id, { active: event.target.checked })
                        }
                        className="h-4 w-4 rounded border-border disabled:opacity-40"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        disabled={!isStocked}
                        checked={draft.trackVariance}
                        onChange={(event) =>
                          updateDraft(item.id, { trackVariance: event.target.checked })
                        }
                        className="h-4 w-4 rounded border-border disabled:opacity-40"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        disabled={!isStocked}
                        value={draft.tolerancePct}
                        onChange={(event) =>
                          updateDraft(item.id, { tolerancePct: event.target.value })
                        }
                        className="w-20 rounded-lg border border-border bg-bg px-3 py-2 text-text focus:border-accent focus:outline-none disabled:opacity-40"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        disabled={!isStocked}
                        value={draft.toleranceQty}
                        onChange={(event) =>
                          updateDraft(item.id, { toleranceQty: event.target.value })
                        }
                        className="w-20 rounded-lg border border-border bg-bg px-3 py-2 text-text focus:border-accent focus:outline-none disabled:opacity-40"
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        disabled={!isStocked || savingId === item.id}
                        onClick={() => saveRow(item)}
                        className="min-h-[36px] rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-40"
                      >
                        {t("common.save")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
