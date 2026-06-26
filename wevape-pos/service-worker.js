const CACHE_NAME = 'wevape-pos-v1';

const APP_SHELL = [
  './',
  './index.html',
  './js/supabaseClient.js',
  './js/auth.js',
  './js/payment.js',
  './js/orders.js',
  './js/sales_history.js',
  './js/sales-summary.js',
  './js/purchases.js',
  './js/transfer.js',
  './js/stocktaking.js',
  './js/stock_history.js',
  './js/refund.js',
  './js/closing.js',
  './js/customers.js',
  './js/dashboard.js',
  './js/hourly-stats.js',
  './js/store-compare.js',
  './js/product-trend.js',
  './js/reorder-report.js',
  './js/inventory_analysis.js',
  './js/revisit.js',
  './js/products_admin.js',
  './js/export.js',
  './js/staff-accounts.js',
  './js/notices.js',
  './js/offline.js',
  './js/app.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Supabase API: 항상 네트워크, 캐시 금지
  if (url.hostname.endsWith('.supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // 외부 CDN: 네트워크 우선, 캐시 폴백
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 앱 셸: 캐시 우선, 네트워크 폴백
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
