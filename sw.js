// Self-destructing service worker.
// ---------------------------------------------------------------------------
// A previously-registered root-scoped service worker on onury.io kept serving
// stale cached content. Its original script is gone (404), so it can't update
// itself away. Deploying THIS script at /sw.js gives those stale workers a new
// version to install on their next update check — and all it does is unregister
// itself, wipe its caches, and reload open pages.
//
// Safe to delete a few weeks after deploy, once stale registrations have cleared.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        await self.registration.unregister();
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) client.navigate(client.url);
      } catch {
        /* best-effort cleanup */
      }
    })()
  );
});
