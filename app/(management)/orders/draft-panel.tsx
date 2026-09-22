"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayInKolkata, formatDateLabel } from "@/lib/date";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SummaryBar } from "./summary-bar";
import { VendorGroup } from "./vendor-group";
import { RegenerateDialog } from "./regenerate-dialog";
import { ApproveDialog } from "./approve-dialog";
import { DismissDialog } from "./dismiss-dialog";
import { NO_VENDOR_LABEL } from "./types";
import type { OrderDraft, OrderDraftLine } from "./types";

function reasonMessage(reason: string): string {
  switch (reason) {
    case "not_allowed":
      return "You don't have permission to do that.";
    case "bad_date":
      return "Choose today or yesterday.";
    case "not_draft":
      return "This draft has already been resolved.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export function DraftPanel({
  outletId,
  outletName,
  date,
}: {
  outletId: string;
  outletName: string;
  date: string;
}) {
  const { showSuccess, showError } = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [lines, setLines] = useState<OrderDraftLine[]>([]);
  const [costByItemId, setCostByItemId] = useState<Record<string, number>>({});
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [showDismiss, setShowDismiss] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data: draftRow, error: draftError } = await supabase
        .from("order_drafts")
        .select("*")
        .eq("outlet_id", outletId)
        .eq("business_date", date)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (draftError) {
        setLoading(false);
        showError(draftError.message);
        return;
      }

      // The latest draft for this day is "current" unless it was dismissed
      // — a dismissed draft is history only, so we treat this as "no open
      // draft" (a fresh Generate creates a new, separate one).
      const current = draftRow && draftRow.status !== "dismissed" ? (draftRow as OrderDraft) : null;
      setDraft(current);

      if (!current) {
        setLines([]);
        setCostByItemId({});
        setLoading(false);
        return;
      }

      const { data: lineRows, error: lineError } = await supabase
        .from("order_draft_lines")
        .select("*")
        .eq("draft_id", current.id);

      if (cancelled) return;
      if (lineError) {
        setLoading(false);
        showError(lineError.message);
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
      setLines(allLines);
      setCostByItemId(costMap);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, outletId, date, refreshToken, showError]);

  async function generate() {
    setGenerating(true);
    const { data, error } = await supabase.rpc("generate_order_draft", {
      p_outlet_id: outletId,
      p_business_date: date,
    });
    setGenerating(false);
    if (error || !data?.ok) {
      showError(reasonMessage(error ? error.message : data.reason));
      return;
    }
    setRefreshToken((n) => n + 1);
  }

  async function regenerate() {
    setBusy(true);
    const { data, error } = await supabase.rpc("generate_order_draft", {
      p_outlet_id: outletId,
      p_business_date: date,
    });
    setBusy(false);
    setShowRegenerate(false);
    if (error || !data?.ok) {
      showError(reasonMessage(error ? error.message : data.reason));
      return;
    }
    showSuccess("Draft regenerated.");
    setRefreshToken((n) => n + 1);
  }

  async function approve(notes: string) {
    if (!draft) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("approve_order_draft", {
      p_draft_id: draft.id,
      p_notes: notes || null,
    });
    setBusy(false);
    setShowApprove(false);
    if (error || !data?.ok) {
      showError(reasonMessage(error ? error.message : data.reason));
      return;
    }
    showSuccess("Order approved.");
    setRefreshToken((n) => n + 1);
  }

  async function dismiss(reason: string) {
    if (!draft) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("dismiss_order_draft", {
      p_draft_id: draft.id,
      p_reason: reason || null,
    });
    setBusy(false);
    setShowDismiss(false);
    if (error || !data?.ok) {
      showError(reasonMessage(error ? error.message : data.reason));
      return;
    }
    showSuccess("Draft dismissed.");
    setRefreshToken((n) => n + 1);
  }

  function handleLineSaved(lineId: string, patch: Partial<OrderDraftLine>) {
    setLines((prev) => prev.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  }

  if (loading) return <SkeletonList rows={4} rowClassName="h-24" />;

  if (!draft) {
    return (
      <EmptyState
        title="No draft yet for this day"
        description="Looks at current stock, par levels and recent usage to suggest what to order."
        action={
          <Button type="button" loading={generating} onClick={generate}>
            Generate order draft
          </Button>
        }
      />
    );
  }

  const editable = draft.status === "draft";
  const includedCount = lines.filter((line) => line.include).length;
  const isToday = date === todayInKolkata();
  const noVendorsAtAll = lines.length > 0 && lines.every((line) => line.vendor_id === null);

  const vendorNames = Array.from(new Set(lines.map((line) => line.vendor_name))).sort((a, b) => {
    if (a === NO_VENDOR_LABEL) return 1;
    if (b === NO_VENDOR_LABEL) return -1;
    return a.localeCompare(b);
  });

  return (
    <div>
      {draft.status === "approved" && (
        <Card className="mb-6 bg-success-bg">
          <p className="text-sm font-medium text-success-fg">
            Approved by {draft.approved_by_name ?? "someone"} on{" "}
            {draft.approved_at ? formatDateLabel(draft.approved_at.slice(0, 10)) : "—"}
          </p>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-serif text-lg font-bold text-text">{formatDateLabel(date)}</h3>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setShowRegenerate(true)}>
              Regenerate
            </Button>
          )}
          {editable && (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setShowDismiss(true)}>
              Dismiss
            </Button>
          )}
          {editable && (
            <span title={includedCount === 0 ? "Include at least one item first" : undefined}>
              <Button type="button" disabled={busy || includedCount === 0} onClick={() => setShowApprove(true)}>
                Approve order
              </Button>
            </span>
          )}
          {draft.status === "approved" && (
            <Button type="button" variant="secondary" loading={generating} onClick={generate}>
              Start a new draft for {isToday ? "today" : "yesterday"}
            </Button>
          )}
        </div>
      </div>

      <SummaryBar lines={lines} costByItemId={costByItemId} />

      {lines.length === 0 ? (
        <EmptyState title="No items to order" description="Every stocked item at this outlet is fully covered." />
      ) : (
        <div className="flex flex-col gap-4">
          {noVendorsAtAll && <p className="text-sm text-muted">No vendors assigned to any item yet.</p>}
          {vendorNames.map((vendorName) => (
            <VendorGroup
              key={vendorName}
              vendorName={vendorName}
              lines={lines.filter((line) => line.vendor_name === vendorName)}
              editable={editable}
              outletName={outletName}
              businessDate={date}
              onLineSaved={handleLineSaved}
            />
          ))}
        </div>
      )}

      {showRegenerate && (
        <RegenerateDialog busy={busy} onClose={() => setShowRegenerate(false)} onConfirm={regenerate} />
      )}
      {showApprove && (
        <ApproveDialog
          lines={lines}
          costByItemId={costByItemId}
          busy={busy}
          onClose={() => setShowApprove(false)}
          onConfirm={approve}
        />
      )}
      {showDismiss && <DismissDialog busy={busy} onClose={() => setShowDismiss(false)} onConfirm={dismiss} />}
    </div>
  );
}
