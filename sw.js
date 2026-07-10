const CACHE_NAME = "murder-darts-v43";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=43",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/icon-maskable.svg",
  "./assets/splash-dartboard-cape.webp?v=43",
  "./assets/lex/camera-180.svg?v=43",
  "./assets/lex/darts-great.svg?v=43",
  "./assets/lex/hundred-caller.svg?v=43",
  "./assets/lex/irish-33.svg?v=43",
  "./assets/lex/lounge-legend.svg?v=43",
  "./assets/lex/lounge-ecstatic.svg?v=43",
  "./assets/lex/lounge-sad.svg?v=43",
  "./assets/lex/lex-corp-activation.svg?v=43",
  "./assets/lex/puppet-crisis.svg?v=43",
  "./assets/lex/wicked-bass.svg?v=43",
  "./src/app.js?v=43",
  "./src/rules.js?v=43",
  "./src/x01-rules.js?v=43"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
      )
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then((clients) => Promise.all(clients.map((client) => client.navigate(client.url).catch(() => null))))
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  if (isNavigationRequest(event.request)) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});

function isNavigationRequest(request) {
  return request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
}

