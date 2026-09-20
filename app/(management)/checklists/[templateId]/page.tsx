"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { ChecklistItemRow } from "@/lib/types";

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
  const supabase = useMemo(() => createClient(), []);
  const [template, setTemplate] = useState<TemplateInfo | null>(null);
  const [items, setItems] = useState<ChecklistItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  async function fetchItems() {
    return supabase
      .from("checklist_items")
      .select("id, label, required, position")
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
      setActionError(error.message);
      return;
    }
    setActionError(null);
    setItems(data ?? []);
  }

  async function addItem() {
    const nextPosition =
      items.length > 0 ? Math.max(...items.map((item) => item.position)) + 1 : 1;
    setAdding(true);
    setActionError(null);
    const { error } = await supabase.from("checklist_items").insert({
      template_id: templateId,
      label: "New item",
      required: true,
      position: nextPosition,
    });
    setAdding(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    await refreshItems();
  }

  async function saveLabel(item: ChecklistItemRow) {
    const trimmed = editingLabel.trim();
    if (!trimmed) {
      setActionError("Label can't be empty.");
      return;
    }
    setSavingId(item.id);
    setActionError(null);
    const { error } = await supabase
      .from("checklist_items")
      .update({ label: trimmed })
      .eq("id", item.id);
    setSavingId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    setEditingId(null);
    await refreshItems();
  }

  async function toggleRequired(item: ChecklistItemRow) {
    setSavingId(item.id);
    setActionError(null);
    const { error } = await supabase
      .from("checklist_items")
      .update({ required: !item.required })
      .eq("id", item.id);
    setSavingId(null);
    if (error) {
      setActionError(error.message);
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
    setActionError(null);
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
      setActionError(firstError.message);
      return;
    }
    await refreshItems();
  }

  async function deleteItem(item: ChecklistItemRow) {
    if (
      !window.confirm(
        `Delete "${item.label}"? Past submissions keep their own copy of this item.`,
      )
    ) {
      return;
    }
    setSavingId(item.id);
    setActionError(null);
    const { error } = await supabase
      .from("checklist_items")
      .delete()
      .eq("id", item.id);
    setSavingId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    await refreshItems();
  }

  return (
    <main className="flex-1 p-6">
      <Link
        href="/checklists"
        className="mb-4 inline-block text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ‹ Back to checklists
      </Link>

      {loading && <p className="text-zinc-500 dark:text-zinc-400">Loading…</p>}
      {loadError && (
        <p className="text-red-600 dark:text-red-400">
          Couldn&apos;t load this checklist: {loadError}
        </p>
      )}

      {!loading && !loadError && template && (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                {template.name}
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {template.kind} · {template.active ? "Active" : "Inactive"}
              </p>
            </div>
            <button
              type="button"
              disabled={adding}
              onClick={addItem}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {adding ? "Adding…" : "Add item"}
            </button>
          </div>

          {actionError && (
            <p className="mb-4 text-sm text-red-600 dark:text-red-400">
              {actionError}
            </p>
          )}

          {items.length === 0 && (
            <p className="text-zinc-500 dark:text-zinc-400">
              No items yet. Add the first one.
            </p>
          )}

          <ul className="flex flex-col gap-3">
            {items.map((item, index) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
              >
                <div className="flex flex-1 flex-wrap items-center gap-3">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      disabled={index === 0 || savingId === item.id}
                      onClick={() => moveItem(item, "up")}
                      className="text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-30 dark:text-zinc-400 dark:hover:text-zinc-50"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={index === items.length - 1 || savingId === item.id}
                      onClick={() => moveItem(item, "down")}
                      className="text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-30 dark:text-zinc-400 dark:hover:text-zinc-50"
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
                        className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-base text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                      />
                      <button
                        type="button"
                        disabled={savingId === item.id}
                        onClick={() => saveLabel(item)}
                        className="rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-base font-medium text-zinc-900 dark:text-zinc-50">
                        {item.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditingLabel(item.label);
                        }}
                        className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                      >
                        Edit
                      </button>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={savingId === item.id}
                    onClick={() => toggleRequired(item)}
                    className={`rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                      item.required
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {item.required ? "Required" : "Optional"}
                  </button>
                  <button
                    type="button"
                    disabled={savingId === item.id}
                    onClick={() => deleteItem(item)}
                    className="rounded-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
