// Service worker voor offline gebruik. Wordt bij `vite build` gegenereerd als dist/sw.js
// (zie vite.config.js): de bestandslijst en versie worden dan ingevuld.
//
// - Bij installeren: alle app-bestanden direct in de cache, zodat de app meteen offline werkt.
// - Pagina (navigatie): eerst netwerk (nieuwste versie), anders uit de cache.
// - <BASE>assets/*: bestandsnamen bevatten een hash en veranderen nooit, dus cache eerst.
// - Andere domeinen (Google, CBS) worden niet onderschept.
const VERSION = __VERSION__;
const CACHE = `vermogensoverzicht-${VERSION}`;
const PRECACHE = __PRECACHE__;
const BASE = __BASE__; // submap van de app, bijv. '/vermogen/'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(BASE, copy));
          return res;
        })
        .catch(() => caches.match(BASE))
    );
    return;
  }

  if (url.pathname.startsWith(BASE + 'assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
