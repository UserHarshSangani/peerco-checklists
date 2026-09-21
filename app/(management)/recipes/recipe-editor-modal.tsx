"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRupees } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { IngredientPickerModal } from "./ingredient-picker-modal";
import { DishesPanel } from "./dishes-panel";
import type { EditorInitial, IngredientOption, RecipeLineDraft } from "./types";

type SaveResult =
  | { ok: true; recipe_id: string; lines: number }
  | { ok: false; reason: string; count?: number };

function saveErrorMessage(result: Extract<SaveResult, { ok: false }>): string {
  switch (result.reason) {
    case "duplicate_name":
      return "A recipe with this name already exists";
    case "bad_item":
      return "Some ingredients have no recipe unit. Set one in Catalog";
    case "duplicate_item":
      return "The same ingredient appears more than once.";
    case "bad_quantity":
      return "One or more quantities are invalid.";
    case "in_use":
      return `${result.count ?? "Some"} mapped dishes use this recipe. Unlink them before deactivating it`;
    case "not_found":
      return "This recipe no longer exists.";
    case "not_allowed":
      return "You don't have permission to save this recipe.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export function RecipeEditorModal({
  organizationId,
  initial,
  onClose,
  onSaved,
}: {
  organizationId: string;
  initial: EditorInitial;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [recipeId, setRecipeId] = useState(initial.recipeId);
  const [name, setName] = useState(initial.name);
  const [batchYield, setBatchYield] = useState(initial.batchYield);
  const [notes, setNotes] = useState(initial.notes);
  const [active, setActive] = useState(initial.active);
  const [lines, setLines] = useState<RecipeLineDraft[]>(initial.lines);
  const [dirty, setDirty] = useState(false);
  const [dishesKey, setDishesKey] = useState(0);

  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const lastQuantityRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("inventory_items")
      .select("id, name, category, recipe_unit, recipe_factor, cost_per_unit")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .not("recipe_unit", "is", null)
      .order("name")
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setIngredients(data as IngredientOption[]);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, organizationId]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  function requestClose() {
    if (dirty && !window.confirm("You have unsaved changes. Discard them?")) {
      return;
    }
    onClose();
  }

  function markDirty<T>(setter: (value: T) => void) {
    return (value: T) => {
      setDirty(true);
      setter(value);
    };
  }

  function addLine(item: IngredientOption) {
    setLines((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        item_id: item.id,
        name: item.name,
        category: item.category,
        recipe_unit: item.recipe_unit,
        recipe_factor: item.recipe_factor,
        cost_per_unit: item.cost_per_unit,
        quantity: "",
        note: "",
      },
    ]);
    setDirty(true);
    setShowPicker(false);
    window.setTimeout(() => lastQuantityRef.current?.focus(), 50);
  }

  function updateLine(localId: string, patch: Partial<RecipeLineDraft>) {
    setLines((prev) =>
      prev.map((line) => (line.localId === localId ? { ...line, ...patch } : line)),
    );
    setDirty(true);
  }

  function removeLine(localId: string) {
    setLines((prev) => prev.filter((line) => line.localId !== localId));
    setDirty(true);
  }

  function handleIngredientCreated(item: IngredientOption) {
    setIngredients((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
  }

  const costMissing = lines.filter((line) => line.cost_per_unit == null);
  const costPerBatch = lines.reduce((sum, line) => {
    const quantity = Number(line.quantity);
    if (line.cost_per_unit == null || !Number.isFinite(quantity)) return sum;
    return sum + (quantity / line.recipe_factor) * line.cost_per_unit;
  }, 0);
  const yieldNum = Number(batchYield);
  const costPerPortion =
    Number.isFinite(yieldNum) && yieldNum > 0 ? costPerBatch / yieldNum : null;

  async function handleSave() {
    if (!name.trim()) {
      setSaveError("Recipe name is required.");
      return;
    }
    if (!Number.isFinite(yieldNum) || yieldNum <= 0) {
      setSaveError("Batch yield must be a positive number.");
      return;
    }
    for (const line of lines) {
      const quantity = Number(line.quantity);
      if (!line.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0) {
        setSaveError(`Enter a quantity for "${line.name}".`);
        return;
      }
    }

    setSaving(true);
    setSaveError(null);
    const { data, error } = await supabase.rpc("save_recipe", {
      p_organization_id: organizationId,
      p_recipe_id: recipeId,
      p_name: name.trim(),
      p_batch_yield: yieldNum,
      p_notes: notes.trim() || null,
      p_active: active,
      p_lines: lines.map((line) => ({
        item_id: line.item_id,
        quantity: Number(line.quantity),
        note: line.note.trim() || null,
      })),
    });
    setSaving(false);

    if (error) {
      setSaveError("Something went wrong. Please try again.");
      return;
    }
    const result = data as SaveResult;
    if (!result.ok) {
      setSaveError(saveErrorMessage(result));
      return;
    }
    setRecipeId(result.recipe_id);
    setDirty(false);
    setDishesKey((n) => n + 1);
    onSaved();
  }

  async function handleDelete() {
    if (!recipeId) return;
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    setDeleting(true);
    const { error } = await supabase.from("menu_recipes").delete().eq("id", recipeId);
    setDeleting(false);
    if (error) {
      setSaveError(
        error.code === "23503"
          ? "Unlink the dishes that use this recipe first."
          : error.message,
      );
      return;
    }
    onSaved();
    onClose();
  }

  const excludeIds = useMemo(() => new Set(lines.map((line) => line.item_id)), [lines]);

  return (
    <>
      <Modal
        onClose={requestClose}
        title={recipeId ? `Edit recipe — ${name || "Untitled"}` : "New recipe"}
        panelClassName="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-surface p-6 shadow-xl outline-none"
      >
        <p className="mb-4 rounded-xl bg-warning/10 p-3 text-sm text-warning">
          Editing a recipe changes how past days are calculated when variance is
          recalculated.
        </p>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-muted">
            Recipe name
            <input
              type="text"
              value={name}
              onChange={(event) => markDirty(setName)(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
            />
          </label>
          <label className="text-sm font-medium text-muted">
            Batch makes (number of portions)
            <input
              type="number"
              min="0.001"
              step="any"
              value={batchYield}
              onChange={(event) => markDirty(setBatchYield)(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
            />
            <span className="mt-1 block text-xs font-normal text-muted">
              One portion is one normal sale unit: a cake, a croissant, a
              sandwich. A tray of 60 croissants makes 60.
            </span>
          </label>
        </div>

        <label className="mb-4 block text-sm font-medium text-muted">
          Notes
          <textarea
            value={notes}
            onChange={(event) => markDirty(setNotes)(event.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
          />
        </label>

        <label className="mb-6 flex items-center gap-2 text-sm font-medium text-text">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => markDirty(setActive)(event.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Active
        </label>

        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-text">Ingredients</h3>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="min-h-[40px] rounded-full bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Add ingredient
          </button>
        </div>

        {lines.length === 0 ? (
          <p className="mb-6 text-sm text-muted">No ingredients yet.</p>
        ) : (
          <ul className="mb-6 flex flex-col gap-2">
            {lines.map((line, index) => {
              const isLast = index === lines.length - 1;
              return (
                <li
                  key={line.localId}
                  className="flex flex-wrap items-center gap-3 rounded-xl bg-bg p-3"
                >
                  <span className="min-w-0 flex-1 text-sm text-text">
                    {line.name}
                    {line.category && (
                      <span className="ml-2 text-xs text-muted">
                        {line.category}
                      </span>
                    )}
                    {!line.recipe_unit && (
                      <span className="ml-2 text-xs font-medium text-danger">
                        No recipe unit set — fix in Catalog before saving
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      ref={isLast ? lastQuantityRef : undefined}
                      type="text"
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(line.localId, { quantity: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (isLast && event.key === "Enter") {
                          event.preventDefault();
                          setShowPicker(true);
                        }
                      }}
                      placeholder="0"
                      className="w-24 rounded-lg border border-border bg-surface px-3 py-2 text-right text-sm text-text focus:border-accent focus:outline-none"
                    />
                    <span className="text-sm text-muted">{line.recipe_unit ?? "—"}</span>
                  </div>
                  <input
                    type="text"
                    value={line.note}
                    onChange={(event) =>
                      updateLine(line.localId, { note: event.target.value })
                    }
                    placeholder="Note (optional)"
                    className="w-40 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(line.localId)}
                    className="text-sm font-medium text-danger"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mb-6 rounded-2xl bg-bg p-4">
          <p className="text-sm text-text">
            Cost per batch: {formatRupees(costPerBatch)} · Cost per portion:{" "}
            {costPerPortion != null ? formatRupees(costPerPortion) : "—"}
          </p>
          {costMissing.length > 0 && (
            <p className="mt-1 text-sm text-warning">
              Cost missing for: {costMissing.map((line) => line.name).join(", ")}
            </p>
          )}
        </div>

        <h3 className="mb-3 text-base font-semibold text-text">
          Dishes using this recipe
        </h3>
        {recipeId ? (
          <DishesPanel
            key={dishesKey}
            organizationId={organizationId}
            recipeId={recipeId}
          />
        ) : (
          <p className="mb-6 text-sm text-muted">
            Save the recipe first to link dishes.
          </p>
        )}

        {saveError && (
          <p className="mt-6 text-sm font-medium text-danger">{saveError}</p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={requestClose} className="flex-1">
            Close
          </Button>
          {recipeId && (
            <Button
              type="button"
              variant="danger"
              loading={deleting}
              onClick={handleDelete}
              className="flex-1"
            >
              Delete recipe
            </Button>
          )}
          <Button type="button" loading={saving} onClick={handleSave} className="flex-1">
            {saving ? "Saving…" : "Save recipe"}
          </Button>
        </div>
      </Modal>

      {showPicker && (
        <IngredientPickerModal
          organizationId={organizationId}
          items={ingredients}
          excludeIds={excludeIds}
          onPick={addLine}
          onCreated={handleIngredientCreated}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
