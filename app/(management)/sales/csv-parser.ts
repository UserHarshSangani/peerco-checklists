import Papa from "papaparse";

export type Channel =
  | "dine_in"
  | "pickup"
  | "zomato"
  | "swiggy"
  | "delivery_other"
  | "unknown";

export type SalesRow = {
  business_date: string;
  pos_name: string;
  category: string | null;
  channel: Channel;
  quantity: number;
  cancelled_quantity: number;
  revenue: number;
};

export type SalesPreview = {
  rows: SalesRow[];
  dateFrom: string;
  dateTo: string;
  invoiceCount: number;
  unitsSold: number;
  unitsCancelled: number;
  revenue: number;
  unitsByChannel: Record<Channel, number>;
  topItems: { name: string; units: number }[];
};

// Required columns, matched fuzzily (case/space/underscore-insensitive)
// since exported header text can vary slightly between Petpooja accounts.
const REQUIRED_COLUMNS: { key: string; label: string; aliases: string[] }[] = [
  { key: "status", label: "Status", aliases: ["status"] },
  { key: "date", label: "Date", aliases: ["date"] },
  { key: "order_type", label: "Order Type", aliases: ["ordertype"] },
  { key: "area", label: "Area", aliases: ["area"] },
  { key: "item_name", label: "Item Name", aliases: ["itemname"] },
  {
    key: "category_name",
    label: "Category Name",
    aliases: ["categoryname", "category"],
  },
  {
    key: "item_quantity",
    label: "Item Quantity",
    aliases: ["itemquantity", "quantity"],
  },
  { key: "item_total", label: "Item Total", aliases: ["itemtotal", "total"] },
  {
    key: "invoice_no",
    label: "Invoice No",
    aliases: ["invoiceno", "invoicenumber", "invoice"],
  },
];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveColumns(
  fields: string[],
): { columnByKey: Record<string, string>; missing: string[] } {
  const byNormalized = new Map(fields.map((f) => [normalizeHeader(f), f]));
  const columnByKey: Record<string, string> = {};
  const missing: string[] = [];
  for (const { key, label, aliases } of REQUIRED_COLUMNS) {
    const match = aliases.map((a) => byNormalized.get(a)).find(Boolean);
    if (match) columnByKey[key] = match;
    else missing.push(label);
  }
  return { columnByKey, missing };
}

function toNumber(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// Handles "YYYY-MM-DD...", "DD-MM-YYYY..." and "DD/MM/YYYY..." prefixes
// (with an optional trailing time), which cover Petpooja's usual exports.
function parseBusinessDate(raw: string): string | null {
  const trimmed = raw.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${month}-${day}`;
  }
  const fallback = new Date(trimmed);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback.toISOString().slice(0, 10);
  }
  return null;
}

function resolveChannel(orderType: string, area: string): Channel {
  const type = orderType.trim();
  if (type === "Dine In") return "dine_in";
  if (type === "Pick Up") return "pickup";
  if (type === "Delivery(Parcel)") {
    const trimmedArea = area.trim();
    if (trimmedArea === "Zomato") return "zomato";
    if (trimmedArea === "Swiggy") return "swiggy";
    return "delivery_other";
  }
  return "unknown";
}

function stripCategorySuffixes(category: string): string {
  return category.split(" [O]").join("").split(" (o)").join("").trim();
}

export async function parseSalesCsv(
  file: File,
): Promise<{ preview: SalesPreview | null; error: string | null }> {
  const text = await file.text();

  const headerCheck = Papa.parse<Record<string, string>>(text, {
    header: true,
    preview: 1,
    skipEmptyLines: true,
  });
  const fields = headerCheck.meta.fields ?? [];
  const { columnByKey, missing } = resolveColumns(fields);
  if (missing.length > 0) {
    return {
      preview: null,
      error: `This file is missing required column(s): ${missing.join(", ")}.`,
    };
  }

  const aggregated = new Map<string, SalesRow>();
  const invoiceNumbers = new Set<string>();
  const itemTotals = new Map<string, number>();
  let parseErrorMessage: string | null = null;

  await new Promise<void>((resolve) => {
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      step: (results) => {
        const row = results.data;
        const invoice = String(row[columnByKey.invoice_no] ?? "").trim();
        if (invoice) invoiceNumbers.add(invoice);

        const businessDate = parseBusinessDate(
          String(row[columnByKey.date] ?? ""),
        );
        const itemName = String(row[columnByKey.item_name] ?? "").trim();
        if (!businessDate || !itemName) return;

        const category = stripCategorySuffixes(
          String(row[columnByKey.category_name] ?? ""),
        );
        const channel = resolveChannel(
          String(row[columnByKey.order_type] ?? ""),
          String(row[columnByKey.area] ?? ""),
        );
        const status = String(row[columnByKey.status] ?? "").trim();
        const quantity = toNumber(row[columnByKey.item_quantity]);
        const total = toNumber(row[columnByKey.item_total]);

        const key = `${businessDate}|${itemName}|${channel}`;
        const existing = aggregated.get(key) ?? {
          business_date: businessDate,
          pos_name: itemName,
          category: category || null,
          channel,
          quantity: 0,
          cancelled_quantity: 0,
          revenue: 0,
        };
        if (status === "Success") {
          existing.quantity += quantity;
          existing.revenue += total;
          itemTotals.set(itemName, (itemTotals.get(itemName) ?? 0) + quantity);
        } else {
          existing.cancelled_quantity += quantity;
        }
        if (!existing.category && category) existing.category = category;
        aggregated.set(key, existing);
      },
      complete: () => resolve(),
      error: (err: Error) => {
        parseErrorMessage = err.message;
        resolve();
      },
    });
  });

  if (parseErrorMessage) {
    return { preview: null, error: parseErrorMessage };
  }

  const rows = Array.from(aggregated.values());
  if (rows.length === 0) {
    return { preview: null, error: "No usable rows were found in this file." };
  }

  const dates = rows.map((row) => row.business_date).sort();
  const unitsByChannel: Record<Channel, number> = {
    dine_in: 0,
    pickup: 0,
    zomato: 0,
    swiggy: 0,
    delivery_other: 0,
    unknown: 0,
  };
  let unitsSold = 0;
  let unitsCancelled = 0;
  let revenue = 0;
  for (const row of rows) {
    unitsSold += row.quantity;
    unitsCancelled += row.cancelled_quantity;
    revenue += row.revenue;
    unitsByChannel[row.channel] += row.quantity;
  }

  const topItems = Array.from(itemTotals.entries())
    .map(([name, units]) => ({ name, units }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 10);

  return {
    preview: {
      rows,
      dateFrom: dates[0],
      dateTo: dates[dates.length - 1],
      invoiceCount: invoiceNumbers.size,
      unitsSold,
      unitsCancelled,
      revenue,
      unitsByChannel,
      topItems,
    },
    error: null,
  };
}
