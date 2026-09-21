"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { unwrapOne } from "@/lib/supabase/embed";
import { useLanguage } from "@/lib/i18n/language-context";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

type OutletRow = {
  id: string;
  name: string;
  organizationName: string | null;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusM: number;
};

export default function OutletsPage() {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [outlets, setOutlets] = useState<OutletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("outlets")
      .select("id, name, latitude, longitude, geofence_radius_m, organizations(name)")
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          setLoadError(error.message);
          return;
        }
        setOutlets(
          (data ?? []).map((row) => ({
            id: row.id,
            name: row.name,
            organizationName: unwrapOne(row.organizations)?.name ?? null,
            latitude: row.latitude,
            longitude: row.longitude,
            geofenceRadiusM: row.geofence_radius_m,
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const groups = new Map<string, OutletRow[]>();
  for (const outlet of outlets) {
    const key = outlet.organizationName ?? "Outlets";
    const list = groups.get(key) ?? [];
    list.push(outlet);
    groups.set(key, list);
  }
  const showGroups = groups.size > 1;

  function statusText(outlet: OutletRow): string {
    if (outlet.latitude == null || outlet.longitude == null) {
      return t("outlets.locationNotSet");
    }
    return t("outlets.locationSet", { radius: outlet.geofenceRadiusM });
  }

  function renderRow(outlet: OutletRow) {
    const isSet = outlet.latitude != null && outlet.longitude != null;
    return (
      <Link
        key={outlet.id}
        href={`/outlets/${outlet.id}`}
        className="flex min-h-16 items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border transition hover:bg-border/20"
      >
        <span className="text-base font-medium text-text">{outlet.name}</span>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
            isSet ? "bg-success/15 text-success" : "bg-border/50 text-muted"
          }`}
        >
          {statusText(outlet)}
        </span>
      </Link>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6">
      <h2 className="mb-6 font-serif text-xl font-bold text-text">
        {t("outlets.heading")}
      </h2>

      {loading && <SkeletonList rows={3} rowClassName="h-16" />}
      {loadError && (
        <p className="text-danger">
          {t("outlets.loadError", { error: loadError })}
        </p>
      )}
      {!loading && !loadError && outlets.length === 0 && (
        <EmptyState title={t("common.noOutlets")} />
      )}

      {showGroups ? (
        <div className="flex flex-col gap-6">
          {Array.from(groups.entries()).map(([groupName, groupOutlets]) => (
            <div key={groupName}>
              <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
                {groupName}
              </h3>
              <div className="flex flex-col gap-3">
                {groupOutlets.map(renderRow)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">{outlets.map(renderRow)}</div>
      )}
    </main>
  );
}
