import { formatQuantity } from "@/lib/format";
import { formatDateLabel } from "@/lib/date";
import type { OrderDraftLine } from "./types";

// order_qty is always stored in the item's base/count unit (that's what
// generate_order_draft computes: suggested_units * order_unit_size). When
// the item has a distinct order_unit with a pack size > 1 (e.g. a 25kg sack
// of rice), showing the raw base-unit number next to that unit's name would
// be wrong — "50 sack" instead of "2 sack" — so the order-unit-denominated
// quantity is order_qty / order_unit_size, not order_qty itself.
export function orderDisplayUnit(line: OrderDraftLine): string {
  return line.order_unit || line.unit;
}

export function orderDisplayQty(line: OrderDraftLine): number {
  if (line.order_unit && line.order_unit_size > 0) {
    return line.order_qty / line.order_unit_size;
  }
  return line.order_qty;
}

// Inverse of orderDisplayQty — converts a quantity typed in the displayed
// (order-unit) terms back to the base-unit value order_qty stores.
export function orderQtyFromDisplay(line: OrderDraftLine, displayQty: number): number {
  if (line.order_unit && line.order_unit_size > 0) {
    return displayQty * line.order_unit_size;
  }
  return displayQty;
}

function currentStockText(line: OrderDraftLine): string {
  if (line.current_stock == null) return "no recent count";
  return `${formatQuantity(line.current_stock)} ${line.unit}`;
}

export function buildVendorOrderText(
  outletName: string,
  businessDate: string,
  lines: OrderDraftLine[],
): string {
  const included = lines.filter((line) => line.include);
  const header = `Order for ${outletName} - ${formatDateLabel(businessDate)}`;
  const body = included.map(
    (line) =>
      `${line.item_name}: ${formatQuantity(orderDisplayQty(line))} ${orderDisplayUnit(line)} (currently ${currentStockText(line)})`,
  );
  return [header, ...body].join("\n");
}

export function buildWhatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
