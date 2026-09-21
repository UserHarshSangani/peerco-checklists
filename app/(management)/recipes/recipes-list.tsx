"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRupees } from "@/lib/format";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

type Recipe = { id: string; name: string; batch_yield: number; active: boolean };
type Line = { recipe_id: string; item_id: string; quantity: number };
type Item = { id: string; recipe_factor: number; cost_per_unit: number | null };

export function RecipesList({ organizationId }: { organizationId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: recipeRows, error: recipeError } = await supabase
        .from("menu_recipes")
        .select("id, name, batch_yield, active")
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
          .select("recipe_id, item_id, quantity")
          .in("recipe_id", recipeIds);
        if (cancelled) return;
        if (error) {
          setLoading(false);
          setLoadError(error.message);
          return;
        }
        lineRows = data ?? [];
      }

      const itemIds = Array.from(new Set(lineRows.map((line) => line.item_id)));
      let itemRows: Item[] = [];
      if (itemIds.length > 0) {
        const { data, error } = await supabase
          .from("inventory_items")
          .select("id, recipe_factor, cost_per_unit")
          .in("id", itemIds);
        if (cancelled) return;
        if (error) {
          setLoading(false);
          setLoadError(error.message);
          return;
        }
        itemRows = data ?? [];
      }

      setRecipes(recipeRows ?? []);
      setLines(lineRows);
      setItems(itemRows);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, organizationId]);

  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

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
      const costPerPortion =
        recipe.batch_yield > 0 ? costTotal / recipe.batch_yield : null;
      return {
        recipe,
        ingredientCount: recipeLines.length,
        costPerPortion,
        costMissing,
      };
    });
  }, [recipes, lines, itemById]);

  if (loading) return <SkeletonList rows={4} rowClassName="h-14" />;
  if (loadError) {
    return <p className="text-danger">Couldn&apos;t load recipes: {loadError}</p>;
  }
  if (rows.length === 0) {
    return <EmptyState title="No recipes yet. Import a workbook to add some." />;
  }

  return (
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
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ recipe, ingredientCount, costPerPortion, costMissing }) => (
            <tr key={recipe.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-medium whitespace-nowrap text-text">
                {recipe.name}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted">
                {recipe.batch_yield}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted">
                {ingredientCount}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted">
                {costMissing
                  ? "Cost missing"
                  : costPerPortion != null
                    ? formatRupees(costPerPortion)
                    : "—"}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    recipe.active
                      ? "bg-success/15 text-success"
                      : "bg-border/50 text-muted"
                  }`}
                >
                  {recipe.active ? "Active" : "Inactive"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
