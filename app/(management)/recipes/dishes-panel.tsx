"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { RecipeCombobox, type RecipeOption } from "../mapping/recipe-combobox";

type LinkedDish = { id: string; pos_name: string; portion: number };

export function DishesPanel({
  organizationId,
  recipeId,
}: {
  organizationId: string;
  recipeId: string;
}) {
  const { showError } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [dishes, setDishes] = useState<LinkedDish[]>([]);
  const [unmapped, setUnmapped] = useState<RecipeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDish, setSelectedDish] = useState<RecipeOption | null>(null);
  const [portion, setPortion] = useState("1");
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  async function fetchAll() {
    return Promise.all([
      supabase
        .from("pos_items")
        .select("id, pos_name, portion")
        .eq("recipe_id", recipeId)
        .order("pos_name"),
      supabase
        .from("pos_items")
        .select("id, pos_name")
        .eq("organization_id", organizationId)
        .eq("status", "unmapped")
        .order("pos_name"),
    ]);
  }

  async function refresh() {
    const [dishesRes, unmappedRes] = await fetchAll();
    if (dishesRes.error || unmappedRes.error) {
      showError((dishesRes.error ?? unmappedRes.error)!.message);
      return;
    }
    setDishes(dishesRes.data ?? []);
    setUnmapped(
      (unmappedRes.data ?? []).map((row) => ({ id: row.id, name: row.pos_name })),
    );
  }

  useEffect(() => {
    let cancelled = false;
    fetchAll().then(([dishesRes, unmappedRes]) => {
      if (cancelled) return;
      setLoading(false);
      if (dishesRes.error) {
        setLoadError(dishesRes.error.message);
        return;
      }
      setDishes(dishesRes.data ?? []);
      setUnmapped(
        (unmappedRes.data ?? []).map((row) => ({ id: row.id, name: row.pos_name })),
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, organizationId]);

  async function handleUnlink(dish: LinkedDish) {
    setUnlinkingId(dish.id);
    const { error } = await supabase
      .from("pos_items")
      .update({ recipe_id: null, status: "unmapped" })
      .eq("id", dish.id);
    setUnlinkingId(null);
    if (error) {
      showError(error.message);
      return;
    }
    await refresh();
  }

  async function handleLink() {
    if (!selectedDish) {
      setLinkError("Choose a dish.");
      return;
    }
    const portionNum = Number(portion);
    if (!Number.isFinite(portionNum) || portionNum <= 0) {
      setLinkError("Portion must be greater than 0.");
      return;
    }
    setLinking(true);
    setLinkError(null);
    const { error } = await supabase
      .from("pos_items")
      .update({ recipe_id: recipeId, portion: portionNum, status: "mapped" })
      .eq("id", selectedDish.id);
    setLinking(false);
    if (error) {
      setLinkError(error.message);
      return;
    }
    setSelectedDish(null);
    setPortion("1");
    await refresh();
  }

  if (loading) return <SkeletonList rows={2} rowClassName="h-12" />;
  if (loadError) {
    return <p className="text-danger">Couldn&apos;t load dishes: {loadError}</p>;
  }

  return (
    <div>
      {dishes.length === 0 ? (
        <EmptyState title="No dishes linked to this recipe yet." />
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {dishes.map((dish) => (
            <li
              key={dish.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-bg p-3"
            >
              <span className="text-sm text-text">
                {dish.pos_name}{" "}
                <span className="text-muted">· portion {dish.portion}</span>
              </span>
              <button
                type="button"
                disabled={unlinkingId === dish.id}
                onClick={() => handleUnlink(dish)}
                className="text-sm font-medium text-danger disabled:opacity-50"
              >
                Unlink
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-2xl bg-bg p-4">
        <p className="mb-2 text-sm font-semibold text-text">Link a dish</p>
        <div className="flex flex-wrap items-end gap-3">
          <RecipeCombobox
            recipes={unmapped}
            value={selectedDish}
            onChange={setSelectedDish}
          />
          <label className="flex flex-col text-sm text-muted">
            Portion
            <input
              type="number"
              min="0.001"
              step="any"
              value={portion}
              onChange={(event) => setPortion(event.target.value)}
              className="mt-1 w-20 rounded-lg border border-border bg-surface px-3 py-2 text-text focus:border-accent focus:outline-none"
            />
          </label>
          <button
            type="button"
            disabled={linking}
            onClick={handleLink}
            className="min-h-[40px] rounded-full bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Link
          </button>
        </div>
        {linkError && (
          <p className="mt-2 text-sm font-medium text-danger">{linkError}</p>
        )}
      </div>
    </div>
  );
}
