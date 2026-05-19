import { getAnalytics, logEvent, setUserId as setFbUserId, isSupported as isAnalyticsSupported, Analytics } from 'firebase/analytics';
import mixpanel from 'mixpanel-browser';
import { app } from './firebase';
import { MIXPANEL_TOKEN } from '../config/env';

let analytics: Analytics | null = null;
let mixpanelInitialized = false;

export const initAnalytics = async () => {
  if (MIXPANEL_TOKEN) {
    mixpanel.init(MIXPANEL_TOKEN, { debug: import.meta.env.DEV, track_pageview: true, persistence: 'localStorage' });
    mixpanelInitialized = true;
    console.log("Mixpanel initialized");
  } else if (import.meta.env.DEV) {
    console.info("Set VITE_MIXPANEL_TOKEN in .env to enable Mixpanel logs.");
  }

  try {
    const supported = await isAnalyticsSupported();
    if (supported) {
      analytics = getAnalytics(app);
      console.log("Firebase Analytics initialized");
    }
  } catch (error: any) {
    if (error.message?.includes('Failed to fetch') || error.message?.includes('fetch')) {
       console.info("Firebase Analytics blocked by adblocker (expected in dev/preview).");
    } else {
       console.warn("Firebase Analytics could not be initialized:", error);
    }
  }
};

export const analyticsTracker = {
  trackEvent: (eventName: string, properties?: Record<string, any>) => {
    if (import.meta.env.DEV) {
      console.debug(`[Analytics Event]: ${eventName}`, properties);
      return;
    }

    if (analytics) {
      logEvent(analytics, eventName, properties);
    }

    if (mixpanelInitialized) {
      mixpanel.track(eventName, properties);
    }
  },

  identifyUser: (userId: string, traits?: Record<string, any>) => {
    if (analytics) {
      setFbUserId(analytics, userId);
    }

    if (mixpanelInitialized) {
      mixpanel.identify(userId);
      if (traits) {
        mixpanel.people.set(traits);
      }
    }
  },
  
  resetUser: () => {
     if (analytics) {
       setFbUserId(analytics, null);
     }
     if (mixpanelInitialized) {
       mixpanel.reset();
     }
  }
};
