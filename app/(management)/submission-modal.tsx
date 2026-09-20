"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeKolkata } from "@/lib/date";
import { useLanguage } from "@/lib/i18n/language-context";
import { Modal } from "@/components/ui/modal";
import { SkeletonList } from "@/components/ui/skeleton";

type Answer = {
  id: string;
  item_label: string;
  done: boolean;
  note: string | null;
};

export type SubmissionSummary = {
  id: string;
  title: string;
  staffName: string;
  submittedAt: string;
  notes: string | null;
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("submission_answers")
      .select("id, item_label, done, note")
      .eq("submission_id", submission.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          setLoadError(error.message);
          return;
        }
        setAnswers(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, submission.id]);

  return (
    <Modal onClose={onClose}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-text">
            {submission.title}
          </h3>
          <p className="text-sm text-muted">
            {t("manager.submittedAt", {
              name: submission.staffName,
              time: formatTimeKolkata(submission.submittedAt),
            })}
          </p>
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
        <ul className="flex flex-col gap-2">
          {answers.map((answer) => (
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
                  {answer.done ? t("manager.itemDone") : t("manager.itemNotDone")}
                </span>
              </div>
              {answer.note && (
                <p className="mt-1 text-sm text-muted">
                  {t("manager.note", { note: answer.note })}
                </p>
              )}
            </li>
          ))}
        </ul>
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
  );
}
