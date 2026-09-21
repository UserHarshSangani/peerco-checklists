"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { requestCurrentPosition } from "@/lib/geolocation";
import { parseCoordinatesString } from "@/lib/coordinates";
import { useLanguage } from "@/lib/i18n/language-context";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";

const MIN_RADIUS = 30;
const MAX_RADIUS = 1000;
const ACCURACY_WARNING_THRESHOLD_M = 50;

const WEEKDAY_KEYS = [
  "outlets.weekday.sunday",
  "outlets.weekday.monday",
  "outlets.weekday.tuesday",
  "outlets.weekday.wednesday",
  "outlets.weekday.thursday",
  "outlets.weekday.friday",
  "outlets.weekday.saturday",
] as const;

export default function OutletDetailPage({
  params,
}: PageProps<"/outlets/[outletId]">) {
  const { outletId } = use(params);
  return <OutletEditor outletId={outletId} />;
}

function OutletEditor({ outletId }: { outletId: string }) {
  const { t } = useLanguage();
  const { showSuccess, showError } = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [outletName, setOutletName] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radius, setRadius] = useState(150);
  const [weeklyCountDay, setWeeklyCountDay] = useState(1);
  const [savingWeeklyDay, setSavingWeeklyDay] = useState(false);
  const [pasteInput, setPasteInput] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("outlets")
      .select("id, name, latitude, longitude, geofence_radius_m, weekly_count_day")
      .eq("id", outletId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          setLoadError(error.message);
          return;
        }
        setOutletName(data.name);
        setLat(data.latitude);
        setLng(data.longitude);
        setRadius(data.geofence_radius_m);
        setWeeklyCountDay(data.weekly_count_day);
        setPasteInput(
          data.latitude != null && data.longitude != null
            ? `${data.latitude}, ${data.longitude}`
            : "",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, outletId]);

  function applyCoordinates(nextLat: number, nextLng: number) {
    setLat(nextLat);
    setLng(nextLng);
    setPasteInput(`${nextLat}, ${nextLng}`);
    setPasteError(null);
  }

  function handlePasteBlur() {
    const trimmed = pasteInput.trim();
    if (!trimmed) {
      setPasteError(null);
      return;
    }
    const parsed = parseCoordinatesString(trimmed);
    if (!parsed) {
      setPasteError(t("outlets.pasteCoordinatesError"));
      return;
    }
    applyCoordinates(parsed.lat, parsed.lng);
  }

  async function handleUseMyLocation() {
    setLocating(true);
    const result = await requestCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
    setLocating(false);
    if (!result.ok) {
      showError(
        result.error === "denied"
          ? t("outlets.locationDenied")
          : t("outlets.locationUnavailable"),
      );
      return;
    }
    setLastAccuracy(result.accuracy);
    applyCoordinates(result.lat, result.lng);
  }

  async function handleSave() {
    if (!Number.isFinite(radius) || radius < MIN_RADIUS || radius > MAX_RADIUS) {
      showError(t("outlets.radiusError"));
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("outlets")
      .update({ latitude: lat, longitude: lng, geofence_radius_m: radius })
      .eq("id", outletId);
    setSaving(false);
    if (error) {
      showError(error.message);
      return;
    }
    showSuccess(t("outlets.saveSuccess"));
  }

  async function handleSaveWeeklyDay(day: number) {
    setWeeklyCountDay(day);
    setSavingWeeklyDay(true);
    const { error } = await supabase
      .from("outlets")
      .update({ weekly_count_day: day })
      .eq("id", outletId);
    setSavingWeeklyDay(false);
    if (error) {
      showError(error.message);
      return;
    }
    showSuccess(t("outlets.weeklyCountDaySaved"));
  }

  async function handleClearLocation() {
    if (!window.confirm(t("outlets.confirmClearLocation"))) return;
    setSaving(true);
    const { error } = await supabase
      .from("outlets")
      .update({ latitude: null, longitude: null })
      .eq("id", outletId);
    setSaving(false);
    if (error) {
      showError(error.message);
      return;
    }
    setLat(null);
    setLng(null);
    setPasteInput("");
    setLastAccuracy(null);
    showSuccess(t("outlets.locationCleared"));
  }

  return (
    <main className="flex-1 p-4 sm:p-6">
      <Link
        href="/outlets"
        className="mb-4 inline-block text-sm font-medium text-muted hover:text-text"
      >
        ‹ {t("outlets.backToOutlets")}
      </Link>

      {loading && <SkeletonList rows={4} rowClassName="h-16" />}
      {loadError && (
        <p className="text-danger">
          {t("outlets.loadOutletError", { error: loadError })}
        </p>
      )}

      {!loading && !loadError && (
        <div className="max-w-lg">
          <h2 className="mb-6 text-xl font-semibold text-text">
            {outletName}
          </h2>

          <div className="mb-6 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border">
            <Button
              type="button"
              variant="secondary"
              loading={locating}
              onClick={handleUseMyLocation}
              className="w-full"
            >
              {locating ? t("outlets.locating") : t("outlets.useMyLocation")}
            </Button>
            {lastAccuracy != null && (
              <p className="mt-2 text-sm text-muted">
                {t("outlets.accuracyLabel", {
                  accuracy: Math.round(lastAccuracy),
                })}
              </p>
            )}
            {lastAccuracy != null && lastAccuracy > ACCURACY_WARNING_THRESHOLD_M && (
              <p className="mt-1 text-sm font-medium text-warning">
                {t("outlets.accuracyWarning")}
              </p>
            )}
          </div>

          <label
            htmlFor="paste-coordinates"
            className="mb-1 block text-sm font-medium text-muted"
          >
            {t("outlets.pasteCoordinatesLabel")}
          </label>
          <input
            id="paste-coordinates"
            type="text"
            value={pasteInput}
            onChange={(event) => setPasteInput(event.target.value)}
            onBlur={handlePasteBlur}
            placeholder={t("outlets.pasteCoordinatesPlaceholder")}
            className="mb-1 w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
          />
          {pasteError && (
            <p className="mb-4 text-sm font-medium text-danger">
              {pasteError}
            </p>
          )}
          {!pasteError && <div className="mb-4" />}

          <label
            htmlFor="geofence-radius"
            className="mb-1 block text-sm font-medium text-muted"
          >
            {t("outlets.radiusLabel")}
          </label>
          <input
            id="geofence-radius"
            type="number"
            min={MIN_RADIUS}
            max={MAX_RADIUS}
            value={radius}
            onChange={(event) => setRadius(Number(event.target.value))}
            className="mb-1 w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
          />
          <p className="mb-6 text-sm text-muted">{t("outlets.radiusHint")}</p>

          <label
            htmlFor="weekly-count-day"
            className="mb-1 block text-sm font-medium text-muted"
          >
            {t("outlets.weeklyCountDayLabel")}
          </label>
          <select
            id="weekly-count-day"
            value={weeklyCountDay}
            disabled={savingWeeklyDay}
            onChange={(event) => handleSaveWeeklyDay(Number(event.target.value))}
            className="mb-6 w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-text focus:border-accent focus:outline-none disabled:opacity-50"
          >
            {WEEKDAY_KEYS.map((key, day) => (
              <option key={key} value={day}>
                {t(key)}
              </option>
            ))}
          </select>

          {lat != null && lng != null ? (
            <a
              href={`https://www.google.com/maps?q=${lat},${lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-6 inline-block text-sm font-medium text-accent underline"
            >
              {t("outlets.openInGoogleMaps")}
            </a>
          ) : (
            <p className="mb-6 text-sm text-muted">
              {t("outlets.noLocationSet")}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              loading={saving}
              onClick={handleSave}
              className="flex-1"
            >
              {saving ? t("common.saving") : t("common.save")}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={saving || (lat == null && lng == null)}
              onClick={handleClearLocation}
              className="flex-1"
            >
              {t("outlets.clearLocation")}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
