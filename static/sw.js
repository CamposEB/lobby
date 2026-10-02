const C = "lobby-v12";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names
    .filter(name => name.startsWith("lobby-") && name !== C)
    .map(name => caches.delete(name)));
  await clients.claim();
})()));
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(C).then(x => x.put(r, c)); return res; })
    .catch(() => caches.match(r)));
});