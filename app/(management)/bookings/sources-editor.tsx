"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/date";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { PLATFORM_LABEL } from "./types";
import type { BookingPlatform, BookingSource } from "./types";

const PLATFORMS: BookingPlatform[] = ["zomato", "swiggy", "eazydiner", "google", "website", "other"];

type FormState = {
  platform: BookingPlatform;
  label: string;
  url: string;
  method: "auto" | "manual";
  party_size: string;
  days_ahead: string;
  check_every_hours: string;
  active: boolean;
};

function toFormState(source?: BookingSource): FormState {
  return {
    platform: source?.platform ?? "zomato",
    label: source?.label ?? "",
    url: source?.url ?? "",
    method: source?.method ?? "manual",
    party_size: String(source?.party_size ?? 2),
    days_ahead: String(source?.days_ahead ?? 7),
    check_every_hours: String(source?.check_every_hours ?? 3),
    active: source?.active ?? true,
  };
}

export function SourcesEditor({
  outletId,
  sources,
  onChange,
}: {
  outletId: string;
  sources: BookingSource[];
  onChange: (sources: BookingSource[]) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { showError, showSuccess } = useToast();
  const [editing, setEditing] = useState<BookingSource | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(toFormState());
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setForm(toFormState());
    setAdding(true);
  }

  function openEdit(source: BookingSource) {
    setForm(toFormState(source));
    setEditing(source);
  }

  function close() {
    setAdding(false);
    setEditing(null);
  }

  async function save() {
    if (!form.url.trim()) {
      showError("A link is required.");
      return;
    }
    const partySize = Number(form.party_size);
    const daysAhead = Number(form.days_ahead);
    const checkEvery = Number(form.check_every_hours);
    if (!Number.isFinite(partySize) || partySize < 1 || partySize > 30) {
      showError("Party size must be between 1 and 30.");
      return;
    }
    if (!Number.isFinite(daysAhead) || daysAhead < 1 || daysAhead > 30) {
      showError("Days ahead must be between 1 and 30.");
      return;
    }
    if (!Number.isFinite(checkEvery) || checkEvery < 1 || checkEvery > 48) {
      showError("Check-every must be between 1 and 48 hours.");
      return;
    }

    setSaving(true);
    const payload = {
      outlet_id: outletId,
      platform: form.platform,
      label: form.label.trim() || null,
      url: form.url.trim(),
      method: form.method,
      party_size: partySize,
      days_ahead: daysAhead,
      check_every_hours: checkEvery,
      active: form.active,
    };

    if (editing) {
      const { data, error } = await supabase
        .from("booking_sources")
        .update(payload)
        .eq("id", editing.id)
        .select()
        .single();
      setSaving(false);
      if (error || !data) {
        showError(
          error?.code === "23505"
            ? "This outlet already has a source for that platform."
            : "Couldn't save. Please try again.",
        );
        return;
      }
      onChange(sources.map((s) => (s.id === editing.id ? (data as BookingSource) : s)));
      showSuccess("Source updated.");
    } else {
      const { data, error } = await supabase.from("booking_sources").insert(payload).select().single();
      setSaving(false);
      if (error || !data) {
        showError(
          error?.code === "23505"
            ? "This outlet already has a source for that platform."
            : "Couldn't save. Please try again.",
        );
        return;
      }
      onChange([...sources, data as BookingSource]);
      showSuccess("Source added.");
    }
    close();
  }

  async function remove(source: BookingSource) {
    const { error } = await supabase.from("booking_sources").delete().eq("id", source.id);
    if (error) {
      showError("Couldn't remove source. Please try again.");
      return;
    }
    onChange(sources.filter((s) => s.id !== source.id));
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-lg font-semibold text-text">Booking sources</h3>
        <Button type="button" variant="secondary" onClick={openAdd}>
          Add source
        </Button>
      </div>

      {sources.length === 0 ? (
        <EmptyState title="No sources yet" description="Add a platform to start tracking its booking slots." />
      ) : (
        <div className="flex flex-col gap-2">
          {sources.map((source) => (
            <div key={source.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-text">
                    {PLATFORM_LABEL[source.platform]}
                    {source.label ? ` — ${source.label}` : ""}
                  </p>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-accent underline"
                  >
                    {source.url}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={source.active ? "success" : "neutral"}>
                    {source.active ? "Active" : "Inactive"}
                  </StatusPill>
                  <button
                    type="button"
                    onClick={() => openEdit(source)}
                    aria-label="Edit source"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-border/30"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(source)}
                    aria-label="Delete source"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-danger hover:bg-danger-bg"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">
                Method {source.method} · Party {source.party_size} · {source.days_ahead} days ahead · every{" "}
                {source.check_every_hours}h
                {source.last_checked_at ? ` · last checked ${formatRelativeTime(source.last_checked_at)}` : ""}
                {source.last_status === "failed" || source.last_status === "blocked"
                  ? ` · ${source.last_status}${source.last_error ? `: ${source.last_error}` : ""}`
                  : ""}
              </p>
            </div>
          ))}
        </div>
      )}

      {(adding || editing) && (
        <Modal title={editing ? "Edit source" : "Add source"} onClose={close}>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-muted">
              Platform
              <select
                value={form.platform}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, platform: event.target.value as BookingPlatform }))
                }
                className="min-h-[44px] rounded-lg border border-border bg-bg px-3 py-2 text-base text-text focus:border-accent focus:outline-none"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>

            {form.platform === "zomato" && (
              <p className="rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning-fg">
                Automated access is disallowed by the site. Use manual entry.
              </p>
            )}

            <label className="flex flex-col gap-1 text-sm font-medium text-muted">
              Label (optional)
              <input
                type="text"
                value={form.label}
                onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
                className="min-h-[44px] rounded-lg border border-border bg-bg px-3 py-2 text-base text-text focus:border-accent focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-muted">
              Link
              <input
                type="url"
                value={form.url}
                onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
                placeholder="https://…"
                className="min-h-[44px] rounded-lg border border-border bg-bg px-3 py-2 text-base text-text focus:border-accent focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-muted">
              Method
              <select
                value={form.method}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, method: event.target.value as "auto" | "manual" }))
                }
                className="min-h-[44px] rounded-lg border border-border bg-bg px-3 py-2 text-base text-text focus:border-accent focus:outline-none"
              >
                <option value="manual">Manual</option>
                <option value="auto">Auto</option>
              </select>
            </label>

            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Party size
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={form.party_size}
                  onChange={(event) => setForm((prev) => ({ ...prev, party_size: event.target.value }))}
                  className="min-h-[40px] rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Days ahead
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={form.days_ahead}
                  onChange={(event) => setForm((prev) => ({ ...prev, days_ahead: event.target.value }))}
                  className="min-h-[40px] rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Check every (h)
                <input
                  type="number"
                  min="1"
                  max="48"
                  value={form.check_every_hours}
                  onChange={(event) => setForm((prev) => ({ ...prev, check_every_hours: event.target.value }))}
                  className="min-h-[40px] rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-muted">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                className="h-4 w-4"
              />
              Active
            </label>

            <div className="mt-2 flex gap-3">
              <Button type="button" variant="secondary" onClick={close} className="flex-1">
                Cancel
              </Button>
              <Button type="button" loading={saving} onClick={save} className="flex-1">
                Save
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
