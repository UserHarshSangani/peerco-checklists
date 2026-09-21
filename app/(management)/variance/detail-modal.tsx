"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateLabel } from "@/lib/date";
import { formatQuantity, formatRupees } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ACK_REASONS, ACK_REASON_LABEL } from "./reasons";
import type { VarianceRow } from "./types";

function line(label: string, value: string) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-medium text-text">{value}</span>
    </div>
  );
}

export function DetailModal({
  row,
  onClose,
  onAcknowledged,
}: {
  row: VarianceRow;
  onClose: () => void;
  onAcknowledged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qty = (value: number | null) =>
    value != null ? `${formatQuantity(value)} ${row.unit}` : "—";

  const openingLabel =
    row.opening_source === "opening_count"
      ? "Opening (counted)"
      : row.opening_source === "previous_closing"
        ? "Opening (from yesterday's closing)"
        : "Opening";

  const showSoldZeroHint = row.status === "shortage" && row.sold_usage_qty === 0;

  async function handleAcknowledge() {
    if (!reason) {
      setError("Choose a reason.");
      return;
    }
    if (reason === "other" && !note.trim()) {
      setError("A note is required for \"Other\".");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("acknowledge_variance", {
      p_result_id: row.id,
      p_reason: reason,
      p_note: note.trim() || null,
    });
    setSubmitting(false);
    if (rpcError) {
      setError("Something went wrong. Please try again.");
      return;
    }
    const result = data as { ok: boolean; reason?: string };
    if (!result.ok) {
      setError(
        result.reason === "note_required"
          ? "A note is required for \"Other\"."
          : result.reason === "bad_reason"
            ? "Choose a valid reason."
            : "Something went wrong. Please try again.",
      );
      return;
    }
    onAcknowledged();
  }

  return (
    <Modal onClose={onClose} title={`${row.item_name} — ${formatDateLabel(row.business_date)}`}>
      <div className="divide-y divide-border">
        {line(openingLabel, qty(row.opening_qty))}
        {line("+ Received", qty(row.received_qty))}
        {line("- Closing", qty(row.closing_qty))}
        {line("= Actual usage", qty(row.actual_usage_qty))}
      </div>

      <div className="mt-4 divide-y divide-border">
        {line("Sold (from recipes)", qty(row.sold_usage_qty))}
        {line("+ Logged wastage", qty(row.wastage_qty))}
        {line(
          "= Expected usage",
          qty(
            row.sold_usage_qty != null && row.wastage_qty != null
              ? row.sold_usage_qty + row.wastage_qty
              : null,
          ),
        )}
      </div>

      <div className="mt-4 divide-y divide-border">
        {line("Variance (actual − expected)", qty(row.variance_qty))}
        {line("Tolerance", qty(row.tolerance_qty))}
        {line(
          "Cost/unit",
          row.cost_per_unit != null ? formatRupees(row.cost_per_unit) : "—",
        )}
        {line(
          "Variance value",
          row.variance_value != null ? formatRupees(row.variance_value) : "—",
        )}
        {row.overnight_gap_qty != null && row.overnight_gap_qty !== 0 &&
          line("Overnight gap", qty(row.overnight_gap_qty))}
      </div>

      {showSoldZeroHint && (
        <p className="mt-4 text-sm font-medium text-warning">
          Check that this dish is mapped and its recipe is complete.
        </p>
      )}

      {row.ack_status === "acknowledged" && (
        <p className="mt-4 rounded-2xl bg-accent/10 p-4 text-sm text-text">
          Acknowledged by {row.ack_by_name ?? "someone"} on{" "}
          {row.ack_at ? formatDateLabel(row.ack_at.slice(0, 10)) : "—"}:{" "}
          {ACK_REASON_LABEL[row.ack_reason ?? ""] ?? row.ack_reason}
          {row.ack_note && ` — ${row.ack_note}`}
        </p>
      )}

      {row.ack_status === "open" && (
        <div className="mt-4 rounded-2xl bg-bg p-4">
          <p className="mb-2 text-sm font-semibold text-text">Acknowledge</p>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mb-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          >
            <option value="">Choose a reason…</option>
            {ACK_REASONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder={reason === "other" ? "Note (required)" : "Note (optional)"}
            className="mb-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
          />
          {error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}
          <Button type="button" loading={submitting} onClick={handleAcknowledge}>
            Submit
          </Button>
        </div>
      )}
    </Modal>
  );
}
