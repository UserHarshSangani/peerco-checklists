import type { ReactNode } from "react";

export type PillTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CLASSES: Record<PillTone, string> = {
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
  danger: "bg-danger-bg text-danger-fg",
  info: "bg-info-bg text-info-fg",
  neutral: "bg-border/50 text-muted",
};

// Status is always paired with an icon and text, never colour alone (per
// the design brief) — pass `icon` for anything shown as a status signal.
export function StatusPill({
  tone = "neutral",
  icon,
  children,
  className = "",
}: {
  tone?: PillTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${TONE_CLASSES[tone]} ${className}`}
    >
      {icon && (
        <span aria-hidden="true" className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
