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

function markerInitials(displayName?: string, userId?: string): string {
  const source = (displayName || '').trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }
  const id = userId || '?';
  return id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '??';
}

function roleAccent(role: string, borderColor?: string): string {
  if (borderColor) return borderColor;
  if (role === 'MECHANIC') return '#F59E0B';
  if (role === 'PEER_MECHANIC') return '#8B5CF6';
  return '#3B82F6';
}

function roleBadgeGlyph(role: string, cx: number, cy: number, scale: number): string {
  const s = scale;
  if (role === 'MECHANIC' || role === 'PEER_MECHANIC') {
    return `<g transform="translate(${cx - 5 * s}, ${cy - 5 * s}) scale(${s})">
      <path d="M3 14 L7 10 L5 8 L9 4 L11 6 L7 10 L10 13 Z" fill="white" stroke="none"/>
      <circle cx="12" cy="4" r="2" fill="white"/>
    </g>`;
  }
  return `<g transform="translate(${cx - 6 * s}, ${cy - 4 * s}) scale(${s})">
    <circle cx="6" cy="10" r="3.5" fill="none" stroke="white" stroke-width="1.5"/>
    <circle cx="14" cy="10" r="3.5" fill="none" stroke="white" stroke-width="1.5"/>
    <path d="M9.5 10 L10.5 4 L12 4" stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none"/>
  </g>`;
}

