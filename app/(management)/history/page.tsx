"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  formatDateLabel,
  formatTimeKolkata,
  lastDatesInKolkata,
} from "@/lib/date";
import { fetchStaffNames } from "@/lib/staff-names";
import { useLanguage } from "@/lib/i18n/language-context";
import { useOutletContext } from "../outlet-context";
import { SubmissionModal, type SubmissionSummary } from "../submission-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { ChecklistTemplate } from "@/lib/types";

const DAYS_SHOWN = 14;

type Cell = {
  id: string;
  staffName: string;
  submittedAt: string;
  notes: string | null;
};

export default function HistoryPage() {
  const { selectedOutlet } = useOutletContext();
  const { t } = useLanguage();

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">{t("manager.chooseOutletHistory")}</p>
      </main>
    );
  }

  return <HistoryForOutlet outletId={selectedOutlet.id} />;
}

function HistoryForOutlet({ outletId }: { outletId: string }) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const dates = useMemo(() => lastDatesInKolkata(DAYS_SHOWN), []);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [grid, setGrid] = useState<Record<string, Record<string, Cell>>>({});
  const [incompleteDates, setIncompleteDates] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openSubmission, setOpenSubmission] =
    useState<SubmissionSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const oldest = dates[dates.length - 1];
    const newest = dates[0];

    async function load() {
      const [templatesRes, submissionsRes] = await Promise.all([
        supabase
          .from("checklist_templates")
          .select("id, name")
          .eq("outlet_id", outletId)
          .eq("active", true)
          .order("name"),
        supabase
          .from("checklist_submissions")
          .select("id, template_id, business_date, submitted_at, notes, staff_id")
          .eq("outlet_id", outletId)
          .gte("business_date", oldest)
          .lte("business_date", newest)
          .order("submitted_at", { ascending: false }),
      ]);

      if (cancelled) return;

      if (templatesRes.error) {
        setLoading(false);
        setLoadError(templatesRes.error.message);
        return;
      }
      if (submissionsRes.error) {
        setLoading(false);
        setLoadError(submissionsRes.error.message);
        return;
      }

      const submissionRows = submissionsRes.data ?? [];
      const staffNames = await fetchStaffNames(
        supabase,
        submissionRows.map((row) => row.staff_id),
      );

      const submissionIds = submissionRows.map((row) => row.id);
      let incompleteAnswers: { submission_id: string }[] = [];
      if (submissionIds.length > 0) {
        const { data, error } = await supabase
          .from("submission_answers")
          .select("submission_id")
          .in("submission_id", submissionIds)
          .eq("done", false);
        if (!error) incompleteAnswers = data ?? [];
      }

      if (cancelled) return;

      const nextGrid: Record<string, Record<string, Cell>> = {};
      const dateBySubmissionId = new Map<string, string>();
      for (const row of submissionRows) {
        dateBySubmissionId.set(row.id, row.business_date);
        const byTemplate = nextGrid[row.business_date] ?? {};
        if (!byTemplate[row.template_id]) {
          // rows are newest-first, so the first one wins per date+template
          byTemplate[row.template_id] = {
            id: row.id,
            staffName: staffNames[row.staff_id] ?? "Unknown staff",
            submittedAt: row.submitted_at,
            notes: row.notes,
          };
        }
        nextGrid[row.business_date] = byTemplate;
      }

      const nextIncompleteDates = new Set<string>();
      for (const answer of incompleteAnswers) {
        const date = dateBySubmissionId.get(answer.submission_id);
        if (date) nextIncompleteDates.add(date);
      }

      setTemplates(templatesRes.data ?? []);
      setGrid(nextGrid);
      setIncompleteDates(nextIncompleteDates);
      setLoading(false);
      setLoadError(null);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, outletId, dates]);

  return (
    <main className="flex-1 p-4 sm:p-6">
      <h2 className="mb-6 text-xl font-semibold text-text">
        {t("manager.historyHeading")}
      </h2>

      {loading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      )}
      {loadError && (
        <p className="text-danger">
          {t("manager.loadHistoryError", { error: loadError })}
        </p>
      )}
      {!loading && !loadError && templates.length === 0 && (
        <EmptyState title={t("common.noActiveChecklists")} />
      )}

      {!loading && !loadError && templates.length > 0 && (
        <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-border">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  {t("manager.dateColumn")}
                </th>
                {templates.map((template) => (
                  <th
                    key={template.id}
                    className="px-4 py-3 text-left font-semibold text-muted"
                  >
                    {template.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => {
                const incomplete = incompleteDates.has(date);
                return (
                  <tr
                    key={date}
                    className={`border-b border-border last:border-0 ${
                      incomplete ? "bg-danger/10" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium whitespace-nowrap text-text">
                      {formatDateLabel(date)}
                    </td>
                    {templates.map((template) => {
                      const cell = grid[date]?.[template.id];
                      return (
                        <td key={template.id} className="px-4 py-3 whitespace-nowrap">
                          {cell ? (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenSubmission({
                                  id: cell.id,
                                  title: template.name,
                                  staffName: cell.staffName,
                                  submittedAt: cell.submittedAt,
                                  notes: cell.notes,
                                })
                              }
                              className="font-medium text-success hover:underline"
                            >
                              ✓ {cell.staffName} · {formatTimeKolkata(cell.submittedAt)}
                            </button>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openSubmission && (
        <SubmissionModal
          submission={openSubmission}
          onClose={() => setOpenSubmission(null)}
        />
      )}
    </main>
  );
}
