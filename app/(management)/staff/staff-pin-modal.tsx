"use client";

import { useState, type FormEvent } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

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
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (showNameField && !name.trim()) {
      setError(t("common.enterName"));
      return;
    }
    if (!/^[0-9]{4,6}$/.test(pin)) {
      setError(t("manager.pinMustBeDigits"));
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
    <Modal onClose={onClose} title={title}>
      <form onSubmit={handleSubmit}>
        {showNameField && (
          <>
            <label
              htmlFor="staff-name"
              className="mb-1 block text-sm font-medium text-muted"
            >
              {t("common.nameLabel")}
            </label>
            <input
              id="staff-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
            />
          </>
        )}

        <label
          htmlFor="staff-pin"
          className="mb-1 block text-sm font-medium text-muted"
        >
          {t("manager.pinLabel")}
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
          className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base tracking-[0.3em] text-text focus:border-accent focus:outline-none"
        />

        {error && (
          <p className="mb-4 text-sm font-medium text-danger">{error}</p>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="flex-1"
          >
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={submitting} className="flex-1">
            {submitting ? t("common.saving") : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
