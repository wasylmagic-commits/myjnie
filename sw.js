// Serwis myjni – service worker: strona zawsze świeża z sieci (no-cache = zawsze sprawdza, GitHub Pages trzyma pliki w cache 10 min), kopia tylko na wypadek braku internetu.
// 15.11.2026: „Udostępnij → Serwis myjni” (share_target): POST …/udostepnij → plik do cache „udostepnione”, aplikacja wysyła go do Apps Script (udostepnij.js).
const CACHE = 'myjnie-v98';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method === 'POST' && u.origin === location.origin && /\/udostepnij\/?$/.test(u.pathname)) {
    e.respondWith((async () => {
      try {
        const f = await e.request.formData(), c = await caches.open('udostepnione');
        for (const p of f.getAll('plik')) {
          if (!p || !p.size) continue;
          const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          await c.put(new Request(new URL('./udost/' + id, self.registration.scope).href),
            new Response(p, { headers: { 'Content-Type': p.type || 'application/octet-stream', 'X-Nazwa': encodeURIComponent(p.name || '') } }));
        }
      } catch (err) { /* pusty formularz – po prostu otwieram aplikację */ }
      return Response.redirect(new URL('./?udost=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (/\/opencv\.js$/.test(u.pathname)) return;   // 13 MB – zostaje w zwykłym cache przeglądarki, bez kopii w SW
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // dane z Apps Script – bez cache
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request)));
});
