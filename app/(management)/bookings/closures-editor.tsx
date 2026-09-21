"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateLabel, todayInKolkata } from "@/lib/date";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { OutletClosure } from "./types";

export function ClosuresEditor({ outletId }: { outletId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { showError, showSuccess } = useToast();
  const [loading, setLoading] = useState(true);
  const [closures, setClosures] = useState<OutletClosure[]>([]);
  const [dateFrom, setDateFrom] = useState(() => todayInKolkata());
  const [dateTo, setDateTo] = useState(() => todayInKolkata());
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("outlet_closures")
        .select("*")
        .eq("outlet_id", outletId)
        .order("date_from", { ascending: false });
      if (cancelled) return;
      setClosures((data as OutletClosure[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, outletId]);

  async function addClosure() {
    if (dateFrom > dateTo) {
      showError("Start date must be on or before end date.");
      return;
    }
    setAdding(true);
    const { data, error } = await supabase
      .from("outlet_closures")
      .insert({ outlet_id: outletId, date_from: dateFrom, date_to: dateTo, reason: reason.trim() || null })
      .select()
      .single();
    setAdding(false);
    if (error || !data) {
      showError("Couldn't add closure. Please try again.");
      return;
    }
    setClosures((prev) => [data as OutletClosure, ...prev]);
    setReason("");
    showSuccess("Closure added.");
  }

  async function removeClosure(id: string) {
    const { error } = await supabase.from("outlet_closures").delete().eq("id", id);
    if (error) {
      showError("Couldn't remove closure. Please try again.");
      return;
    }
    setClosures((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <h3 className="mb-4 font-serif text-lg font-semibold text-text">Closures</h3>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="min-h-[40px] rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          To
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="min-h-[40px] rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs font-medium text-muted">
          Reason
          <input
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Diwali"
            className="min-h-[40px] rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </label>
        <Button type="button" variant="secondary" loading={adding} onClick={addClosure}>
          Add
        </Button>
      </div>

      {loading ? (
        <SkeletonList rows={2} rowClassName="h-12" />
      ) : closures.length === 0 ? (
        <EmptyState title="No closures" description="Add a date range for holidays or planned closures." />
      ) : (
        <div className="flex flex-col gap-2">
          {closures.map((closure) => (
            <div
              key={closure.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-text">
                  {formatDateLabel(closure.date_from)}
                  {closure.date_from !== closure.date_to ? ` – ${formatDateLabel(closure.date_to)}` : ""}
                </p>
                {closure.reason && <p className="text-xs text-muted">{closure.reason}</p>}
              </div>
              <button
                type="button"
                onClick={() => removeClosure(closure.id)}
                aria-label="Remove closure"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-danger hover:bg-danger-bg"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
