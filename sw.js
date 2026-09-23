// V-Flow 서비스워커 — "캐시 먼저 그리고 뒤에서 새것" (stale-while-revalidate)
// 목적: 켜자마자 화면이 뜬다. 새 배포는 뒤에서 받아 다음 열 때 쓰고, 지금 열린 화면엔 「새 버전」 표시를 보낸다.
// 같은 사이트의 GET만. /api/ 와 외부(Supabase 등)는 절대 캐시하지 않는다.
// v3: 화면(HTML)은 주소가 '/', '/?pc=1', '/index.html' 어느 것이든 한 칸('/index.html')에만 둔다.
// v2는 주소마다 따로 두고 찾을 때는 ?를 무시해서, 먼저 들어간 '/?pc=1'(옛 버전)이 계속 나오고 새 버전이 안 보였다.
// 이름을 바꿔 옛 칸을 통째로 지운다.
const CACHE = 'vflow-cache-v3';
const HTML_KEY = '/index.html';
const SHELL = ['/index.html', '/adapter/firebase-shim.js', '/adapter/supabase-client.js', '/adapter/context.js', '/vendor/supabase.js', '/consent.js', '/manifest.json'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isHtml = (req, url) => req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/';

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // 앱 화면('/'·'/index.html', ?pc=1 같은 꼬리 포함)만 한 칸으로. login.html 같은 다른 페이지는 제 주소 그대로
    const shell = url.pathname === '/' || url.pathname === '/index.html';
    const html = isHtml(req, url);
    const key = shell ? HTML_KEY : req;
    const cached = await cache.match(key);
    // 뒤에서 새것 받기 — 캐시가 있든 없든 시작한다
    const fresh = fetch(req).then(async (res) => {
      if (res && res.ok) {
        const oldTag = cached && (cached.headers.get('etag') || cached.headers.get('last-modified') || '');
        const newTag = res.headers.get('etag') || res.headers.get('last-modified') || '';
        if (!res.redirected) await cache.put(key, res.clone());
        // index.html 이 바뀌었으면 열린 화면에 알린다
        if (shell && cached && oldTag && newTag && oldTag !== newTag) {
          const list = await self.clients.matchAll({ type: 'window' });
          list.forEach((c) => c.postMessage({ type: 'vf-update' }));
        }
      }
      return res;
    }).catch(() => null);
    if (cached) return cached;
    const res = await fresh;
    if (res) return res;
    // 오프라인이고 캐시도 없을 때
    if (html && req.mode === 'navigate') { const idx = await cache.match(shell ? HTML_KEY : req); if (idx) return idx; }
    return new Response('', { status: 504 });
  })());
});

// ── 웹 푸시 수신 — 앱이 앞에 있으면 화면 안 토스트, 아니면 윈도우 알림 ──
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil((async () => {
    let front = false
    try {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      list.forEach((c) => c.postMessage({ type: 'vf-push', title: d.title || '', body: d.body || '', url: d.url || '/' }));
      // 앱이 앞에 떠 있으면 화면 안 토스트만 — 같은 알림이 두 번 뜨지 않게
      front = list.some((c) => c.visibilityState === 'visible' && c.focused)
    } catch (err) {}
    if (front) return
    await self.registration.showNotification(d.title || 'V-Flow 알림', {
      body: d.body || '확인할 항목',
      icon: '/icons/icon-192-v2.png',
      badge: '/icons/icon-192-v2.png',
      data: { url: d.url || '/' },
    });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.focus(); return; } }
    return clients.openWindow((e.notification.data && e.notification.data.url) || '/');
  }));
});
