"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { ChecklistItemRow, ChecklistTemplate, Outlet } from "@/lib/types";
import { SubmitModal } from "./submit-modal";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";

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
  const { t } = useLanguage();
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

  const doneCount = items.filter((item) => answers[item.id]?.done).length;
  const missingRequiredItems = items.filter((item) => {
    if (!item.required) return false;
    const answer = answers[item.id];
    return !answer?.done && !answer?.note.trim();
  });

  function handleSubmitTap() {
    if (missingRequiredItems.length > 0) {
      setMissingItemIds(new Set(missingRequiredItems.map((item) => item.id)));
      return;
    }
    setShowSubmitModal(true);
  }

  const topBar = (
    <div className="safe-top sticky top-0 z-40 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 min-h-[40px] text-sm font-medium text-muted hover:text-text"
      >
        ‹ {t("tablet.backToChecklists")}
      </button>
      <p className="mb-2 truncate text-lg font-semibold text-text">
        {template.name}
      </p>
      {!loading && !loadError && items.length > 0 && (
        <>
          <div className="h-2 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${(doneCount / items.length) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-sm text-muted">
            {t("tablet.progress", { done: doneCount, total: items.length })}
          </p>
        </>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        {topBar}
        <main className="flex-1 p-4 sm:p-6">
          <SkeletonList rows={5} rowClassName="h-16" />
        </main>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        {topBar}
        <main className="flex-1 p-4 sm:p-6">
          <p className="text-danger">
            {t("tablet.loadChecklistError", { error: loadError })}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {topBar}
      <main className="flex-1 p-4 pb-40 sm:p-6">
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const answer = answers[item.id] ?? { done: false, note: "" };
            const hasError = missingItemIds.has(item.id);
            return (
              <li
                key={item.id}
                className={`rounded-2xl bg-surface p-4 shadow-sm ring-1 ${
                  hasError ? "ring-danger" : "ring-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleDone(item.id)}
                  className="flex min-h-16 w-full items-center gap-4 text-left"
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 text-xl ${
                      answer.done
                        ? "border-success bg-success text-white"
                        : "border-border"
                    }`}
                    aria-hidden="true"
                  >
                    {answer.done ? "✓" : ""}
                  </span>
                  <span className="flex-1 text-lg font-medium text-text">
                    {item.label}
                  </span>
                  {item.required && (
                    <span className="shrink-0 rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold tracking-wide text-warning uppercase">
                      {t("tablet.required")}
                    </span>
                  )}
                </button>

                {item.required && !answer.done && (
                  <div className="mt-3">
                    <input
                      type="text"
                      value={answer.note}
                      onChange={(event) => setNote(item.id, event.target.value)}
                      placeholder={t("tablet.notDonePlaceholder")}
                      className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text placeholder:text-muted focus:border-accent focus:outline-none"
                    />
                    {hasError && (
                      <p className="mt-1 text-sm text-danger">
                        {t("tablet.noteValidation")}
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
            className="mb-2 block text-sm font-medium text-muted"
          >
            {t("tablet.notesLabel")}
          </label>
          <textarea
            id="checklist-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-muted focus:border-accent focus:outline-none"
            placeholder={t("tablet.notesPlaceholder")}
          />
        </div>
      </main>

      <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 p-4 backdrop-blur">
        {missingRequiredItems.length > 0 && (
          <p className="mb-2 text-center text-sm font-medium text-warning">
            {t("tablet.missingItems", { count: missingRequiredItems.length })}
          </p>
        )}
        <Button
          type="button"
          onClick={handleSubmitTap}
          className="mx-auto block w-full max-w-md"
        >
          {t("tablet.submit")}
        </Button>
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
    </div>
  );
}
