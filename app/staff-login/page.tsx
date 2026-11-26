"use client";

import Link from "next/link";
import { useActionState } from "react";
import { staffLogin, type StaffLoginState } from "./actions";
import { useLanguage } from "@/lib/i18n/language-context";
import { formatTimeKolkata } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/components/auth/auth-card";

const initialState: StaffLoginState = { error: null };

export default function StaffLoginPage() {
  const [state, formAction, pending] = useActionState(staffLogin, initialState);
  const { t } = useLanguage();

  const error =
    state.error === "missing"
      ? t("team.staffLogin.missing")
      : state.error === "invalid"
        ? t("team.staffLogin.invalid")
        : state.error === "locked"
          ? t("team.staffLogin.locked", { time: state.lockedUntil ? formatTimeKolkata(state.lockedUntil) : "" })
          : state.error === "unavailable"
            ? t("team.staffLogin.unavailable")
            : null;

  const inputClass =
    "mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none";

  return (
    <AuthCard heading={t("team.staffLogin.heading")}>
      <form action={formAction}>
        <p className="mb-4 text-sm text-muted">{t("team.staffLogin.intro")}</p>
        <label htmlFor="mobile" className="mb-1 block text-sm font-medium text-muted">
          {t("team.staffLogin.mobile")}
        </label>
        <input
          id="mobile"
          name="mobile"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          required
          className={inputClass}
        />
        <label htmlFor="pin" className="mb-1 block text-sm font-medium text-muted">
          {t("team.staffLogin.pin")}
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4,6}"
          maxLength={6}
          autoComplete="current-password"
          required
          className={inputClass}
        />
        {error && <p className="mb-4 text-sm font-medium text-danger">{error}</p>}
        <Button type="submit" loading={pending} className="w-full">
          {pending ? t("auth.signingIn") : t("auth.signIn")}
        </Button>
      </form>
      <Link
        href="/login"
        className="mt-6 block min-h-[44px] py-3 text-center text-sm font-medium text-accent hover:underline"
      >
        {t("team.staffLogin.managerLink")}
      </Link>
    </AuthCard>
  );
}
