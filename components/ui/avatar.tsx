const RING_TONES = [
  "ring-accent text-accent bg-accent/15",
  "ring-info-fg text-info-fg bg-info-bg",
  "ring-warning-fg text-warning-fg bg-warning-bg",
  "ring-success-fg text-success-fg bg-success-bg",
  "ring-danger-fg text-danger-fg bg-danger-bg",
] as const;

const SIZE_CLASSES = {
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-16 w-16 text-lg",
} as const;

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function toneForName(name: string): (typeof RING_TONES)[number] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return RING_TONES[Math.abs(hash) % RING_TONES.length];
}

// Initials avatar with a deterministic (name-derived) coloured ring, so the
// same person always gets the same colour without any stored preference.
export function Avatar({
  name,
  size = "md",
  className = "",
}: {
  name: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ${toneForName(name)} ${SIZE_CLASSES[size]} ${className}`}
    >
      {getInitials(name)}
    </span>
  );
}
