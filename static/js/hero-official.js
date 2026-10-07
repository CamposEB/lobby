// /static/js/hero-official.js
// Dados oficiais do jogo por herói (win/pick/ban, counters, compatibilidade, notas, skills, combo, wallpapers).
// Lê /static/data/official/<herói>.json (formato em OFICIAL-schema.md). Se o arquivo não existir, nada aparece.
// Depende de: hero-hub.js (window.HeroHub) e hero-tabs.js (ganchos matchups/skills/stats).
(function () {
  'use strict';

  var Hub = window.HeroHub, HC = window.HeroCatalog;
  if (!Hub || !HC) { console.warn('[hero-official] dependências ausentes'); return; }

  var U = Hub.ui, el = U.el;
  var BASE = '/static/data/official/';
  var cache = new Map();           // chave -> { status:'loading'|'ready'|'missing', data }
  var skillSel = 0;

  var RANKS = [['epic', 'Épico'], ['legend', 'Lenda'], ['mythic', 'Mítico'], ['honor', 'Honra Mítica'], ['glory', 'Glória Mítica+']];
  var SLOTS = { passive: 'Passiva', '1': 'Skill 1', '2': 'Skill 2', '3': 'Skill 3', ult: 'Ultimate' };

  var keyOf = function (name) { return HC.norm(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); };

  function load(name) {
    var k = keyOf(name);
    var c = cache.get(k);
    if (c) return c;
    c = { status: 'loading', data: null };
    cache.set(k, c);
    fetch(BASE + k + '.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { c.data = d; c.status = 'ready'; })
      .catch(function () { c.status = 'missing'; })
      .then(function () { Hub.rerender(); });
    return c;
  }

  function official() {
    var cur = Hub.current();
    if (!cur || !cur.name) return null;
    var c = load(cur.name);
    return c.status === 'ready' ? c.data : null;
  }

  // ───────────── formatação ─────────────
  function num(n, d) {
    return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function pct(n) { return n == null ? '—' : num(n, 2) + '%'; }
  function signed(n, d, suffix) {
    if (n == null) return '';
    return (n > 0 ? '+' : n < 0 ? '−' : '') + num(Math.abs(n), d) + (suffix || '');
  }
  function deltaEl(n, d, suffix) {
    var e = el('small', signed(n, d, suffix), 'ho-delta ' + (n > 0 ? 'is-up' : n < 0 ? 'is-down' : ''));
    return e;
  }
  function img(url, alt, cls) {
    var i = new Image();
    i.alt = alt || '';
    i.loading = 'lazy';
    i.decoding = 'async';
    i.referrerPolicy = 'no-referrer';
    if (cls) i.className = cls;
    i.src = url;
    i.addEventListener('error', function () { i.style.visibility = 'hidden'; }, { once: true });
    return i;
  }
  function credit(o) {
    var parts = [];
    if (o.source) parts.push('Fonte: ' + o.source);
    if (o.patch) parts.push('Patch ' + o.patch);
    if (o.updated) parts.push('atualizado em ' + o.updated);
    var p = el('p', parts.join(' · ') + '. Dados do jogo, não substituem o que você vê no cliente.', 'hc-muted ht-source');
    return p;
  }
  function sampleFlag(o) {
    return o.sample ? el('p', 'DADOS DE EXEMPLO · não são reais. Remova o arquivo de exemplo quando importar os dados oficiais.', 'ho-sample') : null;
  }

  function heroRow(name, right, extra) {
    var known = !!HC.find(name);
    var r = el(known ? 'button' : 'div', null, 'hh-row ho-row' + (known ? ' is-link' : ''));
    if (known) {
      r.type = 'button';
      r.addEventListener('click', function () { if (window.SocietyHero) window.SocietyHero.open(name); });
    }
    r.appendChild(U.portrait(name, 'hh-portrait-sm'));
    var copy = el('span', null, 'hh-row-copy');
    copy.appendChild(el('b', name));
    if (extra) copy.appendChild(el('small', extra));
    r.appendChild(copy);
    if (right instanceof Node) r.appendChild(right);
    else if (right != null) r.appendChild(el('span', right, 'hh-row-score'));
    return r;
  }

  function metricText(metric, v) {
    return metric === 'score' ? num(v, 2) : signed(v, 1, ' pp');
  }

  // ───────────── topo: win / pick / ban ─────────────
  Hub.hooks.banner.push(function (main, row, facts) {
    var o = official();
    if (!o || !o.stats) return;
    var st = o.stats;
    var box = el('div', null, 'ho-stats');
    [['WIN RATE', st.win, st.dWin], ['PICK RATE', st.pick, st.dPick], ['BAN RATE', st.ban, st.dBan]].forEach(function (c) {
      var cell = el('div', null, 'ho-stat');
      cell.appendChild(el('small', c[0], 'ho-stat-label'));
      cell.appendChild(el('b', pct(c[1])));
      if (c[2] != null) cell.appendChild(deltaEl(c[2], 1, ' pp'));
      box.appendChild(cell);
    });
    var foot = el('small', 'Ranked' + (o.patch ? ' · patch ' + o.patch : '') + (o.updated ? ' · ' + o.updated : ''), 'ho-stats-src');
    box.appendChild(foot);
    main.insertBefore(box, facts);
  });

  // ───────────── visão geral: perfil do herói ─────────────
  function bar(label, v) { return U.bar(label, v == null ? null : Math.round(v), 'is-blue'); }

  Hub.hooks.overview.push(function () {
    var o = official();
    if (!o || !o.hero) return null;
    var h = o.hero, a = h.attrs || {};
    var c = U.card('PERFIL DO HERÓI', h.title || 'Dados do jogo');
    var chips = el('div', null, 'ht-badges');
    (h.specialty || []).forEach(function (s) { chips.appendChild(el('span', s, 'ht-spec')); });
    (h.lanes || []).forEach(function (l) { chips.appendChild(el('span', l, 'ht-pro')); });
    if (chips.childNodes.length) c.appendChild(chips);
    c.appendChild(bar('RESISTÊNCIA', a.durability));
    c.appendChild(bar('ATAQUE', a.offense));
    c.appendChild(bar('CONTROLE', a.control));
    c.appendChild(bar('DIFICULDADE', a.difficulty));
    var f = sampleFlag(o); if (f) c.appendChild(f);
    c.appendChild(credit(o));
    return c;
  });

  // ───────────── aba Matchups: counters, compatibilidade, notas ─────────────
  function listCard(title, subtitle, list, metric) {
    var c = U.card(title, subtitle);
    if (!list || !list.length) { c.appendChild(el('p', 'Sem dados.', 'hc-muted')); return c; }
    var rows = el('div', null, 'hh-rows');
    list.slice(0, 8).forEach(function (it, i) {
      var right = el('span', metricText(metric, it.value), 'hh-row-score' + (it.value < 0 ? ' is-neg' : ''));
      rows.appendChild(heroRow(it.hero, right, '#' + (i + 1)));
    });
    c.appendChild(rows);
    return c;
  }

  Hub.hooks.matchups.push(function () {
    var o = official();
    if (!o) return null;
    var wrap = el('section', null, 'ho-section');
    var f = sampleFlag(o); if (f) wrap.appendChild(f);
    var metric = (o.counters && o.counters.metric) || 'pp';
    var explain = metric === 'score'
      ? 'Counter score: quanto maior, mais o herói é counterado.'
      : 'Diferença de win rate em pontos percentuais (pp) no confronto.';

    if (o.counters) {
      wrap.appendChild(el('h3', 'COUNTERS (DADOS DO JOGO)', 'ht-section-title'));
      var cols = el('div', null, 'ht-cols');
      cols.appendChild(listCard('FRACO CONTRA', 'Quem mais atrapalha ' + Hub.current().name, o.counters.weak, metric));
      cols.appendChild(listCard('FORTE CONTRA', 'Quem ' + Hub.current().name + ' mais atrapalha', o.counters.strong, metric));
      wrap.appendChild(cols);
      wrap.appendChild(el('p', explain, 'hc-muted ht-source'));
    }
    if (o.compat) {
      wrap.appendChild(el('h3', 'COMPATIBILIDADE', 'ht-section-title'));
      var cc = el('div', null, 'ht-cols');
      cc.appendChild(listCard('MELHORES COMPANHEIROS', 'Combinam bem com ' + Hub.current().name, o.compat.best, o.compat.metric || 'score'));
      cc.appendChild(listCard('MENOS COMPATÍVEIS', 'Combinam pior', o.compat.worst, o.compat.metric || 'score'));
      wrap.appendChild(cc);
    }
    var notes = o.notes || {};
    var groups = [['ally', 'ALIADOS', 'Parcerias indicadas pelo jogo'], ['counter', 'COMO ENFRENTAR', 'Heróis que este herói atrapalha'], ['threat', 'AMEAÇAS', 'Heróis que mais atrapalham este herói']];
    var has = groups.some(function (g) { return notes[g[0]] && notes[g[0]].length; });
    if (has) {
      wrap.appendChild(el('h3', 'NOTAS DO JOGO', 'ht-section-title'));
      var grid = el('div', null, 'ht-guide');
      groups.forEach(function (g) {
        var list = notes[g[0]];
        if (!list || !list.length) return;
        var c = U.card(g[1], g[2]);
        list.forEach(function (n) {
          var item = el('div', null, 'ho-note');
          item.appendChild(heroRow(n.hero, null));
          item.appendChild(el('p', n.text, 'hc-body'));
          c.appendChild(item);
        });
        grid.appendChild(c);
      });
      wrap.appendChild(grid);
    }
    wrap.appendChild(credit(o));
    return wrap;
  });

  // ───────────── aba Skills: habilidades, prioridade e combo ─────────────
  Hub.hooks.skills.push(function () {
    var o = official();
    if (!o || !o.skills || !o.skills.length) return null;
    var wrap = el('section', null, 'ho-section');
    var f = sampleFlag(o); if (f) wrap.appendChild(f);

    var c = U.card('HABILIDADES', 'Descrições do jogo');
    var icons = el('div', null, 'ho-skill-icons');
    var detail = el('div', null, 'ho-skill-detail');
    if (skillSel >= o.skills.length) skillSel = 0;

    function paint() {
      Array.prototype.forEach.call(icons.children, function (b, i) { b.classList.toggle('is-on', i === skillSel); b.setAttribute('aria-pressed', String(i === skillSel)); });
      var s = o.skills[skillSel];
      detail.replaceChildren();
      var head = el('div', null, 'ho-skill-head');
      head.appendChild(el('h4', s.name));
      head.appendChild(el('small', SLOTS[s.slot] || s.slot, 'ho-slot'));
      (s.tags || (s.tag ? [s.tag] : [])).forEach(function (t) { head.appendChild(el('span', t, 'ho-tag')); });
      detail.appendChild(head);
      detail.appendChild(el('p', s.desc, 'ho-skill-desc'));
    }

    o.skills.forEach(function (s, i) {
      var b = el('button', null, 'ho-skill-btn');
      b.type = 'button';
      b.title = s.name;
      b.setAttribute('aria-label', s.name);
      if (s.icon) b.appendChild(img(s.icon, '')); else b.appendChild(el('span', String(s.name).slice(0, 2).toUpperCase(), 'hh-portrait-ph'));
      b.addEventListener('click', function () { skillSel = i; paint(); });
      icons.appendChild(b);
    });
    c.append(icons, detail);
    paint();
    wrap.appendChild(c);

    if (o.skillPriority) {
      var pc = U.card('PRIORIDADE DE EVOLUÇÃO', 'Qual skill evoluir primeiro');
      pc.appendChild(el('p', o.skillPriority, 'hc-body'));
      wrap.appendChild(pc);
    }
    if (o.combo && (o.combo.text || (o.combo.steps || []).length)) {
      var cb = U.card('COMBO DE TEAMFIGHT', 'Sequência indicada pelo jogo');
      var steps = el('div', null, 'ho-combo');
      (o.combo.steps || []).forEach(function (u, i) {
        if (i) steps.appendChild(el('span', '→', 'hc-step-arrow'));
        steps.appendChild(img(u, 'Passo ' + (i + 1), 'ho-combo-step'));
      });
      if (steps.childNodes.length) cb.appendChild(steps);
      if (o.combo.text) cb.appendChild(el('p', o.combo.text, 'hc-body'));
      wrap.appendChild(cb);
    }
    wrap.appendChild(credit(o));
    return wrap;
  });

  // ───────────── aba Stats: por rank ─────────────
  Hub.hooks.stats.push(function () {
    var o = official();
    if (!o || !o.ranks) return null;
    var c = U.card('POR RANK', 'Win, pick e ban rate em cada faixa');
    var rankKeys = RANKS.filter(function (r) { return o.ranks[r[0]]; });
    if (!rankKeys.length) return null;
    var wrapT = el('div', null, 'ho-table-wrap');
    var table = el('table', null, 'ho-table');
    var thead = el('thead'), hr = el('tr');
    hr.appendChild(el('th', 'Métrica'));
    rankKeys.forEach(function (r) { hr.appendChild(el('th', r[1])); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    [['win', 'Win rate'], ['pick', 'Pick rate'], ['ban', 'Ban rate']].forEach(function (m) {
      var tr = el('tr');
      tr.appendChild(el('th', m[1]));
      rankKeys.forEach(function (r) {
        var v = o.ranks[r[0]][m[0]];
        var td = el('td');
        td.appendChild(el('b', pct(v)));
        if (o.stats && o.stats[m[0]] != null && v != null) td.appendChild(deltaEl(v - o.stats[m[0]], 2, ' vs geral'));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapT.appendChild(table);
    c.appendChild(wrapT);
    var f = sampleFlag(o); if (f) c.appendChild(f);
    c.appendChild(credit(o));
    return c;
  });

  // ───────────── aba Wallpapers ─────────────
  function renderWallpapers(panel) {
    var cur = Hub.current();
    var c = load(cur.name);
    var card = U.card('WALLPAPERS', 'Artes oficiais de ' + cur.name);
    var o = c.status === 'ready' ? c.data : null;
    if (c.status === 'loading') card.appendChild(el('p', 'Carregando...', 'hc-muted'));
    else if (!o || !o.wallpapers || !o.wallpapers.length) {
      card.appendChild(U.emptyBlock('Os wallpapers oficiais deste herói ainda não foram importados.'));
    } else {
      var grid = el('div', null, 'ho-wallpapers');
      o.wallpapers.forEach(function (w, i) {
        var url = typeof w === 'string' ? w : w.url;
        var a = el('a', null, 'ho-wall');
        a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.title = 'Abrir imagem ' + (i + 1) + ' em nova aba';
        a.appendChild(img(url, 'Wallpaper ' + (i + 1) + ' de ' + cur.name));
        grid.appendChild(a);
      });
      card.appendChild(grid);
      card.appendChild(el('p', 'Imagens © Moonton, exibidas a partir do endereço oficial. Clique para abrir em tamanho original.', 'hc-muted ht-source'));
    }
    panel.appendChild(card);
  }
  Hub.register({ id: 'wallpapers', order: 85, label: 'Wallpapers', render: renderWallpapers });
})();