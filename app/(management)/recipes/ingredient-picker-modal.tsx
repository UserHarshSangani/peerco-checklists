"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  isRecipeUnitMismatchError,
  isValidRecipeUnitPair,
  RECIPE_UNIT_MISMATCH_MESSAGE,
  type RecipeUnit,
} from "@/lib/units";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { IngredientOption } from "./types";

function isDuplicateNameError(message: string): boolean {
  return message.toLowerCase().includes("duplicate key");
}

export function IngredientPickerModal({
  organizationId,
  items,
  excludeIds,
  onPick,
  onCreated,
  onClose,
}: {
  organizationId: string;
  items: IngredientOption[];
  excludeIds: Set<string>;
  onPick: (item: IngredientOption) => void;
  onCreated: (item: IngredientOption) => void;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newCountUnit, setNewCountUnit] = useState("");
  const [newRecipeUnit, setNewRecipeUnit] = useState<RecipeUnit>("g");
  const [newCost, setNewCost] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const results = useMemo(() => {
    const available = items.filter((item) => !excludeIds.has(item.id));
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return available;
    return available.filter(
      (item) =>
        item.name.toLowerCase().includes(trimmed) ||
        (item.category ?? "").toLowerCase().includes(trimmed),
    );
  }, [items, excludeIds, query]);

  async function handleCreate() {
    if (!newName.trim()) {
      setCreateError("Name is required.");
      return;
    }
    if (!newCountUnit.trim()) {
      setCreateError("Stock unit is required.");
      return;
    }
    if (!isValidRecipeUnitPair(newRecipeUnit, newCountUnit.trim())) {
      setCreateError(RECIPE_UNIT_MISMATCH_MESSAGE);
      return;
    }
    setCreating(true);
    setCreateError(null);
    const { data, error } = await supabase
      .from("inventory_items")
      .insert({
        organization_id: organizationId,
        name: newName.trim(),
        category: newCategory.trim() || null,
        count_unit: newCountUnit.trim(),
        recipe_unit: newRecipeUnit,
        cost_per_unit: newCost.trim() ? Number(newCost) : null,
        active: true,
      })
      .select("id, name, category, recipe_unit, recipe_factor, cost_per_unit")
      .single();
    setCreating(false);
    if (error || !data) {
      setCreateError(
        error && isRecipeUnitMismatchError(error)
          ? RECIPE_UNIT_MISMATCH_MESSAGE
          : error && isDuplicateNameError(error.message)
            ? "An ingredient with this name already exists."
            : (error?.message ?? "Something went wrong. Please try again."),
      );
      return;
    }
    const created = data as IngredientOption;
    onCreated(created);
    onPick(created);
  }

  return (
    <Modal onClose={onClose} title="Add ingredient">
      {!showCreate ? (
        <>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
            placeholder="Search ingredients…"
            className="mb-3 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mb-4 text-sm font-medium text-accent underline"
          >
            + Create new ingredient
          </button>

          {results.length === 0 && <EmptyState title="No ingredients found." />}
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onPick(item)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl bg-bg p-3 text-left ring-1 ring-border transition hover:bg-border/20"
                >
                  <span className="text-base font-medium text-text">
                    {item.name}
                    {item.category && (
                      <span className="ml-2 text-sm font-normal text-muted">
                        {item.category}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm text-muted">
                    {item.recipe_unit}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-muted">
            Name
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              autoFocus
              className="mt-1 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
            />
          </label>
          <label className="text-sm font-medium text-muted">
            Category
            <input
              type="text"
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium text-muted">
              Stock unit
              <input
                type="text"
                value={newCountUnit}
                onChange={(event) => setNewCountUnit(event.target.value)}
                placeholder="kg, g, l, ml, pcs"
                className="mt-1 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
              />
            </label>
            <label className="text-sm font-medium text-muted">
              Recipe unit
              <select
                value={newRecipeUnit}
                onChange={(event) => setNewRecipeUnit(event.target.value as RecipeUnit)}
                className="mt-1 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
              >
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="pcs">pcs</option>
              </select>
            </label>
          </div>
          <label className="text-sm font-medium text-muted">
            Cost per stock unit (₹, optional)
            <input
              type="number"
              min="0"
              step="any"
              value={newCost}
              onChange={(event) => setNewCost(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
            />
          </label>

          <p className="rounded-2xl bg-accent/10 p-3 text-sm text-text">
            New ingredients aren&apos;t stocked at any outlet yet. Add them in
            Catalog &gt; Outlet settings before they appear on the tablet count
            sheet.
          </p>

          {createError && (
            <p className="text-sm font-medium text-danger">{createError}</p>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCreate(false)}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              type="button"
              loading={creating}
              onClick={handleCreate}
              className="flex-1"
            >
              Create and select
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
