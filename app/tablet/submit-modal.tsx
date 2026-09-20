"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayInKolkata } from "@/lib/date";
import type { ChecklistItemRow, ChecklistTemplate, Outlet, StaffMember } from "@/lib/types";
import type { Answer } from "./checklist-view";

const REASON_MESSAGES: Record<string, string> = {
  invalid_pin: "Wrong PIN, try again.",
  missing_required: "Some required items are unchecked without a note.",
  bad_date: "Something went wrong with today's date. Please try again.",
  invalid_staff: "This staff member can't submit for this outlet.",
  not_allowed: "This checklist isn't available right now.",
  bad_request: "Something went wrong. Please try again.",
};

type SubmitResult =
  | { ok: true; submission_id: string }
  | { ok: false; reason: string; locked_until?: string };

type Step = "staff" | "pin" | "success";

const PIN_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function SubmitModal({
  outlet,
  template,
  items,
  answers,
  notes,
  onClose,
  onSuccess,
}: {
  outlet: Outlet;
  template: ChecklistTemplate;
  items: ChecklistItemRow[];
  answers: Record<string, Answer>;
  notes: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<Step>("staff");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(
    null,
  );
  const [pin, setPin] = useState("");
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

  function pickStaff(member: StaffMember) {
    setSelectedStaff(member);
    setPin("");
    setSubmitError(null);
    setStep("pin");
  }

  function pressDigit(digit: string) {
    setSubmitError(null);
    setPin((prev) => (prev.length >= 6 ? prev : prev + digit));
  }

  function backspace() {
    setSubmitError(null);
    setPin((prev) => prev.slice(0, -1));
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
      p_answers: items.map((item) => ({
        item_id: item.id,
        done: answers[item.id]?.done ?? false,
        note: answers[item.id]?.note.trim() || null,
      })),
      p_notes: notes.trim() || null,
    });

    setSubmitting(false);
    setPin("");

    if (error) {
      setSubmitError("Something went wrong. Please try again.");
      return;
    }

    const result = data as SubmitResult;

    if (result.ok) {
      setSubmittedName(selectedStaff.name);
      setStep("success");
      return;
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
          ? `${selectedStaff.name} is locked for a few minutes. Try again after ${until}.`
          : `${selectedStaff.name} is locked for a few minutes. Try again shortly.`,
      );
      return;
    }

    setSubmitError(
      REASON_MESSAGES[result.reason] ?? "Something went wrong. Please try again.",
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        {step === "staff" && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Who&apos;s submitting?
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                Cancel
              </button>
            </div>
            {loadingStaff && (
              <p className="text-zinc-500 dark:text-zinc-400">
                Loading staff…
              </p>
            )}
            {staffError && (
              <p className="text-red-600 dark:text-red-400">
                Couldn&apos;t load staff: {staffError}
              </p>
            )}
            {!loadingStaff && !staffError && staff.length === 0 && (
              <p className="text-zinc-500 dark:text-zinc-400">
                No active staff found for this outlet.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {staff.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => pickStaff(member)}
                  className="rounded-2xl bg-zinc-100 px-4 py-6 text-lg font-medium text-zinc-900 active:scale-[0.98] dark:bg-zinc-800 dark:text-zinc-50"
                >
                  {member.name}
                </button>
              ))}
            </div>
          </>
        )}

        {step === "pin" && selectedStaff && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep("staff")}
                className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                ‹ Back
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                Cancel
              </button>
            </div>
            <h3 className="mb-1 text-center text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {selectedStaff.name}
            </h3>
            <p className="mb-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Enter your PIN
            </p>

            <div className="mb-4 flex justify-center gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <span
                  key={index}
                  className={`h-4 w-4 rounded-full border-2 ${
                    index < pin.length
                      ? "border-zinc-900 bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100"
                      : "border-zinc-300 dark:border-zinc-600"
                  }`}
                />
              ))}
            </div>

            {submitError && (
              <p className="mb-3 text-center text-sm text-red-600 dark:text-red-400">
                {submitError}
              </p>
            )}

            <div className="grid grid-cols-3 gap-3">
              {PIN_DIGITS.map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => pressDigit(digit)}
                  className="rounded-2xl bg-zinc-100 py-4 text-2xl font-semibold text-zinc-900 active:scale-[0.98] dark:bg-zinc-800 dark:text-zinc-50"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPin("")}
                className="rounded-2xl bg-zinc-100 py-4 text-sm font-semibold text-zinc-500 active:scale-[0.98] dark:bg-zinc-800 dark:text-zinc-400"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => pressDigit("0")}
                className="rounded-2xl bg-zinc-100 py-4 text-2xl font-semibold text-zinc-900 active:scale-[0.98] dark:bg-zinc-800 dark:text-zinc-50"
              >
                0
              </button>
              <button
                type="button"
                onClick={backspace}
                className="rounded-2xl bg-zinc-100 py-4 text-sm font-semibold text-zinc-500 active:scale-[0.98] dark:bg-zinc-800 dark:text-zinc-400"
              >
                ⌫
              </button>
            </div>

            <button
              type="button"
              disabled={pin.length < 4 || submitting}
              onClick={submit}
              className="mt-4 w-full rounded-2xl bg-zinc-900 py-4 text-lg font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-3xl text-white">
              ✓
            </span>
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              Submitted by {submittedName}
            </h3>
            <button
              type="button"
              onClick={onSuccess}
              className="mt-2 w-full rounded-2xl bg-zinc-900 py-4 text-lg font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