export function setupLeafletDefaults(): void {
  if (defaultsReady || typeof window === 'undefined') return;
  defaultsReady = true;

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

const iconCache = new Map<string, L.Icon>();

export function makeSvgIcon(svg: string, size: number, anchor: [number, number]): L.Icon {
  const cacheKey = `${size}-${anchor[0]}-${anchor[1]}-${svg}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

    const icon = L.icon({
    iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    iconSize: [size, size],
    iconAnchor: anchor,
    popupAnchor: [0, -size / 2],
  });
  iconCache.set(cacheKey, icon);
  return icon;
}

export function defaultMarkerIcon(): L.Icon {
  setupLeafletDefaults();
  return L.Marker.prototype.options.icon as L.Icon;
}

/** Role-based avatar marker — no external photos (avoids CORS / broken URLs on map). */
export function avatarMarkerIcon(
  userId: string,
  role: string,
  options?: {
    displayName?: string;
    borderColor?: string;
    size?: number;
    online?: boolean;
    sosActive?: boolean;
  }
): L.Icon {
  const size = options?.size ?? 36;
  const online = options?.online ?? false;
  const sosActive = options?.sosActive ?? false;
  const accent = roleAccent(role, options?.borderColor);
  const initials = escapeHtml(markerInitials(options?.displayName, userId));
  const pad = sosActive ? 4 : 0;
  const total = size + pad * 2;
  const cx = total / 2;
  const cy = total / 2;
  const r = size / 2 - 3;

  const dot = online
    ? `<circle cx="${total - 5}" cy="${total - 5}" r="4.5" fill="#22C55E" stroke="white" stroke-width="2"/>`
    : '';

  const sosRing = sosActive
    ? `<circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="none" stroke="#EF4444" stroke-width="2.5" opacity="0.9"/>
       <circle cx="${cx}" cy="${cy}" r="${r + 8}" fill="none" stroke="#EF4444" stroke-width="1.5" opacity="0.35"/>`
    : '';

  const badgeCx = cx + r * 0.55;
  const badgeCy = cy + r * 0.55;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}">
    ${sosRing}
    <circle cx="${cx}" cy="${cy}" r="${r + 2}" fill="white" stroke="${accent}" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 1}" fill="${accent}"/>
    <text x="${cx}" y="${cy + 1}" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" font-size="${Math.max(9, r * 0.85)}" font-weight="800" fill="white">${initials}</text>
    <circle cx="${badgeCx}" cy="${badgeCy}" r="${r * 0.38}" fill="${accent}" stroke="white" stroke-width="1.5"/>
    ${roleBadgeGlyph(role, badgeCx, badgeCy, r * 0.055)}
    ${dot}
  </svg>`;

  return makeSvgIcon(svg, total, [total / 2, total / 2]);
}

const SEVERITY_COLORS: Record<string, string> = {
  low: '#EAB308',
  medium: '#F97316',
  high: '#EF4444',
};

function categoryShape(category: string, color: string): string {
  switch (category) {
    case 'pothole':
      return `<ellipse cx="16" cy="18" rx="7" ry="4" fill="#1e293b" opacity="0.5"/>
        <ellipse cx="16" cy="17" rx="5" ry="2.5" fill="${color}" stroke="white" stroke-width="1"/>`;
    case 'damaged_path':
      return `<path d="M8 22 L12 14 L16 18 L20 12 L24 22 Z" fill="${color}" stroke="white" stroke-width="1" stroke-linejoin="round"/>`;
    case 'obstacle':
      return `<rect x="10" y="12" width="12" height="10" rx="2" fill="${color}" stroke="white" stroke-width="1"/>
        <line x1="13" y1="15" x2="19" y2="19" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="19" y1="15" x2="13" y2="19" stroke="white" stroke-width="1.5" stroke-linecap="round"/>`;
    case 'flooding':
      return `<path d="M6 20 Q10 16 14 20 T22 20 T30 20" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M8 24 Q12 21 16 24 T24 24" fill="none" stroke="${color}" stroke-width="2" opacity="0.7"/>`;
    case 'accident':
      return `<path d="M16 7 L20 19 L12 19 Z" fill="${color}" stroke="white" stroke-width="1"/>
        <text x="16" y="17" text-anchor="middle" font-size="9" font-weight="900" fill="white">!</text>`;
    case 'bad_lighting':
      return `<path d="M16 8 L18 14 L24 14 L19 18 L21 24 L16 20 L11 24 L13 18 L8 14 L14 14 Z" fill="${color}" stroke="white" stroke-width="0.8"/>`;
    default:
      return `<path d="M16 8 L22 22 L10 22 Z" fill="${color}" stroke="white" stroke-width="1" stroke-linejoin="round"/>
        <circle cx="16" cy="18" r="1.5" fill="white"/>
        <line x1="16" y1="13" x2="16" y2="15.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>`;
  }
}

export function reportMarkerIcon(category: string, severity: string): L.Icon {
  const color = SEVERITY_COLORS[severity] || SEVERITY_COLORS.low;
  const cat = escapeHtml(category);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <circle cx="16" cy="16" r="14" fill="${color}" opacity="0.22" stroke="${color}" stroke-width="2"/>
    <circle cx="16" cy="16" r="11" fill="white" opacity="0.95"/>
    ${categoryShape(cat, color)}
  </svg>`;
  return makeSvgIcon(svg, 34, [17, 17]);
}

export function eventMarkerIcon(): L.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="44" height="44">
    <circle cx="22" cy="22" r="20" fill="#EA580C" opacity="0.18" stroke="#EA580C" stroke-width="2"/>
    <circle cx="22" cy="22" r="15" fill="#EA580C"/>
    <circle cx="22" cy="22" r="11" fill="white"/>
    <g transform="translate(22,22) scale(0.42)" fill="#EA580C" stroke="#EA580C" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="-8" cy="8" r="7" fill="none"/>
      <circle cx="8" cy="8" r="7" fill="none"/>
      <path d="M-1 8 L1 -6 L4 -6 L6 8" fill="none"/>
      <path d="M-14 8 L-10 2 L-6 8" fill="none"/>
      <path d="M6 8 L10 2 L14 8" fill="none"/>
      <line x1="-1" y1="-6" x2="1" y2="-10"/>
      <line x1="1" y1="-10" x2="4" y2="-10"/>
    </g>
    <circle cx="34" cy="10" r="4" fill="#22C55E" stroke="white" stroke-width="1.5"/>
  </svg>`;
  return makeSvgIcon(svg, 44, [22, 22]);
}

setupLeafletDefaults();
