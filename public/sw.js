// MBC 방송 일정 관리 Service Worker
// Firebase Messaging 서비스 워커

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase 설정은 빌드 시 환경변수로 주입되지 않으므로
// 서비스 워커에서는 self.FIREBASE_CONFIG 사용
const firebaseConfig = self.FIREBASE_CONFIG || {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // 백그라운드 메시지 핸들러
  messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification?.title || 'MBC 방송 일정';
    const notificationOptions = {
      body: payload.notification?.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.data?.scheduleId || 'mbc-schedule',
      data: payload.data,
      vibrate: [200, 100, 200],
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
}

// 알림 클릭 핸들러
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scheduleId = event.notification.data?.scheduleId;
  const url = scheduleId ? `/schedules/${scheduleId}` : '/calendar';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// 캐시 전략 (오프라인 지원)
const CACHE_NAME = 'mbc-schedule-v1';
const STATIC_ASSETS = ['/calendar', '/login'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});
