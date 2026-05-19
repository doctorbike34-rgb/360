/** Shared geolocation: fast low-accuracy first, then GPS precise, then IP fallback. */

export type GeoCoords = {
  lat: number;
  lng: number;
  accuracy?: number;
  source: 'gps-high' | 'gps-low' | 'ip' | 'default';
};

const DEFAULT_MILAN: GeoCoords = { lat: 45.4642, lng: 9.19, source: 'default' };

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
  /** Try GPS high-accuracy after a quick coarse fix (default true). */
  preferHighAccuracy?: boolean;
  /** Use IP / default when GPS fails (default true). */
  fallbackToIp?: boolean;
};

/**
 * Resolves user coordinates without failing on the first GPS timeout (common indoors / PWA).
 */
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
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 },
        { enableHighAccuracy: true, timeout: 35000, maximumAge: 0 },
      ]
    : [{ enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 }];

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
  }

  return { ...DEFAULT_MILAN };
}

export function geolocationErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return 'Permesso geolocalizzazione negato. Attivalo dalle impostazioni del browser o del telefono.';
    case 2:
      return 'Segnale GPS non disponibile. Prova all\'aperto o usa la posizione approssimativa.';
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
      return 'Posizione aggiornata (approssimativa)';
    case 'ip':
      return 'Posizione approssimativa (rete) — per il GPS preciso riprova all\'aperto';
    default:
      return 'Posizione predefinita (Milano) — attiva il GPS per maggiore precisione';
  }
}
