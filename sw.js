/* Service worker de ¿Qué pueblo es?
   Guarda la app y los datos para que funcione sin conexión después de la primera visita.

   Estrategia:
   - Código (html, js, css): red primero. Así una versión nueva llega siempre,
     aunque el móvil tenga una copia vieja en caché.
   - Datos pesados (pueblos.js, picos.js) e iconos: caché primero. Son unos 5 MB
     que no se descargan en cada arranque y así la app abre al instante y sin conexión.
   Si cambias archivos, sube el número de VERSION para invalidar la caché. */
const VERSION = 'v17';
const CACHE = 'que-pueblo-' + VERSION;

const CORE = [
    './',
    './index.html',
    './manifest.json',
    './styles/base.css?v=17',
    './styles/portada.css?v=17',
    './styles/layout.css?v=17',
    './styles/camera.css?v=17',
    './scripts/app.js?v=17',
    './data/pueblos.js',
    './data/picos.js',
    './icons/icon-180.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png'
];

// Recursos pesados: se sirven de la caché (rápido y sin conexión)
function esPesado(url) {
    return /\/data\//.test(url.pathname) ||
        /\.(png|jpe?g|svg|ico|webmanifest|woff2?)$/i.test(url.pathname);
}

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        // addAll falla entero si un recurso no está; los guardamos uno a uno.
        await Promise.all(CORE.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        ));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // APIs externas: siempre a la red

    // Navegación: red primero, y si no hay conexión, la copia guardada.
    if (req.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const res = await fetch(req);
                const cache = await caches.open(CACHE);
                cache.put('./index.html', res.clone()).catch(() => {});
                return res;
            } catch (e) {
                return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
            }
        })());
        return;
    }

    // Datos pesados e iconos: caché primero y actualización en segundo plano.
    if (esPesado(url)) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE);
            const guardado = await cache.match(req);
            const red = fetch(req).then((res) => {
                if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
                return res;
            }).catch(() => null);
            return guardado || (await red) || Response.error();
        })());
        return;
    }

    // Código (js, css, json): red primero para que una versión nueva llegue siempre.
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        try {
            const res = await fetch(req);
            if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
            return res;
        } catch (e) {
            const guardado = await cache.match(req);
            if (guardado) return guardado;
            throw e;
        }
    })());
});
