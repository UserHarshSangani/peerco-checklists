import { ArrowDown, ArrowUp, Minus } from "lucide-react";

// Pairs an up/down arrow with text (never colour alone) comparing this
// week's number to the same weekday last week. Renders nothing when last
// week's value is unavailable.
export function DeltaIndicator({
  current,
  previous,
  higherIsBetter,
  suffix = "",
}: {
  current: number;
  previous: number | null;
  higherIsBetter: boolean;
  suffix?: string;
}) {
  if (previous == null) return null;
  const diff = current - previous;
  const favorable = higherIsBetter ? diff > 0 : diff < 0;
  const neutral = diff === 0;
  const Icon = neutral ? Minus : diff > 0 ? ArrowUp : ArrowDown;
  const tone = neutral ? "text-muted" : favorable ? "text-success" : "text-danger";
  const sign = diff > 0 ? "+" : "";

  return (
    <p className={`flex items-center gap-1 text-xs font-medium ${tone}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {sign}
      {diff}
      {suffix} vs last week
    </p>
  );
}
