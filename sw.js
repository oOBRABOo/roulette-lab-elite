const CACHE = "roulettepro-full-v1";
const ASSETS = ["./", "./index.html", "./app.js", "./manifest.json", "./sw.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k!==CACHE ? caches.delete(k) : null)))
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).then((resp) => {
      const copy = resp.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(()=>{});
      return resp;
    }).catch(()=>caches.match("./index.html")))
  );
});
