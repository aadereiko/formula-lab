/**
 * The service worker: what makes the app open without a network.
 *
 * Hand-written rather than generated. A generator would precache `dist/**`,
 * which here means all three copies of every KaTeX font -- 19 `.woff2`, 20
 * `.woff`, 20 `.ttf` -- when a browser reads exactly one format. That is 540 KB
 * of a mobile user's data spent on files that will never be opened.
 *
 * Three policies, because the three kinds of request want different things:
 *
 *   1. Hashed build assets -> cache first, forever. The filename contains the
 *      content hash, so a cached copy can never be stale; a new build asks for
 *      a new name.
 *   2. The catalogue endpoints -> network first, falling back to cache. They
 *      change only when the server is redeployed, and they are what makes the
 *      library and constants readable offline.
 *   3. Everything else -> network only. Emphatically including anything
 *      authenticated: a cached `/api/auth/me` or `/api/formulas` could show one
 *      account another's data, which is worse than any offline gap.
 */

// Bump on release. The name is the whole cache-invalidation strategy: a new
// version writes a new cache and the activate step deletes every older one, so
// nobody can be left pinned to a previous build's assets.
const VERSION = "formula-lab-v1.2.0";

/** The shell: enough to render the app with no network at all. */
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg", "/icon-192.png"];

/** Static, versioned with the server, and small: 14 KB, 2 KB, 2 KB. */
const CATALOGUE = ["/api/library", "/api/constants", "/api/capabilities"];

/** Never cached, at any cost. */
const PRIVATE = ["/api/auth", "/api/formulas", "/api/my-constants", "/api/categories", "/api/pinned-library"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // Individually, so one 404 cannot fail the whole install.
      await Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== VERSION).map((name) => caches.delete(name)));
      // Take over open tabs now rather than on their next navigation, so a
      // deploy does not leave one tab on old assets and another on new.
      await self.clients.claim();
    })(),
  );
});

const isHashedAsset = (url) => url.pathname.startsWith("/assets/");
const isCatalogue = (url) => CATALOGUE.includes(url.pathname);
const isPrivate = (url) => PRIVATE.some((prefix) => url.pathname.startsWith(prefix));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // A POST is a computation or a write; neither is cacheable, and /api/evaluate
  // in particular must reach the server or fail so the app can fall back to its
  // own engine.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivate(url)) return;

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (isCatalogue(url)) {
    event.respondWith(networkFirst(request));
    return;
  }
  // A navigation offline still has to produce the app, or there is nothing to
  // be offline *in*.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(new Request("/index.html", { credentials: "same-origin" })));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw new Error("offline and nothing cached");
  }
}
