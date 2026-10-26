/* Service worker Klip. Berkas ini dibuat saat build (lihat vite.config.ts); daftar precache dan versinya diisi otomatis.
 * Hanya aset aplikasi dari origin sendiri yang disimpan. Media pengguna dibaca lewat blob: URL dan tidak
 * pernah melewati service worker, jadi tidak ikut tersimpan. */
const CACHE = 'klip-__VERSION__';
const PRECACHE = __PRECACHE__;
// Skrip modul dan font diminta dengan header Origin; abaikan Vary agar salinan tersimpan tetap cocok.
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('klip-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Halaman: coba jaringan dulu agar versi baru langsung terpakai; tanpa internet pakai salinan tersimpan.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE);
        const page = url.pathname.startsWith('/ui') ? '/ui/index.html' : '/index.html';
        return (await cache.match(page, MATCH)) ?? (await cache.match('/index.html', MATCH)) ?? Response.error();
      }),
    );
    return;
  }

  // Aset: berkas ber-hash tidak pernah berubah, jadi ambil dari cache dulu.
  event.respondWith(
    caches.match(request, MATCH).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
