"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/i18n/language-context";
import { useOutletContext } from "../../outlet-context";
import { CoverBoard } from "./cover-board";

function CoverPage() {
  const { selectedOutlet } = useOutletContext();
  const { t } = useLanguage();
  const params = useSearchParams();
  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">{t("team.cover.chooseOutlet")}</p>
      </main>
    );
  }
  const prefill = {
    date: params.get("date") ?? undefined,
    skill: params.get("skill") ?? undefined,
    start: params.get("start") ?? undefined,
    end: params.get("end") ?? undefined,
  };
  return <CoverBoard key={selectedOutlet.id} outletId={selectedOutlet.id} prefill={prefill} />;
}

// ?date=&skill=&start=&end= fills in the form (the roster's "Ask for cover" link).
export default function TeamCoverPage() {
  return (
    <Suspense fallback={null}>
      <CoverPage />
    </Suspense>
  );
}
