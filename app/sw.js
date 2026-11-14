/* The service worker: keeps the view and every exercise on this device, so the app opens and works offline.
 *
 * The view, the engine and the exercises: network first (an edited exercise shows on the next reload), but a
 * copy from the cache when the network is gone or slower than NET_WAIT. Fonts and the speech files never
 * change: cache first. The view asks for every exercise to be cached with a {cacheAll: [urls]} message.
 * Its scope is /app/, and it also answers the fetches of /data/ made by the pages it controls. */
const CACHE = "english-recall";
const NET_WAIT = 3000;
const SHELL = [
  "./", "index.html", "drill.html", "hands.js", "hands.css", "frame.css", "manifest.webmanifest",
  "fonts/fonts.css", "fonts/NotoSans-latin-2.woff2", "fonts/NotoSans-latin-ext-1.woff2",
  "fonts/SourceSerif4-latin-2.woff2", "fonts/SourceSerif4-latin-ext-1.woff2", "fonts/Vazirmatn-arabic-1.woff2",
  "fonts/Vazirmatn-latin-2.woff2", "fonts/Vazirmatn-latin-ext-1.woff2",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png",
  "../data/index.json",
];
const FOREVER = /\/app\/(fonts|vendor|icons)\//;     // these files never change

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// drill.html?d=… is one page for every exercise: cache it once, without the query
const key = (url) => (url.pathname.endsWith("/drill.html") ? url.origin + url.pathname : url.href);

async function put(k, res) {
  if (res.ok && res.type === "basic") await (await caches.open(CACHE)).put(k, res.clone());
  return res;
}

async function networkFirst(req, k) {
  const net = fetch(req).then((res) => put(k, res));
  const late = new Promise((res) => setTimeout(res, NET_WAIT));
  const hit = await Promise.race([net.then((r) => r, () => null), late.then(() => null)]);
  if (hit) return hit;
  const cached = await caches.match(k);
  return cached || net;                // nothing cached: wait for the network after all (or its error)
}

async function cacheFirst(req, k) {
  return (await caches.match(k)) || fetch(req).then((res) => put(k, res));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;   // AnkiConnect, anything not ours
  if (!url.pathname.startsWith("/app/") && !url.pathname.startsWith("/data/")) return;
  if (req.headers.has("range")) return;                                  // let the browser handle partial requests
  const k = key(url);
  e.respondWith(FOREVER.test(url.pathname) ? cacheFirst(req, k) : networkFirst(req, k));
});

// {cacheAll: [urls]} from the view: fetch every exercise not yet cached, a few at a time, and report back
self.addEventListener("message", (e) => {
  const urls = e.data?.cacheAll;
  if (!Array.isArray(urls)) return;
  e.waitUntil(cacheAll(urls, e.source));
});

async function cacheAll(urls, client) {
  const cache = await caches.open(CACHE);
  let i = 0, done = 0, failed = 0;
  async function lane() {
    while (i < urls.length) {
      const u = new URL(urls[i++], self.registration.scope).href;
      try {
        if (!(await cache.match(u))) {
          const res = await fetch(u);
          if (!res.ok) throw new Error(res.status);
          await cache.put(u, res);
        }
        done++;
      } catch { failed++; }
    }
  }
  await Promise.all(Array.from({ length: 6 }, lane));
  client?.postMessage({ cached: done, failed, total: urls.length });
}
