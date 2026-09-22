"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateLabel } from "@/lib/date";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { SummaryBar } from "./summary-bar";
import { VendorGroup } from "./vendor-group";
import type { OrderDraft, OrderDraftLine } from "./types";

export function HistoryDetailModal({
  draftId,
  outletName,
  onClose,
}: {
  draftId: string;
  outletName: string;
  onClose: () => void;
}) {
  const { showError } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [lines, setLines] = useState<OrderDraftLine[]>([]);
  const [costByItemId, setCostByItemId] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [{ data: draftRow, error: draftError }, { data: lineRows, error: lineError }] = await Promise.all([
        supabase.from("order_drafts").select("*").eq("id", draftId).single(),
        supabase.from("order_draft_lines").select("*").eq("draft_id", draftId),
      ]);

      if (cancelled) return;
      if (draftError || lineError) {
        setLoading(false);
        showError((draftError ?? lineError)!.message);
        return;
      }

      const allLines = (lineRows ?? []) as OrderDraftLine[];
      const itemIds = Array.from(
        new Set(allLines.map((line) => line.item_id).filter((id): id is string => !!id)),
      );
      let costMap: Record<string, number> = {};
      if (itemIds.length > 0) {
        const { data: items } = await supabase
          .from("inventory_items")
          .select("id, cost_per_unit")
          .in("id", itemIds);
        costMap = Object.fromEntries(
          (items ?? [])
            .filter((item) => item.cost_per_unit != null)
            .map((item) => [item.id, item.cost_per_unit as number]),
        );
      }

      if (cancelled) return;
      setDraft(draftRow as OrderDraft);
      setLines(allLines);
      setCostByItemId(costMap);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, draftId, showError]);

  const vendorNames = Array.from(new Set(lines.map((line) => line.vendor_name))).sort();

  return (
    <Modal
      onClose={onClose}
      panelClassName="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-surface p-6 shadow-xl outline-none"
    >
      {loading || !draft ? (
        <SkeletonList rows={4} rowClassName="h-16" />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-serif text-lg font-bold text-text">{formatDateLabel(draft.business_date)}</h3>
              {draft.status === "approved" && draft.approved_by_name && (
                <p className="text-sm text-muted">
                  Approved by {draft.approved_by_name}
                  {draft.approved_at ? ` on ${formatDateLabel(draft.approved_at.slice(0, 10))}` : ""}
                </p>
              )}
              {draft.status === "dismissed" && draft.notes && (
                <p className="text-sm text-muted">Reason: {draft.notes}</p>
              )}
            </div>
            <StatusPill tone={draft.status === "approved" ? "success" : "neutral"}>
              {draft.status === "approved" ? "Approved" : "Dismissed"}
            </StatusPill>
          </div>

          <SummaryBar lines={lines} costByItemId={costByItemId} />

          <div className="flex flex-col gap-4">
            {vendorNames.map((vendorName) => (
              <VendorGroup
                key={vendorName}
                vendorName={vendorName}
                lines={lines.filter((line) => line.vendor_name === vendorName)}
                editable={false}
                outletName={outletName}
                businessDate={draft.business_date}
                onLineSaved={() => undefined}
              />
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
