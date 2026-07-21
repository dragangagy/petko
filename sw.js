const CACHE_NAME = "petko-cache-v226";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",

  "./logo-cut.png",
  "./logo-icon.png",
  "./app-icon.png",
  "./app-icon-maskable.png",
  "./petko-logo.png",
  "./petak-za-petka-logo.png",
  "./vs.png",
  "./spooky-thunderstorm.gif",
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

  "./avatar/M1.png",
  "./avatar/M2.png",
  "./avatar/M3.png",
  "./avatar/M4.png",
  "./avatar/M5.png",
  "./avatar/M6.png",
  "./avatar/M7.png",
  "./avatar/M8.png",
  "./avatar/M9.png",
  "./avatar/M10.png",
  "./avatar/M11.png",
  "./avatar/M12.png",
  "./avatar/M13.png",
  "./avatar/M14.png",
  "./avatar/M15.png",
  "./avatar/M16.png",
  "./avatar/M17.png",
  "./avatar/M18.png",
  "./avatar/M19.png",
  "./avatar/M21.png",
  "./avatar/M22.png",
  "./avatar/M23.png",
  "./avatar/M24.png",
  "./avatar/M25.png",
  "./avatar/M26.png",
  "./avatar/M27.png",
  "./avatar/M28.png",
  "./avatar/M29.png",
  "./avatar/M30.png",
  "./avatar/M31.png",
  "./avatar/M32.png",
  "./avatar/M33.png",
  "./avatar/M34.png",
  "./avatar/M35.png",
  "./avatar/M36.png",
  "./avatar/M37.png",
  "./avatar/M38.png",
  "./avatar/M21-a.png",
  "./avatar/M22-a.png",
  "./avatar/M23-a.png",
  "./avatar/M24-a.png",
  "./avatar/M25-a.png",
  "./avatar/M26-a.png",
  "./avatar/M27-a.png",
  "./avatar/M28-a.png",
  "./avatar/M29-a.png",
  "./avatar/M30-a.png",
  "./avatar/M31-a.png",
  "./avatar/M32-a.png",
  "./avatar/M33-a.png",
  "./avatar/M34-a.png",
  "./avatar/M35-a.png",
  "./avatar/M36-a.png",
  "./avatar/M37-a.png",
  "./avatar/M38-a.png",
  "./avatar/challenge-tie.png",
  "./avatar/Z1.png",
  "./avatar/Z2.png",
  "./avatar/Z3.png",
  "./avatar/Z4.png",
  "./avatar/Z5.png",
  "./avatar/Z6.png",
  "./avatar/Z7.png",
  "./avatar/Z8.png",
  "./avatar/Z9.png",
  "./avatar/Z10.png",
  "./avatar/Z11.png",
  "./avatar/Z12.png",
  "./avatar/Z13.png",
  "./avatar/Z14.png",
  "./avatar/Z15.png",
  "./avatar/Z16.png",
  "./avatar/Z17.png",
  "./avatar/Z18.png",
  "./avatar/Z19.png",
  "./avatar/Z21.png",
  "./avatar/Z22.png",
  "./avatar/Z23.png",
  "./avatar/Z24.png",
  "./avatar/Z25.png",
  "./avatar/Z26.png",
  "./avatar/Z27.png",
  "./avatar/Z28.png",
  "./avatar/Z29.png",
  "./avatar/Z30.png",
  "./avatar/Z31.png",
  "./avatar/Z32.png",
  "./avatar/Z33.png",
  "./avatar/Z34.png",
  "./avatar/Z35.png",
  "./avatar/Z36.png",
  "./avatar/Z37.png",
  "./avatar/Z38.png",
  "./avatar/Z39.png",
  "./avatar/Z40.png",
  "./avatar/Z21-a.png",
  "./avatar/Z22-a.png",

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
