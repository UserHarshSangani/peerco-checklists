"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HandHelping, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { formatDateLabel } from "@/lib/date";
import { formatINR } from "@/lib/team/money";
import { clockIST } from "@/lib/team/engines/attendance";
import { formatDuration } from "@/lib/team/engines/time";
import { kickPush } from "@/lib/team/push-kick";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { PushToggle } from "@/components/pwa/push-toggle";

export type MyCoverOffer = {
  offer_id: string;
  request_id: string;
  date: string;
  skill: string;
  start: string;
  end: string;
  minutes: number;
  amount_paise: number | null;
  response: "accepted" | "declined" | "expired" | null;
  chose_comp_off: boolean;
  selected: boolean;
  mode: "first_accept" | "manager_pick";
  expires_at: string | null;
  state: "open" | "waiting" | "yours" | "declined" | "cancelled" | "closed";
  note: string | null;
};

export type MyCover = {
  offers: MyCoverOffer[];
  points: number;
  points_per_cover: number;
  can_choose_comp_off: boolean;
  comp_off_only: boolean;
};

const TONE: Record<MyCoverOffer["state"], PillTone> = {
  open: "warning",
  waiting: "info",
  yours: "success",
  declined: "neutral",
  cancelled: "neutral",
  closed: "neutral",
};

export function MyCoverCard({ cover }: { cover: MyCover }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState<string | null>(null);

  async function answer(offer: MyCoverOffer, accept: boolean, compOff = false) {
    setBusy(offer.offer_id + (accept ? (compOff ? "c" : "a") : "d"));
    const { data, error } = await supabase.rpc("team_respond_cover", {
      p_offer: offer.offer_id,
      p_accept: accept,
      p_comp_off: compOff,
    });
    setBusy(null);
    const reply = data as { ok: boolean; reason?: string; state?: string } | null;
    if (error || !reply?.ok) {
      showError(t(`team.cover.reason.${reply?.reason ?? "bad_request"}` as TranslationKey));
      router.refresh();
      return;
    }
    kickPush();
    showSuccess(t(`team.cover.mine.done.${reply.state ?? "declined"}` as TranslationKey));
    router.refresh();
  }

  const open = cover.offers.filter((o) => o.state === "open");
  const rest = cover.offers.filter((o) => o.state !== "open").slice(0, 6);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          <HandHelping className="h-4 w-4" aria-hidden="true" />
          {t("team.cover.mine.heading")}
        </h2>
        <span className="flex items-center gap-1 text-sm font-semibold text-text">
          <Star className="h-4 w-4 text-accent" aria-hidden="true" />
          {t("team.cover.mine.points", { points: cover.points })}
        </span>
      </div>

      {open.length === 0 ? (
        <p className="text-sm text-muted">{t("team.cover.mine.none")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((offer) => (
            <li key={offer.offer_id} className="rounded-2xl bg-warning-bg/40 p-3 ring-1 ring-border">
              <p className="font-semibold text-text">
                {t("team.cover.mine.ask", { date: formatDateLabel(offer.date), start: offer.start, end: offer.end })}
              </p>
              <p className="text-sm text-muted">
                {t("team.cover.mine.detail", { skill: offer.skill.replace(/_/g, " "), hours: formatDuration(offer.minutes) })}
              </p>
              <p className="mt-1 text-sm text-text">
                {cover.comp_off_only || offer.amount_paise === null
                  ? t("team.cover.mine.rewardCompOff", { hours: formatDuration(offer.minutes), points: cover.points_per_cover })
                  : t("team.cover.mine.reward", { amount: formatINR(offer.amount_paise), points: cover.points_per_cover })}
              </p>
              {offer.note && <p className="mt-1 text-sm text-muted">“{offer.note}”</p>}
              {offer.expires_at && (
                <p className="mt-1 text-xs text-muted">{t("team.cover.mine.answerBy", { time: clockIST(offer.expires_at) })}</p>
              )}
              {offer.mode === "manager_pick" && <p className="mt-1 text-xs text-muted">{t("team.cover.mine.managerPicks")}</p>}
              <div className="mt-3 flex flex-col gap-2">
                <Button loading={busy === `${offer.offer_id}a`} disabled={Boolean(busy)} onClick={() => answer(offer, true, cover.comp_off_only)}>
                  {cover.comp_off_only ? t("team.cover.mine.acceptCompOff") : t("team.cover.mine.accept")}
                </Button>
                {cover.can_choose_comp_off && (
                  <Button
                    variant="secondary"
                    loading={busy === `${offer.offer_id}c`}
                    disabled={Boolean(busy)}
                    onClick={() => answer(offer, true, true)}
                  >
                    {t("team.cover.mine.acceptCompOff")}
                  </Button>
                )}
                <Button variant="ghost" loading={busy === `${offer.offer_id}d`} disabled={Boolean(busy)} onClick={() => answer(offer, false)}>
                  {t("team.cover.mine.decline")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rest.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-border text-sm">
          {rest.map((offer) => (
            <li key={offer.offer_id} className="flex min-h-[44px] items-center justify-between gap-3 py-2">
              <span className="text-text">
                {formatDateLabel(offer.date)} · {offer.start}–{offer.end}
              </span>
              <StatusPill tone={TONE[offer.state]}>
                {t(`team.cover.mine.state.${offer.state}` as TranslationKey)}
                {offer.state === "yours" && offer.chose_comp_off ? ` · ${t("team.cover.mine.compOffShort")}` : ""}
              </StatusPill>
            </li>
          ))}
        </ul>
      )}

      <PushToggle className="mt-3 w-full" />
    </Card>
  );
}
