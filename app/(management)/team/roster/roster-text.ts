import { formatDateLabel } from "@/lib/date";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { RosterWarning } from "@/lib/team/engines/roster-rules";
import { formatDuration } from "@/lib/team/engines/time";

export type ShiftChoice =
  | { kind: "none" }
  | { kind: "off" }
  | { kind: "template"; templateId: string }
  | { kind: "custom"; start: string; end: string };

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export function warningText(t: T, w: RosterWarning): string {
  switch (w.kind) {
    case "daily_over":
      return t("team.roster.warn.daily_over", { date: formatDateLabel(w.date), hours: formatDuration(w.minutes) });
    case "weekly_over":
      return t("team.roster.warn.weekly_over", { hours: formatDuration(w.minutes) });
    case "short_rest":
      return t("team.roster.warn.short_rest", { date: formatDateLabel(w.date), hours: formatDuration(w.minutes) });
    case "late_without_consent":
      return t("team.roster.warn.late_without_consent", { date: formatDateLabel(w.date) });
    case "no_weekly_off":
      return t("team.roster.warn.no_weekly_off");
  }
}
