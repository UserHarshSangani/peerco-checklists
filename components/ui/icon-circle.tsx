import type { ReactNode } from "react";

export type IconTone = "accent" | "success" | "warning" | "danger" | "info" | "neutral";
export type IconCircleSize = "sm" | "md" | "lg";

const TONE_CLASSES: Record<IconTone, string> = {
  accent: "bg-accent/15 text-accent",
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
  danger: "bg-danger-bg text-danger-fg",
  info: "bg-info-bg text-info-fg",
  neutral: "bg-border/50 text-muted",
};

const SIZE_CLASSES: Record<IconCircleSize, string> = {
  sm: "h-8 w-8 [&_svg]:h-4 [&_svg]:w-4",
  md: "h-11 w-11 [&_svg]:h-5 [&_svg]:w-5",
  lg: "h-14 w-14 [&_svg]:h-7 [&_svg]:w-7",
};

// A lucide-react icon inside a soft tinted circle — the standard way status
// and category icons are presented throughout the app.
export function IconCircle({
  icon,
  tone = "accent",
  size = "md",
  className = "",
}: {
  icon: ReactNode;
  tone?: IconTone;
  size?: IconCircleSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full ${TONE_CLASSES[tone]} ${SIZE_CLASSES[size]} ${className}`}
    >
      {icon}
    </span>
  );
}
