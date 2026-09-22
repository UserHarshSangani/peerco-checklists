import { formatRupees } from "@/lib/format";
import { Card } from "@/components/ui/card";
import type { OrderDraftLine } from "./types";

export function SummaryBar({
  lines,
  costByItemId,
}: {
  lines: OrderDraftLine[];
  costByItemId: Record<string, number>;
}) {
  const shortages = lines.filter((line) => line.reason === "shortage").length;
  const noVendor = lines.filter((line) => line.vendor_id === null).length;
  const needsSetup = lines.filter(
    (line) => line.reason === "no_recent_count" || line.reason === "no_par_no_forecast",
  ).length;

  let totalValue = 0;
  let anyMissingCost = false;
  for (const line of lines) {
    if (!line.include) continue;
    const cost = line.item_id ? costByItemId[line.item_id] : undefined;
    if (cost == null) {
      anyMissingCost = true;
      continue;
    }
    // cost_per_unit is priced per base/count unit, and order_qty is always
    // stored in that same base unit (see order-text.ts), so no conversion
    // is needed here even though the line's editable input shows a
    // different, order-unit-denominated number.
    totalValue += cost * line.order_qty;
  }

  const stats: { label: string; value: string; tone?: string }[] = [
    { label: "Shortages", value: String(shortages), tone: shortages > 0 ? "text-warning" : "text-text" },
    { label: "No vendor assigned", value: String(noVendor), tone: noVendor > 0 ? "text-danger" : "text-text" },
    { label: "Needs setup", value: String(needsSetup), tone: needsSetup > 0 ? "text-danger" : "text-text" },
    { label: "Estimated order value", value: formatRupees(totalValue) },
  ];

  return (
    <Card className="mb-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className={`font-serif text-2xl font-bold ${stat.tone ?? "text-text"}`}>{stat.value}</p>
            <p className="text-xs font-medium text-muted">{stat.label}</p>
          </div>
        ))}
      </div>
      {anyMissingCost && (
        <p className="mt-3 text-xs text-muted">Some items are missing a cost — the total above excludes them.</p>
      )}
    </Card>
  );
}
