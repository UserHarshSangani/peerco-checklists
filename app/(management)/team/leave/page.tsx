"use client";

import { useLanguage } from "@/lib/i18n/language-context";
import { useOutletContext } from "../../outlet-context";
import { LeaveBoard } from "./leave-board";

export default function TeamLeavePage() {
  const { selectedOutlet } = useOutletContext();
  const { t } = useLanguage();
  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">{t("team.leave.chooseOutlet")}</p>
      </main>
    );
  }
  return <LeaveBoard key={selectedOutlet.id} outletId={selectedOutlet.id} />;
}
