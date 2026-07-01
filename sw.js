const CACHE_NAME = "petko-cache-v113";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",

  "./logo-cut.png",
  "./logo-icon.png",
  "./app-icon.png",
  "./petko-logo.png",

  "./medal-daily-wins.png",
  "./medal-challenge-wins.png",
  "./medal-best-daily.png",
  "./medal-total-score.png",
  "./medal-started.png",
  "./medal-success-rate.png",
  "./medal-streak.png",
  "./medal-active-days.png",
  "./medal-challenge-score.png",
  "./medal-lector.png"
];

// Instalacija
self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Aktivacija
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Uvek prvo pokusaj mrezu, pa tek onda kes
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, copy);
        });

        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
