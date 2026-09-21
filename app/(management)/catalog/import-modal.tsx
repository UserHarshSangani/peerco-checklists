"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import {
  ITEM_IMPORT_COLUMNS,
  buildItemImportTemplate,
  downloadTextFile,
  parseItemImportCsv,
  type ItemImportRow,
} from "@/lib/csv";
import type { InventoryItemRow, Vendor } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

type NormalizedRow = {
  name: string;
  category: string | null;
  count_unit: string;
  order_unit: string | null;
  order_unit_size: number;
  cost_per_unit: number | null;
  vendorName: string | null;
  count_frequency: "daily" | "weekly";
};

type PreviewRow = {
  index: number;
  raw: ItemImportRow;
  errors: string[];
  normalized: NormalizedRow | null;
};

export function ImportModal({
  organizationId,
  existingItems,
  existingVendors,
  onClose,
  onImported,
}: {
  organizationId: string;
  existingItems: InventoryItemRow[];
  existingVendors: Vendor[];
  onClose: () => void;
  onImported: () => void;
}) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [summary, setSummary] = useState<
    { created: number; updated: number; skipped: number } | null
  >(null);

  function validateRows(csvRows: ItemImportRow[]): PreviewRow[] {
    const nameCounts = new Map<string, number>();
    for (const row of csvRows) {
      const name = row.name?.trim() ?? "";
      if (!name) continue;
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    }

    return csvRows.map((raw, index) => {
      const errors: string[] = [];
      const name = raw.name?.trim() ?? "";
      if (!name) errors.push(t("catalog.import.errorName"));
      else if ((nameCounts.get(name) ?? 0) > 1) {
        errors.push(t("catalog.import.errorDuplicateInFile"));
      }

      const count_unit = raw.count_unit?.trim() ?? "";
      if (!count_unit) errors.push(t("catalog.import.errorCountUnit"));

      const freqRaw = raw.count_frequency?.trim().toLowerCase() ?? "";
      const count_frequency: "daily" | "weekly" | null =
        freqRaw === "weekly" ? "weekly" : freqRaw === "daily" ? "daily" : null;
      if (!count_frequency) errors.push(t("catalog.import.errorFrequency"));

      let order_unit_size = 1;
      const sizeRaw = raw.order_unit_size?.trim();
      if (sizeRaw) {
        const n = Number(sizeRaw);
        if (!Number.isFinite(n) || n <= 0) {
          errors.push(t("catalog.import.errorOrderUnitSize"));
        } else {
          order_unit_size = n;
        }
      }

      let cost_per_unit: number | null = null;
      const costRaw = raw.cost_per_unit?.trim();
      if (costRaw) {
        const n = Number(costRaw);
        if (!Number.isFinite(n) || n < 0) {
          errors.push(t("catalog.import.errorCostPerUnit"));
        } else {
          cost_per_unit = n;
        }
      }

      const normalized: NormalizedRow | null =
        errors.length === 0 && count_frequency
          ? {
              name,
              category: raw.category?.trim() || null,
              count_unit,
              order_unit: raw.order_unit?.trim() || null,
              order_unit_size,
              cost_per_unit,
              vendorName: raw.vendor?.trim() || null,
              count_frequency,
            }
          : null;

      return { index, raw, errors, normalized };
    });
  }

  async function handleFileSelected(file: File) {
    setFileName(file.name);
    setParseError(null);
    setRows(null);
    setSummary(null);
    const text = await file.text();
    const { rows: parsedRows, error } = parseItemImportCsv(text);
    if (error) {
      setParseError(error);
      return;
    }
    if (parsedRows.length === 0) {
      setParseError(t("catalog.import.errorEmptyFile"));
      return;
    }
    setRows(validateRows(parsedRows));
  }

  const validRows = (rows ?? []).filter((row) => row.normalized);
  const invalidCount = (rows ?? []).length - validRows.length;

  async function handleConfirm() {
    setImporting(true);
    setImportError(null);

    const existingNameSet = new Set(existingItems.map((item) => item.name));
    const existingVendorByName = new Map(
      existingVendors.map((vendor) => [vendor.name.toLowerCase(), vendor.id]),
    );

    const neededVendorNames = Array.from(
      new Set(
        validRows
          .map((row) => row.normalized!.vendorName)
          .filter((name): name is string => !!name)
          .filter((name) => !existingVendorByName.has(name.toLowerCase())),
      ),
    );

    if (neededVendorNames.length > 0) {
      const { data: createdVendors, error: vendorError } = await supabase
        .from("vendors")
        .insert(
          neededVendorNames.map((name) => ({
            organization_id: organizationId,
            name,
          })),
        )
        .select("id, name");
      if (vendorError) {
        setImporting(false);
        setImportError(vendorError.message);
        return;
      }
      for (const vendor of createdVendors ?? []) {
        existingVendorByName.set(vendor.name.toLowerCase(), vendor.id);
      }
    }

    const payload = validRows.map((row) => {
      const normalized = row.normalized!;
      return {
        organization_id: organizationId,
        name: normalized.name,
        category: normalized.category,
        count_unit: normalized.count_unit,
        order_unit: normalized.order_unit,
        order_unit_size: normalized.order_unit_size,
        cost_per_unit: normalized.cost_per_unit,
        vendor_id: normalized.vendorName
          ? (existingVendorByName.get(normalized.vendorName.toLowerCase()) ?? null)
          : null,
        count_frequency: normalized.count_frequency,
      };
    });

    const { error: upsertError } = await supabase
      .from("inventory_items")
      .upsert(payload, { onConflict: "organization_id,name" });

    setImporting(false);

    if (upsertError) {
      setImportError(upsertError.message);
      return;
    }

    const created = validRows.filter(
      (row) => !existingNameSet.has(row.normalized!.name),
    ).length;
    setSummary({
      created,
      updated: validRows.length - created,
      skipped: invalidCount,
    });
    onImported();
  }

  return (
    <Modal
      onClose={onClose}
      title={t("catalog.import.title")}
      panelClassName="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-surface p-6 shadow-xl outline-none"
    >
      {summary ? (
        <div className="flex flex-col gap-4">
          <p className="text-text">
            {t("catalog.import.summary", {
              created: summary.created,
              updated: summary.updated,
              skipped: summary.skipped,
            })}
          </p>
          <Button type="button" onClick={onClose}>
            {t("common.done")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() =>
              downloadTextFile(
                "peerco-item-import-template.csv",
                buildItemImportTemplate(),
                "text/csv",
              )
            }
            className="self-start text-sm font-medium text-accent underline"
          >
            {t("catalog.import.downloadTemplate")}
          </button>

          <div>
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full bg-bg px-4 text-sm font-medium text-text ring-1 ring-border">
              {t("catalog.import.chooseFile")}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void handleFileSelected(file);
                }}
              />
            </label>
            {fileName && (
              <span className="ml-3 text-sm text-muted">{fileName}</span>
            )}
          </div>

          {parseError && <p className="text-danger">{parseError}</p>}

          {rows && (
            <>
              <p className="text-sm text-muted">
                {t("catalog.import.previewSummary", {
                  valid: validRows.length,
                  invalid: invalidCount,
                })}
              </p>
              <div className="overflow-x-auto rounded-2xl ring-1 ring-border">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-bg">
                      {ITEM_IMPORT_COLUMNS.map((column) => (
                        <th
                          key={column}
                          className="px-3 py-2 text-left font-semibold text-muted"
                        >
                          {column}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left font-semibold text-muted">
                        {t("catalog.import.statusColumn")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.index}
                        className={`border-b border-border last:border-0 ${
                          row.errors.length > 0 ? "bg-danger/10" : ""
                        }`}
                      >
                        {ITEM_IMPORT_COLUMNS.map((column) => (
                          <td key={column} className="px-3 py-2 whitespace-nowrap text-text">
                            {row.raw[column] ?? ""}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-xs">
                          {row.errors.length > 0 ? (
                            <span className="font-medium text-danger">
                              {row.errors.join(" · ")}
                            </span>
                          ) : (
                            <span className="font-medium text-success">
                              {t("catalog.import.ok")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {importError && <p className="text-danger">{importError}</p>}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={validRows.length === 0}
              loading={importing}
              onClick={handleConfirm}
              className="flex-1"
            >
              {t("catalog.import.confirm")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
