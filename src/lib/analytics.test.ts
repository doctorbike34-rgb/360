import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyticsTracker, initAnalytics } from './analytics';
import { logEvent, setUserId, isSupported, getAnalytics } from 'firebase/analytics';
import mixpanel from 'mixpanel-browser';

// Mock dependencies
vi.mock('firebase/analytics', () => ({
  getAnalytics: vi.fn(() => ({})),
  logEvent: vi.fn(),
  setUserId: vi.fn(),
  isSupported: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('mixpanel-browser', () => ({
  default: {
    init: vi.fn(),
    track: vi.fn(),
    identify: vi.fn(),
    people: {
      set: vi.fn(),
    },
    reset: vi.fn(),
  },
}));

vi.mock('../firebase', () => ({
  app: {},
}));

describe('analyticsTracker', () => {
  const originalEnv = import.meta.env;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset env vars before each test
    vi.stubEnv('VITE_MIXPANEL_TOKEN', 'test-token');
    vi.stubEnv('DEV', false);

    // Reset console spies
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('initializes Mixpanel and Firebase when supported', async () => {
      await initAnalytics();

      expect(mixpanel.init).toHaveBeenCalledWith('test-token', {
        debug: import.meta.env.DEV,
        track_pageview: true,
        persistence: 'localStorage'
      });
      expect(isSupported).toHaveBeenCalled();
      expect(getAnalytics).toHaveBeenCalled();
    });

    it('does not initialize Mixpanel if token is missing', async () => {
      vi.stubEnv('VITE_MIXPANEL_TOKEN', '');

      await initAnalytics();

      expect(mixpanel.init).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Mixpanel token not found'));
    });

    it('handles Firebase initialization errors', async () => {
      vi.mocked(isSupported).mockRejectedValueOnce(new Error('Failed to fetch'));

      await initAnalytics();

      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Firebase Analytics blocked by adblocker'));
    });

    it('handles other Firebase initialization errors', async () => {
      const error = new Error('Some other error');
      vi.mocked(isSupported).mockRejectedValueOnce(error);

      await initAnalytics();

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Firebase Analytics could not be initialized'), error);
    });
  });

  describe('trackEvent', () => {
    beforeEach(async () => {
      // Initialize to set up the internal state
      await initAnalytics();
    });

    it('tracks event with Mixpanel and Firebase', () => {
      const properties = { foo: 'bar' };
      analyticsTracker.trackEvent('test_event', properties);

      expect(logEvent).toHaveBeenCalledWith(expect.anything(), 'test_event', properties);
      expect(mixpanel.track).toHaveBeenCalledWith('test_event', properties);
    });

    it('logs to console in DEV mode', () => {
      vi.stubEnv('DEV', true);

      analyticsTracker.trackEvent('test_event');

      expect(console.debug).toHaveBeenCalledWith('📊 [Analytics Event]: test_event', undefined);
    });
  });

  describe('identifyUser', () => {
    beforeEach(async () => {
      // Initialize to set up the internal state
      await initAnalytics();
    });

    it('identifies user in Mixpanel and Firebase', () => {
      analyticsTracker.identifyUser('user123');

      expect(setUserId).toHaveBeenCalledWith(expect.anything(), 'user123');
      expect(mixpanel.identify).toHaveBeenCalledWith('user123');
      expect(mixpanel.people.set).not.toHaveBeenCalled();
    });

    it('sets traits in Mixpanel if provided', () => {
      const traits = { plan: 'premium' };
      analyticsTracker.identifyUser('user123', traits);

      expect(mixpanel.identify).toHaveBeenCalledWith('user123');
      expect(mixpanel.people.set).toHaveBeenCalledWith(traits);
    });
  });

  describe('resetUser', () => {
    beforeEach(async () => {
      // Initialize to set up the internal state
      await initAnalytics();
    });

    it('resets Mixpanel user', () => {
      analyticsTracker.resetUser();

      expect(mixpanel.reset).toHaveBeenCalled();
    });
  });
});
