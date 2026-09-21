export type ChecklistDraft = {
  answers: Record<string, { done: boolean; note: string }>;
  photoPaths: Record<string, string>;
  notes: string;
  closedSections: string[];
  savedAt: string;
};

function draftKey(outletId: string, templateId: string, businessDate: string): string {
  return `peerco:checklist-draft:${outletId}:${templateId}:${businessDate}`;
}

export function readChecklistDraft(
  outletId: string,
  templateId: string,
  businessDate: string,
): ChecklistDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(outletId, templateId, businessDate));
    if (!raw) return null;
    return JSON.parse(raw) as ChecklistDraft;
  } catch {
    return null;
  }
}

export function writeChecklistDraft(
  outletId: string,
  templateId: string,
  businessDate: string,
  draft: Omit<ChecklistDraft, "savedAt">,
) {
  try {
    window.localStorage.setItem(
      draftKey(outletId, templateId, businessDate),
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
    );
  } catch {
    // Draft persistence is a convenience, not a requirement — ignore quota/
    // private-mode failures rather than interrupting the checklist.
  }
}

export function clearChecklistDraft(
  outletId: string,
  templateId: string,
  businessDate: string,
) {
  try {
    window.localStorage.removeItem(draftKey(outletId, templateId, businessDate));
  } catch {
    // ignore
  }
}
