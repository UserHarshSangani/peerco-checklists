"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import type { OutletHourRow } from "./types";

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type ShiftForm = { open: string; close: string; last: string };
type DayForm = { closed: boolean; shift1: ShiftForm; shift2: ShiftForm | null };

const EMPTY_SHIFT: ShiftForm = { open: "", close: "", last: "" };
const DEFAULT_DAY: DayForm = { closed: false, shift1: { ...EMPTY_SHIFT }, shift2: null };

function timeToInput(value: string | null): string {
  return value ? value.slice(0, 5) : "";
}

function rowsToForm(rows: OutletHourRow[]): Record<number, DayForm> {
  const form: Record<number, DayForm> = {};
  for (let weekday = 0; weekday < 7; weekday++) {
    const shift1Row = rows.find((r) => r.weekday === weekday && r.shift === 1);
    const shift2Row = rows.find((r) => r.weekday === weekday && r.shift === 2);
    form[weekday] = {
      closed: shift1Row?.is_closed ?? false,
      shift1: shift1Row
        ? {
            open: timeToInput(shift1Row.open_time),
            close: timeToInput(shift1Row.close_time),
            last: timeToInput(shift1Row.last_booking_time),
          }
        : { ...EMPTY_SHIFT },
      shift2: shift2Row
        ? {
            open: timeToInput(shift2Row.open_time),
            close: timeToInput(shift2Row.close_time),
            last: timeToInput(shift2Row.last_booking_time),
          }
        : null,
    };
  }
  return form;
}

function validateShift(shift: ShiftForm): string | null {
  if (!shift.open || !shift.close || !shift.last) return "All three times are required.";
  if (!(shift.open < shift.last)) return "Open time must be before last booking time.";
  if (!(shift.last <= shift.close)) return "Last booking time must be at or before close time.";
  return null;
}

export function HoursEditor({ outletId }: { outletId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { showError, showSuccess } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<number, DayForm>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await supabase.from("outlet_hours").select("*").eq("outlet_id", outletId);
      if (cancelled) return;
      setForm(rowsToForm((data as OutletHourRow[]) ?? []));
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, outletId]);

  function updateDay(weekday: number, patch: Partial<DayForm>) {
    setForm((prev) => ({ ...prev, [weekday]: { ...(prev[weekday] ?? DEFAULT_DAY), ...patch } }));
  }

  function copyMondayToAll() {
    const monday = form[1] ?? DEFAULT_DAY;
    const next: Record<number, DayForm> = {};
    for (let weekday = 0; weekday < 7; weekday++) {
      next[weekday] = {
        closed: monday.closed,
        shift1: { ...monday.shift1 },
        shift2: monday.shift2 ? { ...monday.shift2 } : null,
      };
    }
    setForm(next);
  }

  async function save() {
    const nextErrors: Record<number, string> = {};
    for (let weekday = 0; weekday < 7; weekday++) {
      const day = form[weekday] ?? DEFAULT_DAY;
      if (day.closed) continue;
      const err1 = validateShift(day.shift1);
      if (err1) {
        nextErrors[weekday] = err1;
        continue;
      }
      if (day.shift2) {
        const err2 = validateShift(day.shift2);
        if (err2) nextErrors[weekday] = err2;
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      showError("Fix the highlighted days before saving.");
      return;
    }

    setSaving(true);
    const rows: Omit<OutletHourRow, "id">[] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      const day = form[weekday] ?? DEFAULT_DAY;
      if (day.closed) {
        rows.push({
          outlet_id: outletId,
          weekday,
          shift: 1,
          is_closed: true,
          open_time: null,
          close_time: null,
          last_booking_time: null,
        });
      } else {
        rows.push({
          outlet_id: outletId,
          weekday,
          shift: 1,
          is_closed: false,
          open_time: day.shift1.open,
          close_time: day.shift1.close,
          last_booking_time: day.shift1.last,
        });
        if (day.shift2) {
          rows.push({
            outlet_id: outletId,
            weekday,
            shift: 2,
            is_closed: false,
            open_time: day.shift2.open,
            close_time: day.shift2.close,
            last_booking_time: day.shift2.last,
          });
        }
      }
    }

    const { error: upsertError } = await supabase
      .from("outlet_hours")
      .upsert(rows, { onConflict: "outlet_id,weekday,shift" });

    if (upsertError) {
      setSaving(false);
      showError("Couldn't save hours. Please try again.");
      return;
    }

    const { data: existingRows } = await supabase
      .from("outlet_hours")
      .select("id, weekday, shift")
      .eq("outlet_id", outletId);
    const wanted = new Set(rows.map((r) => `${r.weekday}-${r.shift}`));
    const staleIds = (existingRows ?? [])
      .filter((r) => !wanted.has(`${r.weekday}-${r.shift}`))
      .map((r) => r.id);
    if (staleIds.length > 0) {
      await supabase.from("outlet_hours").delete().in("id", staleIds);
    }

    setSaving(false);
    showSuccess("Hours saved.");
  }

  if (loading) return <SkeletonList rows={7} rowClassName="h-16" />;

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-lg font-semibold text-text">Opening hours</h3>
        <button type="button" onClick={copyMondayToAll} className="text-sm font-medium text-accent underline">
          Copy Monday to all days
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {WEEKDAY_LABELS.map((label, weekday) => {
          const day = form[weekday] ?? DEFAULT_DAY;
          const error = errors[weekday];
          return (
            <div key={weekday} className="rounded-xl border border-border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-text">{label}</span>
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={day.closed}
                    onChange={(event) => updateDay(weekday, { closed: event.target.checked })}
                    className="h-4 w-4"
                  />
                  Closed
                </label>
              </div>

              {!day.closed && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <TimeField
                      label="Open"
                      value={day.shift1.open}
                      onChange={(v) => updateDay(weekday, { shift1: { ...day.shift1, open: v } })}
                    />
                    <TimeField
                      label="Last booking"
                      value={day.shift1.last}
                      onChange={(v) => updateDay(weekday, { shift1: { ...day.shift1, last: v } })}
                    />
                    <TimeField
                      label="Close"
                      value={day.shift1.close}
                      onChange={(v) => updateDay(weekday, { shift1: { ...day.shift1, close: v } })}
                    />
                  </div>

                  {day.shift2 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <TimeField
                        label="Open (2nd)"
                        value={day.shift2.open}
                        onChange={(v) => updateDay(weekday, { shift2: { ...day.shift2!, open: v } })}
                      />
                      <TimeField
                        label="Last booking (2nd)"
                        value={day.shift2.last}
                        onChange={(v) => updateDay(weekday, { shift2: { ...day.shift2!, last: v } })}
                      />
                      <TimeField
                        label="Close (2nd)"
                        value={day.shift2.close}
                        onChange={(v) => updateDay(weekday, { shift2: { ...day.shift2!, close: v } })}
                      />
                      <button
                        type="button"
                        onClick={() => updateDay(weekday, { shift2: null })}
                        className="text-sm font-medium text-danger"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => updateDay(weekday, { shift2: { ...EMPTY_SHIFT } })}
                      className="mt-2 text-sm font-medium text-accent underline"
                    >
                      Add second shift
                    </button>
                  )}
                </>
              )}

              {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <Button type="button" loading={saving} onClick={save}>
          Save hours
        </Button>
      </div>
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <input
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[40px] rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
      />
    </label>
  );
}
