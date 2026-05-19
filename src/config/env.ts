/**
 * Client configuration loaded from `.env` (Vite `VITE_*` variables).
 * Never put secret keys (Stripe secret, service accounts) here.
 */

function readEnv(key: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

export const GEMINI_API_KEY = readEnv('VITE_GEMINI_API_KEY');

export const STRIPE_PUBLISHABLE_KEY = readEnv('VITE_STRIPE_PUBLISHABLE_KEY');

export const RECAPTCHA_SITE_KEY = readEnv('VITE_RECAPTCHA_SITE_KEY');

/** Enable App Check (recommended in production). */
export const APP_CHECK_ENABLED =
  readEnv('VITE_APP_CHECK_ENABLED') === 'true' || import.meta.env.PROD;

/** Use Firebase App Check debug token in dev (register token in Console). */
export const APP_CHECK_DEBUG = readEnv('VITE_APP_CHECK_DEBUG') === 'true';

export const FIREBASE_VAPID_KEY = readEnv('VITE_FIREBASE_VAPID_KEY');

export const getSentryDsn = (): string => readEnv('VITE_SENTRY_DSN');

export const getMixpanelToken = (): string => readEnv('VITE_MIXPANEL_TOKEN');

/** @deprecated Use getMixpanelToken() — kept for backwards compatibility */
export const MIXPANEL_TOKEN = readEnv('VITE_MIXPANEL_TOKEN');

/** @deprecated Use getSentryDsn() */
export const SENTRY_DSN = readEnv('VITE_SENTRY_DSN');

export const APP_URL = readEnv('VITE_APP_URL');

export const FIREBASE_FUNCTIONS_REGION =
  readEnv('VITE_FIREBASE_FUNCTIONS_REGION') || 'europe-west1';

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export const FIREBASE_CONFIG: FirebaseClientConfig = {
  apiKey: readEnv('VITE_FIREBASE_API_KEY'),
  authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readEnv('VITE_FIREBASE_APP_ID'),
  measurementId: readEnv('VITE_FIREBASE_MEASUREMENT_ID') || undefined,
};

/** HTTPS URL for a deployed Cloud Function in the configured region. */
export function getCloudFunctionUrl(functionName: string): string {
  const base = readEnv('VITE_FUNCTIONS_BASE_URL');
  if (base) {
    return `${base.replace(/\/$/, '')}/${functionName}`;
  }
  const { projectId } = FIREBASE_CONFIG;
  if (!projectId) return '';
  return `https://${FIREBASE_FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/${functionName}`;
}

const CLIENT_ENV_CHECKS: Array<{ key: string; value: string; label: string }> = [
  { key: 'VITE_FIREBASE_API_KEY', value: FIREBASE_CONFIG.apiKey, label: 'Firebase' },
  { key: 'VITE_FIREBASE_PROJECT_ID', value: FIREBASE_CONFIG.projectId, label: 'Firebase project' },
  { key: 'VITE_GEMINI_API_KEY', value: GEMINI_API_KEY, label: 'Gemini AI' },
  { key: 'VITE_STRIPE_PUBLISHABLE_KEY', value: STRIPE_PUBLISHABLE_KEY, label: 'Stripe' },
  { key: 'VITE_FIREBASE_VAPID_KEY', value: FIREBASE_VAPID_KEY, label: 'Push (VAPID)' },
];

/** Logs missing required keys once at startup (production warns, dev info). */
export function validateClientEnv(): void {
  const missing = CLIENT_ENV_CHECKS.filter((c) => !c.value).map((c) => c.key);
  if (missing.length === 0) return;

  const message = `Missing .env variables: ${missing.join(', ')}`;
  if (import.meta.env.PROD) {
    console.warn(`[env] ${message}`);
  } else {
    console.info(`[env] ${message}`);
  }
}
