export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-border/60 motion-reduce:animate-none ${className}`}
    />
  );
}

export function SkeletonList({
  rows = 3,
  rowClassName = "h-16",
}: {
  rows?: number;
  rowClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={`w-full ${rowClassName}`} />
      ))}
    </div>
  );
}
