"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeKolkata } from "@/lib/date";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {submission.title}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Submitted by {submission.staffName} at{" "}
              {formatTimeKolkata(submission.submittedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Close
          </button>
        </div>

        {loading && (
          <p className="text-zinc-500 dark:text-zinc-400">
            Loading answers…
          </p>
        )}
        {loadError && (
          <p className="text-red-600 dark:text-red-400">
            Couldn&apos;t load answers: {loadError}
          </p>
        )}

        {!loading && !loadError && (
          <ul className="flex flex-col gap-2">
            {answers.map((answer) => (
              <li
                key={answer.id}
                className={`rounded-xl p-4 ring-1 ${
                  answer.done
                    ? "bg-zinc-50 ring-zinc-200 dark:bg-zinc-800/60 dark:ring-zinc-700"
                    : "bg-red-50 ring-red-300 dark:bg-red-950/40 dark:ring-red-900"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {answer.item_label}
                  </span>
                  <span
                    className={`shrink-0 text-xs font-semibold tracking-wide uppercase ${
                      answer.done
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {answer.done ? "Done" : "Not done"}
                  </span>
                </div>
                {answer.note && (
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                    Note: {answer.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {submission.notes && (
          <div className="mt-4 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/60">
            <p className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Overall notes
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-200">
              {submission.notes}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
