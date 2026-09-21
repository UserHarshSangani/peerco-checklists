"use client";

import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { formatDistanceMeters } from "@/lib/location-format";

export type LocationStatus =
  | "inside"
  | "outside"
  | "low_accuracy"
  | "denied"
  | "unavailable"
  | "not_configured"
  | "not_recorded";

type BadgeStatus = Exclude<LocationStatus, "not_recorded" | "outside">;

const BADGE_CLASSNAME: Record<BadgeStatus, string> = {
  inside: "bg-success/15 text-success",
  low_accuracy: "bg-warning/15 text-warning",
  denied: "bg-warning/15 text-warning",
  unavailable: "bg-border/50 text-muted",
  not_configured: "bg-border/50 text-muted",
};

const BADGE_LABEL_KEY: Record<BadgeStatus, TranslationKey> = {
  inside: "location.inside",
  low_accuracy: "location.lowAccuracy",
  denied: "location.denied",
  unavailable: "location.unavailable",
  not_configured: "location.notConfigured",
};

// Old submissions predate this feature and are "not_recorded" — nothing to
// show for those, per spec.
export function LocationBadge({
  status,
  distanceM,
}: {
  status: LocationStatus;
  distanceM: number | null;
}) {
  const { t } = useLanguage();

  if (status === "not_recorded") return null;

  if (status === "outside") {
    return (
      <span className="inline-flex w-fit rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-semibold text-danger">
        {t("location.outside", {
          distance: distanceM != null ? formatDistanceMeters(distanceM) : "",
        })}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_CLASSNAME[status]}`}
    >
      {t(BADGE_LABEL_KEY[status])}
    </span>
  );
}

// /history: which dates the "Show only flagged" toggle keeps.
export function isFlaggedLocationStatus(status: LocationStatus): boolean {
  return (
    status === "outside" || status === "denied" || status === "low_accuracy"
  );
}

// /history: which cells get the small at-a-glance marker dot, a narrower
// set than the flagged filter above.
export function isMarkerLocationStatus(status: LocationStatus): boolean {
  return status === "outside" || status === "denied";
}
