"use client";

import { PiggyBank } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { formatDateLabel } from "@/lib/date";
import { formatINR } from "@/lib/team/money";
import { Card } from "@/components/ui/card";

export type MyGullak = {
  enabled: boolean;
  day: number;
  level: number;
  level_amount_paise: number;
  next_level_day: number | null;
  next_level_amount_paise: number | null;
  today_paise: number;
  month_paise: number;
  cap_paise: number;
  payable_month_paise: number;
  total_paise: number;
  locked_paise: number;
  next_unlock_date: string | null;
  next_unlock_months: number | null;
  joining_known: boolean;
  history: { date: string; kind: "credit" | "unlock" | "payout" | "forfeit"; amount_paise: number; day: number | null; months: number | null }[];
};

// The staff phone's Gullak card. Always worded as what's saved and what
// unlocks — never as what could be lost.
export function MyGullakCard({ gullak, checkedIn }: { gullak: MyGullak; checkedIn: boolean }) {
  const { t } = useLanguage();
  const capReached = gullak.cap_paise > 0 && gullak.month_paise >= gullak.cap_paise;
  const fresh = gullak.total_paise === 0 && gullak.day === 0;

  return (
    <Card>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        <PiggyBank className="h-4 w-4 text-accent" aria-hidden="true" />
        {t("team.gullak.mine.heading")}
      </h2>

      {fresh ? (
        <p className="text-sm text-text">{t("team.gullak.mine.start")}</p>
      ) : (
        <>
          <p className="text-base font-semibold text-text">
            {t("team.gullak.mine.day", { day: gullak.day })}
            {" · "}
            {gullak.today_paise > 0
              ? t("team.gullak.mine.today", { amount: formatINR(gullak.today_paise) })
              : !checkedIn && !capReached
                ? t("team.gullak.mine.todayNext", { amount: formatINR(gullak.level_amount_paise) })
                : null}
          </p>
          <p className="mt-1 font-serif text-3xl font-bold text-text">{t("team.gullak.mine.total", { amount: formatINR(gullak.total_paise) })}</p>
          {gullak.locked_paise > 0 && (
            <p className="mt-1 text-sm font-medium text-success-fg">
              {gullak.next_unlock_date
                ? t("team.gullak.mine.unlocks", { amount: formatINR(gullak.locked_paise), date: formatDateLabel(gullak.next_unlock_date) })
                : t("team.gullak.mine.unlocksNoDate", { amount: formatINR(gullak.locked_paise) })}
            </p>
          )}
        </>
      )}

      <p className="mt-3 text-sm text-muted">
        {gullak.next_level_day !== null && gullak.next_level_amount_paise !== null
          ? t("team.gullak.mine.nextLevel", {
              days: Math.max(gullak.next_level_day - gullak.day, 1),
              amount: formatINR(gullak.next_level_amount_paise),
            })
          : t("team.gullak.mine.topLevel")}
      </p>
      {capReached && <p className="mt-1 text-sm text-muted">{t("team.gullak.mine.capReached")}</p>}

      <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted">{t("team.gullak.mine.thisMonth")}</dt>
        <dd className="text-right font-medium text-text">{formatINR(gullak.payable_month_paise)}</dd>
      </dl>

      {gullak.history.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{t("team.gullak.mine.history")}</h3>
          <ul className="mt-1 flex flex-col divide-y divide-border text-sm">
            {gullak.history.slice(0, 6).map((h) => (
              <li key={`${h.date}-${h.kind}`} className="flex min-h-[44px] items-center justify-between gap-3 py-2">
                <span className="text-text">
                  {formatDateLabel(h.date)} · {t(`team.gullak.mine.kind.${h.kind}` as TranslationKey, { day: h.day ?? "", months: h.months ?? "" })}
                </span>
                <span className="font-medium text-text">
                  {h.kind === "credit" || h.kind === "unlock" ? "+" : ""}
                  {formatINR(Math.abs(h.amount_paise))}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
