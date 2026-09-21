"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRupees } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/language-context";
import { useToast } from "@/components/ui/toast";
import type { InventoryItemRow, Vendor } from "@/lib/types";
import { isRecipeUnitMismatchError, RECIPE_UNIT_MISMATCH_MESSAGE } from "@/lib/units";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ItemModal, type ItemFormValues } from "./item-modal";
import { ImportModal } from "./import-modal";

function isDuplicateNameError(message: string): boolean {
  return message.toLowerCase().includes("duplicate key");
}

export function ItemsTab({ organizationId }: { organizationId: string }) {
  const { t } = useLanguage();
  const { showError } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<InventoryItemRow[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modalItem, setModalItem] = useState<InventoryItemRow | "new" | null>(
    null,
  );
  const [showImport, setShowImport] = useState(false);

  async function fetchAll() {
    const [itemsRes, vendorsRes] = await Promise.all([
      supabase
        .from("inventory_items")
        .select(
          "id, name, category, count_unit, order_unit, order_unit_size, cost_per_unit, vendor_id, count_frequency, active, recipe_unit, recipe_factor",
        )
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("vendors")
        .select("id, name, phone, notes, active")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
    ]);
    return { itemsRes, vendorsRes };
  }

  async function refresh() {
    const { itemsRes, vendorsRes } = await fetchAll();
    if (itemsRes.error) {
      showError(itemsRes.error.message);
      return;
    }
    setItems(itemsRes.data ?? []);
    if (!vendorsRes.error) setVendors(vendorsRes.data ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    fetchAll().then(({ itemsRes, vendorsRes }) => {
      if (cancelled) return;
      setLoading(false);
      if (itemsRes.error) {
        setLoadError(itemsRes.error.message);
        return;
      }
      setItems(itemsRes.data ?? []);
      setVendors(vendorsRes.data ?? []);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const vendorNameById = useMemo(
    () => new Map(vendors.map((vendor) => [vendor.id, vendor.name])),
    [vendors],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => {
      const vendorName = item.vendor_id
        ? (vendorNameById.get(item.vendor_id) ?? "")
        : "";
      return (
        item.name.toLowerCase().includes(query) ||
        (item.category ?? "").toLowerCase().includes(query) ||
        vendorName.toLowerCase().includes(query)
      );
    });
  }, [items, search, vendorNameById]);

  async function handleSubmit(
    existing: InventoryItemRow | null,
    values: ItemFormValues,
  ): Promise<{ error: string | null }> {
    const payload = {
      name: values.name.trim(),
      category: values.category.trim() || null,
      count_unit: values.count_unit.trim(),
      order_unit: values.order_unit.trim() || null,
      order_unit_size: values.order_unit_size.trim()
        ? Number(values.order_unit_size)
        : 1,
      cost_per_unit: values.cost_per_unit.trim()
        ? Number(values.cost_per_unit)
        : null,
      vendor_id: values.vendor_id || null,
      count_frequency: values.count_frequency,
      active: values.active,
      recipe_unit: values.recipe_unit || null,
    };
    const { error } = existing
      ? await supabase
          .from("inventory_items")
          .update(payload)
          .eq("id", existing.id)
      : await supabase
          .from("inventory_items")
          .insert({ ...payload, organization_id: organizationId });
    if (error) {
      return {
        error: isRecipeUnitMismatchError(error)
          ? RECIPE_UNIT_MISMATCH_MESSAGE
          : isDuplicateNameError(error.message)
            ? t("catalog.duplicateItemName")
            : error.message,
      };
    }
    await refresh();
    return { error: null };
  }

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
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowImport(true)}
          >
            {t("catalog.import.button")}
          </Button>
          <Button type="button" onClick={() => setModalItem("new")}>
            {t("catalog.addItem")}
          </Button>
        </div>
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
                  {t("catalog.categoryLabel")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  {t("catalog.countUnitLabel")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  {t("catalog.orderUnitLabel")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  {t("catalog.costPerUnitLabel")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  {t("catalog.vendorLabel")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  {t("catalog.countFrequencyLabel")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  Recipe unit
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  {t("manager.active")}
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium whitespace-nowrap text-text">
                    {item.name}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {item.category ?? "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {item.count_unit}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {item.order_unit
                      ? `${item.order_unit} × ${item.order_unit_size}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {item.cost_per_unit != null
                      ? formatRupees(item.cost_per_unit)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {item.vendor_id
                      ? (vendorNameById.get(item.vendor_id) ?? "—")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {item.count_frequency === "daily"
                      ? t("catalog.frequencyDaily")
                      : t("catalog.frequencyWeekly")}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {item.recipe_unit
                      ? `${item.recipe_unit} (${item.recipe_factor}/${item.count_unit})`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        item.active
                          ? "bg-success/15 text-success"
                          : "bg-border/50 text-muted"
                      }`}
                    >
                      {item.active ? t("manager.active") : t("manager.inactive")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setModalItem(item)}
                      className="text-sm font-medium text-muted hover:text-text"
                    >
                      {t("manager.edit")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalItem && (
        <ItemModal
          item={modalItem === "new" ? null : modalItem}
          vendors={vendors}
          onSubmit={(values) =>
            handleSubmit(modalItem === "new" ? null : modalItem, values)
          }
          onClose={() => setModalItem(null)}
        />
      )}

      {showImport && (
        <ImportModal
          organizationId={organizationId}
          existingItems={items}
          existingVendors={vendors}
          onClose={() => setShowImport(false)}
          onImported={refresh}
        />
      )}
    </div>
  );
}
