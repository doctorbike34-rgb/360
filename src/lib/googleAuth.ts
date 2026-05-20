import {
  GoogleAuthProvider,
  User,
  UserCredential,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { isPwaStandalone, isIosDevice } from './pwaInstall';
import {
  clearAuthIntent,
  getAuthIntent,
  setAuthIntent,
  type AuthIntent,
} from './authFlow';
import { persistLandingDismissed as markLandingDismissed } from './landingStorage';
import { useAuthStore } from '../store/useAuthStore';
import { UserProfile, UserRole } from '../types';

export const GOOGLE_REDIRECT_PENDING_KEY = 'db360_google_redirect_pending';
export const GOOGLE_REDIRECT_ERROR_KEY = 'db360_google_redirect_error';

const PENDING_MAX_AGE_MS = 10 * 60 * 1000;
const AUTH_SW_PREP_KEY = 'db360_auth_sw_prepared';

let redirectResultPromise: Promise<UserCredential | null> | null = null;

function isDeployedAppHost(): boolean {
  const host = window.location.hostname;
  return (
    host === 'www.db360app.it' ||
    host === 'db360app.it' ||
    host === 'doctorbike-v2.web.app' ||
    host === 'doctorbike-v2.firebaseapp.com'
  );
}

/** Popup su dominio custom apre firebaseapp.com in altra scheda: usare redirect full-page. */
export function shouldPreferGoogleRedirect(): boolean {
  if (typeof window === 'undefined') return false;
  if (isDeployedAppHost()) return true;
  if (isPwaStandalone()) return true;
  if (isIosDevice()) return true;
  return false;
}

function readTimestampedFlag(key: string, maxAgeMs: number): boolean {
  const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key);
  if (!raw) return false;
  if (raw === '1') return true;
  try {
    const parsed = JSON.parse(raw) as { t?: number };
    if (typeof parsed.t === 'number') return Date.now() - parsed.t < maxAgeMs;
  } catch {
    /* legacy */
  }
  return true;
}

function writeTimestampedFlag(key: string, useLocalStorage: boolean): void {
  const payload = JSON.stringify({ t: Date.now() });
  sessionStorage.setItem(key, payload);
  if (useLocalStorage) localStorage.setItem(key, payload);
}

export function markGoogleRedirectPending(): void {
  writeTimestampedFlag(GOOGLE_REDIRECT_PENDING_KEY, true);
}

export function isGoogleRedirectPending(): boolean {
  return readTimestampedFlag(GOOGLE_REDIRECT_PENDING_KEY, PENDING_MAX_AGE_MS);
}

export function clearGoogleRedirectPending(): void {
  sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
  localStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
}

export function getGoogleRedirectError(): string | null {
  return sessionStorage.getItem(GOOGLE_REDIRECT_ERROR_KEY);
}

export function clearGoogleRedirectError(): void {
  sessionStorage.removeItem(GOOGLE_REDIRECT_ERROR_KEY);
}

export function setGoogleAuthError(message: string): void {
  sessionStorage.setItem(GOOGLE_REDIRECT_ERROR_KEY, message);
}

export function isFirebaseAuthReturnUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const blob = `${window.location.search}${window.location.hash}`;
  return /(^|[?#&])(apiKey|access_token|id_token|error)=/.test(blob);
}

function stripAuthParamsFromUrl(): void {
  if (!isFirebaseAuthReturnUrl()) return;
  window.history.replaceState(null, '', window.location.pathname);
}

export async function prepareAuthRedirectReturn(): Promise<'reload' | 'ready'> {
  if (!isFirebaseAuthReturnUrl()) return 'ready';

  redirectResultPromise = null;

  if (sessionStorage.getItem(AUTH_SW_PREP_KEY) === '1') return 'ready';

  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs.length > 0) {
      await Promise.all(regs.map((r) => r.unregister()));
      sessionStorage.setItem(AUTH_SW_PREP_KEY, '1');
      if (hadController) {
        window.location.replace(window.location.href);
        return 'reload';
      }
    }
  }

  sessionStorage.setItem(AUTH_SW_PREP_KEY, '1');
  return 'ready';
}

export function clearAuthRedirectPrepFlag(): void {
  sessionStorage.removeItem(AUTH_SW_PREP_KEY);
}

export function cleanupStaleOAuthFlags(): void {
  if (!isFirebaseAuthReturnUrl() && isGoogleRedirectPending()) {
    clearGoogleRedirectPending();
  }
}

export function getGoogleRedirectResultOnce(): Promise<UserCredential | null> {
  if (!redirectResultPromise) {
    redirectResultPromise = getRedirectResult(auth)
      .then((credential) => credential)
      .catch((err: unknown) => {
        const code = (err as { code?: string })?.code;
        if (code !== 'auth/no-auth-event') {
          console.warn('getRedirectResult:', code, err);
        }
        return null;
      });
  }
  return redirectResultPromise;
}

