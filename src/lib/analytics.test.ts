import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logEvent, setUserId, isSupported, getAnalytics } from 'firebase/analytics';
import mixpanel from 'mixpanel-browser';

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
    people: { set: vi.fn() },
    reset: vi.fn(),
  },
}));

vi.mock('./firebase', () => ({
  app: {},
}));

async function loadAnalytics() {
  vi.resetModules();
  return import('./analytics');
}

describe('analyticsTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_MIXPANEL_TOKEN', 'test-token');
    vi.stubEnv('DEV', false);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('Initialization', () => {
    it('initializes Mixpanel and Firebase when supported', async () => {
      const { initAnalytics } = await loadAnalytics();
      await initAnalytics();

      expect(mixpanel.init).toHaveBeenCalledWith('test-token', {
        debug: false,
        track_pageview: true,
        persistence: 'localStorage',
      });
      expect(isSupported).toHaveBeenCalled();
      expect(getAnalytics).toHaveBeenCalled();
    });

    it('does not initialize Mixpanel if token is missing', async () => {
      vi.stubEnv('VITE_MIXPANEL_TOKEN', '');
      vi.stubEnv('DEV', true);
      const { initAnalytics } = await loadAnalytics();
      await initAnalytics();

      expect(mixpanel.init).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('VITE_MIXPANEL_TOKEN'));
    });

    it('handles Firebase initialization errors', async () => {
      vi.mocked(isSupported).mockRejectedValueOnce(new Error('Failed to fetch'));
      const { initAnalytics } = await loadAnalytics();
      await initAnalytics();

      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Firebase Analytics blocked by adblocker'));
    });

    it('handles other Firebase initialization errors', async () => {
      const error = new Error('Some other error');
      vi.mocked(isSupported).mockRejectedValueOnce(error);
      const { initAnalytics } = await loadAnalytics();
      await initAnalytics();

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Firebase Analytics could not be initialized'),
        error
      );
    });
  });

  describe('trackEvent', () => {
    it('tracks event with Mixpanel and Firebase', async () => {
      const { initAnalytics, analyticsTracker } = await loadAnalytics();
      await initAnalytics();

      const properties = { foo: 'bar' };
      analyticsTracker.trackEvent('test_event', properties);

      expect(logEvent).toHaveBeenCalledWith(expect.anything(), 'test_event', properties);
      expect(mixpanel.track).toHaveBeenCalledWith('test_event', properties);
    });

    it('logs to console in DEV mode', async () => {
      vi.stubEnv('DEV', true);
      const { analyticsTracker } = await loadAnalytics();

      analyticsTracker.trackEvent('test_event');

      expect(console.debug).toHaveBeenCalledWith('[Analytics Event]: test_event', undefined);
    });
  });

  describe('identifyUser', () => {
    it('identifies user in Mixpanel and Firebase', async () => {
      const { initAnalytics, analyticsTracker } = await loadAnalytics();
      await initAnalytics();

      analyticsTracker.identifyUser('user123');

      expect(setUserId).toHaveBeenCalledWith(expect.anything(), 'user123');
      expect(mixpanel.identify).toHaveBeenCalledWith('user123');
    });

    it('sets traits in Mixpanel if provided', async () => {
      const { initAnalytics, analyticsTracker } = await loadAnalytics();
      await initAnalytics();

      const traits = { plan: 'premium' };
      analyticsTracker.identifyUser('user123', traits);

      expect(mixpanel.identify).toHaveBeenCalledWith('user123');
      expect(mixpanel.people.set).toHaveBeenCalledWith(traits);
    });
  });

  describe('resetUser', () => {
    it('resets Mixpanel user', async () => {
      const { initAnalytics, analyticsTracker } = await loadAnalytics();
      await initAnalytics();

      analyticsTracker.resetUser();

      expect(mixpanel.reset).toHaveBeenCalled();
    });
  });
});
