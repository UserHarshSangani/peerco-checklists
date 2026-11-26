"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/components/auth/auth-card";

const MIN_LENGTH = 8;

// Reached from the reset email via /auth/confirm, which has already signed
// the person in. proxy.ts sends anyone without a session to /login.
export default function ResetPasswordPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_LENGTH) return setError(t("auth.reset.tooShort"));
    if (password !== confirm) return setError(t("auth.reset.mismatch"));

    setSubmitting(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(
        updateError.code === "same_password"
          ? t("auth.reset.samePassword")
          : t("auth.reset.failed", { error: updateError.message }),
      );
      return;
    }
    setDone(true);
    // /login sends a signed-in person to their home screen.
    router.replace("/login");
    router.refresh();
  }

  const inputClass =
    "mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none";

  return (
    <AuthCard heading={t("auth.reset.heading")}>
      {done ? (
        <p role="status" className="text-sm text-text">
          {t("auth.reset.done")}
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-muted">
            {t("auth.reset.newPassword")}
          </label>
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
            className={inputClass}
          />
          <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-muted">
            {t("auth.reset.confirmPassword")}
          </label>
          <input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            required
            className={inputClass}
          />
          {error && <p className="mb-4 text-sm font-medium text-danger">{error}</p>}
          <Button type="submit" loading={submitting} className="w-full">
            {submitting ? t("auth.reset.saving") : t("auth.reset.save")}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
