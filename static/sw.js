// /static/sw.js
// Service worker do Society MLBB.
//
// Estratégia:
//   - Navegação (HTML) ........... network-first, cai pro cache se offline
//   - /static/js, /static/css ... network-first (código muda sem mudar URL!)
//   - outros /static/* .......... cache-first com revalidação em background
//   - /api/*, /ws, externos ..... nunca intercepta
//   - Não-GET ................... nunca intercepta
//
// REGRA DE OURO: TODO caminho do respondWith precisa devolver um Response.
// Devolver undefined dispara "Failed to convert value to 'Response'".
const C = "lobby-v14";                 // bump a versão quando mudar a estratégia
const OFFLINE_HTML = new Response(
  '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
  '<body style="font-family:system-ui;background:#0d0d10;color:#e8e8ec;' +
  'display:grid;place-items:center;min-height:100vh;margin:0;text-align:center">' +
  '<div><h1>Sem conexão</h1><p>Verifique sua internet e tente novamente.</p></div></body>',
  { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
);

// ─── install ────────────────────────────────────────────────
self.addEventListener("install", (event) => {
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
      console.warn("[sw] falha limpando caches antigos:", err);
    }
    try {
      await self.clients.claim();
    } catch {}
  })());
});

// ─── helpers ────────────────────────────────────────────────
function isCodeAsset(pathname) {
  // JS/CSS mudam sem mudar URL → precisam ser network-first
  return pathname.startsWith("/static/js/") ||
         pathname.startsWith("/static/css/") ||
         pathname.endsWith(".js") ||
         pathname.endsWith(".mjs") ||
         pathname.endsWith(".css");
}

async function putInCache(req, res) {
  try {
    if (res && res.ok) {
      const cache = await caches.open(C);
      await cache.put(req, res.clone());
    }
  } catch {}
}

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
    return;
  }

  // ─── Navegação (HTML) → network-first, cache como fallback ───
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          putInCache(req, fresh);
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || OFFLINE_HTML;
        }
      })()
    );
    return;
  }

  // ─── JS / CSS → NETWORK-FIRST (sempre pega a versão nova) ────
  if (url.pathname.startsWith("/static/") && isCodeAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: "no-cache" });
          putInCache(req, fresh);
          return fresh;
        } catch {
          // offline: cai pro cache (última versão que funcionou)
          const cached = await caches.match(req);
          if (cached) return cached;
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

  // ─── Outros assets (/static/img, fonts, ícones) → cache-first ─
  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) {
          fetch(req).then((res) => putInCache(req, res)).catch(() => {});
          return cached;
        }
        try {
          const fresh = await fetch(req);
          putInCache(req, fresh);
          return fresh;
        } catch {
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
});