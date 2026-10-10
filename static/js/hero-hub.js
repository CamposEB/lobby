// /static/js/hero-hub.js
// Aba "Heróis" (catálogo) + página de cada herói (builds e meta da comunidade).
// Depende de: window.Society (ponte criada no app.js) e window.HeroCatalog.
(function () {
  'use strict';

  var HC = window.HeroCatalog;
  var S = function () { return window.Society; };
  var $ = function (id) { return document.getElementById(id); };
  var NS = 'http://www.w3.org/2000/svg';

  var TIERS = ['S+', 'S', 'A+', 'A', 'B+', 'B', 'C', 'D'];
  var LANES = ['EXP', 'Jungle', 'Mid', 'Gold', 'Roam'];
  var norm = function (s) { return HC.norm(s); };
  var sameHero = function (a, b) { return norm(a) === norm(b); };
  var tierRank = function (t) {
    var i = TIERS.indexOf(String(t).toUpperCase());
    return i === -1 ? TIERS.length : i;
  };
  var score = function (e) { return Number(e.helpful || 0) - Number(e.not_helpful || 0); };
  var newest = function (a, b) { return Number(b.created_at || 0) - Number(a.created_at || 0); };

  function el(tag, text, cls) {
    var e = document.createElement(tag);
    if (text != null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  function icon(id) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'hh-ico');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  function portrait(name, cls) {
    var wrap = el('span', null, 'hh-portrait ' + (cls || ''));
    var hero = HC.find(name);
    function fallback() {
      wrap.replaceChildren(el('span', String(name || '?').slice(0, 2).toUpperCase(), 'hh-portrait-ph'));
    }
    if (hero && hero.file) {
      var img = new Image();
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = HC.imageUrl(hero);
      img.addEventListener('error', fallback, { once: true });
      wrap.appendChild(img);
    } else {
      fallback();
    }
    return wrap;
  }

  function tierBadge(tier, big) {
    var b = el('span', 'Tier ' + tier, 'hh-tier' + (big ? ' is-big' : ''));
    b.dataset.tier = String(tier).charAt(0).toUpperCase();
    return b;
  }

  function laneName(lane) { return S().laneName(lane); }

  // ───────────── dados da comunidade ─────────────
  function allKnownBuilds() {
    var st = S().state();
    var map = new Map();
    [].concat(st.builds || [], st.trending || [], st.recent || []).forEach(function (b) { map.set(b.id, b); });
    return Array.from(map.values());
  }

  // índice nome-normalizado -> {meta[], builds[], lanes:Set, tier}
  function communityIndex() {
    var idx = new Map();
    function slot(name) {
      var k = norm(name);
      if (!idx.has(k)) idx.set(k, { meta: [], builds: [], lanes: new Set(), tier: null });
      return idx.get(k);
    }
    (S().state().meta || []).forEach(function (e) {
      var s = slot(e.hero); s.meta.push(e); s.lanes.add(e.lane);
    });
    allKnownBuilds().forEach(function (b) {
      var s = slot(b.hero); s.builds.push(b); s.lanes.add(b.lane);
    });
    idx.forEach(function (s) {
      var best = s.meta.slice().sort(function (a, b) {
        return tierRank(a.tier) - tierRank(b.tier) || score(b) - score(a);
      })[0];
      s.tier = best ? best.tier : null;
    });
    return idx;
  }

  // ───────────── LISTA DE HERÓIS ─────────────
  var listUI = { q: '', sort: 'name', role: '', lane: '', tier: '' };

  function renderRoleStats() {
    var box = $('heroesRoleStats');
    if (!box) return;
    box.replaceChildren();
    var counts = {};
    HC.all().forEach(function (h) { h.roles.forEach(function (r) { counts[r] = (counts[r] || 0) + 1; }); });
    HC.ROLES.forEach(function (role) {
      var b = el('button', null, 'hh-role-stat role-' + role);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(listUI.role === role));
      b.append(el('small', HC.roleLabel(role)), el('b', String(counts[role] || 0)));
      b.addEventListener('click', function () {
        listUI.role = listUI.role === role ? '' : role;
        $('heroesRole').value = listUI.role;
        renderHeroes();
      });
      box.appendChild(b);
    });
  }

  function renderHeroes() {
    var grid = $('heroesGrid');
    if (!grid) return;
    var catalog = HC.all();
    var title = $('heroesTitle');
    if (title) title.textContent = catalog.length ? 'Todos os ' + catalog.length + ' heróis' : 'Todos os heróis';
    renderRoleStats();

    var idx = communityIndex();
    var q = norm(listUI.q);
    var rows = catalog.map(function (h) {
      return { hero: h, info: idx.get(norm(h.name)) || { meta: [], builds: [], lanes: new Set(), tier: null } };
    }).filter(function (r) {
      if (q && norm(r.hero.name).indexOf(q) === -1) return false;
      if (listUI.role && r.hero.roles.indexOf(listUI.role) === -1) return false;
      if (listUI.lane && !r.info.lanes.has(listUI.lane)) return false;
      if (listUI.tier === 'none') return !r.info.tier;
      if (listUI.tier && (!r.info.tier || String(r.info.tier).charAt(0).toUpperCase() !== listUI.tier)) return false;
      return true;
    });

    rows.sort(function (a, b) {
      if (listUI.sort === 'tier') {
        return tierRank(a.info.tier) - tierRank(b.info.tier) || a.hero.name.localeCompare(b.hero.name, 'pt-BR');
      }
      if (listUI.sort === 'builds') {
        return b.info.builds.length - a.info.builds.length || a.hero.name.localeCompare(b.hero.name, 'pt-BR');
      }
      return a.hero.name.localeCompare(b.hero.name, 'pt-BR');
    });

    grid.replaceChildren();
    var empty = $('heroesEmpty');
    if (!catalog.length) {
      empty.textContent = 'Carregando catálogo de heróis...';
      empty.hidden = false;
    } else {
      empty.textContent = 'Nenhum herói encontrado com esses filtros.';
      empty.hidden = rows.length > 0;
    }
    $('heroesCount').textContent = catalog.length ? 'Mostrando ' + rows.length + ' de ' + catalog.length : '';

    var frag = document.createDocumentFragment();
    rows.forEach(function (r) {
      var card = el('button', null, 'hh-hero-card');
      card.type = 'button';
      card.setAttribute('aria-label', r.hero.name + (r.info.tier ? ', tier ' + r.info.tier : ''));
      var art = portrait(r.hero.name, 'hh-portrait-card');
      if (r.info.tier) { var tb = tierBadge(r.info.tier); tb.classList.add('hh-card-tier'); art.appendChild(tb); }
      var copy = el('span', null, 'hh-hero-card-copy');
      copy.appendChild(el('b', r.hero.name));
      copy.appendChild(el('small', r.hero.roles.map(function (x) { return HC.roleLabel(x); }).join(' / ')));
      var counts = [];
      if (r.info.builds.length) counts.push(r.info.builds.length + (r.info.builds.length === 1 ? ' build' : ' builds'));
      if (r.info.meta.length) counts.push(r.info.meta.length + ' meta');
      if (counts.length) copy.appendChild(el('em', counts.join(' · ')));
      card.append(art, copy);
      card.addEventListener('click', function () { openHero(r.hero.name); });
      frag.appendChild(card);
    });
    grid.appendChild(frag);
  }

  function initList() {
    var roleSel = $('heroesRole');
    if (roleSel) {
      HC.ROLES.forEach(function (r) { roleSel.appendChild(new Option(HC.roleLabel(r), r)); });
    }
    var t;
    var search = $('heroesSearch');
    if (search) {
      search.addEventListener('input', function (e) {
        clearTimeout(t);
        var v = e.target.value;
        t = setTimeout(function () { listUI.q = v; renderHeroes(); }, 120);
      });
    }
    [['heroesSort', 'sort'], ['heroesRole', 'role'], ['heroesLane', 'lane'], ['heroesTier', 'tier']].forEach(function (p) {
      var el = $(p[0]);
      if (!el) return;                     // ← guard: pula selects ausentes
      el.addEventListener('change', function (e) { listUI[p[1]] = e.target.value; renderHeroes(); });
    });
    renderHeroes();
  }

  // ───────────── PÁGINA DO HERÓI ─────────────
  var cur = { name: '', tab: 'overview', featuredId: null, builds: [], state: 'idle', requestId: 0, timer: null };
  var lastTab = 'heroes';
  var refreshTimer = null;
  var TABS = [];
  var HOOKS = { overview: [], builds: [], banner: [], matchups: [], skills: [], stats: [] };

  function heroMeta() {
    return (S().state().meta || []).filter(function (e) { return sameHero(e.hero, cur.name); });
  }
  function localBuilds() {
    return allKnownBuilds().filter(function (b) { return sameHero(b.hero, cur.name); });
  }
  function sortBuilds(list) {
    return list.slice().sort(function (a, b) { return score(b) - score(a) || newest(a, b); });
  }
  function featuredBuild() {
    if (!cur.builds.length) return null;
    if (cur.featuredId != null) {
      var f = cur.builds.find(function (b) { return String(b.id) === String(cur.featuredId); });
      if (f) return f;
    }
    return sortBuilds(cur.builds)[0];
  }
  function pct(items) {
    var up = 0, down = 0;
    items.forEach(function (e) { up += Number(e.helpful || 0); down += Number(e.not_helpful || 0); });
    return up + down ? Math.round(up * 100 / (up + down)) : null;
  }

  function fact(label, value) {
    var box = el('div', null, 'hh-fact');
    box.appendChild(el('small', label));
    var v = el('div', null, 'hh-fact-value');
    if (value instanceof Node) v.appendChild(value); else v.textContent = value;
    box.appendChild(v);
    return box;
  }

  function renderBanner() {
    var box = $('heroBanner');
    if (!box) return;
    box.replaceChildren();
    $('heroCrumb').textContent = cur.name;
    var info = HC.find(cur.name);
    var meta = heroMeta();
    var builds = cur.builds;

    var tierEntry = meta.slice().sort(function (a, b) {
      return tierRank(a.tier) - tierRank(b.tier) || score(b) - score(a);
    })[0];
    var lanes = LANES.filter(function (l) {
      return meta.some(function (e) { return e.lane === l; }) || builds.some(function (b) { return b.lane === l; });
    });
    var latest = [].concat(meta, builds).sort(newest)[0];

    if (info && info.wallpaper) {
      var bg = new Image();
      bg.className = 'hh-banner-bg';
      bg.alt = '';
      bg.decoding = 'async';
      bg.referrerPolicy = 'no-referrer';
      bg.src = HC.routeImg(info.wallpaper);
      bg.addEventListener('error', function () { bg.remove(); }, { once: true });
      box.appendChild(bg);
    }
    box.appendChild(portrait(cur.name, 'hh-portrait-lg'));

    var main = el('div', null, 'hh-banner-main');
    var row = el('div', null, 'hh-title-row');
    row.appendChild(el('h2', cur.name, 'hh-name'));
    ((info && info.roles) || []).forEach(function (r) {
      row.appendChild(el('span', HC.roleLabel(r), 'hh-role-chip role-' + r));
    });
    main.appendChild(row);
    var facts = el('div', null, 'hh-facts');
    facts.appendChild(fact('TIER DA COMUNIDADE', tierEntry ? tierBadge(tierEntry.tier, true) : 'Sem indicações'));
    facts.appendChild(fact('ROTAS INDICADAS', lanes.length ? lanes.map(laneName).join(' · ') : '—'));
    facts.appendChild(fact('PATCH MAIS RECENTE', latest ? latest.patch : '—'));
    main.appendChild(facts);
    HOOKS.banner.forEach(function (fn) {
      try { fn(main, row, facts); } catch (e) { console.error('[hero-hub] banner', e); }
    });
    box.appendChild(main);

    var stat = el('div', null, 'hh-statbox');
    stat.appendChild(el('p', 'COMUNIDADE · NÃO OFICIAL', 'hh-statbox-eyebrow'));
    var cells = el('div', null, 'hh-stat-cells');
    var ap = pct(builds);
    [['BUILDS', String(builds.length)], ['META', String(meta.length)], ['APROVAÇÃO', ap == null ? '—' : ap + '%']]
      .forEach(function (c) {
        var cell = el('div', null, 'hh-stat-cell');
        cell.append(el('small', c[0]), el('b', c[1]));
        cells.appendChild(cell);
      });
    stat.appendChild(cells);
    stat.appendChild(el('p', 'Enviado por jogadores. Confira o patch e valide no seu elo.', 'hh-statbox-foot'));
    box.appendChild(stat);
  }

  function rawLabel(t) { return typeof t.label === 'function' ? t.label() : t.label; }
  // a aba "Oficial" (hero-official-tabs.js) vira a "Visão geral" e substitui a visão geral antiga
  function isOfficial(t) { return t.id === 'official' || /^oficial$/i.test(String(rawLabel(t))); }
  function hasOfficial() { return TABS.some(isOfficial); }
  function tabLabel(t) { return isOfficial(t) ? 'Visão geral' : rawLabel(t); }
  function tabOrder(t) { return isOfficial(t) ? -1 : (t.order || 50); }
  function sortedTabs() {
    var off = hasOfficial();
    return TABS.filter(function (t) { return !(off && t.id === 'overview'); })
      .sort(function (x, y) { return tabOrder(x) - tabOrder(y); });
  }
  function resolveTab() {
    var list = sortedTabs();
    return list.some(function (t) { return t.id === cur.tab; }) ? cur.tab : (list[0] ? list[0].id : cur.tab);
  }

  function renderTabs() {
    var tabs = $('heroTabs');
    cur.tab = resolveTab();
    tabs.replaceChildren();
    sortedTabs().forEach(function (t) {
      var b = el('button', tabLabel(t), 'hh-tab' + (cur.tab === t.id ? ' is-active' : ''));
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(cur.tab === t.id));
      b.addEventListener('click', function () { cur.tab = t.id; renderTabs(); renderPanel(); });
      tabs.appendChild(b);
    });
  }

  function voteBox(scope, entry) {
    var actions = S().voteActions(scope, entry);
    actions.addEventListener('click', function (e) {
      if (e.target.closest('button')) scheduleRefresh(700);
    });
    return actions;
  }

  function itemsRow(entry, big) {
    var wrap = el('div', null, big ? 'hh-items is-big' : 'hh-items');
    var items = Array.isArray(entry.items) ? entry.items.slice(0, 6) : [];
    items.forEach(function (name, i) {
      var cell = el('div', null, 'hh-item');
      var ic = S().getIcon('itens', name);
      ic.title = (i + 1) + '. ' + name;
      cell.appendChild(ic);
      if (big) cell.appendChild(el('span', name, 'hh-item-name'));
      wrap.appendChild(cell);
    });
    return wrap;
  }

  function gearBox(type, label, value) {
    var box = el('div', null, 'hh-gear');
    box.appendChild(S().getIcon(type, value));
    var copy = el('span', null);
    copy.append(el('small', label), el('b', value || 'Não informado'));
    box.appendChild(copy);
    return box;
  }

  function card(title, subtitle, action) {
    var c = el('section', null, 'hh-panel hh-block');
    var head = el('header', null, 'hh-block-head');
    var left = el('div');
    left.appendChild(el('h3', title));
    if (subtitle) left.appendChild(el('small', subtitle));
    head.appendChild(left);
    if (action) head.appendChild(action);
    c.appendChild(head);
    return c;
  }

  function linkBtn(text, fn) {
    var b = el('button', text, 'hh-link-btn');
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }

  function emptyBlock(text, ctaText, ctaFn) {
    var d = el('div', null, 'hh-empty-block');
    d.appendChild(el('p', text));
    if (ctaText) {
      var b = el('button', ctaText, 'hh-cta');
      b.type = 'button';
      b.addEventListener('click', ctaFn);
      d.appendChild(b);
    }
    return d;
  }

  function costLine(entry) {
    var HD = window.HeroData;
    if (!HD || !HD.ready() || !S().itemFile) return null;
    var r = HD.communityCost(entry.items, S().itemFile);
    if (!r.total) return null;
    return el('p', 'Custo total: ' + HD.fmtGold(r.total) + (r.partial ? ' (aproximado)' : ''), 'hh-cost');
  }

  function featuredCard() {
    var f = featuredBuild();
    var action = cur.builds.length > 1
      ? linkBtn('Ver todas →', function () { cur.tab = 'builds'; renderTabs(); renderPanel(); }) : null;
    var c = card(cur.featuredId != null && f ? 'BUILD SELECIONADA' : 'BUILD EM DESTAQUE',
      f ? laneName(f.lane) + ' · ' + f.patch : 'Melhor avaliada pela comunidade', action);
    c.classList.add('hh-featured');
    if (!f) {
      c.appendChild(emptyBlock(
        cur.state === 'loading' ? 'Carregando builds...' : 'Ainda não há builds publicadas para ' + cur.name + '.',
        cur.state === 'loading' ? null : 'Publicar a primeira build',
        function () { S().startBuild(cur.name); }));
      return c;
    }
    c.appendChild(el('p', 'CAMINHO DE COMPRA', 'hh-label'));
    c.appendChild(itemsRow(f, true));
    var fcost = costLine(f);
    if (fcost) c.appendChild(fcost);
    var gear = el('div', null, 'hh-gear-row');
    gear.append(gearBox('emblemas', 'EMBLEMA E TALENTOS', f.emblem), gearBox('feiticos', 'FEITIÇO DE BATALHA', f.spell));
    c.appendChild(gear);
    if (f.notes) {
      var q = el('blockquote', f.notes, 'hh-quote');
      c.appendChild(q);
    }
    var foot = el('div', null, 'hh-foot');
    foot.appendChild(el('span', 'por ' + f.author + ' · ' + S().relDate(f.created_at), 'hh-muted'));
    foot.appendChild(voteBox('builds', f));
    c.appendChild(foot);

    var others = sortBuilds(cur.builds).filter(function (b) { return b.id !== f.id; }).slice(0, 4);
    if (others.length) {
      var strip = el('div', null, 'hh-others');
      strip.appendChild(el('small', 'OUTRAS BUILDS'));
      others.forEach(function (b) {
        var chip = el('button', laneName(b.lane) + ' · ' + b.author, 'hh-chip-btn');
        chip.type = 'button';
        chip.addEventListener('click', function () { cur.featuredId = b.id; renderBanner(); renderPanel(); });
        strip.appendChild(chip);
      });
      c.appendChild(strip);
    }
    return c;
  }

  function metaCard() {
    var meta = heroMeta().sort(function (a, b) {
      return tierRank(a.tier) - tierRank(b.tier) || score(b) - score(a);
    });
    var c = card('META POR ROTA', 'Indicações dos jogadores',
      meta.length > 3 ? linkBtn('Ver tudo →', function () { cur.tab = 'meta'; renderTabs(); renderPanel(); }) : null);
    if (!meta.length) {
      c.appendChild(emptyBlock('Ninguém indicou ' + cur.name + ' no meta ainda.', 'Indicar no meta',
        function () { S().startMeta(cur.name); }));
      return c;
    }
    var list = el('div', null, 'hh-rows');
    meta.slice(0, 5).forEach(function (e) {
      var row = el('div', null, 'hh-row');
      row.appendChild(tierBadge(e.tier));
      var copy = el('span', null, 'hh-row-copy');
      copy.append(el('b', laneName(e.lane)), el('small', e.patch + ' · por ' + e.author));
      row.appendChild(copy);
      row.appendChild(el('span', '▲ ' + Number(e.helpful || 0), 'hh-row-score'));
      list.appendChild(row);
    });
    c.appendChild(list);
    return c;
  }

  function bar(label, value, tone) {
    var row = el('div', null, 'hh-bar');
    row.appendChild(el('span', label, 'hh-bar-label'));
    var track = el('span', null, 'hh-bar-track');
    var fill = el('span', null, 'hh-bar-fill ' + (tone || ''));
    fill.style.width = (value == null ? 0 : value) + '%';
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('b', value == null ? '—' : String(value), 'hh-bar-num'));
    return row;
  }

  function summaryCard() {
    var meta = heroMeta(), builds = cur.builds;
    var lanes = LANES.filter(function (l) {
      return meta.some(function (e) { return e.lane === l; }) || builds.some(function (b) { return b.lane === l; });
    });
    var c = card('RESUMO RÁPIDO', 'Calculado com os votos da comunidade');
    c.appendChild(bar('APROVAÇÃO DAS BUILDS', pct(builds), 'is-green'));
    c.appendChild(bar('APROVAÇÃO DO META', pct(meta), 'is-blue'));
    c.appendChild(bar('PRESENÇA NAS ROTAS', Math.round(lanes.length * 100 / LANES.length), 'is-gold'));
    var cta = el('div', null, 'hh-cta-row');
    var b1 = el('button', 'Publicar build', 'hh-cta'); b1.type = 'button';
    b1.addEventListener('click', function () { S().startBuild(cur.name); });
    var b2 = el('button', 'Indicar no meta', 'hh-cta is-secondary'); b2.type = 'button';
    b2.addEventListener('click', function () { S().startMeta(cur.name); });
    cta.append(b1, b2);
    c.appendChild(cta);
    return c;
  }

  function buildItemCard(b) {
    var c = el('article', null, 'hh-panel hh-list-card');
    var head = el('header', null, 'hh-list-card-head');
    var tags = el('div', null, 'hh-tags');
    tags.append(el('span', laneName(b.lane), 'hh-tag'), el('span', b.patch, 'hh-tag is-muted'));
    head.appendChild(tags);
    head.appendChild(el('small', 'por ' + b.author + ' · ' + S().relDate(b.created_at), 'hh-muted'));
    c.appendChild(head);
    c.appendChild(itemsRow(b, false));
    var bcost = costLine(b);
    if (bcost) c.appendChild(bcost);
    var gear = el('div', null, 'hh-gear-row');
    gear.append(gearBox('emblemas', 'EMBLEMA', b.emblem), gearBox('feiticos', 'FEITIÇO', b.spell));
    c.appendChild(gear);
    if (b.notes) c.appendChild(el('p', b.notes, 'hh-notes'));
    var foot = el('div', null, 'hh-foot');
    var see = linkBtn('Ver em destaque', function () {
      cur.featuredId = b.id; cur.tab = 'overview'; renderBanner(); renderTabs(); renderPanel();
      window.scrollTo(0, 0);
    });
    foot.append(see, voteBox('builds', b));
    c.appendChild(foot);
    return c;
  }

  function metaItemCard(e) {
    var c = el('article', null, 'hh-panel hh-list-card');
    var head = el('header', null, 'hh-list-card-head');
    var tags = el('div', null, 'hh-tags');
    tags.append(tierBadge(e.tier), el('span', laneName(e.lane), 'hh-tag'), el('span', e.patch, 'hh-tag is-muted'));
    head.appendChild(tags);
    head.appendChild(el('small', 'por ' + e.author + ' · ' + S().relDate(e.created_at), 'hh-muted'));
    c.appendChild(head);
    if (e.notes) c.appendChild(el('p', e.notes, 'hh-notes'));
    var foot = el('div', null, 'hh-foot');
    foot.appendChild(voteBox('meta', e));
    c.appendChild(foot);
    return c;
  }

  function renderOverviewTab(panel) {
    var grid = el('div', null, 'hh-overview');
    grid.append(featuredCard(), metaCard(), summaryCard());
    HOOKS.overview.forEach(function (fn) {
      var n = null;
      try { n = fn(); } catch (e) { console.error('[hero-hub] overview', e); }
      if (n) grid.appendChild(n);
    });
    panel.appendChild(grid);
  }

  function renderBuildsTab(panel) {
    var list = el('div', null, 'hh-list');
    var bs = sortBuilds(cur.builds);
    if (!bs.length) {
      list.appendChild(emptyBlock(cur.state === 'loading' ? 'Carregando builds...' : 'Nenhuma build publicada para ' + cur.name + '.',
        cur.state === 'loading' ? null : 'Publicar build', function () { S().startBuild(cur.name); }));
    }
    bs.forEach(function (b) { list.appendChild(buildItemCard(b)); });
    HOOKS.builds.forEach(function (fn) {
      var n = null;
      try { n = fn(); } catch (e) { console.error('[hero-hub] builds', e); }
      if (n) list.appendChild(n);
    });
    panel.appendChild(list);
  }

  function renderMetaTab(panel) {
    var ml = el('div', null, 'hh-list');
    var ms = heroMeta().sort(function (a, b) { return tierRank(a.tier) - tierRank(b.tier) || score(b) - score(a); });
    if (!ms.length) ml.appendChild(emptyBlock('Nenhuma indicação de meta para ' + cur.name + '.', 'Indicar no meta',
      function () { S().startMeta(cur.name); }));
    ms.forEach(function (e) { ml.appendChild(metaItemCard(e)); });
    panel.appendChild(ml);
  }

  function renderPanel() {
    var panel = $('heroPanel');
    panel.replaceChildren();
    var t = TABS.filter(function (x) { return x.id === cur.tab; })[0] || sortedTabs()[0];
    if (!t) return;
    try { t.render(panel); }
    catch (e) {
      console.error('[hero-hub] aba ' + t.id, e);
      panel.appendChild(el('p', 'Não foi possível carregar esta aba.', 'hh-muted'));
    }
  }

  // re-renderiza preservando o que o usuário digitou / abriu
  function rerender() {
    if (!$('tab-hero') || !$('tab-hero').classList.contains('on') || !cur.name) return;
    var panel = $('heroPanel');
    var fields = Array.prototype.slice.call(panel.querySelectorAll('input,textarea,select'));
    var dets = Array.prototype.slice.call(panel.querySelectorAll('details'));
    var vals = fields.map(function (x) { return x.value; });
    var opens = dets.map(function (x) { return x.open; });
    var y = window.scrollY;
    renderBanner(); renderTabs(); renderPanel();
    var nf = Array.prototype.slice.call(panel.querySelectorAll('input,textarea,select'));
    var nd = Array.prototype.slice.call(panel.querySelectorAll('details'));
    if (nf.length === vals.length) nf.forEach(function (x, i) { x.value = vals[i]; });
    if (nd.length === opens.length) nd.forEach(function (x, i) { x.open = opens[i]; });
    window.scrollTo(0, y);
  }

  function renderHero() {
    renderBanner();
    renderTabs();
    renderPanel();
  }

  function applyBuilds(list, state) {
    cur.builds = list;
    cur.state = state;
    renderHero();
  }

  function fetchBuilds() {
    clearTimeout(cur.timer);
    var id = S().requestHeroBuilds(cur.name);
    if (!id) { cur.state = 'fallback'; return; }
    cur.requestId = id;
    cur.state = 'loading';
    cur.timer = setTimeout(function () {
      if (cur.state === 'loading') applyBuilds(localBuilds(), 'fallback');
    }, 6000);
  }

  function scheduleRefresh(delay) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      if ($('tab-hero') && $('tab-hero').classList.contains('on')) fetchBuilds();
    }, delay || 300);
  }

  function openHero(name, buildId, tab) {
    if (!name) return;
    cur.name = String(name);
    cur.tab = tab || 'overview';
    cur.featuredId = buildId != null ? buildId : null;
    cur.builds = localBuilds();      // mostra já o que existe em memória
    cur.state = 'loading';
    S().tab('hero');
    window.scrollTo(0, 0);
    renderHero();
    fetchBuilds();
    if (window.HeroData) window.HeroData.load();
    if (window.HeroContrib) window.HeroContrib.ensure(cur.name, true);
  }

  function initPage() {
    $('heroBack').addEventListener('click', function () { S().tab(lastTab || 'heroes'); });
    window.addEventListener('society:hero-builds', function (ev) {
      var m = ev.detail || {};
      if (m.request_id !== cur.requestId) return;
      clearTimeout(cur.timer);
      var map = new Map();
      [].concat(m.list || [], m.trending || [], m.recent || []).forEach(function (b) {
        if (sameHero(b.hero, cur.name)) map.set(b.id, b);
      });
      applyBuilds(Array.from(map.values()), 'ready');
    });
  }

  // ───────────── init ─────────────
  function init() {
    if (init.done) return;
    init.done = true;

    document.addEventListener('click', function (e) {
      var go = e.target.closest && e.target.closest('[data-hh-go]');
      if (go) S().tab(go.dataset.hhGo);
    });

    initList();
    initPage();

    window.addEventListener('society:tab', function (ev) {
      var t = ev.detail;
      if (t !== 'hero') lastTab = t;
      if (t === 'heroes') renderHeroes();
    });
    window.addEventListener('hero-catalog-ready', function () { renderHeroes(); });
    window.addEventListener('society:meta', function () {
      if ($('tab-heroes').classList.contains('on')) renderHeroes();
      rerender();
    });
    window.addEventListener('hero-data-ready', rerender);
    window.addEventListener('hero-contrib-updated', rerender);
    window.addEventListener('society:builds', function () {
      if ($('tab-heroes').classList.contains('on')) renderHeroes();
      if ($('tab-hero').classList.contains('on')) scheduleRefresh(300);
    });

    window.SocietyHero = { open: openHero };
  }

  function register(tab) {
    var i = -1;
    TABS.forEach(function (t, k) { if (t.id === tab.id) i = k; });
    if (i >= 0) TABS[i] = tab; else TABS.push(tab);
  }

  register({ id: 'overview', order: 10, label: 'Visão geral', render: renderOverviewTab });
  register({ id: 'builds', order: 20, label: function () { return 'Builds (' + cur.builds.length + ')'; }, render: renderBuildsTab });
  register({ id: 'meta', order: 30, label: function () { return 'Meta (' + heroMeta().length + ')'; }, render: renderMetaTab });

  // API para hero-tabs.js e outros módulos
  window.HeroHub = {
    register: register,
    hooks: HOOKS,
    rerender: rerender,
    current: function () { return cur; },
    setTab: function (id) { cur.tab = id; renderTabs(); renderPanel(); },
    ui: {
      el: el, icon: icon, portrait: portrait, tierBadge: tierBadge, card: card, linkBtn: linkBtn, emptyBlock: emptyBlock,
      itemsRow: itemsRow, gearBox: gearBox, bar: bar, laneName: laneName, score: score, tierRank: tierRank, newest: newest,
      sameHero: sameHero, pct: pct, heroMeta: heroMeta, sortBuilds: sortBuilds, featuredBuild: featuredBuild,
      LANES: LANES, TIERS: TIERS
    }
  };

  if (window.Society) init();
  else window.addEventListener('society-app-ready', init, { once: true });
})();