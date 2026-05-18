import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth, db, getFCM } from './firebase';
import { FIREBASE_VAPID_KEY } from '../config/env';
import { safeStorage } from './storage';

let lastRequestTime = 0;

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

      const token = await getToken(messaging, {
        vapidKey: FIREBASE_VAPID_KEY 
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
      icon: '/logo192.png', // Fallback icon path
      ...options
    });
  }
};
