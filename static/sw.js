// /static/sw.js
// Service worker do Society MLBB.
//
// Estratégia:
//   - Navegação (HTML) ........ network-first, cai pro cache se offline
//   - /static/* (assets) ...... cache-first com revalidação em background
//   - /api/*, /ws, externos ... nunca intercepta (passa direto)
//   - Não-GET ................. nunca intercepta
//
// REGRA DE OURO: TODO caminho do respondWith precisa devolver um Response.
// Devolver undefined dispara "Failed to convert value to 'Response'".
const C = "lobby-v13";                 // bump a versão quando mudar a estratégia
const OFFLINE_HTML = new Response(
  '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
  '<body style="font-family:system-ui;background:#0d0d10;color:#e8e8ec;' +
  'display:grid;place-items:center;min-height:100vh;margin:0;text-align:center">' +
  '<div><h1>Sem conexão</h1><p>Verifique sua internet e tente novamente.</p></div></body>',
  { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
);

// ─── install ────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  // Não pré-cacheia nada específico — deixa o cache on-demand.
  // Se quiser pré-cachear CSS crítico, adicione aqui:
  //   event.waitUntil(caches.open(C).then(c => c.addAll(["/static/css/tokens.css"])));
  self.skipWaiting();
});

// ─── activate ───────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("lobby-") && name !== C)
          .map((name) => caches.delete(name))
      );
    } catch (err) {
      // se falhar limpar cache antigo, não trava o activate
      console.warn("[sw] falha limpando caches antigos:", err);
    }
    try {
      await self.clients.claim();
    } catch {}
  })());
});

// ─── fetch ──────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Só mexe em GET
  if (req.method !== "GET") return;

  // Só same-origin
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Não intercepta API, WebSocket nem endpoints especiais
  if (url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/ws") ||
      url.pathname.startsWith("/static/data/official/")) {
    // Dados de heróis mudam por patch — sempre rede, nunca cache do SW
    // (o browser ainda pode cachear via Cache-Control do FastAPI).
    return;
  }

  // ─── Navegação (HTML) → network-first, cache como fallback ───
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          // Guarda uma cópia pra modo offline
          if (fresh && fresh.ok) {
            const clone = fresh.clone();
            caches.open(C).then((cache) => cache.put(req, clone)).catch(() => {});
          }
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || OFFLINE_HTML;
        }
      })()
    );
    return;
  }

  // ─── Assets (/static/*) → cache-first com revalidação ───────
  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) {
          // Revalida em background (stale-while-revalidate)
          fetch(req).then((res) => {
            if (res && res.ok) {
              const clone = res.clone();
              caches.open(C).then((cache) => cache.put(req, clone)).catch(() => {});
            }
          }).catch(() => {});
          return cached;
        }
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            const clone = fresh.clone();
            caches.open(C).then((cache) => cache.put(req, clone)).catch(() => {});
          }
          return fresh;
        } catch {
          // Sem cache, sem rede → 503 seguro (nunca undefined)
          return new Response("", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "text/plain" },
          });
        }
      })()
    );
    return;
  }

  // Qualquer outro caminho same-origin: deixa o browser lidar (não chama respondWith)
});