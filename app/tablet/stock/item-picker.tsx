"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import type { CountSheetItem } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";

// A searchable item picker shared by the goods-received and wastage tablet
// flows — each keeps its own list of already-added entries and excludes
// them here so the same item can't be added twice.
export function ItemPickerModal({
  items,
  excludeIds,
  onPick,
  onClose,
}: {
  items: CountSheetItem[];
  excludeIds: Set<string>;
  onPick: (item: CountSheetItem) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const available = items.filter((item) => !excludeIds.has(item.item_id));
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return available;
    return available.filter((item) =>
      item.name.toLowerCase().includes(trimmed),
    );
  }, [items, excludeIds, query]);

  return (
    <Modal onClose={onClose} title={t("tablet.stock.addItem")}>
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
        placeholder={t("tablet.stock.searchItems")}
        className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {results.length === 0 && (
        <EmptyState title={t("tablet.stock.noItemsFound")} />
      )}
      <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
        {results.map((item) => (
          <li key={item.item_id}>
            <button
              type="button"
              onClick={() => onPick(item)}
              className="flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl bg-bg p-4 text-left ring-1 ring-border transition hover:bg-border/20 active:scale-[0.98]"
            >
              <span className="text-base font-medium text-text">
                {item.name}
              </span>
              <span className="shrink-0 text-sm text-muted">{item.unit}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
