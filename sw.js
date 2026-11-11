/* Service worker de ¿Qué pueblo es?
   Guarda la app y los datos para que funcione sin conexión después de la primera visita.
   Si cambias archivos, sube el número de VERSION para invalidar la caché. */
const VERSION = 'v16';
const CACHE = 'que-pueblo-' + VERSION;

const CORE = [
    './',
    './index.html',
    './manifest.json',
    './styles/base.css?v=16',
    './styles/portada.css?v=16',
    './styles/layout.css?v=16',
    './styles/camera.css?v=16',
    './scripts/app.js?v=16',
    './data/pueblos.js',
    './data/picos.js',
    './icons/icon-180.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png'
];

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
                return await fetch(req);
            } catch (e) {
                return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
            }
        })());
        return;
    }

    // Resto: caché primero y actualización en segundo plano.
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const guardado = await cache.match(req);
        const red = fetch(req).then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
        }).catch(() => null);
        return guardado || (await red) || Response.error();
    })());
});
