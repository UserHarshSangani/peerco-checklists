"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeKolkata } from "@/lib/date";
import { fetchSignedPhotoUrls } from "@/lib/photo-signed-urls";
import { useLanguage } from "@/lib/i18n/language-context";
import { Modal } from "@/components/ui/modal";
import { SkeletonList } from "@/components/ui/skeleton";
import { LocationBadge, type LocationStatus } from "@/components/location-badge";

type Answer = {
  id: string;
  item_label: string;
  item_section: string | null;
  done: boolean;
  note: string | null;
  photo_path: string | null;
};

const GENERAL_SECTION = "General";

export type SubmissionSummary = {
  id: string;
  title: string;
  staffName: string;
  submittedAt: string;
  notes: string | null;
  locationStatus: LocationStatus;
  distanceM: number | null;
};

export function SubmissionModal({
  submission,
  onClose,
}: {
  submission: SubmissionSummary;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const groupedAnswers = useMemo(() => {
    const map = new Map<string, Answer[]>();
    for (const answer of answers) {
      const key = answer.item_section?.trim() || GENERAL_SECTION;
      const list = map.get(key) ?? [];
      list.push(answer);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [answers]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("submission_answers")
      .select("id, item_label, item_section, done, note, photo_path")
      .eq("submission_id", submission.id)
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLoading(false);
          setLoadError(error.message);
          return;
        }
        const rows = data ?? [];
        const paths = rows
          .map((row) => row.photo_path)
          .filter((path): path is string => !!path);
        const urls = await fetchSignedPhotoUrls(supabase, paths);
        if (cancelled) return;
        setAnswers(rows);
        setPhotoUrls(urls);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, submission.id]);

  return (
    <>
      <Modal onClose={onClose}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-text">
              {submission.title}
            </h3>
            <p className="mb-1 text-sm text-muted">
              {t("manager.submittedAt", {
                name: submission.staffName,
                time: formatTimeKolkata(submission.submittedAt),
              })}
            </p>
            <LocationBadge
              status={submission.locationStatus}
              distanceM={submission.distanceM}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] shrink-0 text-sm font-medium text-muted hover:text-text"
          >
            {t("common.close")}
          </button>
        </div>

        {loading && <SkeletonList rows={4} rowClassName="h-14" />}
        {loadError && (
          <p className="text-danger">
            {t("manager.loadAnswersError", { error: loadError })}
          </p>
        )}

        {!loading && !loadError && (
          <div className="flex flex-col gap-4">
            {groupedAnswers.map(([section, sectionAnswers]) => (
              <div key={section}>
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                  {section}
                </p>
                <ul className="flex flex-col gap-2">
                  {sectionAnswers.map((answer) => {
                    const photoUrl = answer.photo_path
                      ? photoUrls[answer.photo_path]
                      : null;
                    return (
                      <li
                        key={answer.id}
                        className={`rounded-xl p-4 ring-1 ${
                          answer.done
                            ? "bg-bg ring-border"
                            : "bg-danger/10 ring-danger/40"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-text">
                            {answer.item_label}
                          </span>
                          <span
                            className={`shrink-0 text-xs font-semibold tracking-wide uppercase ${
                              answer.done ? "text-success" : "text-danger"
                            }`}
                          >
                            {answer.done
                              ? t("manager.itemDone")
                              : t("manager.itemNotDone")}
                          </span>
                        </div>
                        {answer.note && (
                          <p className="mt-1 text-sm text-muted">
                            {t("manager.note", { note: answer.note })}
                          </p>
                        )}
                        {answer.photo_path && (
                          <div className="mt-2">
                            {photoUrl ? (
                              <button
                                type="button"
                                onClick={() => setViewerUrl(photoUrl)}
                                aria-label={t("manager.viewPhoto")}
                                className="block"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not an optimizable static asset */}
                                <img
                                  src={photoUrl}
                                  alt={t("manager.viewPhoto")}
                                  className="h-16 w-16 rounded-lg object-cover ring-1 ring-border transition hover:opacity-80"
                                />
                              </button>
                            ) : (
                              <p className="text-sm text-muted">
                                {t("manager.photoUnavailable")}
                              </p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        {submission.notes && (
          <div className="mt-4 rounded-xl bg-bg p-4">
            <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
              {t("manager.overallNotes")}
            </p>
            <p className="text-sm text-text">{submission.notes}</p>
          </div>
        )}
      </Modal>

      {viewerUrl && (
        <Modal
          onClose={() => setViewerUrl(null)}
          panelClassName="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-surface p-2 shadow-xl outline-none"
        >
          <div className="flex justify-end p-2">
            <button
              type="button"
              onClick={() => setViewerUrl(null)}
              className="min-h-[40px] text-sm font-medium text-muted hover:text-text"
            >
              {t("common.close")}
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not an optimizable static asset */}
          <img
            src={viewerUrl}
            alt={t("manager.viewPhoto")}
            className="max-h-[75vh] w-full rounded-2xl object-contain"
          />
        </Modal>
      )}
    </>
  );
}
