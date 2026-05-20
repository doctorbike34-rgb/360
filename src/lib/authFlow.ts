const AUTH_INTENT_KEY = 'db360_auth_intent';

export type AuthIntent = 'login' | 'signup';

export function setAuthIntent(intent: AuthIntent): void {
  sessionStorage.setItem(AUTH_INTENT_KEY, intent);
}

export function getAuthIntent(): AuthIntent | null {
  const v = sessionStorage.getItem(AUTH_INTENT_KEY);
  return v === 'login' || v === 'signup' ? v : null;
}

export function clearAuthIntent(): void {
  sessionStorage.removeItem(AUTH_INTENT_KEY);
}

/** Utente Firebase autenticato ma profilo Firestore senza ruolo ancora. */
export function needsProfileCompletion(
  user: { uid: string } | null | undefined,
  role: string | null | undefined
): boolean {
  return !!user && !role;
}
