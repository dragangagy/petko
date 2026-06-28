const CACHE_NAME = "petko-mobile-v77";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=77",
  "./app.js?v=77",
  "./manifest.webmanifest?v=77",
  "./logo-cut.png",
  "./logo-icon.png",
  "./app-icon.png",
  "./petko-logo.png",
  "./medal-daily-wins.png",
  "./medal-challenge-wins.png",
  "./medal-best-daily.png",
  "./medal-total-score.png",
  "./medal-started.png",
  "./medal-streak.png",
  "./medal-active-days.png",
  "./medal-challenge-score.png"
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
