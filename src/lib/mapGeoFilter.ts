import { distanceBetween } from 'geofire-common';

/** Raggio visualizzazione layer mappa (allineato al filtro utenti in Map.tsx). */
export const MAP_LAYER_RADIUS_KM = 40;

export function getMapItemCoords(item: {
  lastLat?: number;
  lat?: number;
  lastLng?: number;
  lng?: number;
  location?: { lat?: number; lng?: number; latitude?: number; longitude?: number };
}): [number, number] | null {
  const lat = item.lastLat ?? item.lat ?? item.location?.lat ?? item.location?.latitude;
  const lng = item.lastLng ?? item.lng ?? item.location?.lng ?? item.location?.longitude;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return [lat, lng];
}

export function filterItemsNearMapCenter<T extends Record<string, unknown>>(
  items: T[],
  center: [number, number] | null,
  radiusKm: number = MAP_LAYER_RADIUS_KM
): T[] {
  if (!center) return items;
  return items.filter((item) => {
    const coords = getMapItemCoords(item);
    if (!coords) return false;
    return distanceBetween(coords, center) <= radiusKm;
  });
}
