/* Driver — service worker aplikacji kierowcy (M4.2).
   Strony /driver: najpierw sieć, bez zasięgu — ostatnia zapisana wersja.
   Pliki aplikacji (_next/static, czcionki, ikony): z pamięci telefonu.
   API (/api/...) nigdy z pamięci — kolejka zdarzeń żyje w IndexedDB. */
const VERSION = "v1";
const PAGES = `driver-pages-${VERSION}`;
const ASSETS = `driver-assets-${VERSION}`;
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (![PAGES, ASSETS].includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

function isAsset(url) {
  return url.pathname.startsWith("/_next/static/") || /\.(?:woff2?|ttf|png|svg|ico|webmanifest)$/.test(url.pathname);
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS)),
    ]);
    if (res.ok && !res.redirected && res.type === "basic") cache.put(request, res.clone());
    return res;
  } catch {
    const hit = (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
    if (hit) return hit;
    if (request.mode === "navigate") {
      const home = await cache.match("/driver");
      if (home) return home;
    }
    return new Response("Brak połączenia — otwórz trasę, gdy będzie zasięg.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (isAsset(url)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.pathname === "/driver" || url.pathname.startsWith("/driver/")) {
    if (url.pathname.startsWith("/driver/login") || url.pathname.startsWith("/driver/terminal")) return;
    event.respondWith(networkFirst(req));
  }
});
