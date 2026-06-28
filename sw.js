const CACHE_NAME = "petko-mobile-v69";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=69",
  "./app.js?v=69",
  "./manifest.webmanifest?v=69",
  "./logo-cut.png",
  "./logo-icon.png",
  "./app-icon.png",
  "./petko-logo.png"
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
