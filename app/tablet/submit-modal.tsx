"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayInKolkata } from "@/lib/date";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { ChecklistItemRow, ChecklistTemplate, Outlet, StaffMember } from "@/lib/types";
import type { Answer } from "./checklist-view";
import { isPhotoUploaded, type ItemPhotoState } from "./photo-capture";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";

const REASON_KEYS: Record<string, TranslationKey> = {
  invalid_pin: "tablet.reason.invalid_pin",
  missing_required: "tablet.reason.missing_required",
  bad_date: "tablet.reason.bad_date",
  invalid_staff: "tablet.reason.invalid_staff",
  not_allowed: "tablet.reason.not_allowed",
  bad_request: "tablet.reason.bad_request",
  missing_photo: "tablet.reason.missing_photo",
  invalid_photo: "tablet.reason.invalid_photo",
};

type SubmitResult =
  | { ok: true; submission_id: string }
  | { ok: false; reason: string; locked_until?: string };

type Step = "staff" | "pin" | "success";

const PIN_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const INACTIVITY_TIMEOUT_MS = 60_000;
const SUCCESS_AUTO_RETURN_MS = 5_000;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function vibrate(pattern: number | number[]) {
  navigator.vibrate?.(pattern);
}

export function SubmitModal({
  outlet,
  template,
  items,
  answers,
  photos,
  notes,
  onClose,
  onSuccess,
}: {
  outlet: Outlet;
  template: ChecklistTemplate;
  items: ChecklistItemRow[];
  answers: Record<string, Answer>;
  photos: Record<string, ItemPhotoState>;
  notes: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<Step>("staff");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(
    null,
  );
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedName, setSubmittedName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("staff")
      .select("id, name, active")
      .eq("outlet_id", outlet.id)
      .eq("active", true)
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadingStaff(false);
        if (error) {
          setStaffError(error.message);
          return;
        }
        setStaff((data ?? []).map(({ id, name }) => ({ id, name })));
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, outlet.id]);

  // Auto-close and forget the PIN after a minute of inactivity — this runs
  // on a shared kiosk tablet, so someone can walk away mid-entry.
  useEffect(() => {
    if (step === "success") return;
    const timer = window.setTimeout(() => {
      setPin("");
      onClose();
    }, INACTIVITY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [step, pin, selectedStaff, onClose]);

  // Auto-return to the checklist list a few seconds after a successful
  // submission; unmounting (via onSuccess) fully resets this modal's state.
  useEffect(() => {
    if (step !== "success") return;
    const timer = window.setTimeout(onSuccess, SUCCESS_AUTO_RETURN_MS);
    return () => window.clearTimeout(timer);
  }, [step, onSuccess]);

  function pickStaff(member: StaffMember) {
    setSelectedStaff(member);
    setPin("");
    setSubmitError(null);
    setStep("pin");
  }

  function pressDigit(digit: string) {
    vibrate(10);
    setSubmitError(null);
    setPin((prev) => (prev.length >= 6 ? prev : prev + digit));
  }

  function backspace() {
    vibrate(10);
    setSubmitError(null);
    setPin((prev) => prev.slice(0, -1));
  }

  function clearPin() {
    vibrate(10);
    setSubmitError(null);
    setPin("");
  }

  async function submit() {
    if (!selectedStaff || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const { data, error } = await supabase.rpc("submit_checklist", {
      p_template_id: template.id,
      p_staff_id: selectedStaff.id,
      p_pin: pin,
      p_business_date: todayInKolkata(),
      p_answers: items.map((item) => {
        const photo = photos[item.id];
        return {
          item_id: item.id,
          done: answers[item.id]?.done ?? false,
          note: answers[item.id]?.note.trim() || null,
          photo_path: isPhotoUploaded(photo) ? photo.path : null,
        };
      }),
      p_notes: notes.trim() || null,
    });

    setSubmitting(false);
    setPin("");

    if (error) {
      setSubmitError(t("tablet.reason.bad_request"));
      return;
    }

    const result = data as SubmitResult;

    if (result.ok) {
      setSubmittedName(selectedStaff.name);
      setStep("success");
      return;
    }

    if (result.reason === "invalid_pin") {
      vibrate([30, 40, 30]);
      setShake(true);
    }

    if (result.reason === "locked") {
      const until = result.locked_until
        ? new Date(result.locked_until).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "numeric",
            minute: "2-digit",
          })
        : null;
      setSubmitError(
        until
          ? t("tablet.reason.locked", { name: selectedStaff.name, time: until })
          : t("tablet.reason.lockedNoTime", { name: selectedStaff.name }),
      );
      return;
    }

    setSubmitError(
      t(REASON_KEYS[result.reason] ?? "tablet.reason.bad_request"),
    );
  }

  if (step === "success") {
    return (
      <Modal onClose={onSuccess} closeOnOverlayClick={false}>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-3xl text-white">
            ✓
          </span>
          <h3 className="text-xl font-semibold text-text">
            {t("tablet.submittedBy", { name: submittedName ?? "" })}
          </h3>
          <Button type="button" onClick={onSuccess} className="mt-2 w-full">
            {t("common.done")}
          </Button>
        </div>
      </Modal>
    );
  }

  if (step === "pin" && selectedStaff) {
    return (
      <Modal onClose={onClose} closeOnOverlayClick={false}>
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep("staff")}
            className="min-h-[40px] text-sm font-medium text-muted hover:text-text"
          >
            ‹ {t("common.back")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] text-sm font-medium text-muted hover:text-text"
          >
            {t("common.cancel")}
          </button>
        </div>
        <h3 className="mb-1 text-center text-lg font-semibold text-text">
          {selectedStaff.name}
        </h3>
        <p className="mb-4 text-center text-sm text-muted">
          {t("tablet.enterPin")}
        </p>

        <div
          className={`mb-4 flex justify-center gap-3 ${shake ? "motion-safe:animate-shake" : ""}`}
          onAnimationEnd={() => setShake(false)}
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <span
              key={index}
              className={`h-4 w-4 rounded-full border-2 ${
                index < pin.length
                  ? "border-accent bg-accent"
                  : "border-border"
              }`}
            />
          ))}
        </div>

        {submitError && (
          <p className="mb-3 text-center text-sm font-medium text-danger">
            {submitError}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          {PIN_DIGITS.map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => pressDigit(digit)}
              className="min-h-16 rounded-2xl bg-bg text-2xl font-semibold text-text ring-1 ring-border active:scale-[0.98]"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={clearPin}
            className="min-h-16 rounded-2xl bg-bg text-sm font-semibold text-muted ring-1 ring-border active:scale-[0.98]"
          >
            {t("tablet.clear")}
          </button>
          <button
            type="button"
            onClick={() => pressDigit("0")}
            className="min-h-16 rounded-2xl bg-bg text-2xl font-semibold text-text ring-1 ring-border active:scale-[0.98]"
          >
            0
          </button>
          <button
            type="button"
            onClick={backspace}
            aria-label={t("tablet.backspace")}
            className="min-h-16 rounded-2xl bg-bg text-sm font-semibold text-muted ring-1 ring-border active:scale-[0.98]"
          >
            ⌫
          </button>
        </div>

        <Button
          type="button"
          disabled={pin.length < 4}
          loading={submitting}
          onClick={submit}
          className="mt-4 w-full"
        >
          {submitting ? t("tablet.submitting") : t("tablet.submit")}
        </Button>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} closeOnOverlayClick={false}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text">
          {t("tablet.whosSubmitting")}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[40px] text-sm font-medium text-muted hover:text-text"
        >
          {t("common.cancel")}
        </button>
      </div>
      {loadingStaff && <SkeletonList rows={4} rowClassName="h-24" />}
      {staffError && (
        <p className="text-danger">
          {t("common.loadStaffError", { error: staffError })}
        </p>
      )}
      {!loadingStaff && !staffError && staff.length === 0 && (
        <p className="text-muted">{t("tablet.noActiveStaff")}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {staff.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => pickStaff(member)}
            className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-bg p-4 text-center ring-1 ring-border transition hover:bg-border/20 active:scale-[0.98]"
          >
            <span
              aria-hidden="true"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-base font-semibold text-white"
            >
              {getInitials(member.name)}
            </span>
            <span className="text-base font-medium text-text">
              {member.name}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
