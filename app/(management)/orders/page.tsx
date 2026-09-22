"use client";

import { useState } from "react";
import { addDaysToDateString, todayInKolkata } from "@/lib/date";
import { useOutletContext } from "../outlet-context";
import { Tabs } from "@/components/ui/tabs";
import { DraftPanel } from "./draft-panel";
import { HistoryPanel } from "./history-panel";

type View = "draft" | "history";
type DateChoice = "today" | "yesterday";

export default function OrdersPage() {
  const { selectedOutlet } = useOutletContext();
  const [view, setView] = useState<View>("draft");
  const [dateChoice, setDateChoice] = useState<DateChoice>("today");

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">Choose an outlet to manage orders.</p>
      </main>
    );
  }

  const today = todayInKolkata();
  const date = dateChoice === "today" ? today : addDaysToDateString(today, -1);

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-serif text-xl font-bold text-text">Orders</h2>
        <Tabs
          tabs={[
            { id: "draft", label: "Current draft" },
            { id: "history", label: "Order history" },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {view === "draft" && (
        <>
          <div className="mb-6">
            <Tabs
              tabs={[
                { id: "today", label: "Today" },
                { id: "yesterday", label: "Yesterday" },
              ]}
              value={dateChoice}
              onChange={setDateChoice}
            />
          </div>
          <DraftPanel
            key={`${selectedOutlet.id}-${date}`}
            outletId={selectedOutlet.id}
            outletName={selectedOutlet.name}
            date={date}
          />
        </>
      )}

      {view === "history" && (
        <HistoryPanel key={selectedOutlet.id} outletId={selectedOutlet.id} outletName={selectedOutlet.name} />
      )}
    </main>
  );
}
