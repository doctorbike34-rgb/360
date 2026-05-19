import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { app } from './firebase';
import { APP_CHECK_DEBUG, APP_CHECK_ENABLED, RECAPTCHA_SITE_KEY } from '../config/env';

let initAttempted = false;

const CONSOLE_SETUP_HINT =
  'Firebase Console → App Check → register the web app → reCAPTCHA Enterprise provider → add domains: doctorbike-v2.web.app, www.db360app.it, localhost';

function useDebugToken(): boolean {
  return import.meta.env.DEV || APP_CHECK_DEBUG;
}

function isAppCheckFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('403') || message.toLowerCase().includes('recaptcha');
}

/**
 * App Check with reCAPTCHA Enterprise (not v3).
 */
export async function initAppCheck(): Promise<void> {
  if (initAttempted || typeof window === 'undefined') return;
  initAttempted = true;

  if (!RECAPTCHA_SITE_KEY) {
    if (import.meta.env.DEV) {
      console.info('[App Check] VITE_RECAPTCHA_SITE_KEY not set — skipped');
    }
    return;
  }

  if (!APP_CHECK_ENABLED) return;

  try {
    if (useDebugToken()) {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
        true;
    }

    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });

    console.info('[App Check] initialized with reCAPTCHA Enterprise');
  } catch (error) {
    const hint = isAppCheckFailure(error)
      ? `${CONSOLE_SETUP_HINT} (403 usually means wrong provider or domain not allowlisted)`
      : CONSOLE_SETUP_HINT;
    console.warn(`[App Check] Could not initialize. ${hint} The app will continue without App Check.`, error);
  }
}
