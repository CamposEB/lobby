// /static/js/hero-official.js
// Camada de DADOS OFICIAIS dos heróis (export_official.py / export_skins.py).
// NÃO monta nada por conta própria — hero-hub.js e hero-tabs.js chamam as
// funções renderXxx e inserem os Nodes onde fizer sentido.
//
// Imagens: URLs do CDN da Moonton passam pelo proxy /api/img (evita 500
// por hotlink protection). O proxy adiciona Referer + User-Agent corretos.
//
// Navegação: cards de herói (counters) usam SocietyHero.open() em vez de
// hash routing (#/heroi/...), que não existe no app.js.
//
// Uso:
//   HeroOfficial.loadHeroByName('Akai').then(function (d) { ... });
//   HeroOfficial.renderSkills(d);  // retorna HTMLElement
//
// API:
//   loadIndex([force])           → Promise<index>
//   loadHero(slug, [force])      → Promise<hero>
//   loadHeroByName(name)         → Promise<hero>
//   getIndexSync()               → cache | null
//   getHeroSync(nameOrSlug)      → cache | null
//
//   renderHeader(d)              → HTMLElement
//   renderStats(d)               → HTMLElement
//   renderSkills(d)              → HTMLElement | null
//   renderCounters(d)            → HTMLElement | null
//   renderLore(d)                → HTMLElement | null
//   renderSkins(d)               → HTMLElement | null
//   renderSections(d)            → DocumentFragment
(function () {
  'use strict';

  var BASE = '/static/data/official/';
  var indexCache = null;
  var heroCache = new Map();   // slug → d
  var slugByName = null;       // nameLower → slug

  // Hosts do CDN da Moonton que passam pelo proxy /api/img
  var CDN_HOSTS = /akmweb\.youngjoygame\.com|esportpedia\.b-cdn\.net|static\.wikia\.nocookie\.net|cdn\.mobilelegends\.com/i;

  // ─── fetch ───
  function fetchJson(url) {
    return fetch(url, { cache: 'force-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + url);
      return r.json();
    });
  }

  function loadIndex(force) {
    if (indexCache && !force) return Promise.resolve(indexCache);
    return fetchJson(BASE + 'index.json').then(function (d) {
      indexCache = d;
      slugByName = {};
      (d.heroes || []).forEach(function (h) {
        if (h.name) slugByName[h.name.toLowerCase().trim()] = h.slug;
      });
      return d;
    });
  }

  function loadHero(slug, force) {
    if (!force && heroCache.has(slug)) return Promise.resolve(heroCache.get(slug));
    return fetchJson(BASE + slug + '.json').then(function (d) {
      heroCache.set(slug, d);
      return d;
    });
  }

  function loadHeroByName(name) {
    if (!name) return Promise.reject(new Error('nome vazio'));
    var key = name.toLowerCase().trim();
    if (slugByName && slugByName[key]) {
      return loadHero(slugByName[key]);
    }
    return loadIndex().then(function () {
      var slug = slugByName && slugByName[key];
      if (!slug) throw new Error('herói não encontrado no índice: ' + name);
      return loadHero(slug);
    });
  }

  function getIndexSync() { return indexCache; }
  function getHeroSync(nameOrSlug) {
    if (!nameOrSlug) return null;
    if (heroCache.has(nameOrSlug)) return heroCache.get(nameOrSlug);
    var key = String(nameOrSlug).toLowerCase().trim();
    if (slugByName && slugByName[key]) return heroCache.get(slugByName[key]) || null;
    return null;
  }

  // ─── helpers de DOM ───
  function el(tag, text, cls) {
    var e = document.createElement(tag);
    if (text != null) e.textContent = String(text);
    if (cls) e.className = cls;
    return e;
  }

  /**
   * Roteia uma URL de imagem:
   *   - "/static/..." ou "/api/..." → retorna como está
   *   - "https://cdn/..."           → roteia pelo /api/img (evita 500 do CDN)
   *   - "//cdn/..."                 → normaliza pra https e roteia
   *   - ""                          → ''
   */
  function cdnUrl(url) {
    if (!url) return '';
    var f = String(url).trim();
    if (!f) return '';

    if (f.charAt(0) === '/') return f;

    if (f.indexOf('//') === 0) f = 'https:' + f;

    if (/^https?:\/\//i.test(f)) {
      if (CDN_HOSTS.test(f)) {
        return '/api/img?url=' + encodeURIComponent(f);
      }
      return f;
    }
    return f;
  }

  // Toda <img> passa por aqui — referrerPolicy + cdnUrl num lugar só.
  function img(src, alt, cls) {
    var i = document.createElement('img');
    i.referrerPolicy = 'no-referrer';
    i.loading = 'lazy';
    i.decoding = 'async';
    if (src) i.src = cdnUrl(src);
    if (alt != null) i.alt = alt;
    if (cls) i.className = cls;
    return i;
  }

  function slugify(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /**
   * Abre a página de um herói usando a API do app/hub.
   * Prefere `SocietyHero.open` (registrada pelo hero-hub.js), com fallback
   * pra `Society.openHero` (bridge no app.js). Não usa hash routing.
   */
  function abrirHeroi(nome, buildId, tabId) {
    if (!nome) return;
    var fn = null;
    if (window.SocietyHero && typeof window.SocietyHero.open === 'function') {
      fn = window.SocietyHero.open;
    } else if (window.Society && typeof window.Society.openHero === 'function') {
      fn = window.Society.openHero;
    }
    if (fn) {
      try { fn(nome, buildId || null, tabId || 'overview'); } catch (e) {
        console.error('[hero-official] falha ao abrir herói:', e);
      }
    } else {
      console.warn('[hero-official] nenhum handler de herói disponível para:', nome);
    }
  }

  // Cria um <a> acessível que chama abrirHeroi ao clique/Enter/Espaço.
  function linkHeroi(nome, cls) {
    var a = document.createElement('a');
    a.className = cls || 'hh-hero-link';
    a.href = 'javascript:void(0)';
    a.setAttribute('role', 'button');
    a.setAttribute('tabindex', '0');
    if (nome) a.setAttribute('aria-label', 'Abrir ' + nome);

    function disparar(e) {
      if (e) e.preventDefault();
      abrirHeroi(nome);
    }
    a.addEventListener('click', disparar);
    a.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') disparar(e);
    });
    return a;
  }

  // ─── render header (banner) ───
  function renderHeader(d) {
    var hero = d.hero || {};
    var meta = d.meta || {};
    var stats = d.stats || {};

    var header = el('header', null, 'hh-hero-head');

    if (hero.wallpaper) {
      var bg = img(hero.wallpaper, '', 'hh-hero-bg');
      header.appendChild(bg);
    }

    var inner = el('div', null, 'hh-hero-head-inner');

    if (hero.head) {
      var avatar = img(hero.head, hero.name || '', 'hh-hero-avatar');
      inner.appendChild(avatar);
    }

    var info = el('div', null, 'hh-hero-info');
    info.appendChild(el('h2', hero.name || '?', 'hh-hero-name'));

    if (meta.roadsort && meta.roadsort.length) {
      info.appendChild(el('p', meta.roadsort.join(' · '), 'hh-hero-lanes'));
    }
    if (meta.sort && meta.sort.length) {
      info.appendChild(el('p', meta.sort.join(' · '), 'hh-hero-roles'));
    }

    var statsRow = el('div', null, 'hh-hero-stats');
    if (stats.win  != null) statsRow.appendChild(chipStat('WR',  stats.win.toFixed(1) + '%'));
    if (stats.pick != null) statsRow.appendChild(chipStat('Pick', stats.pick.toFixed(1) + '%'));
    if (stats.ban  != null) statsRow.appendChild(chipStat('Ban',  stats.ban.toFixed(1) + '%'));
    if (statsRow.children.length) info.appendChild(statsRow);

    inner.appendChild(info);
    header.appendChild(inner);
    return header;
  }

  function chipStat(label, value) {
    var c = el('span', null, 'hh-chip');
    c.appendChild(el('small', label));
    c.appendChild(el('b', value));
    return c;
  }

  // ─── render stats (só o chip row, sem banner) ───
  function renderStats(d) {
    var stats = d.stats || {};
    var box = el('div', null, 'ho-stats-block');

    var row = el('div', null, 'hh-hero-stats');
    if (stats.win  != null) row.appendChild(chipStat('WR',  stats.win.toFixed(1) + '%'));
    if (stats.pick != null) row.appendChild(chipStat('Pick', stats.pick.toFixed(1) + '%'));
    if (stats.ban  != null) row.appendChild(chipStat('Ban',  stats.ban.toFixed(1) + '%'));
    if (row.children.length) box.appendChild(row);

    var c = d.compat || {};
    if (c.best && c.best.length) {
      var b = el('div', null, 'ho-compat');
      b.appendChild(el('small', 'Melhores duos (pp)'));
      var rowBest = el('div', null, 'ho-compat-row');
      c.best.forEach(function (x) {
        var chip = el('span', null, 'ho-compat-chip');
        chip.appendChild(el('b', x.hero));
        chip.appendChild(el('span', (x.value >= 0 ? '+' : '') + x.value + 'pp'));
        rowBest.appendChild(chip);
      });
      b.appendChild(rowBest);
      box.appendChild(b);
    }

    if (c.worst && c.worst.length) {
      var w = el('div', null, 'ho-compat');
      w.appendChild(el('small', 'Piores duos (pp)'));
      var rowW = el('div', null, 'ho-compat-row');
      c.worst.forEach(function (x) {
        var chip = el('span', null, 'ho-compat-chip is-bad');
        chip.appendChild(el('b', x.hero));
        chip.appendChild(el('span', (x.value >= 0 ? '+' : '') + x.value + 'pp'));
        rowW.appendChild(chip);
      });
      w.appendChild(rowW);
      box.appendChild(w);
    }

    return box;
  }

  // ─── render skills ───
  function renderSkills(d) {
    if (!d.skills || !d.skills.length) return null;
    var grid = el('div', null, 'hh-skills');

    d.skills.forEach(function (s, i) {
      var card = el('article', null, 'hh-skill' + (s.is_passive ? ' is-passive' : ''));
      var head = el('div', null, 'hh-skill-head');

      if (s.icon) head.appendChild(img(s.icon, s.name || '', 'hh-skill-icon'));

      var titulo = el('div', null, 'hh-skill-title');
      titulo.appendChild(el('small', s.is_passive ? 'Passiva' : 'Skill ' + i));
      titulo.appendChild(el('b', s.name || '?'));
      head.appendChild(titulo);
      card.appendChild(head);

      var mm = el('div', null, 'hh-skill-meta');
      if (s.cd != null)   mm.appendChild(el('span', 'CD ' + s.cd + 's', 'hh-tag'));
      if (s.cost != null) mm.appendChild(el('span', 'Custo ' + s.cost, 'hh-tag'));
      (s.tags || []).forEach(function (t) {
        var tag = el('span', t.name, 'hh-tag hh-tag-color');
        if (t.rgb) tag.style.color = 'rgb(' + t.rgb + ')';
        mm.appendChild(tag);
      });
      if (mm.children.length) card.appendChild(mm);

      if (s.description) card.appendChild(el('p', s.description, 'hh-skill-desc'));

      grid.appendChild(card);
    });

    return grid;
  }

  // ─── render counters (com PP à direita + clique abre o herói) ───
  function renderCounters(d) {
    var c = d.counters || {};
    var temAlgo =
      (c.strong && c.strong.heroes && c.strong.heroes.length) ||
      (c.weak   && c.weak.heroes   && c.weak.heroes.length) ||
      (c.assist && c.assist.heroes && c.assist.heroes.length);
    if (!temAlgo) return null;

    var wrap = el('div', null, 'hh-counters');

    [['strong', 'Vantagem contra'],
     ['weak',   'Fraco contra'],
     ['assist', 'Bom com']].forEach(function (par) {
      var kind = par[0], titulo = par[1];
      var bloco = c[kind];
      if (!bloco || !(bloco.heroes || []).length) return;

      var card = el('article', null, 'hh-counter hh-counter-' + kind);
      card.appendChild(el('h4', titulo, 'hh-counter-title'));
      if (bloco.desc) card.appendChild(el('p', bloco.desc, 'hh-counter-desc'));

      var col = el('div', null, 'hh-counter-heroes');
      bloco.heroes.forEach(function (h) {
        var nome = h.name || ('#' + h.id);
        var a = linkHeroi(h.name || nome, 'hh-counter-hero');
        if (h.head) a.appendChild(img(h.head, nome, 'hh-counter-face'));
        a.appendChild(el('span', nome));
        if (h.value != null) {
          a.setAttribute('data-pp', (h.value >= 0 ? '+' : '') + h.value + 'pp');
        }
        col.appendChild(a);
      });

      card.appendChild(col);
      wrap.appendChild(card);
    });

    return wrap;
  }

  // ─── render lore (moldura dourada + capitular + CTA) ───
  function renderLore(d) {
    if (!d.lore || !(d.lore.short || d.lore.long)) return null;

    var frame = el('div', null, 'ho-lore-frame');

    frame.appendChild(el('span', null, 'ho-lore-corner-tl'));
    frame.appendChild(el('span', null, 'ho-lore-corner-tr'));

    var title = el('div', null, 'ho-lore-title');
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z');
    svg.appendChild(path);
    title.appendChild(svg);
    var heroName = (d.hero && d.hero.name) || '';
    title.appendChild(el('b', 'A Lenda de ' + heroName));
    frame.appendChild(title);

    var div = el('div', null, 'ho-lore-divider');
    div.appendChild(el('span', '◆ ◆ ◆'));
    frame.appendChild(div);

    var body = el('div', null, 'ho-lore-body');
    body.textContent = d.lore.long || d.lore.short || '';
    frame.appendChild(body);

    if (d.official_url) {
      var cta = el('div', null, 'ho-lore-cta');
      var a = document.createElement('a');
      a.href = d.official_url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.appendChild(document.createTextNode('Ler a história completa em Legends of Dawn'));

      var svg2 = document.createElementNS(svgNS, 'svg');
      svg2.setAttribute('viewBox', '0 0 24 24');
      svg2.setAttribute('aria-hidden', 'true');
      var path2 = document.createElementNS(svgNS, 'path');
      path2.setAttribute('d', 'M7 17 17 7M8 7h9v9');
      svg2.appendChild(path2);
      a.appendChild(svg2);

      cta.appendChild(a);
      frame.appendChild(cta);
    }

    var wrap = el('div', null, 'hh-lore');
    wrap.appendChild(frame);
    return wrap;
  }

  // ─── render skins (grid cinematográfico) ───
  function renderSkins(d) {
    if (!d.skins || !d.skins.length) return null;
    var grid = el('div', null, 'hh-skins');

    d.skins.forEach(function (s) {
      var card = el('article', null, 'hh-skin' + (s.is_original ? ' is-original' : ''));

      var wrapImg = el('div', null, 'hh-skin-imgwrap');
      wrapImg.appendChild(img(s.image, s.name || '', 'hh-skin-img'));

      if (s.badge || s.event || s.rarity) {
        var badgeText = s.badge || s.event || String(s.rarity).toUpperCase();
        var badge = el('span', badgeText, 'hh-skin-badge');
        if (s.rarity) badge.setAttribute('data-rarity', String(s.rarity).toLowerCase());
        wrapImg.appendChild(badge);
      }

      if (s.name) wrapImg.appendChild(el('h4', s.name, 'hh-skin-name'));

      card.appendChild(wrapImg);

      var info = el('div', null, 'hh-skin-info');

      if (s.desc) info.appendChild(el('p', s.desc, 'hh-skin-desc'));

      if (s.price != null) {
        var price = el('span', null, 'hh-skin-price');
        price.textContent = '💎 ' + s.price;
        info.appendChild(price);
      }

      if (s.released) {
        var dt = new Date(s.released + 'T00:00:00Z');
        var fmt = isNaN(dt.getTime()) ? s.released :
          String(dt.getUTCDate()).padStart(2, '0') + '/' +
          String(dt.getUTCMonth() + 1).padStart(2, '0') + '/' +
          dt.getUTCFullYear();
        info.appendChild(el('small', fmt, 'hh-skin-date'));
      }

      if (info.children.length) card.appendChild(info);
      grid.appendChild(card);
    });

    return grid;
  }

  // ─── render tudo junto (aba "Oficial") ───
  function renderSections(d) {
    var frag = document.createDocumentFragment();
    var s1 = renderStats(d);    if (s1) frag.appendChild(section('Stats', s1));
    var s2 = renderSkills(d);   if (s2) frag.appendChild(section('Skills', s2));
    var s3 = renderCounters(d); if (s3) frag.appendChild(section('Matchups', s3));
    var s4 = renderLore(d);     if (s4) frag.appendChild(section('Lore', s4));
    var s5 = renderSkins(d);    if (s5) frag.appendChild(section('Skins (' + d.skins.length + ')', s5));
    return frag;
  }

  function section(titulo, conteudo) {
    var s = el('section', null, 'hh-secao');
    s.appendChild(el('h3', titulo, 'hh-secao-title'));
    s.appendChild(conteudo);
    return s;
  }

  // ─── API pública ───
  window.HeroOfficial = {
    loadIndex: loadIndex,
    loadHero:  loadHero,
    loadHeroByName: loadHeroByName,
    getIndexSync: getIndexSync,
    getHeroSync:  getHeroSync,

    renderHeader:   renderHeader,
    renderStats:    renderStats,
    renderSkills:   renderSkills,
    renderCounters: renderCounters,
    renderLore:     renderLore,
    renderSkins:    renderSkins,
    renderSections: renderSections,

    abrirHeroi: abrirHeroi,
    linkHeroi:  linkHeroi,

    el: el,
    img: img,
    cdnUrl: cdnUrl,
    slugify: slugify,
  };
})();