"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import {
  parseChecklistWorkbook,
  type ParsedChecklist,
  type WorkbookParseResult,
} from "./workbook-parser";

type ImportSuccess = {
  ok: true;
  checklists_created: number;
  checklists_updated: number;
  items_replaced: number;
};

type ImportFailure =
  | { ok: false; reason: "validation"; errors: { code: string; detail: string }[] }
  | { ok: false; reason: "not_allowed" | "bad_request" };

type ImportResponse = ImportSuccess | ImportFailure;

const ERROR_CODE_LABEL: Record<string, (detail: string) => string> = {
  bad_checklist: (detail) =>
    `Check these checklists: ${detail} - each needs a name, a Kind of Opening or Closing, and (if given) a due time like 14:30.`,
  duplicate_checklist_name: (detail) =>
    `These checklist names appear more than once in the file: ${detail}. Each name should appear once (Opening and Closing versions can share a name, but shouldn't both appear as separate rows with the same name).`,
  bad_item: (detail) =>
    `Check these items: ${detail} - each needs a label, and Section (if used) must be under 60 characters.`,
  unknown_checklist: (detail) =>
    `These items reference a checklist not listed on the Checklists sheet: ${detail}.`,
  empty_checklist: (detail) => `These checklists have no items: ${detail}.`,
};

const GENERIC_ERROR = "Something went wrong - check the file and try again.";

function kindLabel(kind: string): string {
  if (kind === "opening") return "Opening";
  if (kind === "closing") return "Closing";
  return kind || "—";
}

export function ChecklistUploadModal({
  outletId,
  onClose,
  onImported,
}: {
  outletId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<WorkbookParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function handleFileSelected(file: File) {
    setFileName(file.name);
    setParseError(null);
    setParsed(null);
    setResult(null);
    setParsing(true);
    try {
      const parsedResult = await parseChecklistWorkbook(file);
      setParsed(parsedResult);
    } catch (err) {
      setParseError(
        err instanceof Error ? `Couldn't read this file: ${err.message}` : "Couldn't read this file.",
      );
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    if (!parsed) return;
    setImporting(true);
    const { data, error } = await supabase.rpc("import_checklist_workbook", {
      p_outlet_id: outletId,
      p_checklists: parsed.checklists,
      p_items: parsed.items,
    });
    setImporting(false);
    if (error) {
      setResult({ ok: false, reason: "bad_request" });
      return;
    }
    const response = data as ImportResponse;
    setResult(response);
    if (response.ok) onImported();
  }

  return (
    <Modal
      onClose={onClose}
      title="Upload checklist"
      panelClassName="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-surface p-6 shadow-xl outline-none"
    >
      {result?.ok ? (
        <div className="flex flex-col gap-4">
          <p className="text-text">
            {result.checklists_created} checklist{result.checklists_created === 1 ? "" : "s"} created,{" "}
            {result.checklists_updated} updated, {result.items_replaced} item
            {result.items_replaced === 1 ? "" : "s"} saved.
          </p>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <a
            href="/templates/Checklist_Template.xlsx"
            download
            className="self-start text-sm font-medium text-accent underline"
          >
            Download template
          </a>

          <div>
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full bg-bg px-4 text-sm font-medium text-text ring-1 ring-border">
              Choose workbook (.xlsx)
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void handleFileSelected(file);
                }}
              />
            </label>
            {fileName && <span className="ml-3 text-sm text-muted">{fileName}</span>}
          </div>

          {parsing && <p className="text-sm text-muted">Reading workbook…</p>}
          {parseError && <p className="text-danger">{parseError}</p>}

          {parsed && (
            <>
              <p className="text-sm text-text">
                {parsed.counts.checklists} checklist{parsed.counts.checklists === 1 ? "" : "s"} and{" "}
                {parsed.counts.items} item{parsed.counts.items === 1 ? "" : "s"} found.
              </p>

              {parsed.blockingErrors.length > 0 && (
                <div className="rounded-2xl bg-danger/10 p-4">
                  <p className="mb-2 text-sm font-semibold text-danger">
                    Fix these before importing:
                  </p>
                  <ul className="flex flex-col gap-1 text-sm text-danger">
                    {parsed.blockingErrors.map((message, index) => (
                      <li key={index}>• {message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-col gap-4">
                {parsed.checklists.map((checklist) => (
                  <ChecklistPreviewTable
                    key={`${checklist.name}-${checklist.kind}`}
                    checklist={checklist}
                    items={parsed.itemsByChecklist.get(checklist.name.toLowerCase()) ?? []}
                  />
                ))}
              </div>
            </>
          )}

          {result && !result.ok && <ImportFailureView result={result} />}

          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!parsed || parsed.blockingErrors.length > 0}
              loading={importing}
              onClick={handleImport}
              className="flex-1"
            >
              Import
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ChecklistPreviewTable({
  checklist,
  items,
}: {
  checklist: ParsedChecklist;
  items: { section?: string; label: string; required?: boolean; requires_photo?: boolean }[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl ring-1 ring-border">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-bg px-4 py-3">
        <p className="text-sm font-semibold text-text">
          {checklist.name || "(blank name)"}
          <span className="ml-2 font-normal text-muted">{kindLabel(checklist.kind)}</span>
        </p>
        <p className="text-xs text-muted">
          {checklist.due_time ? `Due ${checklist.due_time}` : "No due time"} ·{" "}
          {checklist.active === false ? "Inactive" : "Active"}
        </p>
      </div>
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left font-semibold text-muted">#</th>
            <th className="px-3 py-2 text-left font-semibold text-muted">Section</th>
            <th className="px-3 py-2 text-left font-semibold text-muted">Item</th>
            <th className="px-3 py-2 text-left font-semibold text-muted">Required</th>
            <th className="px-3 py-2 text-left font-semibold text-muted">Photo required</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className="border-b border-border last:border-0">
              <td className="px-3 py-2 text-muted">{index + 1}</td>
              <td className="px-3 py-2 whitespace-nowrap text-text">{item.section ?? "—"}</td>
              <td className="px-3 py-2 text-text">{item.label}</td>
              <td className="px-3 py-2 whitespace-nowrap text-text">
                {item.required === false ? "No" : "Yes"}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-text">
                {item.requires_photo ? "Yes" : "No"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportFailureView({ result }: { result: ImportFailure }) {
  if (result.reason === "validation") {
    return (
      <div className="rounded-2xl bg-danger/10 p-4">
        <p className="mb-2 text-sm font-semibold text-danger">The workbook wasn&apos;t imported:</p>
        <ul className="flex flex-col gap-1 text-sm text-danger">
          {result.errors.map((error, index) => (
            <li key={index}>
              • {ERROR_CODE_LABEL[error.code]?.(error.detail) ?? `${error.code}: ${error.detail}`}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return <p className="text-danger">{GENERIC_ERROR}</p>;
}
