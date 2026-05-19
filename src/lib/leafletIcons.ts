/**
 * Shared Leaflet icon helpers — single import path to avoid duplicate `leaflet` bundles.
 */
import L from 'leaflet';

let defaultsReady = false;

function escapeHtml(unsafe: string | number | null | undefined): string {
  if (unsafe == null) return '';
  const str = String(unsafe);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function setupLeafletDefaults(): void {
  if (defaultsReady || typeof window === 'undefined') return;
  defaultsReady = true;

  // Bundled builds break L.Icon.Default image paths — use inline SVG instead of CDN.
  const pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
    <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#00847d"/>
    <circle cx="12.5" cy="12.5" r="5" fill="white"/>
  </svg>`;

  const defaultIcon = L.icon({
    iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg)}`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [0, -34],
  });

  L.Marker.prototype.options.icon = defaultIcon;
}

export function makeSvgIcon(svg: string, size: number, anchor: [number, number]): L.Icon {
  return L.icon({
    iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    iconSize: [size, size],
    iconAnchor: anchor,
    popupAnchor: [0, -size / 2],
  });
}

export function defaultMarkerIcon(): L.Icon {
  setupLeafletDefaults();
  return L.Marker.prototype.options.icon as L.Icon;
}

export function avatarMarkerIcon(
  avatarUrl: string | null | undefined,
  borderColor: string,
  size: number = 36,
  online: boolean = false
): L.Icon {
  const dot = online
    ? `<circle cx="${size - 4}" cy="${size - 4}" r="5" fill="#22C55E" stroke="white" stroke-width="2"/>`
    : '';
  const clipId = `clip-${Math.random().toString(36).slice(2, 9)}`;
  const avatarContent = avatarUrl
    ? `<clipPath id="${clipId}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 4}"/></clipPath><image href="${escapeHtml(avatarUrl)}" x="4" y="4" width="${size - 8}" height="${size - 8}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 4}" fill="${borderColor}" opacity="0.35"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="white" stroke="${borderColor}" stroke-width="3"/>
    ${avatarContent}
    ${dot}
  </svg>`;
  return makeSvgIcon(svg, size, [size / 2, size / 2]);
}

export function reportMarkerIcon(severity: string): L.Icon {
  const colors: Record<string, string> = { low: '#EAB308', medium: '#F97316', high: '#EF4444' };
  const color = colors[severity] || '#EAB308';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <circle cx="16" cy="16" r="14" fill="${color}" opacity="0.3" stroke="${color}" stroke-width="2"/>
    <path d="M16 8 L22 22 L10 22 Z" fill="${color}" stroke="white" stroke-width="1" stroke-linejoin="round"/>
    <circle cx="16" cy="18" r="1.5" fill="white"/>
    <line x1="16" y1="13" x2="16" y2="15.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
  return makeSvgIcon(svg, 32, [16, 16]);
}

export function eventMarkerIcon(): L.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <circle cx="20" cy="20" r="18" fill="#EA580C" opacity="0.2" stroke="#EA580C" stroke-width="2"/>
    <circle cx="20" cy="20" r="14" fill="#EA580C" opacity="0.5"/>
    <circle cx="20" cy="20" r="10" fill="white" opacity="0.9"/>
    <text x="20" y="24" text-anchor="middle" font-size="14" fill="#EA580C">🚲</text>
  </svg>`;
  return makeSvgIcon(svg, 40, [20, 20]);
}

setupLeafletDefaults();
