"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRupees } from "@/lib/format";
import type { RecipeUnit } from "@/lib/units";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { EditorInitial } from "./types";

type Recipe = {
  id: string;
  name: string;
  batch_yield: number;
  notes: string | null;
  active: boolean;
};
type Line = { recipe_id: string; item_id: string; quantity: number; note: string | null };
type Item = {
  id: string;
  name: string;
  category: string | null;
  // Nullable: an ingredient can lose its recipe unit in Catalog after it's
  // already been used in a saved recipe — that line should still show up
  // (with its last-known unit) when editing, not vanish silently.
  recipe_unit: RecipeUnit | null;
  recipe_factor: number;
  cost_per_unit: number | null;
};

type Filter = "all" | "no_ingredients" | "unlinked" | "inactive";

export function RecipesList({
  organizationId,
  onEdit,
  onDuplicate,
}: {
  organizationId: string;
  onEdit: (initial: EditorInitial) => void;
  onDuplicate: (initial: EditorInitial) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [dishCountByRecipe, setDishCountByRecipe] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: recipeRows, error: recipeError } = await supabase
        .from("menu_recipes")
        .select("id, name, batch_yield, notes, active")
        .eq("organization_id", organizationId)
        .order("name");
      if (cancelled) return;
      if (recipeError) {
        setLoading(false);
        setLoadError(recipeError.message);
        return;
      }

      const recipeIds = (recipeRows ?? []).map((row) => row.id);
      let lineRows: Line[] = [];
      if (recipeIds.length > 0) {
        const { data, error } = await supabase
          .from("recipe_lines")
          .select("recipe_id, item_id, quantity, note")
          .in("recipe_id", recipeIds);
        if (cancelled) return;
        if (error) {
          setLoading(false);
          setLoadError(error.message);
          return;
        }
        lineRows = data ?? [];
      }

      // Not filtered to recipe_unit is not null: an existing recipe line's
      // ingredient must still resolve here even if its recipe unit was
      // later cleared in Catalog, so editing that recipe doesn't silently
      // drop the line.
      const { data: itemRows, error: itemError } = await supabase
        .from("inventory_items")
        .select("id, name, category, recipe_unit, recipe_factor, cost_per_unit")
        .eq("organization_id", organizationId);
      if (cancelled) return;
      if (itemError) {
        setLoading(false);
        setLoadError(itemError.message);
        return;
      }

      const { data: posRows, error: posError } = await supabase
        .from("pos_items")
        .select("recipe_id")
        .eq("organization_id", organizationId)
        .not("recipe_id", "is", null);
      if (cancelled) return;
      if (posError) {
        setLoading(false);
        setLoadError(posError.message);
        return;
      }
      const dishCounts: Record<string, number> = {};
      for (const row of posRows ?? []) {
        if (!row.recipe_id) continue;
        dishCounts[row.recipe_id] = (dishCounts[row.recipe_id] ?? 0) + 1;
      }

      setRecipes(recipeRows ?? []);
      setLines(lineRows);
      setItems((itemRows ?? []) as Item[]);
      setDishCountByRecipe(dishCounts);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, organizationId]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const rows = useMemo(() => {
    return recipes.map((recipe) => {
      const recipeLines = lines.filter((line) => line.recipe_id === recipe.id);
      let costTotal = 0;
      let costMissing = false;
      for (const line of recipeLines) {
        const item = itemById.get(line.item_id);
        if (!item || item.cost_per_unit == null) {
          costMissing = true;
          continue;
        }
        costTotal += (line.quantity / item.recipe_factor) * item.cost_per_unit;
      }
      const costPerPortion = recipe.batch_yield > 0 ? costTotal / recipe.batch_yield : null;
      const dishCount = dishCountByRecipe[recipe.id] ?? 0;
      return {
        recipe,
        recipeLines,
        ingredientCount: recipeLines.length,
        costPerPortion,
        costMissing,
        dishCount,
      };
    });
  }, [recipes, lines, itemById, dishCountByRecipe]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (query && !row.recipe.name.toLowerCase().includes(query)) return false;
      if (filter === "no_ingredients" && row.ingredientCount > 0) return false;
      if (filter === "unlinked" && row.dishCount > 0) return false;
      if (filter === "inactive" && row.recipe.active) return false;
      return true;
    });
  }, [rows, search, filter]);

  function buildLineDrafts(recipeLines: Line[]) {
    return recipeLines.flatMap((line) => {
      const item = itemById.get(line.item_id);
      if (!item) return [];
      return [
        {
          localId: crypto.randomUUID(),
          item_id: item.id,
          name: item.name,
          category: item.category,
          recipe_unit: item.recipe_unit,
          recipe_factor: item.recipe_factor,
          cost_per_unit: item.cost_per_unit,
          quantity: String(line.quantity),
          note: line.note ?? "",
        },
      ];
    });
  }

  function handleEdit(row: (typeof rows)[number]) {
    onEdit({
      recipeId: row.recipe.id,
      name: row.recipe.name,
      batchYield: String(row.recipe.batch_yield),
      notes: row.recipe.notes ?? "",
      active: row.recipe.active,
      lines: buildLineDrafts(row.recipeLines),
    });
  }

  function handleDuplicate(row: (typeof rows)[number]) {
    onDuplicate({
      recipeId: null,
      name: `${row.recipe.name} (copy)`,
      batchYield: String(row.recipe.batch_yield),
      notes: row.recipe.notes ?? "",
      active: true,
      lines: buildLineDrafts(row.recipeLines),
    });
  }

  if (loading) return <SkeletonList rows={4} rowClassName="h-14" />;
  if (loadError) {
    return <p className="text-danger">Couldn&apos;t load recipes: {loadError}</p>;
  }

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "no_ingredients", label: "No ingredients yet" },
    { id: "unlinked", label: "Not linked to any dish" },
    { id: "inactive", label: "Inactive" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search recipes…"
          className="min-h-[44px] w-full max-w-xs rounded-lg border border-border bg-surface px-4 py-2 text-base text-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <div className="flex flex-wrap gap-1 rounded-full bg-surface p-1 ring-1 ring-border">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`min-h-[36px] rounded-full px-3 py-1.5 text-sm font-medium transition ${
                filter === item.id ? "bg-accent text-accent-fg" : "text-muted hover:text-text"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No recipes match." />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-border">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left font-semibold text-muted">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  Batch yield
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  Ingredients
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  Cost / portion
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  Linked dishes
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  Status
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.recipe.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium whitespace-nowrap text-text">
                    {row.recipe.name}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {row.recipe.batch_yield}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {row.ingredientCount}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {row.costMissing
                      ? "Cost missing"
                      : row.costPerPortion != null
                        ? formatRupees(row.costPerPortion)
                        : "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {row.dishCount}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        row.recipe.active
                          ? "bg-success/15 text-success"
                          : "bg-border/50 text-muted"
                      }`}
                    >
                      {row.recipe.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleEdit(row)}
                      className="mr-3 text-sm font-medium text-muted hover:text-text"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(row)}
                      className="text-sm font-medium text-muted hover:text-text"
                    >
                      Duplicate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
