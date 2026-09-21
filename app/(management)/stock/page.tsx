"use client";

import { useState } from "react";
import { todayInKolkata } from "@/lib/date";
import { useLanguage } from "@/lib/i18n/language-context";
import { useOutletContext } from "../outlet-context";
import { CountsTab } from "./counts-tab";
import { ReceiptsTab } from "./receipts-tab";
import { WastageTab } from "./wastage-tab";

type Tab = "counts" | "receipts" | "wastage";

export default function StockPage() {
  const { t } = useLanguage();
  const { selectedOutlet } = useOutletContext();
  const [date, setDate] = useState(() => todayInKolkata());
  const [tab, setTab] = useState<Tab>("counts");

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">{t("stock.chooseOutlet")}</p>
      </main>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "counts", label: t("stock.countsTab") },
    { id: "receipts", label: t("stock.receiptsTab") },
    { id: "wastage", label: t("stock.wastageTab") },
  ];

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-serif text-xl font-bold text-text">
          {t("stock.heading")}
        </h2>
        <label className="flex items-center gap-2 text-sm font-medium text-muted">
          {t("stock.dateLabel")}
          <input
            type="date"
            value={date}
            max={todayInKolkata()}
            onChange={(event) => setDate(event.target.value)}
            className="min-h-[40px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 rounded-full bg-surface p-1 ring-1 ring-border">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`min-h-[40px] flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
              tab === item.id
                ? "bg-accent text-accent-fg"
                : "text-muted hover:text-text"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "counts" && (
        <CountsTab
          key={`counts-${selectedOutlet.id}-${date}`}
          outletId={selectedOutlet.id}
          date={date}
        />
      )}
      {tab === "receipts" && (
        <ReceiptsTab
          key={`receipts-${selectedOutlet.id}-${date}`}
          outletId={selectedOutlet.id}
          date={date}
        />
      )}
      {tab === "wastage" && (
        <WastageTab
          key={`wastage-${selectedOutlet.id}-${date}`}
          outletId={selectedOutlet.id}
          date={date}
        />
      )}
    </main>
  );
}
