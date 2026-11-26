"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

// Small form pieces for Team screens: label above, 44px touch targets.

const CONTROL =
  "min-h-[44px] w-full rounded-lg border border-border bg-bg px-3 py-2 text-base text-text focus:border-accent focus:outline-none disabled:opacity-60";

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function CheckRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-accent)]"
      />
      <span className="flex flex-col">
        <span className="text-sm text-text">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

// Rupees typed by a person -> integer paise, or null if not a valid amount.
export function rupeesToPaise(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (trimmed === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

export function paiseToRupeesInput(paise: number | null | undefined): string {
  if (!paise) return "";
  return String(paise / 100);
}
