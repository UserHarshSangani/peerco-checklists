export function ProgressBar({
  value,
  className = "",
}: {
  /** 0–100 */
  value: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`h-2 w-full overflow-hidden rounded-full bg-border ${className}`}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
