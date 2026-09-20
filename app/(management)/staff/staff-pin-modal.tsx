"use client";

import { useState, type FormEvent } from "react";

export function StaffPinModal({
  title,
  showNameField,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  showNameField: boolean;
  submitLabel: string;
  onSubmit: (values: {
    name: string;
    pin: string;
  }) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (showNameField && !name.trim()) {
      setError("Enter a name.");
      return;
    }
    if (!/^[0-9]{4,6}$/.test(pin)) {
      setError("PIN must be 4 to 6 digits.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await onSubmit({ name: name.trim(), pin });
    setPin(""); // never keep the PIN around once it has been submitted
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl dark:bg-zinc-900"
      >
        <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h3>

        {showNameField && (
          <>
            <label
              htmlFor="staff-name"
              className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-300"
            >
              Name
            </label>
            <input
              id="staff-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              className="mb-4 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 text-base text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </>
        )}

        <label
          htmlFor="staff-pin"
          className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-300"
        >
          PIN (4 to 6 digits)
        </label>
        <input
          id="staff-pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={pin}
          onChange={(event) =>
            setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          className="mb-4 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 text-base tracking-[0.3em] text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />

        {error && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-zinc-100 py-3 text-base font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-2xl bg-zinc-900 py-3 text-base font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {submitting ? "Saving…" : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
