"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, Check, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { todayInKolkata } from "@/lib/date";
import { attendancePhotoPath, processPhoto, uploadAttendancePhoto } from "@/lib/photo-upload";
import { clockIST } from "@/lib/team/engines/attendance";
import { formatSegments, type Segment } from "@/lib/team/engines/time";
import type { Outlet } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { PinPad } from "./pin-pad";

type Person = {
  staff_id: string;
  name: string;
  roster_kind: "work" | "weekly_off" | null;
  segments: Segment[] | null;
  extended_until: string | null;
  state: "in" | "out" | "none";
  last_at: string | null;
};

type Step =
  | { kind: "list" }
  | { kind: "photo"; person: Person; action: "in" | "out"; preview: { file: File; url: string } | null }
  | { kind: "pin"; person: Person; action: "in" | "out"; photoPath: string | null }
  | { kind: "done"; person: Person; action: "in" | "out"; at: string; lateMinutes: number };

const IDLE_MS = 60_000;
const DONE_MS = 4_000;

const REASONS: Record<string, TranslationKey> = {
  invalid_pin: "tablet.reason.invalid_pin",
  invalid_staff: "tablet.reason.invalid_staff",
  locked: "team.checkin.locked",
  missing_photo: "team.checkin.missingPhoto",
  invalid_photo: "team.checkin.invalidPhoto",
  already_in: "team.checkin.alreadyIn",
  not_checked_in: "team.checkin.notCheckedIn",
  not_allowed: "tablet.reason.not_allowed",
};

