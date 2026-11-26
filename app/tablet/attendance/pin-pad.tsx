"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { Button } from "@/components/ui/button";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

// PIN keypad for check-in/out. Clears itself after every attempt.
export function PinPad({
  busy,
  onSubmit,
  submitLabel,
}: {
  busy: boolean;
  onSubmit: (pin: string) => Promise<boolean>;
  submitLabel: string;
}) {
  const { t } = useLanguage();
  const [pin, setPin] = useState("");

  const press = (digit: string) => {
    navigator.vibrate?.(10);
    setPin((p) => (p.length >= 6 ? p : p + digit));
  };
  const key = "min-h-16 rounded-2xl bg-surface text-2xl font-semibold text-text ring-1 ring-border active:scale-[0.98]";

  return (
    <div className="w-full">
      <p className="mb-3 text-center text-sm text-muted">{t("tablet.enterPin")}</p>
      <div className="mb-4 flex justify-center gap-3" aria-live="polite">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className={`h-4 w-4 rounded-full border-2 ${i < pin.length ? "border-accent bg-accent" : "border-border"}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {DIGITS.map((d) => (
          <button key={d} type="button" className={key} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={`${key} text-sm text-muted`} onClick={() => setPin("")}>
          {t("tablet.clear")}
        </button>
        <button type="button" className={key} onClick={() => press("0")}>
          0
        </button>
        <button type="button" aria-label={t("tablet.backspace")} className={`${key} text-sm text-muted`} onClick={() => setPin((p) => p.slice(0, -1))}>
          ⌫
        </button>
      </div>
      <Button
        className="mt-4 w-full"
        disabled={pin.length < 4}
        loading={busy}
        onClick={async () => {
          const value = pin;
          setPin("");
          await onSubmit(value);
        }}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
