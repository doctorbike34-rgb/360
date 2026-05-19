import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, Messaging, isSupported } from 'firebase/messaging';
import { getFunctions } from 'firebase/functions';
import fallbackFirebaseConfig from '../../firebase-applet-config.json';
import { useAuthStore } from '../store/useAuthStore';
import { FIREBASE_CONFIG, FIREBASE_FUNCTIONS_REGION, RECAPTCHA_SITE_KEY } from '../config/env';

function resolveFirebaseConfig(): FirebaseOptions {
  const fromEnv = FIREBASE_CONFIG;
  if (fromEnv.apiKey && fromEnv.projectId) {
    return {
      apiKey: fromEnv.apiKey,
      authDomain: fromEnv.authDomain,
      projectId: fromEnv.projectId,
      storageBucket: fromEnv.storageBucket,
      messagingSenderId: fromEnv.messagingSenderId,
      appId: fromEnv.appId,
      measurementId: fromEnv.measurementId,
    };
  }

  console.warn(
    '[firebase] VITE_FIREBASE_* missing in .env — using firebase-applet-config.json fallback'
  );
  return fallbackFirebaseConfig as FirebaseOptions;
}

const firebaseConfig = resolveFirebaseConfig();

if (!firebaseConfig?.apiKey) {
  console.error('Firebase configuration is missing. Set VITE_FIREBASE_* in .env');
}

export const app = initializeApp(firebaseConfig);

// App Check — reCAPTCHA Enterprise
// DISABLED: reCAPTCHA Enterprise key returns 403. Re-enable after configuring
// the key in Firebase Console > App Check with allowed domains.
// import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
//
// if (typeof window !== 'undefined') {
//   if (import.meta.env?.DEV) (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
//   if (!RECAPTCHA_SITE_KEY) {
//     console.warn('VITE_RECAPTCHA_SITE_KEY is not configured. App Check will not be initialized.');
//   } else {
//     try {
//       initializeAppCheck(app, {
//         provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
//         isTokenAutoRefreshEnabled: true
//       });
//     } catch (err) {
//       console.warn('App Check initialization failed. App will run without App Check:', err);
//     }
//   }
// }

export const storage = getStorage(app);

// Using default memory-only cache (no persistence)
export const db = getFirestore(app);

export const auth = getAuth(app);
export const functions = getFunctions(app, FIREBASE_FUNCTIONS_REGION);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const isQuotaError = error instanceof Error && (error.message.includes('Quota exceeded') || error.message.includes('quota limits'));
  
  if (isQuotaError) {
    useAuthStore.getState().setQuotaError(true);
    console.warn(`Firestore Quota Exceeded for ${path}. Action: ${operationType}.`);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

let messaging: Messaging | null = null;
let supportedChecked = false;
let isSupportedFCM = false;

export const getFCM = async () => {
  if (!supportedChecked) {
    try {
      isSupportedFCM = await isSupported();
    } catch (e) {
      isSupportedFCM = false;
    }
    supportedChecked = true;
  }
  
  if (isSupportedFCM && !messaging && typeof window !== 'undefined') {
    try {
      if (!('serviceWorker' in navigator)) throw new Error('Missing ServiceWorker API');
      
      messaging = getMessaging(app);
    } catch (e) {
      console.warn('FCM initialization failed', e);
      isSupportedFCM = false;
      messaging = null;
    }
  }
  return messaging;
};
