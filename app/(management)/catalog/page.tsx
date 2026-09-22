"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/i18n/language-context";
import { useOutletContext } from "../outlet-context";
import { ItemsTab } from "./items-tab";
import { VendorsTab } from "./vendors-tab";
import { OutletSettingsTab } from "./outlet-settings-tab";

type Tab = "items" | "vendors" | "outlet-settings";

function isTab(value: string | null): value is Tab {
  return value === "items" || value === "vendors" || value === "outlet-settings";
}

export default function CatalogPage() {
  const { t } = useLanguage();
  const { selectedOutlet } = useOutletContext();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const highlightItemId = searchParams.get("item");
  const [tab, setTab] = useState<Tab>(isTab(requestedTab) ? requestedTab : "items");

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">{t("catalog.chooseOutlet")}</p>
      </main>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "items", label: t("catalog.itemsTab") },
    { id: "vendors", label: t("catalog.vendorsTab") },
    { id: "outlet-settings", label: t("catalog.outletSettingsTab") },
  ];

  return (
    <main className="flex-1 p-4 sm:p-6">
      <h2 className="mb-4 font-serif text-xl font-bold text-text">
        {t("catalog.heading")}
      </h2>
      {selectedOutlet.organizationName && (
        <p className="mb-4 text-sm text-muted">
          {t("catalog.brandLabel", { brand: selectedOutlet.organizationName })}
        </p>
      )}
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

      {tab === "items" && (
        <ItemsTab
          key={`items-${selectedOutlet.organizationId}`}
          organizationId={selectedOutlet.organizationId}
        />
      )}
      {tab === "vendors" && (
        <VendorsTab
          key={`vendors-${selectedOutlet.organizationId}`}
          organizationId={selectedOutlet.organizationId}
        />
      )}
      {tab === "outlet-settings" && (
        <OutletSettingsTab
          key={`outlet-${selectedOutlet.id}`}
          outletId={selectedOutlet.id}
          organizationId={selectedOutlet.organizationId}
          highlightItemId={highlightItemId}
        />
      )}
    </main>
  );
}
