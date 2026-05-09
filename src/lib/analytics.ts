import { getAnalytics, logEvent, setUserId as setFbUserId, isSupported as isAnalyticsSupported, Analytics } from 'firebase/analytics';
import mixpanel from 'mixpanel-browser';
import { app } from './firebase';

let analytics: Analytics | null = null;
let mixpanelInitialized = false;

export const initAnalytics = async () => {
  // Initialize Mixpanel
  const mixpanelToken = import.meta.env.VITE_MIXPANEL_TOKEN;
  if (mixpanelToken) {
    mixpanel.init(mixpanelToken, { debug: import.meta.env.DEV, track_pageview: true, persistence: 'localStorage' });
    mixpanelInitialized = true;
    console.log("✅ Mixpanel initialized");
  } else {
    console.info("ℹ️ Mixpanel token not found. Set VITE_MIXPANEL_TOKEN in .env to enable Mixpanel logs.");
  }

  // Initialize Firebase Analytics
  try {
    const supported = await isAnalyticsSupported();
    if (supported) {
      analytics = getAnalytics(app);
      console.log("✅ Firebase Analytics initialized");
    }
  } catch (error) {
    console.warn("⚠️ Firebase Analytics could not be initialized:", error);
  }
};

export const analyticsTracker = {
  trackEvent: (eventName: string, properties?: Record<string, any>) => {
    // Console log for dev
    if (import.meta.env.DEV) {
      console.debug(`📊 [Analytics Event]: ${eventName}`, properties);
    }

    // Firebase Analytics
    if (analytics) {
      logEvent(analytics, eventName, properties);
    }

    // Mixpanel
    if (mixpanelInitialized) {
      mixpanel.track(eventName, properties);
    }
  },

  identifyUser: (userId: string, traits?: Record<string, any>) => {
    // Firebase Analytics
    if (analytics) {
      setFbUserId(analytics, userId);
    }

    // Mixpanel
    if (mixpanelInitialized) {
      mixpanel.identify(userId);
      if (traits) {
        mixpanel.people.set(traits);
      }
    }
  },
  
  resetUser: () => {
     if (mixpanelInitialized) {
       mixpanel.reset();
     }
  }
};
