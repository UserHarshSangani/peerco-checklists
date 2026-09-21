"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeKolkata } from "@/lib/date";
import { formatQuantity, formatRupees } from "@/lib/format";
import { fetchStaffNames } from "@/lib/staff-names";
import { fetchSignedPhotoUrls } from "@/lib/photo-signed-urls";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { WastageReason } from "@/lib/types";
import { LocationBadge, type LocationStatus } from "@/components/location-badge";
import { Modal } from "@/components/ui/modal";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

const REASON_LABEL_KEY: Record<WastageReason, TranslationKey> = {
  spoilage: "tablet.wastage.reason.spoilage",
  prep_waste: "tablet.wastage.reason.prep_waste",
  breakage: "tablet.wastage.reason.breakage",
  staff_meal: "tablet.wastage.reason.staff_meal",
  complimentary: "tablet.wastage.reason.complimentary",
  other: "tablet.wastage.reason.other",
};

type Entry = {
  id: string;
  item_id: string | null;
  item_name: string;
  unit: string;
  quantity: number;
  reason: WastageReason;
  note: string | null;
  photo_path: string | null;
  staff_id: string;
  logged_at: string;
  location_status: LocationStatus;
  distance_from_outlet_m: number | null;
};

export function WastageTab({ outletId, date }: { outletId: string; date: string }) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [costByItemId, setCostByItemId] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: rows, error } = await supabase
        .from("wastage_entries")
        .select(
          "id, item_id, item_name, unit, quantity, reason, note, photo_path, staff_id, logged_at, location_status, distance_from_outlet_m",
        )
        .eq("outlet_id", outletId)
        .eq("business_date", date)
        .order("logged_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        setLoading(false);
        setLoadError(error.message);
        return;
      }

      const entryRows = rows ?? [];
      const itemIds = Array.from(
        new Set(
          entryRows.map((row) => row.item_id).filter((id): id is string => !!id),
        ),
      );
      let costMap: Record<string, number> = {};
      if (itemIds.length > 0) {
        const { data: items } = await supabase
          .from("inventory_items")
          .select("id, cost_per_unit")
          .in("id", itemIds);
        costMap = Object.fromEntries(
          (items ?? [])
            .filter((item) => item.cost_per_unit != null)
            .map((item) => [item.id, item.cost_per_unit as number]),
        );
      }

      const names = await fetchStaffNames(
        supabase,
        entryRows.map((row) => row.staff_id),
      );
      const urls = await fetchSignedPhotoUrls(
        supabase,
        entryRows
          .map((row) => row.photo_path)
          .filter((path): path is string => !!path),
      );
      if (cancelled) return;

      setEntries(
        entryRows.map((row) => ({
          id: row.id,
          item_id: row.item_id,
          item_name: row.item_name,
          unit: row.unit,
          quantity: row.quantity,
          reason: row.reason as WastageReason,
          note: row.note,
          photo_path: row.photo_path,
          staff_id: row.staff_id,
          logged_at: row.logged_at,
          location_status: row.location_status as LocationStatus,
          distance_from_outlet_m: row.distance_from_outlet_m,
        })),
      );
      setStaffNames(names);
      setPhotoUrls(urls);
      setCostByItemId(costMap);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, outletId, date]);

  const summary = useMemo(() => {
    const byReason = new Map<WastageReason, { count: number; value: number }>();
    for (const entry of entries) {
      const cost = entry.item_id ? costByItemId[entry.item_id] : undefined;
      const current = byReason.get(entry.reason) ?? { count: 0, value: 0 };
      current.count += 1;
      if (cost != null) current.value += cost * entry.quantity;
      byReason.set(entry.reason, current);
    }
    return byReason;
  }, [entries, costByItemId]);

  if (loading) return <SkeletonList rows={4} rowClassName="h-20" />;
  if (loadError) {
    return (
      <p className="text-danger">
        {t("stock.loadError", { error: loadError })}
      </p>
    );
  }
  if (entries.length === 0) {
    return <EmptyState title={t("stock.noWastage")} />;
  }

  return (
    <>
      <div className="mb-6 overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-border">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left font-semibold text-muted">
                {t("stock.reasonColumn")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-muted">
                {t("stock.entriesColumn")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-muted">
                {t("stock.valueColumn")}
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from(summary.entries()).map(([reason, totals]) => (
              <tr key={reason} className="border-b border-border last:border-0">
                <td className="px-4 py-3 whitespace-nowrap text-text">
                  {t(REASON_LABEL_KEY[reason])}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">
                  {totals.count}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">
                  {formatRupees(totals.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border"
          >
            <div className="flex-1">
              <p className="text-base font-medium text-text">
                {entry.item_name} — {formatQuantity(entry.quantity)} {entry.unit}
              </p>
              <p className="text-sm text-muted">
                {t(REASON_LABEL_KEY[entry.reason])}
              </p>
              {entry.note && (
                <p className="mt-1 text-sm text-muted">
                  {t("manager.note", { note: entry.note })}
                </p>
              )}
              <p className="mt-1 text-sm text-muted">
                {t("manager.submittedAt", {
                  name: staffNames[entry.staff_id] ?? "—",
                  time: formatTimeKolkata(entry.logged_at),
                })}
              </p>
              <div className="mt-1">
                <LocationBadge
                  status={entry.location_status}
                  distanceM={entry.distance_from_outlet_m}
                />
              </div>
            </div>
            {entry.photo_path && (
              <div>
                {photoUrls[entry.photo_path] ? (
                  <button
                    type="button"
                    onClick={() => setViewerUrl(photoUrls[entry.photo_path!])}
                    aria-label={t("manager.viewPhoto")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not an optimizable static asset */}
                    <img
                      src={photoUrls[entry.photo_path]}
                      alt={t("manager.viewPhoto")}
                      className="h-16 w-16 rounded-lg object-cover ring-1 ring-border transition hover:opacity-80"
                    />
                  </button>
                ) : (
                  <p className="text-sm text-muted">
                    {t("manager.photoUnavailable")}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {viewerUrl && (
        <Modal
          onClose={() => setViewerUrl(null)}
          panelClassName="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-surface p-2 shadow-xl outline-none"
        >
          <div className="flex justify-end p-2">
            <button
              type="button"
              onClick={() => setViewerUrl(null)}
              className="min-h-[40px] text-sm font-medium text-muted hover:text-text"
            >
              {t("common.close")}
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not an optimizable static asset */}
          <img
            src={viewerUrl}
            alt={t("manager.viewPhoto")}
            className="max-h-[75vh] w-full rounded-2xl object-contain"
          />
        </Modal>
      )}
    </>
  );
}
