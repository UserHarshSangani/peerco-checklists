"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayInKolkata, formatTimeKolkata } from "@/lib/date";
import { fetchStaffNames } from "@/lib/staff-names";
import { useLanguage } from "@/lib/i18n/language-context";
import { useOutletContext } from "../outlet-context";
import { SubmissionModal, type SubmissionSummary } from "../submission-modal";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { ChecklistTemplate } from "@/lib/types";

export default function DashboardPage() {
  const { selectedOutlet } = useOutletContext();
  const { t } = useLanguage();

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">{t("manager.chooseOutletDashboard")}</p>
      </main>
    );
  }

  return <DashboardForOutlet outletId={selectedOutlet.id} />;
}

function DashboardForOutlet({ outletId }: { outletId: string }) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [date, setDate] = useState(todayInKolkata());
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [submissionByTemplate, setSubmissionByTemplate] = useState<
    Record<string, SubmissionSummary>
  >({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openSubmission, setOpenSubmission] =
    useState<SubmissionSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

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
          .select("id, template_id, submitted_at, notes, staff_id")
          .eq("outlet_id", outletId)
          .eq("business_date", date)
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

      const templateRows = templatesRes.data ?? [];
      const submissionRows = submissionsRes.data ?? [];
      const staffNames = await fetchStaffNames(
        supabase,
        submissionRows.map((row) => row.staff_id),
      );

      if (cancelled) return;

      const templateNameById = new Map(
        templateRows.map((row) => [row.id, row.name]),
      );
      const latestByTemplate: Record<string, SubmissionSummary> = {};
      for (const row of submissionRows) {
        if (latestByTemplate[row.template_id]) continue; // rows are newest-first
        latestByTemplate[row.template_id] = {
          id: row.id,
          title:
            templateNameById.get(row.template_id) ??
            t("manager.checklistFallbackTitle"),
          staffName: staffNames[row.staff_id] ?? "Unknown staff",
          submittedAt: row.submitted_at,
          notes: row.notes,
        };
      }

      setTemplates(templateRows);
      setSubmissionByTemplate(latestByTemplate);
      setLoading(false);
      setLoadError(null);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, outletId, date, t]);

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-text">
          {t("manager.dashboardHeading")}
        </h2>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="min-h-[44px] rounded-lg border border-border bg-surface px-4 py-2 text-base text-text focus:border-accent focus:outline-none"
        />
      </div>

      {loading && <SkeletonList rows={3} rowClassName="h-24" />}
      {loadError && (
        <p className="text-danger">
          {t("manager.loadDashboardError", { error: loadError })}
        </p>
      )}
      {!loading && !loadError && templates.length === 0 && (
        <EmptyState title={t("common.noActiveChecklists")} />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => {
          const submission = submissionByTemplate[template.id];
          return (
            <button
              key={template.id}
              type="button"
              disabled={!submission}
              onClick={() => submission && setOpenSubmission(submission)}
              className={`rounded-2xl p-6 text-left shadow-sm ring-1 transition ${
                submission
                  ? "bg-success/10 ring-success/30 hover:bg-success/15"
                  : "cursor-default bg-warning/10 ring-warning/30"
              }`}
            >
              <p className="mb-2 text-lg font-semibold text-text">
                {template.name}
              </p>
              {submission ? (
                <p className="text-sm font-medium text-success">
                  {t("manager.submittedAt", {
                    name: submission.staffName,
                    time: formatTimeKolkata(submission.submittedAt),
                  })}
                </p>
              ) : (
                <p className="text-sm font-medium text-warning">
                  {t("manager.notSubmittedYet")}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {openSubmission && (
        <SubmissionModal
          submission={openSubmission}
          onClose={() => setOpenSubmission(null)}
        />
      )}
    </main>
  );
}
