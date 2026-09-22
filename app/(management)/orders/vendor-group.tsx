"use client";

import { Copy, MessageCircle, Truck } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { SectionCard } from "@/components/ui/section-card";
import { LineRow } from "./line-row";
import { buildVendorOrderText, buildWhatsAppShareUrl } from "./order-text";
import { REASON_SORT_ORDER, type OrderDraftLine } from "./types";

export function VendorGroup({
  vendorName,
  lines,
  editable,
  outletName,
  businessDate,
  onLineSaved,
}: {
  vendorName: string;
  lines: OrderDraftLine[];
  editable: boolean;
  outletName: string;
  businessDate: string;
  onLineSaved: (lineId: string, patch: Partial<OrderDraftLine>) => void;
}) {
  const { showSuccess, showError } = useToast();

  const sorted = [...lines].sort((a, b) => {
    const reasonDiff = REASON_SORT_ORDER[a.reason] - REASON_SORT_ORDER[b.reason];
    if (reasonDiff !== 0) return reasonDiff;
    return a.item_name.localeCompare(b.item_name);
  });
  const includedCount = lines.filter((line) => line.include).length;
  const text = buildVendorOrderText(outletName, businessDate, lines);

  async function copyList() {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess("Order list copied.");
    } catch {
      showError("Couldn't copy to the clipboard.");
    }
  }

  return (
    <SectionCard
      icon={<Truck className="h-4 w-4" />}
      title={vendorName}
      done={includedCount}
      total={lines.length}
      defaultOpen
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyList}
          className="flex min-h-[36px] items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-sm font-medium text-text ring-1 ring-border"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copy list for this vendor
        </button>
        <a
          href={buildWhatsAppShareUrl(text)}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-[36px] items-center gap-1.5 rounded-full bg-success-bg px-3 py-1.5 text-sm font-medium text-success-fg"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Share on WhatsApp
        </a>
      </div>

      <div className="rounded-2xl bg-bg ring-1 ring-border">
        {sorted.map((line) => (
          <LineRow key={line.id} line={line} editable={editable} onSaved={onLineSaved} />
        ))}
      </div>
    </SectionCard>
  );
}
