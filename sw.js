const CACHE_NAME = "petko-cache-v178";

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
  "./petak-za-petka-logo.png",
  "./petko-splash.png",
  "./petak-splash.png",
  "./petko-mood-hello.png",
  "./petko-mood-think.png",
  "./petko-mood-win.png",
  "./petko-mood-miss.png",
  "./petko-mood-laugh.png",
  "./petko-mood-oops.png",
  "./petko-mood-sad.png",
  "./petko-mood-cool.png",
  "./petko-mood-great.png",
  "./petko-mood-trophy.png",
  "./1.png",
  "./2.png",
  "./3.png",
  "./4.png",
  "./5.png",
  "./6.png",
  "./7.png",
  "./8.png",
  "./9.png",
  "./10.png",
  "./11.png",
  "./12.png",
  "./13.png",
  "./14.png",
  "./15.png",
  "./16.png",
  "./17.png",
  "./18.png",
  "./19.png",
  "./20.png",
  "./21.png",
  "./22.png",
  "./23.png",
  "./24.png",
  "./25.png",
  "./26.png",
  "./extrime1.png",
  "./extrime2.png",
  "./extrime3.png",

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
