export type NavigationApp = 'google' | 'apple' | 'waze';

export function navigationUrl(
  app: NavigationApp,
  lat: number,
  lng: number
): string {
  const dest = `${lat},${lng}`;
  switch (app) {
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    case 'apple':
      return `https://maps.apple.com/?daddr=${dest}&dirflg=d`;
    case 'waze':
      return `https://waze.com/ul?ll=${dest}&navigate=yes`;
  }
}

export function openNavigationApp(app: NavigationApp, lat: number, lng: number): void {
  window.open(navigationUrl(app, lat, lng), '_blank', 'noopener,noreferrer');
}

export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}
