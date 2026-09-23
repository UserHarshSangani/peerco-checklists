export type ReportType = "checklist" | "variance" | "stock";

export type ChecklistComplianceRow = {
  date: string;
  outlet: string;
  checklist: string;
  kind: "Opening" | "Closing";
  dueTime: string | null;
  submitted: boolean;
  submittedBy: string | null;
  submittedAt: string | null;
  itemsTotal: number | null;
  itemsDone: number | null;
  itemsMissed: number | null;
  missedItems: string;
  locationStatus: string;
};

export type ChecklistSummaryRow = {
  outlet: string;
  completionPct: number | null;
  totalMissedItems: number;
  totalSubmitted: number;
  totalExpected: number;
};

export type ChecklistComplianceReport = {
  rows: ChecklistComplianceRow[];
  summary: ChecklistSummaryRow[];
};

export type VarianceReportRow = {
  date: string;
  outlet: string;
  item: string;
  unit: string;
  openingQty: number | null;
  openingSource: string | null;
  receivedQty: number;
  closingQty: number | null;
  actualUsage: number | null;
  soldUsage: number;
  wastage: number;
  varianceQty: number | null;
  varianceValue: number | null;
  status: string;
  acknowledged: boolean;
  ackReason: string | null;
  ackBy: string | null;
  ackNote: string | null;
};

export type VarianceTopItem = {
  item: string;
  outlet: string;
  varianceQty: number;
  varianceValue: number;
};

export type VarianceReport = {
  rows: VarianceReportRow[];
  totalShortageValue: number;
  totalSurplusValue: number;
  topItems: VarianceTopItem[];
};

export type StockCountRow = {
  date: string;
  outlet: string;
  kind: "Opening" | "Closing";
  item: string;
  unit: string;
  quantity: number;
  note: string | null;
  staff: string;
  submittedAt: string;
  locationStatus: string;
};

export type StockReceiptRow = {
  date: string;
  outlet: string;
  vendor: string;
  invoiceRef: string | null;
  item: string;
  unit: string;
  quantity: number;
  unitCost: number | null;
  lineTotal: number | null;
  staff: string;
  submittedAt: string;
};

export type WastageRow = {
  date: string;
  outlet: string;
  item: string;
  unit: string;
  quantity: number;
  reason: string;
  note: string | null;
  staff: string;
  loggedAt: string;
  locationStatus: string;
};

export type StockReport = {
  counts: StockCountRow[];
  receipts: StockReceiptRow[];
  wastage: WastageRow[];
};
