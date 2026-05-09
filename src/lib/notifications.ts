import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth, db, getFCM } from './firebase';

export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) return null;
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const messaging = await getFCM();
      if (!messaging) return null;

      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY 
      });
      
      if (token && auth.currentUser) {
        // Only update if the token is not already registered in this session/local for this user
        const storageKey = `fcm_token_${auth.currentUser.uid}`;
        let cachedToken = null;
        try {
          cachedToken = localStorage.getItem(storageKey);
        } catch (e) {
          console.warn('localStorage access denied in notifications');
        }

        if (cachedToken !== token) {
          await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            fcmTokens: arrayUnion(token)
          });
          try {
            localStorage.setItem(storageKey, token);
          } catch (e) {
            // Ignore
          }
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
