import { safeStorage } from './storage';

const PWA_INSTALLED_KEY = 'pwa_installed';

export type PwaInstallResult = 'accepted' | 'dismissed' | 'ios' | 'unavailable' | 'already';

export function isPwaStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** App già sulla Home / installata: non mostrare «Installa». */
export function isPwaInstalled(): boolean {
  if (isPwaStandalone()) return true;
  return safeStorage.getItem(PWA_INSTALLED_KEY) === '1';
}

export function markPwaInstalled(): void {
  safeStorage.setItem(PWA_INSTALLED_KEY, '1');
}

export function isIosDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
}

export function isAndroidDevice(): boolean {
  return /Android/i.test(navigator.userAgent);
}

/** Avvia installazione PWA nativa (Chrome/Edge Android) se disponibile. */
export async function triggerPwaInstall(
  deferredPrompt: { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null
): Promise<PwaInstallResult> {
  if (isPwaStandalone()) return 'already';

  if (deferredPrompt) {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    return outcome === 'accepted' ? 'accepted' : 'dismissed';
  }

  if (isIosDevice()) return 'ios';
  return 'unavailable';
}
