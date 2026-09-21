"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDaysToDateString, formatTimeKolkata } from "@/lib/date";
import { formatQuantity } from "@/lib/format";
import { fetchStaffNames } from "@/lib/staff-names";
import { useLanguage } from "@/lib/i18n/language-context";
import { LocationBadge, type LocationStatus } from "@/components/location-badge";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

type CountLine = {
  item_id: string | null;
  item_name: string;
  unit: string;
  quantity: number;
};

type CountSubmission = {
  id: string;
  kind: "opening" | "closing";
  business_date: string;
  staff_id: string;
  submitted_at: string;
  location_status: LocationStatus;
  distance_from_outlet_m: number | null;
  lines: CountLine[];
};

type ItemValue = { name: string; unit: string; quantity: number };

function mergeLatestByItem(
  submissions: CountSubmission[],
): Record<string, ItemValue> {
  const merged: Record<string, ItemValue> = {};
  // submissions must already be sorted oldest → newest so later entries win.
  for (const submission of submissions) {
    for (const line of submission.lines) {
      const key = line.item_id ?? `name:${line.item_name}`;
      merged[key] = { name: line.item_name, unit: line.unit, quantity: line.quantity };
    }
  }
  return merged;
}

export function CountsTab({ outletId, date }: { outletId: string; date: string }) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const previousDate = useMemo(() => addDaysToDateString(date, -1), [date]);
  const [submissions, setSubmissions] = useState<CountSubmission[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: counts, error } = await supabase
        .from("stock_counts")
        .select(
          "id, kind, business_date, staff_id, submitted_at, location_status, distance_from_outlet_m",
        )
        .eq("outlet_id", outletId)
        .gte("business_date", previousDate)
        .lte("business_date", date)
        .order("submitted_at", { ascending: true });

      if (cancelled) return;
      if (error) {
        setLoading(false);
        setLoadError(error.message);
        return;
      }

      const countRows = counts ?? [];
      const ids = countRows.map((row) => row.id);
      const linesById: Record<string, CountLine[]> = {};
      if (ids.length > 0) {
        const { data: lines, error: linesError } = await supabase
          .from("stock_count_lines")
          .select("count_id, item_id, item_name, unit, quantity")
          .in("count_id", ids);
        if (cancelled) return;
        if (linesError) {
          setLoading(false);
          setLoadError(linesError.message);
          return;
        }
        for (const line of lines ?? []) {
          const list = linesById[line.count_id] ?? [];
          list.push({
            item_id: line.item_id,
            item_name: line.item_name,
            unit: line.unit,
            quantity: line.quantity,
          });
          linesById[line.count_id] = list;
        }
      }

      const names = await fetchStaffNames(
        supabase,
        countRows.map((row) => row.staff_id),
      );
      if (cancelled) return;

      setSubmissions(
        countRows.map((row) => ({
          id: row.id,
          kind: row.kind as "opening" | "closing",
          business_date: row.business_date,
          staff_id: row.staff_id,
          submitted_at: row.submitted_at,
          location_status: row.location_status as LocationStatus,
          distance_from_outlet_m: row.distance_from_outlet_m,
          lines: linesById[row.id] ?? [],
        })),
      );
      setStaffNames(names);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, outletId, date, previousDate]);

  const todaySubmissions = submissions.filter((s) => s.business_date === date);
  const todayOpeningSubs = todaySubmissions.filter((s) => s.kind === "opening");
  const todayClosingSubs = todaySubmissions.filter((s) => s.kind === "closing");
  const yesterdayClosingSubs = submissions.filter(
    (s) => s.business_date === previousDate && s.kind === "closing",
  );

  const todayOpening = mergeLatestByItem(todayOpeningSubs);
  const todayClosing = mergeLatestByItem(todayClosingSubs);
  const yesterdayClosing = mergeLatestByItem(yesterdayClosingSubs);

  const compareKeys = Array.from(
    new Set([...Object.keys(todayOpening), ...Object.keys(todayClosing)]),
  ).sort((a, b) =>
    (todayOpening[a]?.name ?? todayClosing[a]?.name ?? "").localeCompare(
      todayOpening[b]?.name ?? todayClosing[b]?.name ?? "",
    ),
  );

  const gapKeys = Array.from(
    new Set([...Object.keys(yesterdayClosing), ...Object.keys(todayOpening)]),
  ).sort((a, b) =>
    (yesterdayClosing[a]?.name ?? todayOpening[a]?.name ?? "").localeCompare(
      yesterdayClosing[b]?.name ?? todayOpening[b]?.name ?? "",
    ),
  );

  if (loading) return <SkeletonList rows={5} rowClassName="h-16" />;
  if (loadError) {
    return (
      <p className="text-danger">
        {t("stock.loadError", { error: loadError })}
      </p>
    );
  }

  function submissionCard(submission: CountSubmission) {
    return (
      <div
        key={submission.id}
        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border"
      >
        <p className="text-sm text-text">
          {t("manager.submittedAt", {
            name: staffNames[submission.staff_id] ?? "—",
            time: formatTimeKolkata(submission.submitted_at),
          })}
        </p>
        <LocationBadge
          status={submission.location_status}
          distanceM={submission.distance_from_outlet_m}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="mb-3 text-base font-semibold text-text">
          {t("manager.kindOpening")}
        </h3>
        {todayOpeningSubs.length === 0 ? (
          <EmptyState title={t("stock.noSubmissions")} />
        ) : (
          <div className="flex flex-col gap-2">{todayOpeningSubs.map(submissionCard)}</div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-base font-semibold text-text">
          {t("manager.kindClosing")}
        </h3>
        {todayClosingSubs.length === 0 ? (
          <EmptyState title={t("stock.noSubmissions")} />
        ) : (
          <div className="flex flex-col gap-2">{todayClosingSubs.map(submissionCard)}</div>
        )}
      </div>

      {compareKeys.length > 0 && (
        <div>
          <h3 className="mb-3 text-base font-semibold text-text">
            {t("stock.openingVsClosing")}
          </h3>
          <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-border">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-muted">
                    {t("common.nameLabel")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-muted">
                    {t("manager.kindOpening")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-muted">
                    {t("manager.kindClosing")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-muted">
                    {t("stock.difference")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {compareKeys.map((key) => {
                  const opening = todayOpening[key];
                  const closing = todayClosing[key];
                  const diff =
                    opening != null && closing != null
                      ? closing.quantity - opening.quantity
                      : null;
                  return (
                    <tr key={key} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap text-text">
                        {opening?.name ?? closing?.name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {opening
                          ? `${formatQuantity(opening.quantity)} ${opening.unit}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {closing
                          ? `${formatQuantity(closing.quantity)} ${closing.unit}`
                          : "—"}
                      </td>
                      <td
                        className={`px-4 py-3 font-medium whitespace-nowrap ${
                          diff != null && diff !== 0 ? "text-danger" : "text-muted"
                        }`}
                      >
                        {diff != null ? formatQuantity(diff) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {gapKeys.length > 0 && (
        <div>
          <h3 className="mb-1 text-base font-semibold text-text">
            {t("stock.overnightGap")}
          </h3>
          <p className="mb-3 text-sm text-muted">
            {t("stock.overnightGapHint")}
          </p>
          <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-border">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-muted">
                    {t("common.nameLabel")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-muted">
                    {t("stock.yesterdayClosing")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-muted">
                    {t("stock.todayOpening")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-muted">
                    {t("stock.difference")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {gapKeys.map((key) => {
                  const prevClosing = yesterdayClosing[key];
                  const opening = todayOpening[key];
                  const diff =
                    prevClosing != null && opening != null
                      ? opening.quantity - prevClosing.quantity
                      : null;
                  return (
                    <tr
                      key={key}
                      className={`border-b border-border last:border-0 ${
                        diff !== null && diff !== 0 ? "bg-warning/10" : ""
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-text">
                        {prevClosing?.name ?? opening?.name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {prevClosing
                          ? `${formatQuantity(prevClosing.quantity)} ${prevClosing.unit}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {opening
                          ? `${formatQuantity(opening.quantity)} ${opening.unit}`
                          : "—"}
                      </td>
                      <td
                        className={`px-4 py-3 font-medium whitespace-nowrap ${
                          diff != null && diff !== 0 ? "text-warning" : "text-muted"
                        }`}
                      >
                        {diff != null ? formatQuantity(diff) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
