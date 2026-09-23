"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import {
  parseRecipeWorkbook,
  type WorkbookParseResult,
} from "./workbook-parser";

type ImportSuccess = {
  ok: true;
  ingredients_created: number;
  ingredients_updated: number;
  recipes_created: number;
  recipes_updated: number;
  recipe_lines: number;
  dishes_mapped: number;
  dishes_unmapped: number;
  dishes_needing_portion: string[];
  dishes_recipe_not_ready: string[];
};

type ImportFailure =
  | { ok: false; reason: "validation"; errors: { code: string; detail: string }[] }
  | { ok: false; reason: "not_allowed" | "bad_request" };

type ImportResponse = ImportSuccess | ImportFailure;

const ERROR_CODE_LABEL: Record<string, string> = {
  bad_ingredient:
    "Some ingredients have a missing name, an invalid recipe unit, or a missing stock unit",
  unit_mismatch:
    "These ingredients' recipe unit doesn't match their stock unit (g needs a stock unit of kg or g, ml needs l or ml, pcs needs pcs)",
  bad_recipe:
    "These recipes have a missing name, an invalid batch yield, or no ingredient lines",
  duplicate_recipe: "These recipe names appear more than once",
  unknown_ingredient:
    "These ingredients are used in a recipe but aren't in the Ingredients sheet or the catalog",
  bad_quantity:
    "These recipes have a line with a missing or non-positive quantity",
};

const REASON_LABEL: Record<string, string> = {
  not_allowed: "You don't have permission to import recipes for this brand.",
  bad_request:
    "The workbook couldn't be read correctly. Please check the file and try again.",
};

export function UploadModal({
  organizationId,
  onClose,
  onImported,
}: {
  organizationId: string;
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
      const parsedResult = await parseRecipeWorkbook(file);
      setParsed(parsedResult);
    } catch (err) {
      setParseError(
        err instanceof Error
          ? `Couldn't read this file: ${err.message}`
          : "Couldn't read this file.",
      );
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    if (!parsed) return;
    setImporting(true);
    const { data, error } = await supabase.rpc("import_recipe_workbook", {
      p_organization_id: organizationId,
      p_ingredients: parsed.ingredients,
      p_recipes: parsed.recipes,
      p_dishes: parsed.dishes,
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
      title="Import recipe workbook"
      panelClassName="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-surface p-6 shadow-xl outline-none"
    >
      {result?.ok ? (
        <ImportSuccessView result={result} onClose={onClose} />
      ) : (
        <div className="flex flex-col gap-4">
          <a
            href="/templates/Recipe_Template_Blank.xlsx"
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
                {parsed.counts.recipes} recipe(s), {parsed.counts.lines} ingredient
                line(s), {parsed.counts.newIngredients} ingredient(s) to send.
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

              {parsed.warnings.length > 0 && (
                <div className="rounded-2xl bg-warning/10 p-4">
                  <p className="mb-2 text-sm font-semibold text-warning">
                    Worth checking (won&apos;t block the import):
                  </p>
                  <ul className="flex flex-col gap-1 text-sm text-warning">
                    {parsed.warnings.map((message, index) => (
                      <li key={index}>• {message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {result && !result.ok && (
            <ImportFailureView result={result} />
          )}

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

function ImportFailureView({ result }: { result: ImportFailure }) {
  if (result.reason === "validation") {
    return (
      <div className="rounded-2xl bg-danger/10 p-4">
        <p className="mb-2 text-sm font-semibold text-danger">
          The workbook wasn&apos;t imported:
        </p>
        <ul className="flex flex-col gap-1 text-sm text-danger">
          {result.errors.map((error, index) => (
            <li key={index}>
              • {ERROR_CODE_LABEL[error.code] ?? error.code}: {error.detail}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <p className="text-danger">
      {REASON_LABEL[result.reason] ?? "Something went wrong. Please try again."}
    </p>
  );
}

function ImportSuccessView({
  result,
  onClose,
}: {
  result: ImportSuccess;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-text">
        {result.recipes_created} recipe(s) created, {result.recipes_updated}{" "}
        updated, {result.recipe_lines} ingredient line(s) saved.
        <br />
        {result.ingredients_created} new ingredient(s), {result.ingredients_updated}{" "}
        existing ingredient(s) updated.
        <br />
        {result.dishes_mapped} dish(es) mapped, {result.dishes_unmapped} left
        unmapped.
      </p>

      {result.ingredients_created > 0 && (
        <p className="rounded-2xl bg-accent/10 p-4 text-sm text-text">
          New ingredients are not stocked at any outlet yet. Add them in Catalog
          &gt; Outlet settings (Add all items), then they appear on the tablet
          count sheet.
        </p>
      )}

      {result.dishes_needing_portion.length > 0 && (
        <div className="rounded-2xl bg-warning/10 p-4">
          <p className="mb-2 text-sm font-semibold text-warning">
            These dishes have a recipe but still need a portion set:
          </p>
          <p className="text-sm text-warning">
            {result.dishes_needing_portion.join(", ")}
          </p>
        </div>
      )}

      {result.dishes_recipe_not_ready.length > 0 && (
        <div className="rounded-2xl bg-warning/10 p-4">
          <p className="mb-2 text-sm font-semibold text-warning">
            These dishes point to a recipe that doesn&apos;t exist yet:
          </p>
          <p className="text-sm text-warning">
            {result.dishes_recipe_not_ready.join(", ")}
          </p>
        </div>
      )}

      <Button type="button" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}
