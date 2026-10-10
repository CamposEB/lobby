// /static/js/hero-catalog.js
// Catálogo de heróis (global). Carregue ANTES de app.js, hero-hub.js, hero-tabs.js.
// Expõe: window.HERO_CATALOG  [{id, name, file, roles[], slug}]
//        window.HeroCatalog   helpers (find, imageUrl, roleLabel, norm, all, ROLES)
//        window.MLBB_HERO_BASE
//        evento "hero-catalog-ready"
//
// Fonte primária: /static/data/official/index.json (nosso export)
// Fallback: GitHub raw do catálogo antigo (compatibilidade)
//
// Imagens: URLs absolutas do CDN da Moonton (akmweb.youngjoygame.com)
// passam pelo proxy /api/img para driblar hotlink protection. URLs locais
// (começando com "/") são retornadas como estão.
(function () {
  'use strict';

  var FONTES = [
    '/static/data/official/index.json',
    'https://raw.githubusercontent.com/Ceplin03/database-mlbb.Mobile-Legends-Bang-Bang/master/hero.json'
  ];

  window.HERO_CATALOG = window.HERO_CATALOG || [];
  window.MLBB_HERO_BASE = window.MLBB_HERO_BASE || '/static/img/icons/herois/';

  // Hosts externos que passam pelo proxy /api/img (deve espelhar o whitelist do server.py)
  var CDN_HOSTS = /(?:^|\/\/)(akmweb\.youngjoygame\.com|esportpedia\.b-cdn\.net|static\.wikia\.nocookie\.net|cdn\.mobilelegends\.com)\//i;

  var ROLE_LABELS = {
    fighter: 'Lutador', mage: 'Mago', marksman: 'Atirador',
    assassin: 'Assassino', tank: 'Tanque', support: 'Suporte'
  };

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  /**
   * Roteia uma URL de imagem:
   *   - "/static/..." ou "/api/..."  → retorna como está (já é local)
   *   - "https://cdn/..."            → roteia pelo /api/img (evita 500 do CDN)
   *   - "//cdn/..."                  → normaliza pra https e roteia
   *   - "arquivo.png"                → prepende MLBB_HERO_BASE
   *   - vazio                        → ''
   */
  function routeImg(url) {
    if (!url) return '';
    var f = String(url).trim();
    if (!f) return '';

    // Já é path local
    if (f.charAt(0) === '/') return f;

    // Protocol-relative (//host/path) → vira https://host/path
    if (f.indexOf('//') === 0) f = 'https:' + f;

    // URL absoluta
    if (/^https?:\/\//i.test(f)) {
      // Se for CDN conhecido, roteia pelo proxy
      if (CDN_HOSTS.test(f)) {
        return '/api/img?url=' + encodeURIComponent(f);
      }
      // Outras URLs externas — deixa o browser buscar direto
      return f;
    }

    // Nome de arquivo relativo → prepende a base local (legado)
    return window.MLBB_HERO_BASE + f;
  }

  window.HeroCatalog = {
    ROLES: Object.keys(ROLE_LABELS),
    norm: norm,
    all: function () { return window.HERO_CATALOG; },
    roleLabel: function (role) { return ROLE_LABELS[role] || role; },
    find: function (name) {
      var n = norm(name);
      if (!n) return null;
      var list = window.HERO_CATALOG;
      for (var i = 0; i < list.length; i++) if (norm(list[i].name) === n) return list[i];
      return null;
    },
    imageUrl: function (hero) {
      if (!hero || !hero.file) return '';
      return routeImg(hero.file);
    },
    // Expõe o roteador pra quem quiser usar direto
    routeImg: routeImg
  };

  function normalizarIndex(d) {
    var lista = (d && d.heroes) || [];
    return lista.map(function (h) {
      return {
        id:    h.hero_id || 0,
        name:  h.name || '',
        // Prioridade: square (menor) → head → wallpaper
        file:  h.square || h.head || h.wallpaper || '',
        roles: Array.isArray(h.roles)
          ? h.roles.map(String).map(function (r) { return r.toLowerCase(); })
          : [],
        slug:  h.slug || '',
        wallpaper: h.wallpaper || h.head || ''
      };
    }).filter(function (h) { return h.name; });
  }

  function normalizarGithub(d) {
    var lista = Array.isArray(d) ? d : [];
    return lista.map(function (hero) {
      return {
        id:    hero.id_hero || 0,
        name:  hero.name_hero || hero['name-hero'] || '',
        file:  hero['images-hero'] || hero.images_hero || '',
        roles: Array.isArray(hero.role) ? hero.role.map(String) : [],
        slug:  ''
      };
    }).filter(function (hero) { return hero.name && hero.file; });
  }

  function tentarFonte(url) {
    return fetch(url, { cache: 'force-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        if (data && Array.isArray(data.heroes)) return normalizarIndex(data);
        if (Array.isArray(data))                 return normalizarGithub(data);
        throw new Error('formato desconhecido');
      });
  }

  function load() {
    var i = 0;
    function proxima() {
      if (i >= FONTES.length) {
        console.warn('[hero-catalog] nenhuma fonte disponível');
        window.HERO_CATALOG = [];
        return Promise.resolve();
      }
      var url = FONTES[i++];
      return tentarFonte(url).then(function (lista) {
        if (!lista.length) throw new Error('lista vazia');
        window.HERO_CATALOG = lista;
        console.log('[hero-catalog] carregado de ' + url + ' — ' + lista.length + ' heróis');
      }).catch(function (err) {
        console.warn('[hero-catalog] falhou ' + url + ': ' + err.message);
        return proxima();
      });
    }
    return proxima().then(function () {
      window.dispatchEvent(new CustomEvent('hero-catalog-ready'));
    });
  }

  window.HERO_CATALOG_READY = load();
})();