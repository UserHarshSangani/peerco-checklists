import * as XLSX from "xlsx";

// Column headers exactly as they appear in public/templates/Checklist_Template.xlsx
// — parsed by name (object-mode sheet_to_json), never by column position, so a
// reordered column in someone's copy of the template still works.
const CHECKLISTS_SHEET = "Checklists";
const ITEMS_SHEET = "Items";

const CHECKLIST_COL = {
  name: "Checklist name",
  kind: "Kind (Opening / Closing)",
  dueTime: "Due time (HH:MM, optional)",
  active: "Active (Yes/No)",
} as const;

const ITEM_COL = {
  checklistName: "Checklist name",
  section: "Section (optional)",
  label: "Item",
  required: "Required (Yes/No)",
  photo: "Photo required (Yes/No)",
} as const;

// Mirrors import_checklist_workbook's own due_time check exactly (24-hour
// HH:MM) so a row that passes this preview check never fails at the RPC.
const DUE_TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export type ParsedChecklist = {
  name: string;
  kind: string;
  due_time?: string;
  active?: boolean;
};

export type ParsedItem = {
  checklist_name: string;
  section?: string;
  label: string;
  required?: boolean;
  requires_photo?: boolean;
};

export type WorkbookParseResult = {
  checklists: ParsedChecklist[];
  items: ParsedItem[];
  itemsByChecklist: Map<string, ParsedItem[]>;
  orphanItems: ParsedItem[];
  counts: { checklists: number; items: number };
  blockingErrors: string[];
};

function isExample(value: string): boolean {
  return value.trim().toLowerCase().startsWith("example");
}

// Blank/undefined -> undefined (the RPC's own default applies); "Yes"
// (case-insensitive) -> true; anything else non-blank -> false.
function parseYesNo(raw: string | undefined): boolean | undefined {
  const trimmed = (raw ?? "").toString().trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase() === "yes";
}

function cellText(raw: unknown): string {
  return raw === undefined || raw === null ? "" : String(raw).trim();
}

export async function parseChecklistWorkbook(file: File): Promise<WorkbookParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const checklistsSheet = workbook.Sheets[CHECKLISTS_SHEET];
  const itemsSheet = workbook.Sheets[ITEMS_SHEET];
  if (!checklistsSheet || !itemsSheet) {
    throw new Error(
      `This workbook is missing the "${CHECKLISTS_SHEET}" or "${ITEMS_SHEET}" sheet.`,
    );
  }

  const checklistRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(checklistsSheet, {
    defval: "",
  });
  const itemRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(itemsSheet, {
    defval: "",
  });

  const checklists: ParsedChecklist[] = [];
  for (const row of checklistRows) {
    const name = cellText(row[CHECKLIST_COL.name]);
    const kindRaw = cellText(row[CHECKLIST_COL.kind]);
    const dueTimeRaw = cellText(row[CHECKLIST_COL.dueTime]);
    const activeRaw = cellText(row[CHECKLIST_COL.active]);
    // A genuinely blank row (every cell empty) — sheet_to_json usually
    // already drops these, but a stray blank cell elsewhere in the row can
    // still produce one, so this is a defensive second check.
    if (!name && !kindRaw && !dueTimeRaw && !activeRaw) continue;
    if (isExample(name)) continue;

    checklists.push({
      name,
      kind: kindRaw.toLowerCase(),
      due_time: dueTimeRaw || undefined,
      active: parseYesNo(activeRaw),
    });
  }

  const items: ParsedItem[] = [];
  for (const row of itemRows) {
    const checklistName = cellText(row[ITEM_COL.checklistName]);
    const section = cellText(row[ITEM_COL.section]);
    const label = cellText(row[ITEM_COL.label]);
    const requiredRaw = cellText(row[ITEM_COL.required]);
    const photoRaw = cellText(row[ITEM_COL.photo]);
    if (!checklistName && !section && !label && !requiredRaw && !photoRaw) continue;
    if (isExample(checklistName) || isExample(label)) continue;

    items.push({
      checklist_name: checklistName,
      section: section || undefined,
      label,
      required: parseYesNo(requiredRaw),
      requires_photo: parseYesNo(photoRaw),
    });
  }

  const checklistNameKeys = new Set(checklists.map((c) => c.name.toLowerCase()));
  const itemsByChecklist = new Map<string, ParsedItem[]>();
  const orphanItems: ParsedItem[] = [];
  for (const item of items) {
    const key = item.checklist_name.toLowerCase();
    if (checklistNameKeys.has(key)) {
      const list = itemsByChecklist.get(key) ?? [];
      list.push(item);
      itemsByChecklist.set(key, list);
    } else {
      orphanItems.push(item);
    }
  }

  const blockingErrors: string[] = [];

  const emptyChecklists = checklists.filter(
    (c) => (itemsByChecklist.get(c.name.toLowerCase()) ?? []).length === 0,
  );
  if (emptyChecklists.length > 0) {
    blockingErrors.push(
      `These checklists have no items on the Items sheet: ${emptyChecklists
        .map((c) => c.name)
        .join(", ")}.`,
    );
  }

  if (orphanItems.length > 0) {
    const names = Array.from(new Set(orphanItems.map((i) => i.checklist_name)));
    blockingErrors.push(
      `These items reference a checklist not listed on the Checklists sheet: ${names.join(", ")}.`,
    );
  }

  const badDueTimes = checklists.filter((c) => c.due_time && !DUE_TIME_RE.test(c.due_time));
  if (badDueTimes.length > 0) {
    blockingErrors.push(
      `These checklists have a due time that isn't in HH:MM 24-hour format: ${badDueTimes
        .map((c) => `${c.name} ("${c.due_time}")`)
        .join(", ")}.`,
    );
  }

  return {
    checklists,
    items,
    itemsByChecklist,
    orphanItems,
    counts: { checklists: checklists.length, items: items.length },
    blockingErrors,
  };
}
