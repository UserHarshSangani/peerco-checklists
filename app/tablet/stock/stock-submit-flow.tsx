"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Outlet, StaffMember } from "@/lib/types";
import {
  getTabletLocationPayload,
  type LocationPayload,
} from "@/lib/geolocation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";

const LOCATION_EXPLAINER_KEY = "peerco:location-explainer-seen";

function hasSeenLocationExplainer(): boolean {
  try {
    return window.localStorage.getItem(LOCATION_EXPLAINER_KEY) === "1";
  } catch {
    return true; // storage unavailable — don't block the flow on it
  }
}

function markLocationExplainerSeen() {
  try {
    window.localStorage.setItem(LOCATION_EXPLAINER_KEY, "1");
  } catch {
    // ignore
  }
}

// Shared across all three stock RPCs (submit_stock_count, submit_receipt,
// log_wastage) — each only ever returns a subset of these reasons, so one
// map covers all of them; an unmapped reason falls back to bad_request.
export const STOCK_REASON_KEYS: Record<string, TranslationKey> = {
  invalid_pin: "tablet.reason.invalid_pin",
  bad_date: "tablet.reason.bad_date",
  invalid_staff: "tablet.reason.invalid_staff",
  not_allowed: "tablet.reason.not_allowed",
  bad_request: "tablet.reason.bad_request",
  invalid_photo: "tablet.reason.invalid_photo",
  bad_quantity: "tablet.reason.bad_quantity",
  duplicate_item: "tablet.reason.duplicate_item",
  invalid_item: "tablet.reason.invalid_item",
  incomplete: "tablet.reason.incomplete",
  invalid_vendor: "tablet.reason.invalid_vendor",
  bad_reason: "tablet.reason.bad_reason",
  note_required: "tablet.reason.note_required",
};

// invalid_item/incomplete mean the sheet on screen is stale (an item was
// deactivated, or the sheet's item set otherwise changed underneath the
// user) — the caller should reload it, per spec.
export function reasonNeedsReload(reason: string): boolean {
  return reason === "invalid_item" || reason === "incomplete";
}

export type StockSubmitOutcome =
  | { ok: true; location_status: string; [key: string]: unknown }
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

// The staff-picker → PIN-pad → location-capture → submit → success shell,
// generalized from app/tablet/submit-modal.tsx so the stock count, goods
// received and wastage flows can share it — each just supplies its own
// `onSubmit` RPC call and reacts to failure reasons it cares about.
export function StockSubmitFlow({
  outlet,
  onClose,
  onSuccess,
  onSubmit,
  onFailure,
}: {
  outlet: Outlet;
  onClose: () => void;
  onSuccess: () => void;
  onSubmit: (
    staffId: string,
    pin: string,
    location: LocationPayload,
  ) => Promise<StockSubmitOutcome>;
  onFailure?: (reason: string) => void;
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
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedName, setSubmittedName] = useState<string | null>(null);
  const [submittedLocationStatus, setSubmittedLocationStatus] = useState<
    string | null
  >(null);

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

  useEffect(() => {
    if (step === "success" || locating || submitting) return;
    const timer = window.setTimeout(() => {
      setPin("");
      onClose();
    }, INACTIVITY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [step, pin, selectedStaff, locating, submitting, onClose]);

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

  async function submit(location: LocationPayload) {
    if (!selectedStaff || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const result = await onSubmit(selectedStaff.id, pin, location);

    setSubmitting(false);
    setPin("");

    if (result.ok) {
      setSubmittedName(selectedStaff.name);
      setSubmittedLocationStatus(result.location_status);
      setStep("success");
      return;
    }

    onFailure?.(result.reason);

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
      t(STOCK_REASON_KEYS[result.reason] ?? "tablet.reason.bad_request"),
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
    return (
      <Modal onClose={onSuccess} closeOnOverlayClick={false}>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-3xl text-white">
            ✓
          </span>
          <h3 className="text-xl font-semibold text-text">
            {t("tablet.submittedBy", { name: submittedName ?? "" })}
          </h3>
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
