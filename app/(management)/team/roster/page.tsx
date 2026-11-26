"use client";

import { useLanguage } from "@/lib/i18n/language-context";
import { useOutletContext } from "../../outlet-context";
import { RosterWeek } from "./roster-week";

export default function TeamRosterPage() {
  const { selectedOutlet } = useOutletContext();
  const { t } = useLanguage();
  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">{t("team.roster.chooseOutlet")}</p>
      </main>
    );
  }
  return <RosterWeek key={selectedOutlet.id} outletId={selectedOutlet.id} />;
}
