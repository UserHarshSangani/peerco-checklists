"use client";

import { useState, type FormEvent } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export type ChecklistKind = "opening" | "closing";

export function NewChecklistModal({
  onCreate,
  onClose,
}: {
  onCreate: (values: {
    name: string;
    kind: ChecklistKind;
  }) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ChecklistKind>("opening");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(t("common.enterName"));
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await onCreate({ name: name.trim(), kind });
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <Modal onClose={onClose} title={t("manager.newChecklist")}>
      <form onSubmit={handleSubmit}>
        <label
          htmlFor="template-name"
          className="mb-1 block text-sm font-medium text-muted"
        >
          {t("common.nameLabel")}
        </label>
        <input
          id="template-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
        />

        <label
          htmlFor="template-kind"
          className="mb-1 block text-sm font-medium text-muted"
        >
          {t("manager.kindLabel")}
        </label>
        <select
          id="template-kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as ChecklistKind)}
          className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
        >
          <option value="opening">{t("manager.kindOpening")}</option>
          <option value="closing">{t("manager.kindClosing")}</option>
        </select>

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
            {submitting ? t("manager.creating") : t("manager.create")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
