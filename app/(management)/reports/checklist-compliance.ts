import type { createClient } from "@/lib/supabase/client";
import { addDaysToDateString } from "@/lib/date";
import { fetchStaffNames } from "@/lib/staff-names";
import { locationStatusLabel } from "@/lib/reports/location-label";
import type { ChecklistComplianceReport, ChecklistComplianceRow } from "./types";

type Supabase = ReturnType<typeof createClient>;

function kindLabel(kind: string): "Opening" | "Closing" {
  return kind === "closing" ? "Closing" : "Opening";
}

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDaysToDateString(cursor, 1);
  }
  return dates;
}

export async function fetchChecklistComplianceReport(
  supabase: Supabase,
  outletIds: string[],
  outletNameById: Map<string, string>,
  from: string,
  to: string,
): Promise<ChecklistComplianceReport> {
  if (outletIds.length === 0) return { rows: [], summary: [] };

  const [templatesRes, submissionsRes] = await Promise.all([
    supabase
      .from("checklist_templates")
      .select("id, outlet_id, name, kind, due_time, active")
      .in("outlet_id", outletIds),
    supabase
      .from("checklist_submissions")
      .select(
        "id, outlet_id, template_id, business_date, staff_id, submitted_at, location_status",
      )
      .in("outlet_id", outletIds)
      .gte("business_date", from)
      .lte("business_date", to),
  ]);

  if (templatesRes.error) throw templatesRes.error;
  if (submissionsRes.error) throw submissionsRes.error;

  const templates = templatesRes.data ?? [];
  const submissions = submissionsRes.data ?? [];

  const staffNames = await fetchStaffNames(
    supabase,
    submissions.map((row) => row.staff_id),
  );

  const submissionIds = submissions.map((row) => row.id);
  let answers: { submission_id: string; item_label: string; done: boolean }[] = [];
  if (submissionIds.length > 0) {
    const { data, error } = await supabase
      .from("submission_answers")
      .select("submission_id, item_label, done")
      .in("submission_id", submissionIds);
    if (error) throw error;
    answers = data ?? [];
  }

  const answersBySubmission = new Map<string, { item_label: string; done: boolean }[]>();
  for (const answer of answers) {
    const list = answersBySubmission.get(answer.submission_id) ?? [];
    list.push({ item_label: answer.item_label, done: answer.done });
    answersBySubmission.set(answer.submission_id, list);
  }

  // Keyed by outlet+template+date — a submission for a template that's
  // since been deactivated still needs a home, so this is built from every
  // submission, not just ones for currently-active templates.
  const submissionByKey = new Map<string, (typeof submissions)[number]>();
  for (const submission of submissions) {
    submissionByKey.set(
      `${submission.outlet_id}:${submission.template_id}:${submission.business_date}`,
      submission,
    );
  }

  const templateById = new Map(templates.map((template) => [template.id, template]));
  const activeTemplatesByOutlet = new Map<string, typeof templates>();
  for (const template of templates) {
    if (!template.active) continue;
    const list = activeTemplatesByOutlet.get(template.outlet_id) ?? [];
    list.push(template);
    activeTemplatesByOutlet.set(template.outlet_id, list);
  }

  const dates = dateRange(from, to);
  const rows: ChecklistComplianceRow[] = [];

  // Expected rows: every active template, every day in range, per outlet.
  const coveredKeys = new Set<string>();
  for (const outletId of outletIds) {
    const outletName = outletNameById.get(outletId) ?? "";
    const activeTemplates = activeTemplatesByOutlet.get(outletId) ?? [];
    for (const date of dates) {
      for (const template of activeTemplates) {
        const key = `${outletId}:${template.id}:${date}`;
        coveredKeys.add(key);
        const submission = submissionByKey.get(key);
        rows.push(buildRow(outletName, date, template, submission, answersBySubmission, staffNames));
      }
    }
  }

  // Any submission for a template that's no longer active still gets its
  // own row, so real historical data is never silently dropped.
  for (const submission of submissions) {
    const key = `${submission.outlet_id}:${submission.template_id}:${submission.business_date}`;
    if (coveredKeys.has(key)) continue;
    const template = templateById.get(submission.template_id);
    if (!template) continue;
    const outletName = outletNameById.get(submission.outlet_id) ?? "";
    rows.push(buildRow(outletName, submission.business_date, template, submission, answersBySubmission, staffNames));
  }

  rows.sort((a, b) => (a.date === b.date ? a.checklist.localeCompare(b.checklist) : a.date < b.date ? 1 : -1));

  const summary = outletIds.map((outletId) => {
    const outletName = outletNameById.get(outletId) ?? "";
    const outletRows = rows.filter((row) => row.outlet === outletName);
    const totalExpected = outletRows.length;
    const totalSubmitted = outletRows.filter((row) => row.submitted).length;
    const totalMissedItems = outletRows.reduce((sum, row) => sum + (row.itemsMissed ?? 0), 0);
    return {
      outlet: outletName,
      completionPct: totalExpected > 0 ? Math.round((totalSubmitted / totalExpected) * 1000) / 10 : null,
      totalMissedItems,
      totalSubmitted,
      totalExpected,
    };
  });

  return { rows, summary };
}

function buildRow(
  outletName: string,
  date: string,
  template: { name: string; kind: string; due_time: string | null },
  submission:
    | { id: string; staff_id: string; submitted_at: string; location_status: string }
    | undefined,
  answersBySubmission: Map<string, { item_label: string; done: boolean }[]>,
  staffNames: Record<string, string>,
): ChecklistComplianceRow {
  // Kept as the raw "HH:MM:SS" Postgres time string — formatted for
  // display or converted to an Excel time value at the point of use.
  const dueTime = template.due_time;

  if (!submission) {
    return {
      date,
      outlet: outletName,
      checklist: template.name,
      kind: kindLabel(template.kind),
      dueTime,
      submitted: false,
      submittedBy: null,
      submittedAt: null,
      itemsTotal: null,
      itemsDone: null,
      itemsMissed: null,
      missedItems: "",
      locationStatus: "",
    };
  }

  const itemAnswers = answersBySubmission.get(submission.id) ?? [];
  const done = itemAnswers.filter((answer) => answer.done).length;
  const missed = itemAnswers.filter((answer) => !answer.done);

  return {
    date,
    outlet: outletName,
    checklist: template.name,
    kind: kindLabel(template.kind),
    dueTime,
    submitted: true,
    submittedBy: staffNames[submission.staff_id] ?? "Unknown staff",
    submittedAt: submission.submitted_at,
    itemsTotal: itemAnswers.length,
    itemsDone: done,
    itemsMissed: missed.length,
    missedItems: missed.map((answer) => answer.item_label).join(", "),
    locationStatus: locationStatusLabel(submission.location_status),
  };
}
