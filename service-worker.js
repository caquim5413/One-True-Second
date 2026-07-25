const CACHE_NAME = "one-true-second-v1";

// Solo guardamos en caché el "esqueleto" de la app (HTML, CSS, JS, iconos).
// Las fotos y textos siguen viviendo en Google Drive, no aquí.
const APP_SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./google.js",
    "./drive.js",
    "./manifest.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {

    event.waitUntil(

        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(APP_SHELL);
        })

    );

    self.skipWaiting();

});

self.addEventListener("activate", (event) => {

    event.waitUntil(

        caches.keys().then((names) => {

            return Promise.all(

                names
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))

            );

        })

    );

    self.clients.claim();

});

// Estrategia sencilla: intenta ir a la red primero (para no servir
// datos viejos de Drive), y si no hay conexión, usa la caché del
// esqueleto de la app.
self.addEventListener("fetch", (event) => {

    if (event.request.method !== "GET") return;

    event.respondWith(

        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })

    );

});
