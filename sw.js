// Service worker de Facturación: deja instalar la app y abrirla sin cobertura.
// La página y sus archivos: primero la red (así siempre llega la última versión) y, sin conexión, la copia guardada.
// Las tipografías y la librería de PDF (cdnjs): de la copia guardada, que se refresca por detrás.
// Supabase y WhatsApp no se tocan: van siempre a la red.
// Al actualizarse solo borra sus cachés (facturas-*): en la misma web hay otras apps con las suyas.
const CACHE = 'facturas-v2';
const APP = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const LIBS = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP)).catch(() => null).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('facturas-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); } return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  if (LIBS.test(req.url)) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const guardada = await c.match(req);
      const red = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => guardada);
      return guardada || red;
    }));
  }
});
