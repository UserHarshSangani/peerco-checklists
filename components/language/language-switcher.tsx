"use client";

import { useLanguage } from "@/lib/i18n/language-context";
import { LOCALE_NAMES, type Locale } from "@/lib/i18n/translations";

const LOCALES: Locale[] = ["en", "hi", "mr"];

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLanguage();

  return (
    <select
      aria-label={t("common.language")}
      value={locale}
      onChange={(event) => setLocale(event.target.value as Locale)}
      className="min-h-[40px] rounded-full border border-border bg-surface px-3 text-sm font-medium text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {LOCALES.map((value) => (
        <option key={value} value={value}>
          {LOCALE_NAMES[value]}
        </option>
      ))}
    </select>
  );
}
