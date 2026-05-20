import {
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  User,
} from 'firebase/auth';
import { auth } from './firebase';
import { isPwaStandalone, isIosDevice } from './pwaInstall';
import { type AuthIntent, setAuthIntent } from './authFlow';
import { completeOAuthSession } from './googleAuth';
import { markGoogleRedirectPending } from './googleAuth';

export const APPLE_REDIRECT_PENDING_KEY = 'db360_apple_redirect_pending';
export const APPLE_REDIRECT_ERROR_KEY = 'db360_apple_redirect_error';

const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

// ─── Pending flag ─────────────────────────────────────────────────────────────

function writePendingFlag(): void {
  const payload = JSON.stringify({ t: Date.now() });
  sessionStorage.setItem(APPLE_REDIRECT_PENDING_KEY, payload);
  localStorage.setItem(APPLE_REDIRECT_PENDING_KEY, payload);
}

export function isAppleRedirectPending(): boolean {
  const raw = sessionStorage.getItem(APPLE_REDIRECT_PENDING_KEY) ?? localStorage.getItem(APPLE_REDIRECT_PENDING_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { t?: number };
    if (typeof parsed.t === 'number') return Date.now() - parsed.t < PENDING_MAX_AGE_MS;
  } catch { /* legacy */ }
  return true;
}

export function clearAppleRedirectPending(): void {
  sessionStorage.removeItem(APPLE_REDIRECT_PENDING_KEY);
  localStorage.removeItem(APPLE_REDIRECT_PENDING_KEY);
}

// ─── Error flag ───────────────────────────────────────────────────────────────

export function getAppleRedirectError(): string | null {
  return sessionStorage.getItem(APPLE_REDIRECT_ERROR_KEY);
}

export function clearAppleRedirectError(): void {
  sessionStorage.removeItem(APPLE_REDIRECT_ERROR_KEY);
}

export function setAppleAuthError(message: string): void {
  sessionStorage.setItem(APPLE_REDIRECT_ERROR_KEY, message);
}

// ─── Provider factory ─────────────────────────────────────────────────────────

function createAppleAuthProvider(): OAuthProvider {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  return provider;
}

// ─── Should prefer redirect? ─────────────────────────────────────────────────

export function shouldPreferAppleRedirect(): boolean {
  if (typeof window === 'undefined') return false;
  // Always prefer redirect for Apple (popup blocked by Safari on iOS by default)
  if (isIosDevice()) return true;
  if (isPwaStandalone()) return true;
  return false;
}

// ─── Main sign-in entry point ─────────────────────────────────────────────────

export async function startAppleSignIn(intent: AuthIntent): Promise<User | null> {
  clearAppleRedirectError();
  setAuthIntent(intent);
  const provider = createAppleAuthProvider();

  if (shouldPreferAppleRedirect()) {
    writePendingFlag();
    // Reuse Google's redirect pending key so App.tsx boot logic covers both
    markGoogleRedirectPending();
    await signInWithRedirect(auth, provider);
    return null;
  }

  try {
    const result = await signInWithPopup(auth, provider);
    return result.user ?? null;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return null;
    }
    throw err;
  }
}

// Re-export generic session completer so Auth.tsx can use it for both providers
export { completeOAuthSession };
