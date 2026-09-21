"use client";

import { useState, type FormEvent } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import type { Vendor } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export function VendorModal({
  vendor,
  onSubmit,
  onClose,
}: {
  vendor: Vendor | null;
  onSubmit: (values: {
    name: string;
    phone: string;
    notes: string;
    active: boolean;
  }) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(vendor?.name ?? "");
  const [phone, setPhone] = useState(vendor?.phone ?? "");
  const [notes, setNotes] = useState(vendor?.notes ?? "");
  const [active, setActive] = useState(vendor?.active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(t("common.nameEmpty"));
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      notes: notes.trim(),
      active,
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <Modal
      onClose={onClose}
      title={vendor ? t("catalog.editVendor") : t("catalog.addVendor")}
    >
      <form onSubmit={handleSubmit}>
        <label
          htmlFor="vendor-name"
          className="mb-1 block text-sm font-medium text-muted"
        >
          {t("common.nameLabel")}
        </label>
        <input
          id="vendor-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
        />

        <label
          htmlFor="vendor-phone"
          className="mb-1 block text-sm font-medium text-muted"
        >
          {t("catalog.phoneLabel")}
        </label>
        <input
          id="vendor-phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
        />

        <label
          htmlFor="vendor-notes"
          className="mb-1 block text-sm font-medium text-muted"
        >
          {t("catalog.notesLabel")}
        </label>
        <textarea
          id="vendor-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
        />

        {vendor && (
          <label className="mb-4 flex items-center gap-2 text-sm font-medium text-text">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            {t("manager.active")}
          </label>
        )}

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
            {submitting ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
