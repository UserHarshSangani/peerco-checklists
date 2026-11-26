"use client";

import { CalendarDays, PiggyBank, Clock } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import { formatINR } from "@/lib/team/money";
import { LogoutButton } from "@/components/logout-button";
import { Card } from "@/components/ui/card";

type Props = {
  linked: boolean;
  name: string | null;
  outletName: string | null;
  joiningDate: string | null;
  mobile: string | null;
  pay: { kind: "monthly" | "daily"; paise: number } | null;
};

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function StaffHome({ linked, name, outletName, joiningDate, mobile, pay }: Props) {
  const { t } = useLanguage();

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-bg p-4">
      <header className="flex items-center justify-between gap-3 pt-2">
        <div className="min-w-0">
          <p className="text-sm text-muted">{outletName ?? "PeerCo Daybook"}</p>
          <h1 className="truncate font-serif text-2xl font-bold text-text">
            {name ? t("team.me.hello", { name }) : t("team.me.helloNoName")}
          </h1>
        </div>
        <LogoutButton />
      </header>

      {!linked ? (
        <Card>
          <p className="text-sm text-text">{t("team.me.notLinked")}</p>
        </Card>
      ) : (
        <>
          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t("team.me.aboutYou")}</h2>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-muted">{t("team.me.mobile")}</dt>
              <dd className="text-right text-text">{mobile ?? "—"}</dd>
              <dt className="text-muted">{t("team.me.joined")}</dt>
              <dd className="text-right text-text">{joiningDate ? formatDate(joiningDate) : "—"}</dd>
              <dt className="text-muted">{pay?.kind === "daily" ? t("team.me.dailyRate") : t("team.me.monthlyPay")}</dt>
              <dd className="text-right font-medium text-text">{pay ? formatINR(pay.paise) : "—"}</dd>
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t("team.me.comingSoon")}</h2>
            <ul className="flex flex-col gap-3 text-sm text-text">
              <li className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-accent" aria-hidden="true" />
                {t("team.me.soonShifts")}
              </li>
              <li className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-accent" aria-hidden="true" />
                {t("team.me.soonLeave")}
              </li>
              <li className="flex items-center gap-3">
                <PiggyBank className="h-5 w-5 text-accent" aria-hidden="true" />
                {t("team.me.soonGullak")}
              </li>
            </ul>
          </Card>
        </>
      )}
    </main>
  );
}
