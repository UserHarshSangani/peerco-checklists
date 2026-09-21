// Parses coordinates exactly as Google Maps gives them when you copy a
// pin's location, e.g. "18.5362, 73.8940".
export function parseCoordinatesString(
  input: string,
): { lat: number; lng: number } | null {
  const match = input
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}
