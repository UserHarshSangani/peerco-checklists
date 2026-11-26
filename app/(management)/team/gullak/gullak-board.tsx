"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PiggyBank } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import { addDaysToDateString, formatDateLabel, todayInKolkata } from "@/lib/date";
import { formatINR } from "@/lib/team/money";
import { getTeamSettings } from "@/lib/team/settings/get-team-settings";
import type { TeamSettings } from "@/lib/team/settings/registry";
import { levels, rulesFromSettings } from "@/lib/team/engines/gullak";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

type Row = {
  staff_id: string;
  name: string;
  day: number;
  level_amount_paise: number;
  month_paise: number;
  payable_month_paise: number;
  locked_paise: number;
  next_unlock_date: string | null;
  last_counted_date: string | null;
  joining_known: boolean;
};

// Manager view: everyone's streak and Gullak at this outlet. Read-only —
// the ledger only changes through attendance (and payroll, later).
export function GullakBoard({ outletId }: { outletId: string }) {
  const { t } = useLanguage();
  const { showError } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const today = todayInKolkata();

  const load = useCallback(async () => {
    try {
      const [board, s] = await Promise.all([supabase.rpc("team_gullak_board", { p_outlet: outletId }), getTeamSettings(supabase, outletId)]);
      if (board.error) throw new Error(board.error.message);
      setRows((board.data ?? []) as Row[]);
      setSettings(s);
    } catch (e) {
      showError((e as Error).message);
      setRows([]);
    }
  }, [supabase, outletId, showError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the outlet's Gullak board
    void load();
  }, [load]);

  if (!rows || !settings) {
    return (
      <main className="flex-1 p-4 sm:p-6">
        <SkeletonList />
      </main>
    );
  }

  const rules = rulesFromSettings(settings);
  const { starts, amounts } = levels(rules);
  const levelText = starts
    .map((start, i) => (i + 1 < starts.length ? `${start}–${starts[i + 1] - 1}: ${formatINR(amounts[i])}` : `${start}+: ${formatINR(amounts[i])}`))
    .join(", ");
  const waitUntil = addDaysToDateString(today, -1 - settings["gullak.absence_wait_days"]);
  const sum = (k: "month_paise" | "payable_month_paise" | "locked_paise") => rows.reduce((s, r) => s + r[k], 0);

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mb-4 max-w-2xl">
        <h2 className="mb-1 flex items-center gap-2 font-serif text-xl font-bold text-text">
          <PiggyBank className="h-5 w-5 text-accent" aria-hidden="true" />
          {t("team.gullak.title")}
        </h2>
        <p className="text-sm text-muted">{t("team.gullak.subtitle")}</p>
        <p className="mt-1 text-sm text-muted">
          {t("team.gullak.rules", {
            levels: levelText,
            cap: rules.capPaise > 0 ? formatINR(rules.capPaise) : t("team.gullak.noCap"),
            months: [...rules.unlockMonths].sort((a, b) => a - b).join(", "),
          })}
        </p>
      </div>

      {!settings["gullak.enabled"] ? (
        <Card>
          <p className="text-sm text-text">{t("team.gullak.off")}</p>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState title={t("team.gullak.empty")} />
      ) : (
        <>
          <p className="mb-3 text-sm text-text">
            {t("team.gullak.totals", {
              earned: formatINR(sum("month_paise")),
              payable: formatINR(sum("payable_month_paise")),
              locked: formatINR(sum("locked_paise")),
            })}
          </p>
          <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">{t("team.gullak.col.name")}</th>
                  <th className="px-4 py-3 font-semibold">{t("team.gullak.col.day")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("team.gullak.col.daily")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("team.gullak.col.month")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("team.gullak.col.payable")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("team.gullak.col.locked")}</th>
                  <th className="px-4 py-3 font-semibold">{t("team.gullak.col.unlock")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.staff_id}>
                    <td className="px-4 py-3 font-medium text-text">{r.name}</td>
                    <td className="px-4 py-3 text-text">
                      {t("team.gullak.dayN", { day: r.day })}
                      {r.last_counted_date && r.last_counted_date < waitUntil && (
                        <span className="block text-xs text-warning-fg">
                          {t("team.gullak.waiting", { date: formatDateLabel(addDaysToDateString(r.last_counted_date, 1)) })}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-text">{formatINR(r.level_amount_paise)}</td>
                    <td className="px-4 py-3 text-right text-text">{formatINR(r.month_paise)}</td>
                    <td className="px-4 py-3 text-right text-text">{formatINR(r.payable_month_paise)}</td>
                    <td className="px-4 py-3 text-right text-text">{formatINR(r.locked_paise)}</td>
                    <td className="px-4 py-3 text-text">
                      {r.next_unlock_date ? formatDateLabel(r.next_unlock_date) : !r.joining_known ? t("team.gullak.noJoining") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
