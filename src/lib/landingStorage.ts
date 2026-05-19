/** Landing intro is always shown when logged out (no localStorage dismiss). */
export function shouldShowLanding(): boolean {
  return true;
}

export function persistLandingDismissed(): void {
  /* intentionally no-op — intro stays available via Auth link */
}

export function clearLandingDismissed(): void {
  /* no-op */
}
