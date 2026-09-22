"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateLabel } from "@/lib/date";
import { useToast } from "@/components/ui/toast";
import { StatusPill } from "@/components/ui/status-pill";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { HistoryDetailModal } from "./history-detail-modal";
import type { OrderDraft } from "./types";

type DraftWithCounts = OrderDraft & { lineCount: number; includedCount: number };

export function HistoryPanel({ outletId, outletName }: { outletId: string; outletName: string }) {
  const { showError } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [drafts, setDrafts] = useState<DraftWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDraftId, setOpenDraftId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data: draftRows, error: draftError } = await supabase
        .from("order_drafts")
        .select("*")
        .eq("outlet_id", outletId)
        .in("status", ["approved", "dismissed"])
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (draftError) {
        setLoading(false);
        showError(draftError.message);
        return;
      }

      const draftRowsList = (draftRows ?? []) as OrderDraft[];
      const draftIds = draftRowsList.map((row) => row.id);
      let counts: Record<string, { total: number; included: number }> = {};
      if (draftIds.length > 0) {
        const { data: lineRows } = await supabase
          .from("order_draft_lines")
          .select("draft_id, include")
          .in("draft_id", draftIds);
        counts = {};
        for (const row of lineRows ?? []) {
          const current = counts[row.draft_id] ?? { total: 0, included: 0 };
          current.total += 1;
          if (row.include) current.included += 1;
          counts[row.draft_id] = current;
        }
      }

      if (cancelled) return;
      setDrafts(
        draftRowsList.map((row) => ({
          ...row,
          lineCount: counts[row.id]?.total ?? 0,
          includedCount: counts[row.id]?.included ?? 0,
        })),
      );
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, outletId, showError]);

  if (loading) return <SkeletonList rows={4} rowClassName="h-20" />;
  if (drafts.length === 0) {
    return <EmptyState title="No past orders yet" description="Approved and dismissed drafts will show up here." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {drafts.map((draft) => (
        <button
          key={draft.id}
          type="button"
          onClick={() => setOpenDraftId(draft.id)}
          className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-4 text-left shadow-sm ring-1 ring-border transition hover:bg-border/10"
        >
          <div>
            <p className="text-base font-medium text-text">{formatDateLabel(draft.business_date)}</p>
            <p className="text-sm text-muted">
              {draft.lineCount} line{draft.lineCount === 1 ? "" : "s"} · {draft.includedCount} item
              {draft.includedCount === 1 ? "" : "s"} ordered
            </p>
            {draft.status === "approved" && draft.approved_by_name && (
              <p className="text-xs text-muted">
                Approved by {draft.approved_by_name}
                {draft.approved_at ? ` on ${formatDateLabel(draft.approved_at.slice(0, 10))}` : ""}
              </p>
            )}
          </div>
          <StatusPill tone={draft.status === "approved" ? "success" : "neutral"}>
            {draft.status === "approved" ? "Approved" : "Dismissed"}
          </StatusPill>
        </button>
      ))}

      {openDraftId && (
        <HistoryDetailModal draftId={openDraftId} outletName={outletName} onClose={() => setOpenDraftId(null)} />
      )}
    </div>
  );
}
