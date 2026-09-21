"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDaysToDateString, formatDateLabel, todayInKolkata } from "@/lib/date";
import { formatQuantity } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { RecipeCombobox, type RecipeOption } from "./recipe-combobox";

type Tab = "unmapped" | "mapped" | "ignored" | "all";

type PosItem = {
  id: string;
  pos_name: string;
  pos_category: string | null;
  recipe_id: string | null;
  portion: number;
  status: "unmapped" | "mapped" | "ignored";
  last_seen_date: string | null;
};

type Draft = { recipe: RecipeOption | null; portion: string };

const TABS: { id: Tab; label: string }[] = [
  { id: "unmapped", label: "Unmapped" },
  { id: "mapped", label: "Mapped" },
  { id: "ignored", label: "Ignored" },
  { id: "all", label: "All" },
];

export function MappingTable({
  organizationId,
  outletIds,
}: {
  organizationId: string;
  outletIds: string[];
}) {
  const { showError } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("unmapped");
  const [posItems, setPosItems] = useState<PosItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [unitsByPosItem, setUnitsByPosItem] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function fetchAll() {
    const since = addDaysToDateString(todayInKolkata(), -29);
    return Promise.all([
      supabase
        .from("pos_items")
        .select("id, pos_name, pos_category, recipe_id, portion, status, last_seen_date")
        .eq("organization_id", organizationId)
        .order("pos_name"),
      supabase
        .from("menu_recipes")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
      outletIds.length > 0
        ? supabase
            .from("pos_sales_daily")
            .select("pos_item_id, quantity")
            .in("outlet_id", outletIds)
            .gte("business_date", since)
        : Promise.resolve({
            data: [] as { pos_item_id: string; quantity: number }[],
            error: null,
          }),
    ]);
  }

  function applyData(
    itemRows: PosItem[],
    recipeRows: RecipeOption[],
    salesRows: { pos_item_id: string; quantity: number }[],
  ) {
    const recipeById = new Map(recipeRows.map((recipe) => [recipe.id, recipe.name]));
    setPosItems(itemRows);
    setRecipes(recipeRows);
    const units: Record<string, number> = {};
    for (const row of salesRows) {
      units[row.pos_item_id] = (units[row.pos_item_id] ?? 0) + row.quantity;
    }
    setUnitsByPosItem(units);
    setDrafts(
      Object.fromEntries(
        itemRows.map((item) => [
          item.id,
          {
            recipe: item.recipe_id
              ? { id: item.recipe_id, name: recipeById.get(item.recipe_id) ?? "" }
              : null,
            portion: String(item.portion),
          },
        ]),
      ),
    );
  }

  useEffect(() => {
    let cancelled = false;
    fetchAll().then(([itemsRes, recipesRes, salesRes]) => {
      if (cancelled) return;
      setLoading(false);
      if (itemsRes.error) {
        setLoadError(itemsRes.error.message);
        return;
      }
      if (recipesRes.error) {
        setLoadError(recipesRes.error.message);
        return;
      }
      applyData(
        (itemsRes.data ?? []) as PosItem[],
        recipesRes.data ?? [],
        salesRes.data ?? [],
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, outletIds.join(",")]);

  async function refresh() {
    const [itemsRes, recipesRes, salesRes] = await fetchAll();
    if (itemsRes.error || recipesRes.error) {
      showError((itemsRes.error ?? recipesRes.error)!.message);
      return;
    }
    applyData(
      (itemsRes.data ?? []) as PosItem[],
      recipesRes.data ?? [],
      salesRes.data ?? [],
    );
  }

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function saveMapping(item: PosItem) {
    const draft = drafts[item.id];
    if (!draft.recipe) {
      setRowErrors((prev) => ({ ...prev, [item.id]: "Choose a recipe." }));
      return;
    }
    const portion = Number(draft.portion);
    if (!Number.isFinite(portion) || portion <= 0) {
      setRowErrors((prev) => ({
        ...prev,
        [item.id]: "Portion must be greater than 0.",
      }));
      return;
    }
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    setSavingId(item.id);
    const { error } = await supabase
      .from("pos_items")
      .update({ recipe_id: draft.recipe.id, portion, status: "mapped" })
      .eq("id", item.id);
    setSavingId(null);
    if (error) {
      showError(error.message);
      return;
    }
    await refresh();
  }

  async function setStatus(item: PosItem, status: "ignored" | "unmapped") {
    setSavingId(item.id);
    const { error } = await supabase
      .from("pos_items")
      .update({ recipe_id: null, status })
      .eq("id", item.id);
    setSavingId(null);
    if (error) {
      showError(error.message);
      return;
    }
    await refresh();
  }

  const totals = posItems.reduce(
    (acc, item) => {
      const units = unitsByPosItem[item.id] ?? 0;
      acc.total += units;
      if (item.status === "unmapped") acc.unmapped += units;
      return acc;
    },
    { total: 0, unmapped: 0 },
  );
  const unmappedPct = totals.total > 0 ? (totals.unmapped / totals.total) * 100 : 0;

  const filtered = tab === "all" ? posItems : posItems.filter((item) => item.status === tab);

  if (loading) return <SkeletonList rows={5} rowClassName="h-16" />;
  if (loadError) {
    return <p className="text-danger">Couldn&apos;t load mappings: {loadError}</p>;
  }

  return (
    <div>
      {totals.total > 0 && (
        <p className="mb-4 rounded-2xl bg-warning/10 p-4 text-sm font-medium text-warning">
          {unmappedPct.toFixed(1)}% of units sold in the last 30 days are from
          unmapped dishes.
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-1 rounded-full bg-surface p-1 ring-1 ring-border">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`min-h-[40px] flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
              tab === item.id ? "bg-accent text-white" : "text-muted hover:text-text"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nothing here." />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-border">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  POS name
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  Category
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  Last seen
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  Units (30d)
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  Recipe
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  Portion
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const draft = drafts[item.id] ?? { recipe: null, portion: "1" };
                return (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap text-text">
                      {item.pos_name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {item.pos_category ?? "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {item.last_seen_date ? formatDateLabel(item.last_seen_date) : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {formatQuantity(unitsByPosItem[item.id] ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      <RecipeCombobox
                        recipes={recipes}
                        value={draft.recipe}
                        onChange={(recipe) => updateDraft(item.id, { recipe })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0.001"
                        step="any"
                        value={draft.portion}
                        onChange={(event) =>
                          updateDraft(item.id, { portion: event.target.value })
                        }
                        className="w-20 rounded-lg border border-border bg-bg px-3 py-2 text-text focus:border-accent focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-end gap-1">
                        {rowErrors[item.id] && (
                          <p className="text-xs font-medium text-danger">
                            {rowErrors[item.id]}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={savingId === item.id}
                            onClick={() => saveMapping(item)}
                            className="min-h-[36px] rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                          >
                            Save
                          </button>
                          {item.status !== "ignored" && (
                            <button
                              type="button"
                              disabled={savingId === item.id}
                              onClick={() => setStatus(item, "ignored")}
                              className="min-h-[36px] rounded-full bg-border/50 px-3 py-1.5 text-sm font-medium text-muted disabled:opacity-40"
                            >
                              Ignore
                            </button>
                          )}
                          {item.status !== "unmapped" && (
                            <button
                              type="button"
                              disabled={savingId === item.id}
                              onClick={() => setStatus(item, "unmapped")}
                              className="min-h-[36px] rounded-full bg-border/50 px-3 py-1.5 text-sm font-medium text-muted disabled:opacity-40"
                            >
                              Unmap
                            </button>
                          )}
                        </div>
                      </div>
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
