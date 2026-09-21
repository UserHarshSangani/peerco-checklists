"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { ChecklistItemRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type TemplateInfo = {
  id: string;
  name: string;
  kind: "opening" | "closing";
  active: boolean;
};

export default function TemplateDetailPage({
  params,
}: PageProps<"/checklists/[templateId]">) {
  const { templateId } = use(params);
  return <TemplateEditor templateId={templateId} />;
}

function TemplateEditor({ templateId }: { templateId: string }) {
  const { t } = useLanguage();
  const { showError } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [template, setTemplate] = useState<TemplateInfo | null>(null);
  const [items, setItems] = useState<ChecklistItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  // Buffers in-progress edits to a section field until it's saved on blur,
  // so retyping doesn't trigger a save (and a refetch that could steal
  // focus) on every keystroke.
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, string>>({});

  const kindLabels = {
    opening: t("manager.kindOpening"),
    closing: t("manager.kindClosing"),
  };

  async function fetchItems() {
    return supabase
      .from("checklist_items")
      .select("id, label, required, position, requires_photo, section")
      .eq("template_id", templateId)
      .order("position");
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [templateRes, itemsRes] = await Promise.all([
        supabase
          .from("checklist_templates")
          .select("id, name, kind, active")
          .eq("id", templateId)
          .single(),
        fetchItems(),
      ]);

      if (cancelled) return;
      setLoading(false);

      if (templateRes.error) {
        setLoadError(templateRes.error.message);
        return;
      }
      if (itemsRes.error) {
        setLoadError(itemsRes.error.message);
        return;
      }

      setTemplate(templateRes.data);
      setItems(itemsRes.data ?? []);
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  async function refreshItems() {
    const { data, error } = await fetchItems();
    if (error) {
      showError(error.message);
      return;
    }
    setItems(data ?? []);
  }

  async function addItem() {
    const nextPosition =
      items.length > 0 ? Math.max(...items.map((item) => item.position)) + 1 : 1;
    setAdding(true);
    const { error } = await supabase.from("checklist_items").insert({
      template_id: templateId,
      label: "New item",
      required: true,
      position: nextPosition,
    });
    setAdding(false);
    if (error) {
      showError(error.message);
      return;
    }
    await refreshItems();
  }

  async function saveLabel(item: ChecklistItemRow) {
    const trimmed = editingLabel.trim();
    if (!trimmed) {
      showError(t("manager.labelEmpty"));
      return;
    }
    setSavingId(item.id);
    const { error } = await supabase
      .from("checklist_items")
      .update({ label: trimmed })
      .eq("id", item.id);
    setSavingId(null);
    if (error) {
      showError(error.message);
      return;
    }
    setEditingId(null);
    await refreshItems();
  }

  async function toggleRequired(item: ChecklistItemRow) {
    setSavingId(item.id);
    const { error } = await supabase
      .from("checklist_items")
      .update({ required: !item.required })
      .eq("id", item.id);
    setSavingId(null);
    if (error) {
      showError(error.message);
      return;
    }
    await refreshItems();
  }

  async function toggleRequiresPhoto(item: ChecklistItemRow) {
    setSavingId(item.id);
    const { error } = await supabase
      .from("checklist_items")
      .update({ requires_photo: !item.requires_photo })
      .eq("id", item.id);
    setSavingId(null);
    if (error) {
      showError(error.message);
      return;
    }
    await refreshItems();
  }

  async function moveItem(item: ChecklistItemRow, direction: "up" | "down") {
    const index = items.findIndex((row) => row.id === item.id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= items.length) return;
    const other = items[swapIndex];

    setSavingId(item.id);
    const [res1, res2] = await Promise.all([
      supabase
        .from("checklist_items")
        .update({ position: other.position })
        .eq("id", item.id),
      supabase
        .from("checklist_items")
        .update({ position: item.position })
        .eq("id", other.id),
    ]);
    setSavingId(null);
    const firstError = res1.error ?? res2.error;
    if (firstError) {
      showError(firstError.message);
      return;
    }
    await refreshItems();
  }

  async function deleteItem(item: ChecklistItemRow) {
    if (!window.confirm(t("manager.confirmDeleteItem", { label: item.label }))) {
      return;
    }
    setSavingId(item.id);
    const { error } = await supabase
      .from("checklist_items")
      .delete()
      .eq("id", item.id);
    setSavingId(null);
    if (error) {
      showError(error.message);
      return;
    }
    await refreshItems();
  }

  function sectionValue(item: ChecklistItemRow): string {
    return sectionDrafts[item.id] ?? item.section ?? "";
  }

  function updateSectionDraft(itemId: string, value: string) {
    setSectionDrafts((prev) => ({ ...prev, [itemId]: value.slice(0, 60) }));
  }

  async function saveSection(item: ChecklistItemRow) {
    const draftValue = sectionDrafts[item.id];
    if (draftValue === undefined) return;
    const trimmed = draftValue.trim();
    if (trimmed === (item.section ?? "")) {
      setSectionDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }
    setSavingId(item.id);
    const { error } = await supabase
      .from("checklist_items")
      .update({ section: trimmed || null })
      .eq("id", item.id);
    setSavingId(null);
    if (error) {
      showError(error.message);
      return;
    }
    setSectionDrafts((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    await refreshItems();
  }

  const sectionSuggestions = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map((item) => item.section)
            .filter((section): section is string => !!section?.trim()),
        ),
      ),
    [items],
  );

  const groupedItems = useMemo(() => {
    const map = new Map<string, ChecklistItemRow[]>();
    for (const item of items) {
      const key = item.section?.trim() || "General";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <main className="flex-1 p-4 sm:p-6">
      <Link
        href="/checklists"
        className="mb-4 inline-block text-sm font-medium text-muted hover:text-text"
      >
        ‹ {t("common.backToChecklists")}
      </Link>

      {loading && <SkeletonList rows={4} rowClassName="h-16" />}
      {loadError && (
        <p className="text-danger">
          {t("manager.loadTemplateError", { error: loadError })}
        </p>
      )}

      {!loading && !loadError && template && (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-serif text-xl font-bold text-text">
                {template.name}
              </h2>
              <p className="text-sm text-muted">
                {kindLabels[template.kind]} ·{" "}
                {template.active ? t("manager.active") : t("manager.inactive")}
              </p>
            </div>
            <Button type="button" disabled={adding} onClick={addItem}>
              {adding ? t("manager.adding") : t("manager.addItem")}
            </Button>
          </div>

          {items.length === 0 && (
            <EmptyState title={t("manager.noItemsYet")} />
          )}

          <datalist id="section-suggestions">
            {sectionSuggestions.map((section) => (
              <option key={section} value={section} />
            ))}
          </datalist>

          <div className="flex flex-col gap-6">
            {groupedItems.map(([section, sectionItems]) => (
              <div key={section}>
                <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
                  {section}
                </h3>
                <ul className="flex flex-col gap-3">
                  {sectionItems.map((item) => {
                    const index = items.findIndex((row) => row.id === item.id);
                    return (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border"
                      >
                        <div className="flex flex-1 flex-wrap items-center gap-3">
                          <div className="flex flex-col">
                            <button
                              type="button"
                              disabled={index === 0 || savingId === item.id}
                              onClick={() => moveItem(item, "up")}
                              aria-label={t("manager.moveUp")}
                              className="text-xs text-muted hover:text-text disabled:opacity-30"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              disabled={index === items.length - 1 || savingId === item.id}
                              onClick={() => moveItem(item, "down")}
                              aria-label={t("manager.moveDown")}
                              className="text-xs text-muted hover:text-text disabled:opacity-30"
                            >
                              ▼
                            </button>
                          </div>

                          {editingId === item.id ? (
                            <>
                              <input
                                type="text"
                                value={editingLabel}
                                onChange={(event) => setEditingLabel(event.target.value)}
                                autoFocus
                                className="min-h-[40px] rounded-lg border border-border bg-bg px-3 py-2 text-base text-text focus:border-accent focus:outline-none"
                              />
                              <button
                                type="button"
                                disabled={savingId === item.id}
                                onClick={() => saveLabel(item)}
                                className="min-h-[36px] rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-50"
                              >
                                {t("common.save")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="min-h-[36px] text-sm font-medium text-muted hover:text-text"
                              >
                                {t("common.cancel")}
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-base font-medium text-text">
                                {item.label}
                              </span>
                              {item.requires_photo && (
                                <span aria-hidden="true" title={t("manager.photoRequiredToggle")}>
                                  📷
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(item.id);
                                  setEditingLabel(item.label);
                                }}
                                className="min-h-[36px] text-sm font-medium text-muted hover:text-text"
                              >
                                {t("manager.edit")}
                              </button>
                            </>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-1.5 text-xs text-muted">
                            Section
                            <input
                              type="text"
                              list="section-suggestions"
                              maxLength={60}
                              value={sectionValue(item)}
                              onChange={(event) =>
                                updateSectionDraft(item.id, event.target.value)
                              }
                              onBlur={() => saveSection(item)}
                              placeholder="General"
                              className="min-h-[36px] w-32 rounded-lg border border-border bg-bg px-2 py-1 text-sm text-text focus:border-accent focus:outline-none"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={savingId === item.id}
                            onClick={() => toggleRequired(item)}
                            className={`min-h-[40px] rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                              item.required
                                ? "bg-warning/15 text-warning"
                                : "bg-border/50 text-muted"
                            }`}
                          >
                            {item.required ? t("manager.required") : t("manager.optional")}
                          </button>
                          <button
                            type="button"
                            disabled={savingId === item.id}
                            onClick={() => toggleRequiresPhoto(item)}
                            className={`min-h-[40px] rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                              item.requires_photo
                                ? "bg-accent/15 text-accent"
                                : "bg-border/50 text-muted"
                            }`}
                          >
                            📷 {t("manager.photoRequiredToggle")}
                          </button>
                          <button
                            type="button"
                            disabled={savingId === item.id}
                            onClick={() => deleteItem(item)}
                            className="min-h-[40px] rounded-full px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                          >
                            {t("manager.delete")}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
