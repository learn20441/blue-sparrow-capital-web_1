// service-worker.js
const CACHE_NAME = "bsc-v1";
const ASSETS = [
  "/", "/index.html",
  "/assets/images/logo.png",
  "/assets/images/app-icon-192.png",
  "/assets/images/app-icon-512.png",
  "/assets/images/maskable-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});
