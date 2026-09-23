// English-only label for the raw location_status text stored on
// checklist_submissions / stock_counts / stock_receipts / wastage_entries —
// reports are manager-facing and explicitly English only, so this
// deliberately doesn't go through the translations system the way
// components/location-badge.tsx does for the rest of the app.
const LOCATION_LABEL: Record<string, string> = {
  inside: "Inside outlet",
  outside: "Outside outlet",
  low_accuracy: "Low accuracy",
  denied: "Location denied",
  unavailable: "Unavailable",
  not_configured: "Not configured",
  not_recorded: "Not recorded",
};

export function locationStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return LOCATION_LABEL[status] ?? status;
}
