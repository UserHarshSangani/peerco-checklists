export type GeolocationFailureReason = "denied" | "unavailable" | "timeout";

export type GeolocationResult =
  | { ok: true; lat: number; lng: number; accuracy: number }
  | { ok: false; error: GeolocationFailureReason };

// Never logs or stores the resolved coordinates — callers pass them straight
// to submit_checklist (tablet) or an outlet-location form field (admin) and
// nothing else touches them.
export function requestCurrentPosition(
  options: PositionOptions,
): Promise<GeolocationResult> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ ok: false, error: "unavailable" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          ok: true,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve({ ok: false, error: "denied" });
        } else if (error.code === error.TIMEOUT) {
          resolve({ ok: false, error: "timeout" });
        } else {
          resolve({ ok: false, error: "unavailable" });
        }
      },
      options,
    );
  });
}

export type LocationPayload =
  | { lat: number; lng: number; accuracy: number }
  | { error: GeolocationFailureReason };

// The tablet submit flow: short timeout, tolerant of a slightly stale fix,
// and never blocks or fails the caller — always resolves to something that
// can be handed straight to submit_checklist's p_location.
export async function getTabletLocationPayload(): Promise<LocationPayload> {
  const result = await requestCurrentPosition({
    enableHighAccuracy: true,
    timeout: 8000,
    maximumAge: 30000,
  });
  if (result.ok) {
    return { lat: result.lat, lng: result.lng, accuracy: result.accuracy };
  }
  return { error: result.error };
}

// Same great-circle formula the server uses (see private.evaluate_location)
// — used client-side only for the tablet's non-blocking "at outlet" display
// chip. The server's own check at submit time remains the source of truth.
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
