// V-Flow 서비스워커 — "항상 최신 우선(network-first)" 전략
// 목적: PWA 설치 요건 충족 + 오프라인 시 마지막 화면 보여주기.
// 새 배포가 나가면 온라인 상태에선 항상 새 버전을 받으므로 "옛 버전 고정" 문제가 없다.
const CACHE = 'vflow-cache-v1';

self.addEventListener('install', () => {
  // 새 서비스워커가 대기 없이 즉시 활성화되도록
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // 옛 캐시 정리
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 같은 사이트의 GET 요청만 취급 (Supabase 등 외부 API는 절대 캐시하지 않음)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  e.respondWith((async () => {
    try {
      // 1순위: 네트워크에서 최신본
      const res = await fetch(e.request);
      if (res && res.ok) {
        const c = await caches.open(CACHE);
        c.put(e.request, res.clone());
      }
      return res;
    } catch (err) {
      // 오프라인: 캐시된 마지막 버전으로
      const cached = await caches.match(e.request, { ignoreSearch: url.pathname.endsWith('.html') });
      if (cached) return cached;
      throw err;
    }
  })());
});

// ── 🔔 웹 푸시 수신 ──
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.title || 'V-Flow 알림', {
    body: d.body || '확인할 항목이 있어요',
    icon: '/icons/icon-192-v2.png',
    badge: '/icons/icon-192-v2.png',
    data: { url: d.url || '/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.focus(); return; } }
    return clients.openWindow((e.notification.data && e.notification.data.url) || '/');
  }));
});