export async function waitForFirebaseUserAfterOAuth(maxMs = 8000): Promise<User | null> {
  const credential = await getGoogleRedirectResultOnce();
  if (credential?.user) return credential.user;

  try {
    await auth.authStateReady();
  } catch {
    /* ignore */
  }
  if (auth.currentUser) return auth.currentUser;

  const deadline = Date.now() + maxMs;
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsub();
        resolve(user);
      }
    });
    window.setTimeout(() => {
      unsub();
      resolve(auth.currentUser);
    }, Math.max(0, deadline - Date.now()));
  });
}

function createGoogleAuthProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export type GoogleAuthResolution =
  | { status: 'registered'; role: UserRole }
  | { status: 'needs_signup' };

export async function resolveGoogleUserProfile(googleUser: User): Promise<GoogleAuthResolution> {
  const userDoc = await getDoc(doc(db, 'users', googleUser.uid));
  const isAdminEmail = googleUser.email?.toLowerCase() === 'doctorbike34@gmail.com';

  if (userDoc.exists()) {
    const profile = userDoc.data() as UserProfile;
    if (isAdminEmail) {
      if (profile.role !== 'ADMIN') {
        await updateDoc(doc(db, 'users', googleUser.uid), { role: 'ADMIN' });
      }
      await setDoc(
        doc(db, 'admins', googleUser.uid),
        { uid: googleUser.uid, email: googleUser.email, updatedAt: serverTimestamp() },
        { merge: true }
      );
      return { status: 'registered', role: 'ADMIN' };
    }
    if (profile.role) {
      return { status: 'registered', role: profile.role };
    }
    return { status: 'needs_signup' };
  }

  if (isAdminEmail) {
    return { status: 'registered', role: 'ADMIN' };
  }

  return { status: 'needs_signup' };
}

export async function completeGoogleSession(
  googleUser: User,
  intent?: AuthIntent | null
): Promise<GoogleAuthResolution> {
  void intent;
  const { setUser, setRole, setLoading } = useAuthStore.getState();
  clearGoogleRedirectError();
  const resolution = await resolveGoogleUserProfile(googleUser);

  setUser(googleUser);

  if (resolution.status === 'registered') {
    setRole(resolution.role);
    clearAuthIntent();
    clearGoogleRedirectPending();
    clearAuthRedirectPrepFlag();
    setLoading(false);
    return resolution;
  }

  setAuthIntent('signup');
  setRole(null);
  clearGoogleRedirectPending();
  clearAuthRedirectPrepFlag();
  setLoading(false);
  return resolution;
}

/**
 * Provider-agnostic OAuth session completer.
 * Used by Apple Sign-In (and any future OAuth provider) to run the same
 * profile-resolution + store-update flow as Google.
 */
export const completeOAuthSession = completeGoogleSession;

export async function startGoogleSignIn(intent: AuthIntent): Promise<User | null> {
  clearGoogleRedirectError();
  setAuthIntent(intent);
  const provider = createGoogleAuthProvider();

  if (shouldPreferGoogleRedirect()) {
    markGoogleRedirectPending();
    await signInWithRedirect(auth, provider);
    return null;
  }

  const result = await signInWithPopup(auth, provider);
  return result.user ?? (await waitForFirebaseUserAfterOAuth(5000));
}

export async function handleGoogleRedirectOnBoot(): Promise<User | null> {
  if (typeof window === 'undefined') return null;

  cleanupStaleOAuthFlags();

  const authReturnUrl = isFirebaseAuthReturnUrl();
  const wasPending = isGoogleRedirectPending();
  if (!authReturnUrl && !wasPending) return null;

  const fbUser = await waitForFirebaseUserAfterOAuth(15000);

  if (!fbUser) {
    if (authReturnUrl || wasPending) {
      const msg = authReturnUrl
        ? 'Accesso Google non completato. Verifica i domini autorizzati in Firebase (www.db360app.it) e riprova.'
        : 'Accesso Google interrotto. Riprova.';
      setGoogleAuthError(msg);
      console.warn('[Google Auth]', msg);
    }
    clearGoogleRedirectPending();
    if (authReturnUrl) stripAuthParamsFromUrl();
    return null;
  }

  await completeGoogleSession(fbUser, getAuthIntent());
  if (authReturnUrl) stripAuthParamsFromUrl();
  return fbUser;
}

export function isGoogleSignedInUser(user: User | null | undefined): boolean {
  return !!user?.providerData?.some((p) => p.providerId === 'google.com');
}
