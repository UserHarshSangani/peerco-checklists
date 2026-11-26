"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type ForgotState, type ForgotStatus } from "./actions";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/components/auth/auth-card";

const initialState: ForgotState = { status: "idle" };

const ERROR_KEYS: Partial<Record<ForgotStatus, TranslationKey>> = {
  missing_email: "auth.forgot.enterEmail",
  too_many: "auth.forgot.tooMany",
  failed: "auth.forgot.failed",
};

export function ForgotPasswordForm({ linkInvalid }: { linkInvalid: boolean }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);
  const { t } = useLanguage();
  const errorKey = ERROR_KEYS[state.status];

  return (
    <AuthCard heading={t("auth.forgot.heading")}>
      {state.status === "sent" ? (
        <p role="status" className="mb-6 rounded-lg bg-accent/10 p-4 text-sm text-text">
          {t("auth.forgot.sent")}
        </p>
      ) : (
        <form action={formAction}>
          {linkInvalid && state.status === "idle" && (
            <p className="mb-4 text-sm font-medium text-danger">{t("auth.forgot.linkInvalid")}</p>
          )}
          <p className="mb-4 text-sm text-muted">{t("auth.forgot.intro")}</p>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-muted">
            {t("auth.email")}
          </label>
          <input
            id="email"
            type="email"
            name="email"
            required
            autoComplete="username"
            className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
          />
          {errorKey && <p className="mb-4 text-sm font-medium text-danger">{t(errorKey)}</p>}
          <Button type="submit" loading={pending} className="w-full">
            {pending ? t("auth.forgot.sending") : t("auth.forgot.send")}
          </Button>
        </form>
      )}
      <Link
        href="/login"
        className="mt-6 block min-h-[44px] py-3 text-center text-sm font-medium text-accent hover:underline"
      >
        {t("auth.forgot.backToLogin")}
      </Link>
    </AuthCard>
  );
}
