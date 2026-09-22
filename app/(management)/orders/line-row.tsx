"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatQuantity, sanitizeDecimalInput } from "@/lib/format";
import { formatShortDateLabel } from "@/lib/date";
import { useToast } from "@/components/ui/toast";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { orderDisplayQty, orderDisplayUnit, orderQtyFromDisplay } from "./order-text";
import type { LineReason, OrderDraftLine } from "./types";

const REASON_PILL: Record<LineReason, { tone: PillTone; label: string }> = {
  shortage: { tone: "warning", label: "Reorder needed" },
  sufficient_stock: { tone: "success", label: "Stocked" },
  no_recent_count: { tone: "danger", label: "No recent count" },
  no_par_no_forecast: { tone: "neutral", label: "Set up par level" },
};

function forecastBadgeText(line: OrderDraftLine): string {
  if (line.forecast_basis === "same_weekday") return `Same weekday (${line.forecast_samples ?? 0})`;
  if (line.forecast_basis === "recent_days") return `Recent days (${line.forecast_samples ?? 0})`;
  return "No history";
}

export function LineRow({
  line,
  editable,
  onSaved,
}: {
  line: OrderDraftLine;
  editable: boolean;
  onSaved: (lineId: string, patch: Partial<OrderDraftLine>) => void;
}) {
  const { showError } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [qtyInput, setQtyInput] = useState(() => formatQuantity(orderDisplayQty(line)));
  const [noteInput, setNoteInput] = useState(line.note ?? "");
  const [saving, setSaving] = useState(false);

  const pill = REASON_PILL[line.reason];
  const needsCatalogLink =
    (line.reason === "no_recent_count" || line.reason === "no_par_no_forecast") && line.item_id;

  async function saveQty() {
    const displayQty = Number(qtyInput);
    if (!Number.isFinite(displayQty) || displayQty < 0) {
      showError("Enter a valid quantity.");
      setQtyInput(formatQuantity(orderDisplayQty(line)));
      return;
    }
    const nextOrderQty = orderQtyFromDisplay(line, displayQty);
    if (nextOrderQty === line.order_qty) return;

    setSaving(true);
    // p_include/p_note are left out entirely (not just null) so their SQL
    // defaults apply and this save touches only order_qty.
    const { data, error } = await supabase.rpc("update_order_draft_line", {
      p_line_id: line.id,
      p_order_qty: nextOrderQty,
    });
    setSaving(false);

    if (error || !data?.ok) {
      const reason = error ? error.message : data.reason;
      showError(reasonMessage(reason));
      setQtyInput(formatQuantity(orderDisplayQty(line)));
      return;
    }
    onSaved(line.id, { order_qty: nextOrderQty });
  }

  async function saveNote() {
    const trimmed = noteInput.trim();
    if (trimmed === (line.note ?? "")) return;

    setSaving(true);
    const { data, error } = await supabase.rpc("update_order_draft_line", {
      p_line_id: line.id,
      p_order_qty: line.order_qty,
      p_note: trimmed,
    });
    setSaving(false);

    if (error || !data?.ok) {
      const reason = error ? error.message : data.reason;
      showError(reasonMessage(reason));
      setNoteInput(line.note ?? "");
      return;
    }
    onSaved(line.id, { note: trimmed || null });
  }

  async function toggleInclude() {
    if (!editable) return;
    const next = !line.include;
    setSaving(true);
    const { data, error } = await supabase.rpc("update_order_draft_line", {
      p_line_id: line.id,
      p_order_qty: line.order_qty,
      p_include: next,
    });
    setSaving(false);

    if (error || !data?.ok) {
      showError(reasonMessage(error ? error.message : data.reason));
      return;
    }
    onSaved(line.id, { include: next });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-medium text-text">{line.item_name}</p>
          <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
          <StatusPill tone={line.forecast_basis ? "info" : "neutral"}>{forecastBadgeText(line)}</StatusPill>
        </div>
        {needsCatalogLink && (
          <Link
            href={`/catalog?tab=outlet-settings&item=${line.item_id}`}
            className="text-sm font-medium text-accent underline"
          >
            Fix in Catalog
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs font-medium text-muted">Current stock</p>
          {line.current_stock != null ? (
            <>
              <p className="text-text">
                {formatQuantity(line.current_stock)} {line.unit}
              </p>
              <p className="text-xs text-muted">
                as of {line.last_count_date ? formatShortDateLabel(line.last_count_date) : "—"}
              </p>
            </>
          ) : (
            <p className="font-medium text-danger">no recent count</p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-muted">Target</p>
          <p className="text-text">
            {line.target_qty != null ? `${formatQuantity(line.target_qty)} ${line.unit}` : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted">Suggested</p>
          <p className="text-text">
            {formatQuantity(line.suggested_qty)} {line.unit}
          </p>
          {line.suggested_units != null && line.order_unit && (
            <p className="text-xs text-muted">
              ({formatQuantity(line.suggested_units)} {line.order_unit})
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-muted">Order quantity</p>
          {editable ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                value={qtyInput}
                onChange={(event) => setQtyInput(sanitizeDecimalInput(event.target.value))}
                onBlur={saveQty}
                disabled={saving}
                className="w-20 rounded-lg border border-border bg-bg px-2 py-1.5 text-text focus:border-accent focus:outline-none disabled:opacity-50"
              />
              <span className="text-xs text-muted">{orderDisplayUnit(line)}</span>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-text">
              <Lock className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
              {formatQuantity(orderDisplayQty(line))} {orderDisplayUnit(line)}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={line.include}
            disabled={!editable || saving}
            onChange={toggleInclude}
            className="h-4 w-4 rounded border-border disabled:opacity-50"
          />
          Include in order
        </label>
        {editable ? (
          <input
            type="text"
            value={noteInput}
            onChange={(event) => setNoteInput(event.target.value)}
            onBlur={saveNote}
            disabled={saving}
            placeholder="Note (optional)"
            className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50"
          />
        ) : (
          line.note && <p className="text-sm text-muted">Note: {line.note}</p>
        )}
      </div>
    </div>
  );
}

function reasonMessage(reason: string): string {
  switch (reason) {
    case "not_editable":
      return "This draft is no longer editable.";
    case "bad_quantity":
      return "Enter a quantity between 0 and 1,000,000.";
    case "not_allowed":
      return "You don't have permission to edit this.";
    default:
      return "Couldn't save that change. Please try again.";
  }
}
