import Papa from "papaparse";

export const ITEM_IMPORT_COLUMNS = [
  "name",
  "category",
  "count_unit",
  "order_unit",
  "order_unit_size",
  "cost_per_unit",
  "vendor",
  "count_frequency",
] as const;

export type ItemImportRow = Record<(typeof ITEM_IMPORT_COLUMNS)[number], string>;

export function buildItemImportTemplate(): string {
  return Papa.unparse({
    fields: [...ITEM_IMPORT_COLUMNS],
    data: [
      ["Tomatoes", "Produce", "kg", "kg", "10", "42", "Fresh Farms", "daily"],
      ["Paper napkins", "Supplies", "pack", "carton", "24", "85", "", "weekly"],
    ],
  });
}

export function parseItemImportCsv(
  text: string,
): { rows: ItemImportRow[]; error: string | null } {
  const result = Papa.parse<ItemImportRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });
  if (result.errors.length > 0) {
    return { rows: [], error: result.errors[0].message };
  }
  return { rows: result.data, error: null };
}

export function downloadTextFile(filename: string, contents: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
