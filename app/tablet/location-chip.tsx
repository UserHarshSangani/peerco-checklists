"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, MapPinCheck, MapPinOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { haversineMeters, requestCurrentPosition } from "@/lib/geolocation";
import {
  hasSeenLocationExplainer,
  markLocationExplainerSeen,
} from "@/lib/location-explainer";
import { useLanguage } from "@/lib/i18n/language-context";
import { StatusPill } from "@/components/ui/status-pill";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

type ChipStatus = "checking" | "verified" | "away" | "off";

// Client-side-only "am I roughly at the outlet" indicator, shown while a
// checklist/stock screen is open. It never blocks submission — the server
// independently re-checks the position it receives at submit time and that
// remains the only authoritative record.
export function LocationChip({ outletId }: { outletId: string }) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  // The explainer gate is read once here (lazy initializer, not an effect)
  // so the very first render already reflects it without a synchronous
  // setState in an effect body.
  const [status, setStatus] = useState<ChipStatus>(() =>
    hasSeenLocationExplainer() ? "checking" : "off",
  );
  const [showExplainer, setShowExplainer] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const check = useCallback(async () => {
    setStatus("checking");
    const { data } = await supabase
      .from("outlets")
      .select("latitude, longitude, geofence_radius_m")
      .eq("id", outletId)
      .single();
    if (!data || data.latitude == null || data.longitude == null) {
      setStatus("off");
      return;
    }
    const result = await requestCurrentPosition({
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 30000,
    });
    if (!result.ok) {
      setStatus("off");
      return;
    }
    const distance = haversineMeters(
      result.lat,
      result.lng,
      data.latitude,
      data.longitude,
    );
    setStatus(distance <= data.geofence_radius_m ? "verified" : "away");
  }, [supabase, outletId]);

  useEffect(() => {
    // Nothing to do until the explainer has been accepted — the initial
    // state already shows "off" in that case, and handleExplainerContinue
    // bumps `attempt` right after marking it seen. Deferred through a
    // microtask so check()'s first setState (before its own first await)
    // isn't a synchronous call from within the effect body itself.
    if (!hasSeenLocationExplainer()) return;
    Promise.resolve().then(() => void check());
  }, [check, attempt]);

  function handleTap() {
    if (status === "verified") return;
    if (!hasSeenLocationExplainer()) {
      setShowExplainer(true);
      return;
    }
    setAttempt((n) => n + 1);
  }

  function handleExplainerContinue() {
    markLocationExplainerSeen();
    setShowExplainer(false);
    setAttempt((n) => n + 1);
  }

  return (
    <>
      <button type="button" onClick={handleTap} className="text-left">
        {status === "checking" && (
          <StatusPill tone="neutral" icon={<MapPin className="h-full w-full" />}>
            {t("tablet.checkingLocation")}
          </StatusPill>
        )}
        {status === "verified" && (
          <StatusPill tone="success" icon={<MapPinCheck className="h-full w-full" />}>
            {t("tablet.locationVerified")}
          </StatusPill>
        )}
        {status === "away" && (
          <StatusPill tone="warning" icon={<MapPinOff className="h-full w-full" />}>
            {t("tablet.locationAway")}
          </StatusPill>
        )}
        {status === "off" && (
          <StatusPill tone="warning" icon={<MapPinOff className="h-full w-full" />}>
            {t("tablet.locationOffTapHelp")}
          </StatusPill>
        )}
      </button>

      {showExplainer && (
        <Modal onClose={() => setShowExplainer(false)}>
          <p className="mb-6 text-base text-text">
            {t("tablet.locationExplainerBody")}
          </p>
          <Button type="button" onClick={handleExplainerContinue} className="w-full">
            {t("common.continue")}
          </Button>
        </Modal>
      )}
    </>
  );
}
