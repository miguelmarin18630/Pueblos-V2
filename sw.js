/* Service worker de Â¿QuÃ© pueblo es?
   Guarda la app y los datos para que funcione sin conexiÃ³n despuÃ©s de la primera visita.

   Dos cachÃ©s:
   - CACHE_CODIGO: html, js, css. Se borra en cada versiÃ³n, pero se sirve "red primero",
     asÃ­ que una versiÃ³n nueva llega siempre aunque el mÃ³vil tenga una copia vieja.
   - CACHE_DATOS: los archivos pesados (pueblos.js, picos.js) y los iconos. NO se borra
     nunca: al cambiar de versiÃ³n no hay que volver a bajar los 5 MB de datos.

   Si cambias archivos del motor, sube VERSION (y el ?v=... del index.html). */
const VERSION = 'v21';
const CACHE_CODIGO = 'que-pueblo-cod-' + VERSION;
const CACHE_DATOS = 'que-pueblo-datos';   // permanente

const CODIGO = [
    './',
    './index.html',
    './manifest.json',
    './styles/base.css?v=21',
    './styles/portada.css?v=21',
    './styles/layout.css?v=21',
    './styles/camera.css?v=21',
    './scripts/app.js?v=21'
];

const DATOS = [
    './data/pueblos.js',
    './data/picos.js',
    './icons/icon-180.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png'
];

// Recursos pesados: se sirven de la cachÃ© (rÃ¡pido y sin conexiÃ³n)
function esPesado(url) {
    return /\/data\//.test(url.pathname) ||
        /\.(png|jpe?g|svg|ico|webmanifest|woff2?)$/i.test(url.pathname);
}

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_CODIGO);
        // addAll falla entero si un recurso no estÃ¡; los guardamos uno a uno.
        await Promise.all(CODIGO.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        ));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        const datos = await caches.open(CACHE_DATOS);
        // Se aprovechan los datos que ya estaban guardados en versiones anteriores
        for (const k of keys) {
            if (k === CACHE_DATOS) continue;
            const vieja = await caches.open(k);
            for (const url of DATOS) {
                if (await datos.match(url)) continue;
                const r = await vieja.match(url);
                if (r) await datos.put(url, r).catch(() => {});
            }
        }
        // Se borran las cachÃ©s antiguas de cÃ³digo; la de datos se conserva
        await Promise.all(keys
            .filter((k) => k !== CACHE_DATOS && k !== CACHE_CODIGO)
            .map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

// Los datos pesados se descargan una vez y se quedan en el mÃ³vil
function guardarDatos() {
    return caches.open(CACHE_DATOS).then(async (cache) => {
        for (const url of DATOS) {
            const ya = await cache.match(url);
            if (ya) continue;
            try {
                const res = await fetch(url, { cache: 'reload' });
                if (res && res.ok) await cache.put(url, res);
            } catch (e) { /* sin conexiÃ³n: se descargarÃ¡ luego */ }
        }
    });
}
self.addEventListener('message', (event) => {
    if (event.data === 'guardar-datos') event.waitUntil(guardarDatos());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // APIs externas: siempre a la red

    // NavegaciÃ³n: red primero, y si no hay conexiÃ³n, la copia guardada.
    if (req.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const res = await fetch(req);
                const cache = await caches.open(CACHE_CODIGO);
                cache.put('./index.html', res.clone()).catch(() => {});
                return res;
            } catch (e) {
                return (await caches.match('./index.html')) ||
                       (await caches.match('./')) || Response.error();
            }
        })());
        return;
    }

    // Datos pesados e iconos: cachÃ© primero y actualizaciÃ³n en segundo plano.
    if (esPesado(url)) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_DATOS);
            const guardado = await cache.match(req);
            const red = fetch(req).then((res) => {
                if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
                return res;
            }).catch(() => null);
            return guardado || (await red) || Response.error();
        })());
        return;
    }

    // CÃ³digo (js, css, json): red primero para que una versiÃ³n nueva llegue siempre.
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_CODIGO);
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
