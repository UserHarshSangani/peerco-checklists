import { useState } from "react";
import { formatRupees } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { OrderDraftLine } from "./types";

type VendorTotal = { vendorName: string; count: number; value: number; missingCost: boolean };

function vendorTotals(lines: OrderDraftLine[], costByItemId: Record<string, number>): VendorTotal[] {
  const included = lines.filter((line) => line.include);
  const byVendor = new Map<string, VendorTotal>();
  for (const line of included) {
    const current = byVendor.get(line.vendor_name) ?? {
      vendorName: line.vendor_name,
      count: 0,
      value: 0,
      missingCost: false,
    };
    current.count += 1;
    const cost = line.item_id ? costByItemId[line.item_id] : undefined;
    if (cost == null) current.missingCost = true;
    else current.value += cost * line.order_qty;
    byVendor.set(line.vendor_name, current);
  }
  return Array.from(byVendor.values()).sort((a, b) => a.vendorName.localeCompare(b.vendorName));
}

export function ApproveDialog({
  lines,
  costByItemId,
  busy,
  onClose,
  onConfirm,
}: {
  lines: OrderDraftLine[];
  costByItemId: Record<string, number>;
  busy: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const totals = vendorTotals(lines, costByItemId);
  const totalItems = totals.reduce((sum, v) => sum + v.count, 0);

  return (
    <Modal title="Approve this order?" onClose={onClose}>
      <p className="mb-3 text-sm text-text">
        {totalItems} item{totalItems === 1 ? "" : "s"} across {totals.length} vendor{totals.length === 1 ? "" : "s"}
        . Once approved, quantities can no longer be edited.
      </p>

      <div className="mb-4 flex flex-col gap-2 rounded-2xl bg-bg p-3 ring-1 ring-border">
        {totals.map((vendor) => (
          <div key={vendor.vendorName} className="flex items-center justify-between text-sm">
            <span className="text-text">
              {vendor.vendorName} <span className="text-muted">· {vendor.count} item{vendor.count === 1 ? "" : "s"}</span>
            </span>
            <span className="font-medium text-text">
              {vendor.missingCost ? `${formatRupees(vendor.value)}+` : formatRupees(vendor.value)}
            </span>
          </div>
        ))}
      </div>

      <label className="mb-6 block text-sm font-medium text-muted">
        Notes (optional)
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-base text-text focus:border-accent focus:outline-none"
        />
      </label>

      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onClose} className="flex-1" disabled={busy}>
          Cancel
        </Button>
        <Button type="button" loading={busy} onClick={() => onConfirm(notes.trim())} className="flex-1">
          Approve order
        </Button>
      </div>
    </Modal>
  );
}
