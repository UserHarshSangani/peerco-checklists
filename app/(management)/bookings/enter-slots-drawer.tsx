"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayInKolkata, addDaysToDateString } from "@/lib/date";
import { parsePastedTimes } from "@/lib/booking-time-parser";
import { Drawer } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ScreenshotUpload, isScreenshotUploaded, type ScreenshotState } from "./screenshot-upload";
import { ALERT_KIND_LABEL } from "./alert-message";
import type { AlertKind, BookingSource } from "./types";

type WindowRow = { name: string; from: string; to: string };

type SubmitResponse =
  | { ok: true; snapshot_id: string; slots: number; alerts: { opened: number; resolved: number; raised: AlertKind[] } }
  | { ok: false; reason: string };

function reasonMessage(reason: string): string {
  switch (reason) {
    case "not_found":
      return "This source no longer exists.";
    case "not_allowed":
      return "You don't have permission to record this.";
    case "inactive":
      return "This source is inactive. Activate it first, or record it anyway from Sources and hours.";
    case "bad_status":
      return "Choose a valid status.";
    case "bad_date":
      return "Choose a date from yesterday to 60 days ahead.";
    case "bad_request":
      return "Something went wrong. Please try again.";
    case "bad_slots":
      return "One or more times couldn't be understood. Fix them and try again.";
    case "invalid_screenshot":
      return "The screenshot didn't upload correctly. Please try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export function EnterSlotsDrawer({
  outletId,
  sources,
  defaultSourceId,
  onClose,
  onSubmitted,
}: {
  outletId: string;
  sources: BookingSource[];
  defaultSourceId?: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [sourceId, setSourceId] = useState(defaultSourceId ?? sources[0]?.id ?? "");
  const source = sources.find((s) => s.id === sourceId);
  const [date, setDate] = useState(() => todayInKolkata());
  const [partySize, setPartySize] = useState(String(source?.party_size ?? 2));
  const [rawTimes, setRawTimes] = useState("");
  const [windows, setWindows] = useState<WindowRow[]>([]);
  const [screenshot, setScreenshot] = useState<ScreenshotState | undefined>(undefined);
  const [status, setStatus] = useState<"ok" | "failed" | "blocked">("ok");
  const [errorNote, setErrorNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResponse | null>(null);

  const { parsed, unrecognized } = parsePastedTimes(rawTimes);

  function addWindow() {
    setWindows((prev) => [...prev, { name: "", from: "", to: "" }]);
  }
  function updateWindow(index: number, patch: Partial<WindowRow>) {
    setWindows((prev) => prev.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  }
  function removeWindow(index: number) {
    setWindows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!source) {
      setSubmitError("Choose a source.");
      return;
    }
    const partySizeNum = partySize.trim() ? Number(partySize) : undefined;
    setSubmitting(true);
    setSubmitError(null);
    const { data, error } = await supabase.rpc("submit_booking_snapshot", {
      p_source_id: source.id,
      p_target_date: date,
      p_slots: status === "ok" ? parsed : [],
      p_status: status,
      p_error: status === "ok" ? null : errorNote.trim() || null,
      p_window_labels: windows.length
        ? windows
            .filter((w) => w.from || w.to || w.name)
            .map((w) => ({ name: w.name.trim() || undefined, from: w.from || undefined, to: w.to || undefined }))
        : null,
      p_screenshot_path: isScreenshotUploaded(screenshot) ? screenshot.path : null,
      p_party_size: partySizeNum,
    });
    setSubmitting(false);
    if (error) {
      setSubmitError("Something went wrong. Please try again.");
      return;
    }
    const response = data as SubmitResponse;
    setResult(response);
    if (!response.ok) {
      setSubmitError(reasonMessage(response.reason));
      return;
    }
    onSubmitted();
  }

  if (result?.ok) {
    return (
      <Drawer onClose={onClose} panelClassName="safe-bottom max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-xl outline-none lg:mx-auto lg:mb-auto lg:mt-16 lg:rounded-3xl">
        <h3 className="mb-4 text-lg font-semibold text-text">Recorded</h3>
        <p className="mb-2 text-sm text-text">{result.slots} slot(s) saved.</p>
        {result.alerts.raised.length > 0 ? (
          <p className="mb-2 text-sm text-warning">
            Raised: {result.alerts.raised.map((kind) => ALERT_KIND_LABEL[kind]).join(", ")}
          </p>
        ) : (
          <p className="mb-2 text-sm text-success">No issues found.</p>
        )}
        {result.alerts.resolved > 0 && (
          <p className="mb-4 text-sm text-muted">
            {result.alerts.resolved} previous alert(s) resolved.
          </p>
        )}
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </Drawer>
    );
  }

  return (
    <Drawer onClose={onClose} panelClassName="safe-bottom max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-xl outline-none lg:mx-auto lg:mb-auto lg:mt-8 lg:rounded-3xl">
      <h3 className="mb-4 text-lg font-semibold text-text">Enter slots</h3>

      <label className="mb-1 block text-sm font-medium text-muted">Source</label>
      <select
        value={sourceId}
        onChange={(event) => setSourceId(event.target.value)}
        className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
      >
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label || s.platform}
          </option>
        ))}
      </select>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-muted">Date</label>
          <input
            type="date"
            value={date}
            min={addDaysToDateString(todayInKolkata(), -1)}
            max={addDaysToDateString(todayInKolkata(), 60)}
            onChange={(event) => setDate(event.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-muted">Party size</label>
          <input
            type="number"
            min="1"
            max="30"
            value={partySize}
            onChange={(event) => setPartySize(event.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <label className="mb-1 block text-sm font-medium text-muted">Status</label>
      <div className="mb-4 flex gap-2">
        {(["ok", "failed", "blocked"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={`min-h-[36px] rounded-full px-3 py-1.5 text-sm font-medium capitalize ${
              status === value ? "bg-accent text-accent-fg" : "bg-bg text-muted ring-1 ring-border"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {status === "ok" ? (
        <>
          <label className="mb-1 block text-sm font-medium text-muted">
            Paste times seen on the platform
          </label>
          <textarea
            value={rawTimes}
            onChange={(event) => setRawTimes(event.target.value)}
            rows={3}
            placeholder={"12:00 PM, 1:30 PM, 7.00 pm\n8:30 pm"}
            className="mb-2 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text placeholder:text-muted focus:border-accent focus:outline-none"
          />
          {parsed.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {parsed.map((time) => (
                <span
                  key={time}
                  className="rounded-full bg-success-bg px-2.5 py-1 text-xs font-semibold text-success-fg"
                >
                  {time}
                </span>
              ))}
            </div>
          )}
          {unrecognized.length > 0 && (
            <p className="mb-4 text-sm font-medium text-danger">
              Couldn&apos;t understand: {unrecognized.join(", ")}
            </p>
          )}

          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-muted">
                Platform windows (optional)
              </label>
              <button
                type="button"
                onClick={addWindow}
                className="text-sm font-medium text-accent underline"
              >
                Add window
              </button>
            </div>
            {windows.map((window, index) => (
              <div key={index} className="mb-2 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={window.name}
                  onChange={(event) => updateWindow(index, { name: event.target.value })}
                  placeholder="Name (e.g. Dinner)"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
                />
                <input
                  type="time"
                  value={window.from}
                  onChange={(event) => updateWindow(index, { from: event.target.value })}
                  className="rounded-lg border border-border bg-bg px-2 py-2 text-sm text-text focus:border-accent focus:outline-none"
                />
                <span className="text-xs text-muted">to</span>
                <input
                  type="time"
                  value={window.to}
                  onChange={(event) => updateWindow(index, { to: event.target.value })}
                  className="rounded-lg border border-border bg-bg px-2 py-2 text-sm text-text focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeWindow(index)}
                  className="text-sm font-medium text-danger"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-muted">
            What happened? (optional)
          </label>
          <input
            type="text"
            value={errorNote}
            onChange={(event) => setErrorNote(event.target.value)}
            placeholder="e.g. Page wouldn't load"
            className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
      )}

      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-muted">
          Screenshot (optional)
        </label>
        <ScreenshotUpload outletId={outletId} state={screenshot} onChange={setScreenshot} />
      </div>

      {submitError && (
        <p className="mb-4 text-sm font-medium text-danger">{submitError}</p>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!source}
          loading={submitting}
          onClick={handleSubmit}
          className="flex-1"
        >
          Save
        </Button>
      </div>
    </Drawer>
  );
}
