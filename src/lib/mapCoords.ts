/** Default map center (Milan) when GPS / coords are missing or invalid. */
export const DEFAULT_MAP_CENTER: [number, number] = [45.4642, 9.19];

export function isValidLatLngPair(
  coords: [number, number] | null | undefined
): coords is [number, number] {
  return (
    Array.isArray(coords) &&
    coords.length === 2 &&
    Number.isFinite(coords[0]) &&
    Number.isFinite(coords[1])
  );
}

export function mapCenterOrDefault(
  coords: [number, number] | null | undefined,
  fallback: [number, number] = DEFAULT_MAP_CENTER
): [number, number] {
  return isValidLatLngPair(coords) ? coords : fallback;
}

/** Normalize lat/lng from Firestore docs (numbers, GeoPoint-like, or nested location). */
export function getLatLngFromRecord(
  data:
    | {
        lat?: unknown;
        lng?: unknown;
        lastLat?: unknown;
        lastLng?: unknown;
        location?: {
          lat?: unknown;
          lng?: unknown;
          latitude?: unknown;
          longitude?: unknown;
        };
      }
    | null
    | undefined
): [number, number] | null {
  if (!data) return null;

  const readNum = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    return null;
  };

  const geo = data as { latitude?: unknown; longitude?: unknown };
  const lat =
    readNum(data.lat) ??
    readNum(data.lastLat) ??
    readNum(data.location?.lat) ??
    readNum(data.location?.latitude) ??
    readNum(geo.latitude);
  const lng =
    readNum(data.lng) ??
    readNum(data.lastLng) ??
    readNum(data.location?.lng) ??
    readNum(data.location?.longitude) ??
    readNum(geo.longitude);

  const pair: [number, number] = [lat ?? NaN, lng ?? NaN];
  return isValidLatLngPair(pair) ? pair : null;
}

export function getSosLatLng(
  sos: Parameters<typeof getLatLngFromRecord>[0]
): [number, number] | null {
  return getLatLngFromRecord(sos);
}
