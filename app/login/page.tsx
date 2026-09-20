"use client";

import { useActionState } from "react";
import { login, type LoginErrorCode, type LoginState } from "./actions";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { Button } from "@/components/ui/button";

const initialState: LoginState = { errorCode: null };

const ERROR_KEYS: Record<LoginErrorCode, TranslationKey> = {
  missing_credentials: "auth.enterCredentials",
  invalid_credentials: "auth.incorrectCredentials",
  no_profile: "auth.noProfile",
};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const { t } = useLanguage();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-3xl bg-surface p-8 shadow-sm ring-1 ring-border"
      >
        <h1 className="mb-6 text-center text-2xl font-semibold text-text">
          PeerCo Checklists
        </h1>

        <label
          htmlFor="email"
          className="mb-1 block text-sm font-medium text-muted"
        >
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

        <label
          htmlFor="password"
          className="mb-1 block text-sm font-medium text-muted"
        >
          {t("auth.password")}
        </label>
        <input
          id="password"
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
        />

        {state.errorCode && (
          <p className="mb-4 text-sm font-medium text-danger">
            {t(ERROR_KEYS[state.errorCode])}
          </p>
        )}

        <Button type="submit" loading={pending} className="w-full">
          {pending ? t("auth.signingIn") : t("auth.signIn")}
        </Button>
      </form>
    </main>
  );
}
