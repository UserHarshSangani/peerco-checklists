"use client";

import { useState, type FormEvent } from "react";
import { ClipboardCheck, PackageSearch, Truck, ChefHat } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export type TaskPermissionValues = {
  can_checklists: boolean;
  can_stock_counts: boolean;
  can_goods_received: boolean;
  can_wastage: boolean;
};

export const DEFAULT_TASK_PERMISSIONS: TaskPermissionValues = {
  can_checklists: true,
  can_stock_counts: true,
  can_goods_received: true,
  can_wastage: true,
};

const PERMISSION_TOGGLES: {
  key: keyof TaskPermissionValues;
  label: TranslationKey;
  icon: typeof ClipboardCheck;
}[] = [
  { key: "can_checklists", label: "manager.permissions.checklists", icon: ClipboardCheck },
  { key: "can_stock_counts", label: "manager.permissions.stockCounts", icon: PackageSearch },
  { key: "can_goods_received", label: "manager.permissions.goodsReceived", icon: Truck },
  { key: "can_wastage", label: "manager.permissions.wastage", icon: ChefHat },
];

export function StaffPinModal({
  title,
  showNameField,
  showPermissions = false,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  showNameField: boolean;
  showPermissions?: boolean;
  submitLabel: string;
  onSubmit: (values: {
    name: string;
    pin: string;
    permissions: TaskPermissionValues;
  }) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [permissions, setPermissions] = useState<TaskPermissionValues>(DEFAULT_TASK_PERMISSIONS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePermission(key: keyof TaskPermissionValues) {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

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
    const result = await onSubmit({ name: name.trim(), pin, permissions });
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

        {showPermissions && (
          <div className="mb-4">
            <p className="mb-2 text-sm font-medium text-muted">
              {t("manager.permissions.sectionTitle")}
            </p>
            <div className="flex flex-wrap gap-2">
              {PERMISSION_TOGGLES.map(({ key, label, icon: Icon }) => {
                const on = permissions[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => togglePermission(key)}
                    className={`flex min-h-[40px] items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 ring-border ${
                      on ? "bg-accent text-accent-fg" : "bg-bg text-text"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {t(label)}
                  </button>
                );
              })}
            </div>
          </div>
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
            {submitting ? t("common.saving") : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
