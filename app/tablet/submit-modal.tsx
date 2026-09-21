"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { todayInKolkata } from "@/lib/date";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { ChecklistItemRow, ChecklistTemplate, Outlet, StaffMember } from "@/lib/types";
import type { Answer } from "./checklist-view";
import { isPhotoUploaded, type ItemPhotoState } from "./photo-capture";
import {
  getTabletLocationPayload,
  type LocationPayload,
} from "@/lib/geolocation";
import {
  hasSeenLocationExplainer,
  markLocationExplainerSeen,
} from "@/lib/location-explainer";
import { useCurrentStaff } from "./current-staff-context";
import { Avatar } from "@/components/ui/avatar";
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
  | {
      ok: true;
      submission_id: string;
      location_status: string;
      distance_m: number | null;
    }
  | { ok: false; reason: string; locked_until?: string };

type Step = "staff" | "pin" | "success";

const PIN_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const INACTIVITY_TIMEOUT_MS = 60_000;
const SUCCESS_AUTO_RETURN_MS = 5_000;

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
  const currentStaff = useCurrentStaff();
  const [step, setStep] = useState<Step>(currentStaff.staff ? "pin" : "staff");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(
    currentStaff.staff,
  );
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedLocationStatus, setSubmittedLocationStatus] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (step !== "staff") return;
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
  }, [supabase, outlet.id, step]);

  // Auto-close and forget the PIN after a minute of inactivity — this runs
  // on a shared kiosk tablet, so someone can walk away mid-entry. Paused
  // while a submission is actually in flight so a slow network/GPS fix
  // can't cause the modal to close out from under it.
  useEffect(() => {
    if (step === "success" || locating || submitting) return;
    const timer = window.setTimeout(() => {
      setPin("");
      onClose();
    }, INACTIVITY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [step, pin, selectedStaff, locating, submitting, onClose]);

  // Auto-return to the checklist list a few seconds after a successful
  // submission; unmounting (via onSuccess) fully resets this modal's state.
  useEffect(() => {
    if (step !== "success") return;
    const timer = window.setTimeout(onSuccess, SUCCESS_AUTO_RETURN_MS);
    return () => window.clearTimeout(timer);
  }, [step, onSuccess]);

  function pickStaff(member: StaffMember) {
    setSelectedStaff(member);
    currentStaff.setStaff(member);
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

  async function submit(location: LocationPayload) {
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
      p_location: location,
    });

    setSubmitting(false);
    setPin("");

    if (error) {
      setSubmitError(t("tablet.reason.bad_request"));
      return;
    }

    const result = data as SubmitResult;

    if (result.ok) {
      setSubmittedLocationStatus(result.location_status);
      setStep("success");
      currentStaff.setStaff(null);
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

  async function proceedWithSubmit() {
    setLocating(true);
    const location = await getTabletLocationPayload();
    setLocating(false);
    await submit(location);
  }

  function handleSubmitTap() {
    if (!hasSeenLocationExplainer()) {
      setShowExplainer(true);
      return;
    }
    void proceedWithSubmit();
  }

  function handleExplainerContinue() {
    markLocationExplainerSeen();
    setShowExplainer(false);
    void proceedWithSubmit();
  }

  if (step === "pin" && selectedStaff && showExplainer) {
    return (
      <Modal onClose={onClose} closeOnOverlayClick={false}>
        <p className="mb-6 text-base text-text">
          {t("tablet.locationExplainerBody")}
        </p>
        <Button
          type="button"
          onClick={handleExplainerContinue}
          className="w-full"
        >
          {t("common.continue")}
        </Button>
      </Modal>
    );
  }

  if (step === "success") {
    const showLocationHint =
      submittedLocationStatus === "denied" ||
      submittedLocationStatus === "unavailable";
    const doneCount = items.filter((item) => answers[item.id]?.done).length;
    const photoCount = Object.values(photos).filter(isPhotoUploaded).length;
    return (
      <Modal onClose={onSuccess} closeOnOverlayClick={false}>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-success-bg text-success-fg">
            <Check className="h-10 w-10" strokeWidth={3} aria-hidden="true" />
          </span>
          <h3 className="font-serif text-2xl font-bold text-text">
            {t("tablet.submittedBy", { name: selectedStaff?.name ?? "" })}
          </h3>
          <p className="text-base text-muted">
            {t("tablet.submitSummary", { done: doneCount, total: items.length, photos: photoCount })}
          </p>
          {showLocationHint && (
            <p className="text-sm text-muted">
              {t("tablet.locationOffHint")}
            </p>
          )}
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
            onClick={onClose}
            className="min-h-[40px] text-sm font-medium text-muted hover:text-text"
          >
            {t("common.cancel")}
          </button>
        </div>
        <div className="mb-4 flex flex-col items-center gap-2">
          <Avatar name={selectedStaff.name} size="lg" />
          <h3 className="text-lg font-semibold text-text">{selectedStaff.name}</h3>
        </div>
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
          loading={submitting || locating}
          onClick={handleSubmitTap}
          className="mt-4 w-full"
        >
          {locating
            ? t("tablet.checkingLocation")
            : submitting
              ? t("tablet.submitting")
              : t("tablet.submit")}
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
            <Avatar name={member.name} />
            <span className="text-base font-medium text-text">
              {member.name}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
