import { vi } from 'vitest';

vi.stubEnv('DEV', false);
vi.stubEnv('PROD', true);
vi.stubEnv('VITE_MIXPANEL_TOKEN', 'test-token');
vi.stubEnv('VITE_SENTRY_DSN', '');

vi.mock('./src/config/env', () => ({
  GEMINI_API_KEY: 'test-gemini-key',
  STRIPE_PUBLISHABLE_KEY: 'pk_test',
  get RECAPTCHA_SITE_KEY() {
    return 'test-recaptcha';
  },
  FIREBASE_VAPID_KEY: 'test-vapid',
  getSentryDsn: () => (import.meta.env.VITE_SENTRY_DSN as string) || '',
  getMixpanelToken: () => (import.meta.env.VITE_MIXPANEL_TOKEN as string) ?? 'test-token',
  SENTRY_DSN: '',
  MIXPANEL_TOKEN: 'test-token',
  APP_URL: 'https://test.example',
  APP_CHECK_ENABLED: false,
  APP_CHECK_DEBUG: false,
  FIREBASE_CONFIG: {
    apiKey: 'test',
    authDomain: 'test.firebaseapp.com',
    projectId: 'test',
    storageBucket: 'test.appspot.com',
    messagingSenderId: '123',
    appId: '1:123:web:abc',
  },
  FIREBASE_FUNCTIONS_REGION: 'europe-west1',
  getCloudFunctionUrl: (name: string) => `https://europe-west1-test.cloudfunctions.net/${name}`,
  validateClientEnv: vi.fn(),
}));
