/** Shared geolocation: GPS first; IP / default only when explicitly requested. */

export type GeoCoords = {
  lat: number;
  lng: number;
  accuracy?: number;
  source: 'gps-high' | 'gps-low' | 'ip' | 'default';
};

export type LocationSource = 'gps' | 'ip' | 'default';

const DEFAULT_MILAN: GeoCoords = { lat: 45.4642, lng: 9.19, source: 'default' };

export function isGpsCoordsSource(source: GeoCoords['source']): boolean {
  return source === 'gps-high' || source === 'gps-low';
}

export function toStoreLocationSource(source: GeoCoords['source']): LocationSource {
  if (source === 'gps-high' || source === 'gps-low') return 'gps';
  if (source === 'ip') return 'ip';
  return 'default';
}

/** Non sovrascrivere GPS con IP/default (es. geo IP operatore → Milano). */
export function shouldApplyLocationSource(
  current: LocationSource | null,
  next: LocationSource,
  force = false
): boolean {
  if (force) return true;
  if (!current) return true;
  if (current === 'gps' && (next === 'ip' || next === 'default')) return false;
  return true;
}

export async function fetchIpLocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch('https://get.geojs.io/v1/ip/geo.json', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.latitude && data.longitude) {
      return { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude) };
    }
  } catch {
    /* network / blocked */
  }
  return null;
}

function getPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

export type GetCurrentCoordsOptions = {
  preferHighAccuracy?: boolean;
  fallbackToIp?: boolean;
};

/**
 * Solo GPS fresco (pulsante "mia posizione", mappa). Mai IP né Milano di default.
 */
export async function getFreshGpsCoords(): Promise<GeoCoords> {
  if (!('geolocation' in navigator)) {
    const err = new Error('Geolocation not available') as Error & { code: number };
    err.code = 2;
    throw err;
  }

  const attempts: PositionOptions[] = [
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 },
  ];

  let permissionDenied = false;

  for (const opts of attempts) {
    try {
      const pos = await getPosition(opts);
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        source: opts.enableHighAccuracy ? 'gps-high' : 'gps-low',
      };
    } catch (err) {
      const geoErr = err as GeolocationPositionError;
      if (geoErr.code === 1) {
        permissionDenied = true;
        break;
      }
    }
  }

  const error = new Error(
    permissionDenied ? 'Geolocation permission denied' : 'GPS unavailable'
  ) as Error & { code: number };
  error.code = permissionDenied ? 1 : 2;
  throw error;
}

/** @deprecated Use getFreshGpsCoords for map locate — kept as alias without IP fallback */
export async function getCachedOrFastCoords(): Promise<GeoCoords> {
  return getFreshGpsCoords();
}

export async function getCurrentCoords(options: GetCurrentCoordsOptions = {}): Promise<GeoCoords> {
  const { preferHighAccuracy = true, fallbackToIp = true } = options;

  if (!('geolocation' in navigator)) {
    if (fallbackToIp) {
      const ip = await fetchIpLocation();
      if (ip) return { ...ip, source: 'ip' };
    }
    return { ...DEFAULT_MILAN };
  }

  const attempts: PositionOptions[] = preferHighAccuracy
    ? [
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 },
        { enableHighAccuracy: true, timeout: 35000, maximumAge: 0 },
      ]
    : [{ enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }];

  let permissionDenied = false;

  for (const opts of attempts) {
    try {
      const pos = await getPosition(opts);
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        source: opts.enableHighAccuracy ? 'gps-high' : 'gps-low',
      };
    } catch (err) {
      const geoErr = err as GeolocationPositionError;
      if (geoErr.code === 1) {
        permissionDenied = true;
        break;
      }
    }
  }

  if (permissionDenied) {
    const error = new Error('Geolocation permission denied') as Error & { code: number };
    error.code = 1;
    throw error;
  }

  if (fallbackToIp) {
    const ip = await fetchIpLocation();
    if (ip) return { ...ip, source: 'ip' };
    return { ...DEFAULT_MILAN };
  }

  const error = new Error('GPS unavailable') as Error & { code: number };
  error.code = 2;
  throw error;
}

export function geolocationErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return 'Permesso geolocalizzazione negato. Attivalo dalle impostazioni del browser o del telefono.';
    case 2:
      return 'Segnale GPS non disponibile. Prova all\'aperto o attendi qualche secondo.';
    case 3:
      return 'GPS in timeout. Prova di nuovo o attendi qualche secondo all\'aperto.';
    default:
      return 'Impossibile ottenere la posizione.';
  }
}

export function geoSuccessToast(source: GeoCoords['source']): string {
  switch (source) {
    case 'gps-high':
      return 'Posizione GPS aggiornata';
    case 'gps-low':
      return 'Posizione aggiornata (GPS approssimativo)';
    case 'ip':
      return 'Posizione di rete (imprecisa) — abilita il GPS per la posizione reale';
    default:
      return 'Posizione predefinita — attiva il GPS';
  }
}
