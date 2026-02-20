// Simple offline-first Service Worker
const CACHE = "roulette-monitor-pro-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./analytics.js",
  "./manifest.json"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e)=>{
  const req = e.request;
  e.respondWith(
    caches.match(req).then(cached=>{
      return cached || fetch(req).then(resp=>{
        const copy = resp.clone();
        caches.open(CACHE).then(c=>c.put(req, copy)).catch(()=>{});
        return resp;
      }).catch(()=>cached);
    })
  );
});
