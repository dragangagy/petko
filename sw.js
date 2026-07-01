const CACHE_NAME = "petko-cache-v116";

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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const current = clientList.find((client) => "focus" in client);
      if (current) {
        current.focus();
        return current.navigate ? current.navigate(url) : undefined;
      }
      return clients.openWindow ? clients.openWindow(url) : undefined;
    })
  );
});
