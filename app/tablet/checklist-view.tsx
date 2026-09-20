"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChecklistItemRow, ChecklistTemplate, Outlet } from "@/lib/types";
import { SubmitModal } from "./submit-modal";

export type Answer = { done: boolean; note: string };

export function ChecklistView({
  outlet,
  template,
  onBack,
  onSubmitted,
}: {
  outlet: Outlet;
  template: ChecklistTemplate;
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<ChecklistItemRow[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missingItemIds, setMissingItemIds] = useState<Set<string>>(
    new Set(),
  );
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("checklist_items")
      .select("id, label, required, position")
      .eq("template_id", template.id)
      .order("position")
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          setLoadError(error.message);
          return;
        }
        const rows = data ?? [];
        setItems(rows);
        setAnswers(
          Object.fromEntries(
            rows.map((row) => [row.id, { done: false, note: "" }]),
          ),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, template.id]);

  function toggleDone(itemId: string) {
    setAnswers((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], done: !prev[itemId]?.done },
    }));
    setMissingItemIds((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  }

  function setNote(itemId: string, note: string) {
    setAnswers((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], note },
    }));
    if (note.trim()) {
      setMissingItemIds((prev) => {
        if (!prev.has(itemId)) return prev;
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }

  function handleSubmitTap() {
    const missing = items.filter((item) => {
      if (!item.required) return false;
      const answer = answers[item.id];
      return !answer?.done && !answer?.note.trim();
    });
    if (missing.length > 0) {
      setMissingItemIds(new Set(missing.map((item) => item.id)));
      return;
    }
    setShowSubmitModal(true);
  }

  if (loading) {
    return (
      <main className="flex-1 p-6">
        <p className="text-zinc-500 dark:text-zinc-400">
          Loading checklist…
        </p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex-1 p-6">
        <p className="text-red-600 dark:text-red-400">
          Couldn&apos;t load checklist: {loadError}
        </p>
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 pb-32">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ‹ Back to checklists
      </button>
      <h2 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        {template.name}
      </h2>

      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const answer = answers[item.id] ?? { done: false, note: "" };
          const hasError = missingItemIds.has(item.id);
          return (
            <li
              key={item.id}
              className={`rounded-2xl bg-white p-5 shadow-sm ring-1 dark:bg-zinc-900 ${
                hasError
                  ? "ring-red-400 dark:ring-red-500"
                  : "ring-zinc-200 dark:ring-zinc-800"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleDone(item.id)}
                className="flex w-full items-center gap-4 text-left"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 text-xl ${
                    answer.done
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-zinc-300 dark:border-zinc-600"
                  }`}
                >
                  {answer.done ? "✓" : ""}
                </span>
                <span className="flex-1 text-lg font-medium text-zinc-900 dark:text-zinc-50">
                  {item.label}
                </span>
                {item.required && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold tracking-wide text-amber-800 uppercase dark:bg-amber-900/40 dark:text-amber-300">
                    Required
                  </span>
                )}
              </button>

              {item.required && !answer.done && (
                <div className="mt-3">
                  <input
                    type="text"
                    value={answer.note}
                    onChange={(event) => setNote(item.id, event.target.value)}
                    placeholder="Why wasn't this done?"
                    className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                  />
                  {hasError && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      Check it off or add a short note.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-6">
        <label
          htmlFor="checklist-notes"
          className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300"
        >
          Notes (optional)
        </label>
        <textarea
          id="checklist-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          placeholder="Anything else worth noting…"
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 p-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <button
          type="button"
          onClick={handleSubmitTap}
          className="mx-auto block w-full max-w-md rounded-2xl bg-zinc-900 py-4 text-center text-lg font-semibold text-white active:scale-[0.98] dark:bg-zinc-100 dark:text-zinc-900"
        >
          Submit
        </button>
      </div>

      {showSubmitModal && (
        <SubmitModal
          outlet={outlet}
          template={template}
          items={items}
          answers={answers}
          notes={notes}
          onClose={() => setShowSubmitModal(false)}
          onSuccess={onSubmitted}
        />
      )}
    </main>
  );
}
