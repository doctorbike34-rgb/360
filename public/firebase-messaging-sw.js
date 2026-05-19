/* eslint-disable no-undef */
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
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: payload.data,
  };
  self.registration.showNotification(title, options);
});
