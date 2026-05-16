import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initAnalytics, analyticsTracker } from './analytics';
import { getAnalytics, logEvent, setUserId as setFbUserId, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import mixpanel from 'mixpanel-browser';

// Mock dependencies
vi.mock('./firebase', () => ({
  app: {}
}));

vi.mock('firebase/analytics', () => ({
  getAnalytics: vi.fn(),
  logEvent: vi.fn(),
  setUserId: vi.fn(),
  isSupported: vi.fn().mockResolvedValue(true)
}));

vi.mock('mixpanel-browser', () => ({
  default: {
    init: vi.fn(),
    track: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    people: {
      set: vi.fn()
    }
  }
}));

describe('analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global variables by clearing them if necessary, 
    // but since they are encapsulated in the module we'll rely on the mocks.
  });

  describe('initAnalytics', () => {
    it('should initialize Mixpanel if token is present', async () => {
      // Mock import.meta.env
      vi.stubEnv('VITE_MIXPANEL_TOKEN', 'test-token');
      
      await initAnalytics();
      
      expect(mixpanel.init).toHaveBeenCalledWith('test-token', expect.any(Object));
    });

    it('should initialize Firebase Analytics if supported', async () => {
      (isAnalyticsSupported as any).mockResolvedValue(true);
      (getAnalytics as any).mockReturnValue({});

      await initAnalytics();

      expect(getAnalytics).toHaveBeenCalled();
    });

    it('should handle Firebase Analytics initialization failure', async () => {
      (isAnalyticsSupported as any).mockResolvedValue(true);
      (getAnalytics as any).mockImplementation(() => {
        throw new Error('Initialization failed');
      });
      
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await initAnalytics();

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Firebase Analytics could not be initialized:'), expect.any(Error));
    });
  });

  describe('analyticsTracker', () => {
    it('should track events in Firebase and Mixpanel', async () => {
      // Setup state for tracker
      vi.stubEnv('VITE_MIXPANEL_TOKEN', 'test-token');
      (isAnalyticsSupported as any).mockResolvedValue(true);
      (getAnalytics as any).mockReturnValue({ app: {} });

      await initAnalytics();
      
      analyticsTracker.trackEvent('test_event', { prop: 'value' });

      expect(logEvent).toHaveBeenCalledWith(expect.any(Object), 'test_event', { prop: 'value' });
      expect(mixpanel.track).toHaveBeenCalledWith('test_event', { prop: 'value' });
    });

    it('should identify users in Firebase and Mixpanel', async () => {
      vi.stubEnv('VITE_MIXPANEL_TOKEN', 'test-token');
      (isAnalyticsSupported as any).mockResolvedValue(true);
      (getAnalytics as any).mockReturnValue({ app: {} });

      await initAnalytics();
      
      analyticsTracker.identifyUser('user123', { name: 'Test User' });

      expect(setFbUserId).toHaveBeenCalledWith(expect.any(Object), 'user123');
      expect(mixpanel.identify).toHaveBeenCalledWith('user123');
      expect(mixpanel.people.set).toHaveBeenCalledWith({ name: 'Test User' });
    });

    it('should reset user in Mixpanel', async () => {
      vi.stubEnv('VITE_MIXPANEL_TOKEN', 'test-token');
      await initAnalytics();
      
      analyticsTracker.resetUser();

      expect(mixpanel.reset).toHaveBeenCalled();
    });
  });
});
