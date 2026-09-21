"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayInKolkata, formatDateLabelForLocale } from "@/lib/date";
import { fetchSignedPhotoUrls } from "@/lib/photo-signed-urls";
import { useMediaQuery } from "@/lib/use-media-query";
import { useOutletContext, type ManagedOutlet } from "../outlet-context";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonList } from "@/components/ui/skeleton";
import { AlertsBanner } from "./alerts-banner";
import { KpiCards } from "./kpi-cards";
import { CompletionTrendChart } from "./completion-trend-chart";
import { OutletTable } from "./outlet-table";
import { OutletProgressList } from "./outlet-progress-list";
import { TopVariances } from "./top-variances";
import { ActivityFeed } from "./activity-feed";
import { CollapsibleCard } from "./collapsible-card";
import { BookingAlertsCard } from "./booking-alerts-card";
import type { OverviewData, OverviewResponse } from "./types";

function greetingForHour(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function reasonMessage(reason: string): string {
  switch (reason) {
    case "not_allowed":
      return "You don't have permission to view this.";
    case "bad_date":
      return "That date isn't available.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export default function DashboardPage() {
  const { outlets } = useOutletContext();
  const { showError } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [userName, setUserName] = useState("");
  const [date, setDate] = useState(() => todayInKolkata());
  const [outletFilterId, setOutletFilterId] = useState<string | null>(null);
  const [data, setData] = useState<OverviewData | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || cancelled) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      setUserName(profile?.full_name ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      const { data: raw, error } = await supabase.rpc("get_overview", {
        p_date: date,
        p_outlet_id: outletFilterId,
      });
      if (cancelled) return;
      if (error) {
        setLoading(false);
        setLoadError(error.message);
        showError(error.message);
        return;
      }
      const result = raw as OverviewResponse;
      if (!result.ok) {
        setLoading(false);
        const message = reasonMessage(result.reason);
        setLoadError(message);
        showError(message);
        return;
      }
      const paths = Array.from(new Set(result.activity.flatMap((entry) => entry.photos)));
      const urls = await fetchSignedPhotoUrls(supabase, paths);
      if (cancelled) return;
      setData(result);
      setPhotoUrls(urls);
      setLoading(false);
    }

    // Deferred so load()'s own first statements (setLoading/setLoadError,
    // before its first await) aren't a synchronous setState from within
    // the effect body itself.
    Promise.resolve().then(load);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, date, outletFilterId, refreshToken]);

  // Auto-refresh every 60s while the tab is visible and today is selected.
  useEffect(() => {
    if (date !== todayInKolkata()) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setRefreshToken((n) => n + 1);
      }
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [date]);

  const firstName = userName.trim().split(/\s+/)[0] || null;
  const isToday = date === todayInKolkata();
  const showBrand = new Set(outlets.map((outlet) => outlet.organizationId)).size > 1;

  const groups = new Map<string, ManagedOutlet[]>();
  for (const outlet of outlets) {
    const key = outlet.organizationName ?? "Outlets";
    const list = groups.get(key) ?? [];
    list.push(outlet);
    groups.set(key, list);
  }

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-text">
            {greetingForHour()}
            {firstName ? `, ${firstName}` : ""}
          </h2>
          <p className="text-sm text-muted">
            {isToday
              ? "Here's what's happening across your outlets today."
              : `Here's how ${formatDateLabelForLocale(date, "en")} went.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            max={todayInKolkata()}
            onChange={(event) => setDate(event.target.value)}
            className="min-h-[44px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          />
          <select
            value={outletFilterId ?? ""}
            onChange={(event) => setOutletFilterId(event.target.value || null)}
            className="min-h-[44px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          >
            <option value="">All outlets</option>
            {showBrand
              ? Array.from(groups.entries()).map(([groupName, groupOutlets]) => (
                  <optgroup key={groupName} label={groupName}>
                    {groupOutlets.map((outlet) => (
                      <option key={outlet.id} value={outlet.id}>
                        {outlet.name}
                      </option>
                    ))}
                  </optgroup>
                ))
              : outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </option>
                ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            loading={loading}
            onClick={() => setRefreshToken((n) => n + 1)}
          >
            Refresh
          </Button>
        </div>
      </div>

      {loading && !data && <SkeletonList rows={4} rowClassName="h-24" />}

      {loadError && (
        <Card className="mb-6">
          <p className="mb-3 text-danger">{loadError}</p>
          <Button type="button" onClick={() => setRefreshToken((n) => n + 1)}>
            Retry
          </Button>
        </Card>
      )}

      {data && (
        <div className="flex flex-col gap-6">
          <AlertsBanner alerts={data.alerts} />
          <KpiCards kpis={data.kpis} />
          <BookingAlertsCard outlets={outlets} />

          {isDesktop ? (
            <>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
                <Card>
                  <h3 className="mb-4 font-serif text-base font-bold text-text">
                    Weekly checklist completion
                  </h3>
                  <CompletionTrendChart trend={data.trend} />
                </Card>
                <Card>
                  <h3 className="mb-4 font-serif text-base font-bold text-text">
                    Completion by outlet
                  </h3>
                  <OutletTable
                    outlets={data.outlets}
                    isAdmin={showBrand}
                    onSelectOutlet={setOutletFilterId}
                  />
                </Card>
              </div>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr]">
                <Card>
                  <h3 className="mb-4 font-serif text-base font-bold text-text">
                    Top variances (last 7 days)
                  </h3>
                  <TopVariances variances={data.top_variances} />
                </Card>
                <Card>
                  <h3 className="mb-4 font-serif text-base font-bold text-text">
                    Recent activity
                  </h3>
                  <ActivityFeed activity={data.activity} photoUrls={photoUrls} />
                </Card>
              </div>
            </>
          ) : (
            <>
              <Card>
                <h3 className="mb-4 font-serif text-base font-bold text-text">
                  Completion by outlet
                </h3>
                <OutletProgressList
                  outlets={data.outlets}
                  isAdmin={showBrand}
                  onSelectOutlet={setOutletFilterId}
                />
              </Card>
              <Card>
                <h3 className="mb-4 font-serif text-base font-bold text-text">
                  Recent activity
                </h3>
                <ActivityFeed activity={data.activity} photoUrls={photoUrls} />
              </Card>
              <CollapsibleCard title="Weekly checklist completion">
                <CompletionTrendChart trend={data.trend} />
              </CollapsibleCard>
              <CollapsibleCard title="Top variances (last 7 days)">
                <TopVariances variances={data.top_variances} />
              </CollapsibleCard>
            </>
          )}
        </div>
      )}
    </main>
  );
}
