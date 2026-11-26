"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { useOutletContext } from "../../outlet-context";
import { Tabs } from "@/components/ui/tabs";
import { TemplatesTab } from "./templates-tab";
import { MinimumsTab } from "./minimums-tab";

type Tab = "templates" | "minimums";

export default function TeamShiftsPage() {
  const { selectedOutlet } = useOutletContext();
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>("templates");

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">{t("team.shifts.chooseOutlet")}</p>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6">
      <h2 className="mb-1 font-serif text-xl font-bold text-text">{t("team.shifts.heading")}</h2>
      <p className="mb-4 max-w-2xl text-sm text-muted">{t("team.shifts.intro")}</p>
      <div className="mb-6 max-w-md">
        <Tabs
          tabs={[
            { id: "templates", label: t("team.shifts.tab.templates") },
            { id: "minimums", label: t("team.shifts.tab.minimums") },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === "templates" ? (
        <TemplatesTab key={selectedOutlet.id} outletId={selectedOutlet.id} />
      ) : (
        <MinimumsTab key={selectedOutlet.id} outletId={selectedOutlet.id} />
      )}
    </main>
  );
}
