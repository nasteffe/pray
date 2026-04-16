/*
 * Prayer Briefing — Service Worker
 *
 * Cache-first for static assets, network-first for briefing pages.
 * Enables offline reading of previously viewed briefings.
 * Periodic alert checking for flash alert notifications.
 */

const CACHE_NAME = 'prayer-v4';
const STATIC_ASSETS = [
  '/static/css/prayer.css',
  '/pray',
];

// Alert polling interval (15 minutes)
const ALERT_CHECK_INTERVAL = 15 * 60 * 1000;

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for pages, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Static assets: cache-first
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Prayer pages: network-first, cache fallback
  if (url.pathname.startsWith('/pray')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else: network only
  event.respondWith(fetch(event.request));
});

// ---------------------------------------------------------------------------
// Flash alert notification polling
// ---------------------------------------------------------------------------

// Message handler: clients can request an immediate alert check
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_ALERTS') {
    checkForAlerts();
  }
});

async function checkForAlerts() {
  try {
    const response = await fetch('/pray/api/alerts');
    if (!response.ok) return;

    const data = await response.json();
    if (!data.alerts || data.alerts.length === 0) return;

    // Compare against last seen alerts (stored in cache)
    const cache = await caches.open(CACHE_NAME);
    const lastSeenResponse = await cache.match('/_alert_state');
    let lastSeenIds = [];
    if (lastSeenResponse) {
      try {
        const lastSeen = await lastSeenResponse.json();
        lastSeenIds = lastSeen.seen || [];
      } catch (e) { /* ignore parse errors */ }
    }

    // Find new alerts
    const newAlerts = data.alerts.filter(
      (alert) => !lastSeenIds.includes(alert.id)
    );

    if (newAlerts.length > 0) {
      // Show notification for each new alert
      for (const alert of newAlerts) {
        await self.registration.showNotification('Flash Alert: ' + alert.country, {
          body: alert.level + ' — ' + alert.thresholds_exceeded + ' thresholds crossed',
          icon: '/static/icons/pray-192.svg',
          badge: '/static/icons/pray-192.svg',
          tag: 'flash-' + alert.id,
          data: { url: '/pray/' + alert.iso3 },
          requireInteraction: true,
        });
      }

      // Update seen state
      const allIds = data.alerts.map((a) => a.id);
      const stateResponse = new Response(JSON.stringify({ seen: allIds }));
      await cache.put('/_alert_state', stateResponse);
    }
  } catch (err) {
    // Silently fail — polling will retry next interval
  }
}

// Notification click: navigate to the country prayer page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/pray';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url.includes('/pray') && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      return clients.openWindow(url);
    })
  );
});

// Periodic sync (if supported by browser) — checks for alerts on interval
// Falls back to setInterval in the main page for unsupported browsers
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-alerts') {
    event.waitUntil(checkForAlerts());
  }
});
