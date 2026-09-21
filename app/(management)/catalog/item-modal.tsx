"use client";

import { useState, type FormEvent } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import type { InventoryItemRow, Vendor } from "@/lib/types";
import {
  isValidRecipeUnitPair,
  recipeUnitFactor,
  RECIPE_UNIT_MISMATCH_MESSAGE,
  type RecipeUnit,
} from "@/lib/units";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export type ItemFormValues = {
  name: string;
  category: string;
  count_unit: string;
  order_unit: string;
  order_unit_size: string;
  cost_per_unit: string;
  vendor_id: string;
  count_frequency: "daily" | "weekly";
  active: boolean;
  recipe_unit: RecipeUnit | "";
};

export function ItemModal({
  item,
  vendors,
  onSubmit,
  onClose,
}: {
  item: InventoryItemRow | null;
  vendors: Vendor[];
  onSubmit: (values: ItemFormValues) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [values, setValues] = useState<ItemFormValues>({
    name: item?.name ?? "",
    category: item?.category ?? "",
    count_unit: item?.count_unit ?? "",
    order_unit: item?.order_unit ?? "",
    order_unit_size: item ? String(item.order_unit_size) : "1",
    cost_per_unit: item?.cost_per_unit != null ? String(item.cost_per_unit) : "",
    vendor_id: item?.vendor_id ?? "",
    count_frequency: item?.count_frequency ?? "daily",
    active: item?.active ?? true,
    recipe_unit: item?.recipe_unit ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!values.name.trim()) {
      setError(t("common.nameEmpty"));
      return;
    }
    if (!values.count_unit.trim()) {
      setError(t("catalog.countUnitRequired"));
      return;
    }
    if (!isValidRecipeUnitPair(values.recipe_unit, values.count_unit.trim())) {
      setError(RECIPE_UNIT_MISMATCH_MESSAGE);
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await onSubmit(values);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <Modal
      onClose={onClose}
      title={item ? t("catalog.editItem") : t("catalog.addItem")}
      panelClassName="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface p-6 shadow-xl outline-none"
    >
      <form onSubmit={handleSubmit}>
        <label className="mb-1 block text-sm font-medium text-muted">
          {t("common.nameLabel")}
        </label>
        <input
          type="text"
          value={values.name}
          onChange={(event) => set("name", event.target.value)}
          autoFocus
          className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium text-muted">
          {t("catalog.categoryLabel")}
        </label>
        <input
          type="text"
          value={values.category}
          onChange={(event) => set("category", event.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
        />

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">
              {t("catalog.countUnitLabel")}
            </label>
            <input
              type="text"
              value={values.count_unit}
              onChange={(event) => set("count_unit", event.target.value)}
              placeholder={t("catalog.unitPlaceholder")}
              className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">
              {t("catalog.countFrequencyLabel")}
            </label>
            <select
              value={values.count_frequency}
              onChange={(event) =>
                set("count_frequency", event.target.value as "daily" | "weekly")
              }
              className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
            >
              <option value="daily">{t("catalog.frequencyDaily")}</option>
              <option value="weekly">{t("catalog.frequencyWeekly")}</option>
            </select>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">
              {t("catalog.orderUnitLabel")}
            </label>
            <input
              type="text"
              value={values.order_unit}
              onChange={(event) => set("order_unit", event.target.value)}
              placeholder={t("catalog.unitPlaceholder")}
              className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">
              {t("catalog.orderUnitSizeLabel")}
            </label>
            <input
              type="number"
              min="0.001"
              step="any"
              value={values.order_unit_size}
              onChange={(event) => set("order_unit_size", event.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">
              Recipe unit
            </label>
            <select
              value={values.recipe_unit}
              onChange={(event) =>
                set("recipe_unit", event.target.value as RecipeUnit | "")
              }
              className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
            >
              <option value="">Not used in recipes</option>
              <option value="g">g</option>
              <option value="ml">ml</option>
              <option value="pcs">pcs</option>
            </select>
            {!isValidRecipeUnitPair(values.recipe_unit, values.count_unit.trim()) && (
              <p className="mt-1 text-sm text-danger">{RECIPE_UNIT_MISMATCH_MESSAGE}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">
              Recipe units per stock unit
            </label>
            <p className="flex h-[50px] items-center rounded-lg bg-bg px-4 text-base text-muted">
              {values.recipe_unit
                ? (() => {
                    const factor = recipeUnitFactor(
                      values.recipe_unit,
                      values.count_unit.trim(),
                    );
                    return factor != null
                      ? `${factor} ${values.recipe_unit} per ${values.count_unit.trim()}`
                      : "—";
                  })()
                : "—"}
            </p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">
              {t("catalog.costPerUnitLabel")}
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={values.cost_per_unit}
              onChange={(event) => set("cost_per_unit", event.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">
              {t("catalog.vendorLabel")}
            </label>
            <select
              value={values.vendor_id}
              onChange={(event) => set("vendor_id", event.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
            >
              <option value="">{t("catalog.noVendor")}</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {item && (
          <label className="mb-4 flex items-center gap-2 text-sm font-medium text-text">
            <input
              type="checkbox"
              checked={values.active}
              onChange={(event) => set("active", event.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            {t("manager.active")}
          </label>
        )}

        {error && (
          <p className="mb-4 text-sm font-medium text-danger">{error}</p>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="flex-1"
          >
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={submitting} className="flex-1">
            {submitting ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