export function CheckInFlow({ outlet, onExit }: { outlet: Outlet; onExit: () => void }) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: "list" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("team_device_today", { p_outlet: outlet.id });
    if (e) setLoadError(e.message);
    else setPeople((data ?? []) as Person[]);
  }, [supabase, outlet.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the list on open
    void load();
  }, [load]);

  const backToList = useCallback(() => {
    setStep((s) => {
      if (s.kind === "photo" && s.preview) URL.revokeObjectURL(s.preview.url);
      return { kind: "list" };
    });
    setError(null);
    setBusy(false);
    void load();
  }, [load]);

  // Shared tablet: anything left half-done goes back to the list.
  useEffect(() => {
    if (step.kind === "list" || busy) return;
    const timer = window.setTimeout(backToList, step.kind === "done" ? DONE_MS : IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [step, busy, backToList]);

  function choose(person: Person) {
    setError(null);
    setStep({ kind: "photo", person, action: person.state === "in" ? "out" : "in", preview: null });
  }

  async function usePhoto() {
    if (step.kind !== "photo" || !step.preview) return;
    setBusy(true);
    setError(null);
    try {
      const path = attendancePhotoPath(outlet.id, step.person.staff_id, todayInKolkata());
      const { error: e } = await uploadAttendancePhoto(supabase, path, await processPhoto(step.preview.file));
      if (e) throw new Error(e);
      URL.revokeObjectURL(step.preview.url);
      setStep({ kind: "pin", person: step.person, action: step.action, photoPath: path });
    } catch {
      setError(t("team.checkin.uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function submitPin(pin: string) {
    if (step.kind !== "pin") return false;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("team_check_in_out", {
      p_outlet: outlet.id,
      p_staff: step.person.staff_id,
      p_pin: pin,
      p_kind: step.action,
      p_photo_path: step.photoPath,
    });
    setBusy(false);
    const result = data as { ok: boolean; reason?: string; at?: string; late_minutes?: number; locked_until?: string } | null;
    if (e || !result) {
      setError(t("tablet.reason.bad_request"));
      return false;
    }
    if (!result.ok) {
      const key = REASONS[result.reason ?? ""] ?? "tablet.reason.bad_request";
      setError(t(key, { time: result.locked_until ? clockIST(result.locked_until) : "" }));
      if (result.reason === "missing_photo") setStep({ kind: "photo", person: step.person, action: step.action, preview: null });
      return false;
    }
    setStep({ kind: "done", person: step.person, action: step.action, at: result.at!, lateMinutes: result.late_minutes ?? 0 });
    return true;
  }

  const shiftText = (p: Person) =>
    p.roster_kind === "work" && p.segments
      ? formatSegments(p.segments)
      : p.roster_kind === "weekly_off"
        ? t("team.roster.weeklyOff")
        : t("team.checkin.notRostered");

  if (step.kind === "done") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-success-bg">
          <Check className="h-10 w-10 text-success-fg" aria-hidden="true" />
        </span>
        <h2 className="font-serif text-3xl font-bold text-text">
          {t(step.action === "in" ? "team.checkin.doneIn" : "team.checkin.doneOut", {
            name: step.person.name,
            time: clockIST(step.at),
          })}
        </h2>
        {step.action === "in" && step.lateMinutes > 0 && (
          <p className="text-lg text-warning">{t("team.checkin.late", { minutes: step.lateMinutes })}</p>
        )}
        <Button onClick={backToList} className="mt-4 min-w-48">
          {t("common.done")}
        </Button>
      </div>
    );
  }

  if (step.kind === "photo" || step.kind === "pin") {
    const title = t(step.action === "in" ? "team.checkin.titleIn" : "team.checkin.titleOut", { name: step.person.name });
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <header className="safe-top border-b border-border bg-surface px-4 py-3 sm:px-6">
          <button type="button" onClick={backToList} className="min-h-[40px] text-sm font-medium text-muted hover:text-text">
            ‹ {t("common.cancel")}
          </button>
        </header>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 p-4 sm:p-6">
          <Avatar name={step.person.name} size="lg" />
          <h2 className="text-center font-serif text-2xl font-bold text-text">{title}</h2>
          {error && <p className="text-center text-sm font-medium text-danger">{error}</p>}

          {step.kind === "photo" ? (
            step.preview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                <img src={step.preview.url} alt={t("tablet.photoPreviewAlt")} className="max-h-[50vh] rounded-2xl object-contain ring-1 ring-border" />
                <div className="flex w-full gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    disabled={busy}
                    onClick={() => {
                      URL.revokeObjectURL(step.preview!.url);
                      setStep({ ...step, preview: null });
                    }}
                  >
                    <RotateCcw className="h-5 w-5" aria-hidden="true" />
                    {t("tablet.retake")}
                  </Button>
                  <Button className="flex-1" loading={busy} onClick={usePhoto}>
                    <Check className="h-5 w-5" aria-hidden="true" />
                    {t("tablet.usePhoto")}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-center text-muted">{t("team.checkin.photoHint")}</p>
                <label className="relative flex min-h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl bg-surface text-xl font-semibold text-text ring-1 ring-border active:scale-[0.98]">
                  {/* Native label+input keeps the camera open inside the tap's user activation. */}
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="absolute h-px w-px opacity-0"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) setStep({ ...step, preview: { file, url: URL.createObjectURL(file) } });
                    }}
                  />
                  <Camera className="h-10 w-10 text-accent" aria-hidden="true" />
                  {t("team.checkin.takeSelfie")}
                </label>
                <button
                  type="button"
                  className="min-h-[44px] text-sm text-muted underline"
                  onClick={() => setStep({ kind: "pin", person: step.person, action: step.action, photoPath: null })}
                >
                  {t("team.checkin.noCamera")}
                </button>
              </>
            )
          ) : (
            <PinPad busy={busy} onSubmit={submitPin} submitLabel={t(step.action === "in" ? "team.checkin.in" : "team.checkin.out")} />
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="safe-top flex items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-6">
        <button type="button" onClick={onExit} className="min-h-[40px] text-sm font-medium text-muted hover:text-text">
          ‹ {t("common.back")}
        </button>
        <p className="font-medium text-text">{outlet.name}</p>
      </header>
      <main className="flex-1 p-4 sm:p-6">
        <h2 className="mb-1 font-serif text-2xl font-bold text-text">{t("team.checkin.heading")}</h2>
        <p className="mb-6 text-sm text-muted">{t("team.checkin.intro")}</p>
        {loadError && <p className="text-danger">{t("common.loadStaffError", { error: loadError })}</p>}
        {!people && !loadError && <SkeletonList rows={4} rowClassName="h-28" />}
        {people && people.length === 0 && <p className="text-muted">{t("tablet.noActiveStaff")}</p>}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {people?.map((p) => (
            <button
              key={p.staff_id}
              type="button"
              onClick={() => choose(p)}
              className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl bg-surface p-4 text-center shadow-sm ring-1 ring-border transition hover:bg-border/20 active:scale-[0.98]"
            >
              <Avatar name={p.name} size="lg" />
              <span className="text-base font-medium text-text">{p.name}</span>
              <span className="text-xs text-muted">{shiftText(p)}</span>
              {p.state === "in" ? (
                <StatusPill tone="success">{t("team.checkin.inSince", { time: p.last_at ? clockIST(p.last_at) : "" })}</StatusPill>
              ) : p.state === "out" ? (
                <StatusPill tone="neutral">{t("team.checkin.leftAt", { time: p.last_at ? clockIST(p.last_at) : "" })}</StatusPill>
              ) : (
                <StatusPill tone="info">{t("team.checkin.notIn")}</StatusPill>
              )}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
