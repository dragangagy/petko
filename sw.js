const CACHE_NAME = "petko-mobile-v58";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=58",
  "./app.js?v=58",
  "./manifest.webmanifest?v=58",
  "./logo-cut.png",
  "./logo-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
