import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('firebase/analytics', () => ({
  getAnalytics: vi.fn(() => ({ id: 'mock-analytics' })),
  logEvent: vi.fn(),
  setUserId: vi.fn(),
  isSupported: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('./firebase', () => ({
  app: {},
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

describe('analyticsTracker', () => {
  let originalEnv: any;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = import.meta.env;
    vi.stubEnv('VITE_MIXPANEL_TOKEN', 'test-token');
    vi.stubEnv('DEV', 'true');
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('before initialization', () => {
    it('trackEvent should only log to console in DEV mode', async () => {
      const { analyticsTracker } = await import('./analytics');
      const { logEvent } = await import('firebase/analytics');
      const mixpanel = (await import('mixpanel-browser')).default;

      analyticsTracker.trackEvent('test_event', { prop: 'value' });

      expect(console.debug).toHaveBeenCalledWith('📊 [Analytics Event]: test_event', { prop: 'value' });
      expect(logEvent).not.toHaveBeenCalled();
      expect(mixpanel.track).not.toHaveBeenCalled();
    });

    it('identifyUser should not call anything', async () => {
      const { analyticsTracker } = await import('./analytics');
      const { setUserId } = await import('firebase/analytics');
      const mixpanel = (await import('mixpanel-browser')).default;

      analyticsTracker.identifyUser('user123', { trait: 'value' });

      expect(setUserId).not.toHaveBeenCalled();
      expect(mixpanel.identify).not.toHaveBeenCalled();
      expect(mixpanel.people.set).not.toHaveBeenCalled();
    });

    it('resetUser should not call anything', async () => {
      const { analyticsTracker } = await import('./analytics');
      const mixpanel = (await import('mixpanel-browser')).default;

      analyticsTracker.resetUser();

      expect(mixpanel.reset).not.toHaveBeenCalled();
    });
  });

  describe('after initialization', () => {
    it('trackEvent should call Firebase and Mixpanel', async () => {
      const { analyticsTracker, initAnalytics } = await import('./analytics');
      const { logEvent } = await import('firebase/analytics');
      const mixpanel = (await import('mixpanel-browser')).default;

      await initAnalytics();

      analyticsTracker.trackEvent('test_event', { prop: 'value' });

      expect(logEvent).toHaveBeenCalledWith({ id: 'mock-analytics' }, 'test_event', { prop: 'value' });
      expect(mixpanel.track).toHaveBeenCalledWith('test_event', { prop: 'value' });
    });

    it('identifyUser should call Firebase and Mixpanel', async () => {
      const { analyticsTracker, initAnalytics } = await import('./analytics');
      const { setUserId } = await import('firebase/analytics');
      const mixpanel = (await import('mixpanel-browser')).default;

      await initAnalytics();

      analyticsTracker.identifyUser('user123', { trait: 'value' });

      expect(setUserId).toHaveBeenCalledWith({ id: 'mock-analytics' }, 'user123');
      expect(mixpanel.identify).toHaveBeenCalledWith('user123');
      expect(mixpanel.people.set).toHaveBeenCalledWith({ trait: 'value' });
    });

    it('resetUser should call Mixpanel reset', async () => {
      const { analyticsTracker, initAnalytics } = await import('./analytics');
      const mixpanel = (await import('mixpanel-browser')).default;

      await initAnalytics();

      analyticsTracker.resetUser();

      expect(mixpanel.reset).toHaveBeenCalled();
    });
  });
});
