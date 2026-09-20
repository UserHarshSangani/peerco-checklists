"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayInKolkata, formatTimeKolkata } from "@/lib/date";
import { fetchStaffNames } from "@/lib/staff-names";
import { useOutletContext } from "../outlet-context";
import { SubmissionModal, type SubmissionSummary } from "../submission-modal";
import type { ChecklistTemplate } from "@/lib/types";

export default function DashboardPage() {
  const { selectedOutlet } = useOutletContext();

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-zinc-500 dark:text-zinc-400">
          Choose an outlet to see its checklists.
        </p>
      </main>
    );
  }

  return <DashboardForOutlet outletId={selectedOutlet.id} />;
}

function DashboardForOutlet({ outletId }: { outletId: string }) {
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
          title: templateNameById.get(row.template_id) ?? "Checklist",
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
  }, [supabase, outletId, date]);

  return (
    <main className="flex-1 p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Dashboard
        </h2>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      {loading && (
        <p className="text-zinc-500 dark:text-zinc-400">Loading…</p>
      )}
      {loadError && (
        <p className="text-red-600 dark:text-red-400">
          Couldn&apos;t load the dashboard: {loadError}
        </p>
      )}
      {!loading && !loadError && templates.length === 0 && (
        <p className="text-zinc-500 dark:text-zinc-400">
          No active checklists for this outlet.
        </p>
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
                  ? "bg-emerald-50 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:ring-emerald-900"
                  : "cursor-default bg-amber-50 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-900"
              }`}
            >
              <p className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {template.name}
              </p>
              {submission ? (
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Submitted by {submission.staffName} at{" "}
                  {formatTimeKolkata(submission.submittedAt)}
                </p>
              ) : (
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  Not submitted yet
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
