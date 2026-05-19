/* eslint-disable no-undef */
// Loaded via Workbox importScripts — handles FCM background push in the main PWA service worker.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyADxqb1dYF5TzOZTzF3MwvOqDvAcl4T-5g',
  authDomain: 'doctorbike-v2.firebaseapp.com',
  projectId: 'doctorbike-v2',
  storageBucket: 'doctorbike-v2.firebasestorage.app',
  messagingSenderId: '513494631917',
  appId: '1:513494631917:web:78691138fd0df02ee253e4',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const title = notification.title || 'DoctorBike';
  const options = {
    body: notification.body || '',
    icon: notification.icon || '/icon.svg',
    badge: '/icon.svg',
    tag: payload.data?.tag || payload.data?.chatId || 'db360',
    renotify: true,
    data: payload.data || {},
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const payload = event.data.json();
      if (payload.notification) {
        const n = payload.notification;
        event.waitUntil(
          self.registration.showNotification(n.title || 'DoctorBike', {
            body: n.body || '',
            icon: n.icon || '/icon.svg',
            badge: '/icon.svg',
            tag: payload.data?.tag || 'db360',
            data: payload.data || {},
          })
        );
      }
    } catch (_e) {
      // onBackgroundMessage handles FCM-formatted payloads
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
