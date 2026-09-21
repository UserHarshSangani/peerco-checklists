"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOutletContext } from "../outlet-context";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { SlotsTab } from "./slots-tab";
import { EnterSlotsDrawer } from "./enter-slots-drawer";
import { AlertsTab } from "./alerts-tab";
import { HoursSourcesTab } from "./hours-sources-tab";
import type { BookingSource } from "./types";

type Tab = "slots" | "alerts" | "hours";

// sessionStorage (not localStorage): the throttle is meant to bound how
// often one open tab/session can trigger a sweep, not to persist across
// browser restarts.
const SWEEP_STORAGE_KEY = "peerco:booking-sweep-last-run";
const AUTO_SWEEP_THROTTLE_MS = 10 * 60 * 1000;
const RECHECK_THROTTLE_MS = 30 * 1000;

function readLastSweepAt(): number {
  try {
    return Number(window.sessionStorage.getItem(SWEEP_STORAGE_KEY) ?? "0");
  } catch {
    return 0;
  }
}

function writeLastSweepAt(timestamp: number) {
  try {
    window.sessionStorage.setItem(SWEEP_STORAGE_KEY, String(timestamp));
  } catch {
    // ignore — the throttle just won't be remembered this session
  }
}

export default function BookingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedOutlet } = useOutletContext();
  const { showError } = useToast();
  const [tab, setTab] = useState<Tab>("slots");
  const [sources, setSources] = useState<BookingSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [enterSourceId, setEnterSourceId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOutlet) return;
    let cancelled = false;
    async function load() {
      setLoadingSources(true);
      const { data } = await supabase
        .from("booking_sources")
        .select("*")
        .eq("outlet_id", selectedOutlet!.id)
        .order("platform");
      if (cancelled) return;
      setSources((data as BookingSource[]) ?? []);
      setLoadingSources(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedOutlet, refreshToken]);

  useEffect(() => {
    Promise.resolve().then(() => void maybeAutoSweep());

    async function maybeAutoSweep() {
      if (Date.now() - readLastSweepAt() < AUTO_SWEEP_THROTTLE_MS) return;
      writeLastSweepAt(Date.now());
      await supabase.rpc("booking_health_sweep");
      setRefreshToken((prev) => prev + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per page load only
  }, []);

  async function recheck() {
    const sinceLast = Date.now() - readLastSweepAt();
    if (sinceLast < RECHECK_THROTTLE_MS) {
      showError(
        `Please wait ${Math.ceil((RECHECK_THROTTLE_MS - sinceLast) / 1000)}s before rechecking again.`,
      );
      return;
    }
    writeLastSweepAt(Date.now());
    setSweeping(true);
    await supabase.rpc("booking_health_sweep");
    setSweeping(false);
    setRefreshToken((prev) => prev + 1);
  }

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">Choose an outlet to see bookings.</p>
      </main>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "slots", label: "Slots" },
    { id: "alerts", label: "Alerts" },
    { id: "hours", label: "Sources and hours" },
  ];

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-serif text-xl font-bold text-text">Bookings</h2>
        <Button type="button" variant="secondary" loading={sweeping} onClick={recheck}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Recheck
        </Button>
      </div>

      <div className="mb-6">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>

      {loadingSources ? (
        <SkeletonList rows={4} rowClassName="h-16" />
      ) : (
        <>
          {tab === "slots" && (
            <SlotsTab
              key={`slots-${selectedOutlet.id}`}
              outletId={selectedOutlet.id}
              sources={sources}
              refreshToken={refreshToken}
              onEnterSlots={setEnterSourceId}
            />
          )}
          {tab === "alerts" && (
            <AlertsTab
              key={`alerts-${selectedOutlet.id}`}
              outletId={selectedOutlet.id}
              sources={sources}
              refreshToken={refreshToken}
            />
          )}
          {tab === "hours" && (
            <HoursSourcesTab
              key={`hours-${selectedOutlet.id}`}
              outletId={selectedOutlet.id}
              sources={sources}
              onSourcesChange={setSources}
            />
          )}
        </>
      )}

      {enterSourceId && (
        <EnterSlotsDrawer
          outletId={selectedOutlet.id}
          sources={sources}
          defaultSourceId={enterSourceId}
          onClose={() => setEnterSourceId(null)}
          onSubmitted={() => setRefreshToken((prev) => prev + 1)}
        />
      )}
    </main>
  );
}
