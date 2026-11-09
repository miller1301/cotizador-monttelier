/*
 * Service worker: keeps the app working offline once it was opened online.
 *
 * Strategy: serve from the cache first and refresh the cache in the background
 * (stale-while-revalidate), so a published update shows up on the next visit.
 * Change CACHE_VERSION when files are added or removed from APP_FILES.
 */
var CACHE_VERSION = "monttelier-cotizador-v1";

var APP_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./css/print.css",
  "./js/default-config.js",
  "./js/format.js",
  "./js/pricing.js",
  "./js/storage.js",
  "./js/dom.js",
  "./js/calculator.js",
  "./js/quote.js",
  "./js/admin.js",
  "./js/app.js",
  "./assets/logo-monttelier.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_FILES);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key !== CACHE_VERSION;
      }).map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  var refresh = fetch(request).then(function (response) {
    if (!response || !response.ok || response.type !== "basic") return response;
    var copy = response.clone();
    return caches.open(CACHE_VERSION).then(function (cache) {
      return cache.put(request, copy);
    }).then(function () {
      return response;
    });
  });

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return refresh.catch(function () {
        return request.mode === "navigate" ? caches.match("./index.html") : Response.error();
      });
    })
  );
  event.waitUntil(refresh.catch(function () {}));
});
