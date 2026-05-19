import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth, db, getFCM } from './firebase';
import { FIREBASE_VAPID_KEY } from '../config/env';
import { safeStorage } from './storage';

let lastRequestTime = 0;

/** Use the active PWA service worker (includes FCM via importScripts). */
async function getFcmServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  try {
    return await navigator.serviceWorker.ready;
  } catch (err) {
    console.warn('[FCM] service worker not ready', err);
    return undefined;
  }
}

export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) return null;
  
  // Throttle: don't request more than once every 1 minute to avoid 429 errors
  const now = Date.now();
  if (now - lastRequestTime < 60000) {
    console.debug('Notification permission request throttled');
    return null;
  }
  lastRequestTime = now;
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const messaging = await getFCM();
      if (!messaging) return null;

      const swRegistration = await getFcmServiceWorkerRegistration();
      const token = await getToken(messaging, {
        vapidKey: FIREBASE_VAPID_KEY,
        ...(swRegistration ? { serviceWorkerRegistration: swRegistration } : {}),
      });
      
      if (token && auth.currentUser) {
        const storageKey = `fcm_token_${auth.currentUser.uid}`;
        const cachedToken = safeStorage.getItem(storageKey);

        if (cachedToken !== token) {
          await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            fcmTokens: arrayUnion(token)
          });
          safeStorage.setItem(storageKey, token);
        }
        return token;
      }
    }
  } catch (error) {
    console.error('Error requesting notification permission:', error);
  }
  return null;
};

export const onForegroundMessage = async (callback: (payload: unknown) => void) => {
  const messaging = await getFCM();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    callback(payload);
  });
};

/** Show a system notification via the service worker (works on mobile PWA). */
export const showLocalNotification = async (title: string, options?: NotificationOptions) => {
  if (Notification.permission !== 'granted') return;

  const payload: NotificationOptions = {
    icon: '/icon.svg',
    badge: '/icon.svg',
    ...options,
  };

  try {
    const registration = await getFcmServiceWorkerRegistration();
    if (registration?.showNotification) {
      await registration.showNotification(title, payload);
      return;
    }
  } catch (err) {
    console.warn('[notifications] SW showNotification failed, falling back', err);
  }

  try {
    new Notification(title, payload);
  } catch (err) {
    console.warn('[notifications] Notification constructor failed', err);
  }
};
