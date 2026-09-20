"use client";

import { useLanguage } from "@/lib/i18n/language-context";
import { useTheme, type ThemePreference } from "./theme-provider";

const OPTIONS: { value: ThemePreference; labelKey: "common.themeLight" | "common.themeDark" | "common.themeSystem" }[] = [
  { value: "light", labelKey: "common.themeLight" },
  { value: "dark", labelKey: "common.themeDark" },
  { value: "system", labelKey: "common.themeSystem" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();

  return (
    <div
      role="radiogroup"
      aria-label={t("common.theme")}
      className="inline-flex items-center rounded-full bg-border/50 p-1"
    >
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        const label = t(option.labelKey);
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => setTheme(option.value)}
            className={`min-h-[32px] rounded-full px-3 py-1 text-xs font-semibold transition ${
              active
                ? "bg-surface text-text shadow-sm"
                : "text-muted hover:text-text"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
