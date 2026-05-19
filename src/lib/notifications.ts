import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth, db, getFCM } from './firebase';
import { FIREBASE_VAPID_KEY } from '../config/env';
import { safeStorage } from './storage';

let lastRequestTime = 0;
let fcmSwRegistration: ServiceWorkerRegistration | null = null;

async function getFcmServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  if (fcmSwRegistration) return fcmSwRegistration;
  try {
    fcmSwRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    return fcmSwRegistration;
  } catch (err) {
    console.warn('[FCM] firebase-messaging-sw.js registration failed', err);
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

export const showLocalNotification = (title: string, options?: NotificationOptions) => {
  if (Notification.permission === 'granted') {
    new Notification(title, {
      icon: '/icon.svg',
      ...options
    });
  }
};
