const CHUNK_RELOAD_KEY = 'db360_chunk_reload';

export function wasChunkReloadAttempted(): boolean {
  return sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1';
}

export function markChunkReloadAttempted(): void {
  sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
}

export function clearChunkReloadFlag(): void {
  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
}

export async function clearAppCaches(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}

export function isStaleChunkLoadError(reason: unknown): boolean {
  const msg =
    reason instanceof Error
      ? `${reason.message} ${reason.stack ?? ''}`
      : String(reason ?? '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  );
}

/** Pulisce cache SW e ricarica una sola volta per recuperare chunk dopo deploy. */
export async function recoverFromStaleChunks(): Promise<void> {
  if (wasChunkReloadAttempted()) return;
  markChunkReloadAttempted();
  await clearAppCaches();
  window.location.reload();
}
