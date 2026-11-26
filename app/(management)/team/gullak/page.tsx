"use client";

import { useLanguage } from "@/lib/i18n/language-context";
import { useOutletContext } from "../../outlet-context";
import { GullakBoard } from "./gullak-board";

export default function TeamGullakPage() {
  const { selectedOutlet } = useOutletContext();
  const { t } = useLanguage();
  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">{t("team.cover.chooseOutlet")}</p>
      </main>
    );
  }
  return <GullakBoard key={selectedOutlet.id} outletId={selectedOutlet.id} />;
}
