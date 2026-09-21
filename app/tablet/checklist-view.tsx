"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, WifiOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { todayInKolkata, formatTimeKolkata } from "@/lib/date";
import { useLanguage } from "@/lib/i18n/language-context";
import { useOnlineStatus } from "@/lib/use-online-status";
import {
  clearChecklistDraft,
  readChecklistDraft,
  writeChecklistDraft,
} from "@/lib/tablet/checklist-draft";
import { sectionIcon, GENERAL_SECTION_LABEL } from "@/lib/tablet/section-icon";
import type { ChecklistItemRow, ChecklistTemplate, Outlet } from "@/lib/types";
import { SubmitModal } from "./submit-modal";
import { PhotoCapture, isPhotoUploaded, type ItemPhotoState } from "./photo-capture";
import { LocationChip } from "./location-chip";
import { StaffChip } from "./staff-chip";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { ProgressRing } from "@/components/ui/progress-ring";
import { StatusPill } from "@/components/ui/status-pill";
import { SectionCard } from "@/components/ui/section-card";

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
  const online = useOnlineStatus();
  const supabase = useMemo(() => createClient(), []);
  const businessDate = useMemo(() => todayInKolkata(), []);
  const [items, setItems] = useState<ChecklistItemRow[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [photos, setPhotos] = useState<Record<string, ItemPhotoState>>({});
  const [notes, setNotes] = useState("");
  const [closedSections, setClosedSections] = useState<Set<string>>(new Set());
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missingItemIds, setMissingItemIds] = useState<Set<string>>(
    new Set(),
  );
  const [missingPhotoItemIds, setMissingPhotoItemIds] = useState<Set<string>>(
    new Set(),
  );
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("checklist_items")
      .select("id, label, required, position, requires_photo, section")
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

        const draft = readChecklistDraft(outlet.id, template.id, businessDate);
        if (draft) {
          const validIds = new Set(rows.map((row) => row.id));
          setAnswers({
            ...Object.fromEntries(rows.map((row) => [row.id, { done: false, note: "" }])),
            ...Object.fromEntries(
              Object.entries(draft.answers).filter(([id]) => validIds.has(id)),
            ),
          });
          setNotes(draft.notes);
          setClosedSections(new Set(draft.closedSections));
          setLastSavedAt(draft.savedAt);
          // Photo paths from a previous session were already uploaded to
          // Storage, so they can be treated as "uploaded" without a preview
          // (we never re-fetch a photo back down from Storage).
          setPhotos(
            Object.fromEntries(
              Object.entries(draft.photoPaths)
                .filter(([id]) => validIds.has(id))
                .map(([id, path]) => [
                  id,
                  { status: "uploaded", previewUrl: "", file: new File([], ""), path },
                ]),
            ),
          );
        } else {
          setAnswers(
            Object.fromEntries(
              rows.map((row) => [row.id, { done: false, note: "" }]),
            ),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, template.id, outlet.id, businessDate]);

  // Autosave the draft after every change — ticks, notes, uploaded photo
  // paths and which sections are collapsed — keyed by outlet+template+date.
  useEffect(() => {
    if (items.length === 0) return;
    const photoPaths = Object.fromEntries(
      Object.entries(photos)
        .filter(([, state]) => isPhotoUploaded(state))
        .map(([id, state]) => [id, (state as { path: string }).path]),
    );
    writeChecklistDraft(outlet.id, template.id, businessDate, {
      answers,
      photoPaths,
      notes,
      closedSections: Array.from(closedSections),
    });
    // Escapes the "no setState directly in an effect body" rule the same
    // way an async .then() callback would — this is a synchronous
    // localStorage write, not a subscription, so there's nothing to await.
    Promise.resolve().then(() => setLastSavedAt(new Date().toISOString()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, photos, notes, closedSections]);

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
    setMissingPhotoItemIds((prev) => {
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

  function setPhotoState(itemId: string, state: ItemPhotoState | undefined) {
    setPhotos((prev) => {
      const next = { ...prev };
      if (state) {
        next[itemId] = state;
      } else {
        delete next[itemId];
      }
      return next;
    });
    if (isPhotoUploaded(state)) {
      setMissingPhotoItemIds((prev) => {
        if (!prev.has(itemId)) return prev;
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }

  function toggleSection(section: string, open: boolean) {
    setClosedSections((prev) => {
      const next = new Set(prev);
      if (open) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  function isItemComplete(item: ChecklistItemRow): boolean {
    const answer = answers[item.id];
    if (!answer?.done) return false;
    if (item.requires_photo) return isPhotoUploaded(photos[item.id]);
    return true;
  }

  const doneCount = items.filter(isItemComplete).length;
  const remaining = items.length - doneCount;
  const missingRequiredItems = items.filter((item) => {
    if (!item.required) return false;
    const answer = answers[item.id];
    return !answer?.done && !answer?.note.trim();
  });
  const missingPhotoItems = items.filter((item) => {
    if (!item.requires_photo) return false;
    return answers[item.id]?.done && !isPhotoUploaded(photos[item.id]);
  });

  function handleSubmitTap() {
    if (missingRequiredItems.length > 0 || missingPhotoItems.length > 0) {
      setMissingItemIds(new Set(missingRequiredItems.map((item) => item.id)));
      setMissingPhotoItemIds(new Set(missingPhotoItems.map((item) => item.id)));
      return;
    }
    setShowSubmitModal(true);
  }

  function handleSubmitted() {
    clearChecklistDraft(outlet.id, template.id, businessDate);
    onSubmitted();
  }

  const groupedSections = useMemo(() => {
    const map = new Map<string, ChecklistItemRow[]>();
    for (const item of items) {
      const key = item.section?.trim() || GENERAL_SECTION_LABEL;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [items]);

  const topBar = (
    <div className="safe-top sticky top-0 z-40 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] text-sm font-medium text-muted hover:text-text"
        >
          ‹ {t("common.backToChecklists")}
        </button>
        <StaffChip />
      </div>
      <div className="flex items-center gap-4">
        <ProgressRing
          value={items.length > 0 ? (doneCount / items.length) * 100 : 0}
          size={56}
          strokeWidth={5}
          label={`${doneCount}/${items.length}`}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-lg font-bold text-text">
            {template.name}
          </p>
          <p className="text-sm text-muted">
            {t("tablet.itemsRemaining", { count: remaining })}
          </p>
        </div>
      </div>
      {!loading && !loadError && items.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <LocationChip outletId={outlet.id} />
          {lastSavedAt && (
            <StatusPill tone="neutral">
              {t("tablet.lastSaved", { time: formatTimeKolkata(lastSavedAt) })}
            </StatusPill>
          )}
          <StatusPill tone={online ? "success" : "danger"}>
            {online ? t("tablet.online") : t("tablet.offline")}
          </StatusPill>
        </div>
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

      {!online && (
        <div className="flex items-start gap-3 bg-warning-bg px-4 py-3 text-sm font-medium text-warning-fg sm:px-6">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          {t("tablet.offlineBanner")}
        </div>
      )}

      <main className="flex-1 p-4 pb-48 sm:p-6">
        <div className="flex flex-col gap-4">
          {groupedSections.map(([section, sectionItems]) => {
            const sectionDone = sectionItems.filter(isItemComplete).length;
            return (
              <SectionCard
                key={section}
                icon={(() => {
                  const Icon = sectionIcon(
                    section === GENERAL_SECTION_LABEL ? null : section,
                  );
                  return <Icon className="h-full w-full" />;
                })()}
                title={section}
                done={sectionDone}
                total={sectionItems.length}
                defaultOpen={!closedSections.has(section)}
                onOpenChange={(open) => toggleSection(section, open)}
              >
                <ul className="flex flex-col gap-3">
                  {sectionItems.map((item) => {
                    const answer = answers[item.id] ?? { done: false, note: "" };
                    const hasNoteError = missingItemIds.has(item.id);
                    const hasPhotoError = missingPhotoItemIds.has(item.id);
                    return (
                      <li
                        key={item.id}
                        className={`rounded-2xl bg-bg p-4 ring-1 ${
                          hasNoteError || hasPhotoError ? "ring-danger" : "ring-border"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleDone(item.id)}
                          className="flex min-h-16 w-full items-center gap-4 text-left"
                        >
                          <span
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 text-xl ${
                              answer.done
                                ? "border-success-fg bg-success-fg text-white"
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
                            <StatusPill tone="warning">
                              {t("tablet.required")}
                            </StatusPill>
                          )}
                          {item.requires_photo && (
                            <Camera
                              className="h-5 w-5 shrink-0 text-muted"
                              aria-hidden="true"
                            />
                          )}
                        </button>

                        {item.required && !answer.done && (
                          <div className="mt-3">
                            <input
                              type="text"
                              value={answer.note}
                              onChange={(event) => setNote(item.id, event.target.value)}
                              placeholder={t("tablet.notDonePlaceholder")}
                              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-muted focus:border-accent focus:outline-none"
                            />
                            {hasNoteError && (
                              <p className="mt-1 text-sm text-danger">
                                {t("tablet.noteValidation")}
                              </p>
                            )}
                          </div>
                        )}

                        {item.requires_photo && (
                          <PhotoCapture
                            outletId={outlet.id}
                            businessDate={businessDate}
                            state={photos[item.id]}
                            onChange={(state) => setPhotoState(item.id, state)}
                          />
                        )}
                        {hasPhotoError && (
                          <p className="mt-1 text-sm text-danger">
                            {t("tablet.photoNeededInline")}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </SectionCard>
            );
          })}
        </div>

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
          <p className="mb-1 text-center text-sm font-medium text-warning">
            {t("tablet.missingItems", { count: missingRequiredItems.length })}
          </p>
        )}
        {missingPhotoItems.length > 0 && (
          <p className="mb-2 text-center text-sm font-medium text-warning">
            {t("tablet.photoNeeded", {
              labels: missingPhotoItems.map((item) => item.label).join(", "),
            })}
          </p>
        )}
        <Button
          type="button"
          disabled={!online}
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
          photos={photos}
          notes={notes}
          onClose={() => setShowSubmitModal(false)}
          onSuccess={handleSubmitted}
        />
      )}
    </div>
  );
}
