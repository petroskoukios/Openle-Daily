/* Openle service worker. Network-first so an online player always gets the
   latest build (the site updates often); the cache is the offline fallback,
   and navigations fall back to the cached app shell. */

const CACHE = "openle-v1";
const PRECACHE = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(r => { put(req, r); return r; }).catch(() => caches.match("/index.html")));
    return;
  }
  e.respondWith(fetch(req).then(r => { if (r && r.ok) put(req, r); return r; }).catch(() => caches.match(req)));
});

function put(req, res) {
  const copy = res.clone();
  caches.open(CACHE).then(c => c.put(req, copy));
}
