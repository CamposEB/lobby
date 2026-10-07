// /static/js/hero-tabs.js
// Abas extras da página do herói: Matchups, Guia, Skills, Stats, Skins, Lore
// + blocos da Visão geral (build dos pros, matchups, combo, dica) e selos do topo.
// Depende de: hero-hub.js (window.HeroHub), hero-contrib.js, hero-data.js.
(function () {
  'use strict';

  var Hub = window.HeroHub, HC = window.HeroCatalog, HX = window.HeroContrib, HD = window.HeroData;
  if (!Hub || !HX || !HD) { console.warn('[hero-tabs] dependências ausentes'); return; }

  var U = Hub.ui, el = U.el, S = function () { return window.Society; };
  var NS = 'http://www.w3.org/2000/svg';
  var cur = function () { return Hub.current(); };
  var net = function (e) { return Number(e.helpful || 0) - Number(e.not_helpful || 0); };

  // ───────────── utilidades ─────────────
  function writable() { return HX.status(cur().name) !== 'unavailable'; }

  function gate(panel) {
    var b = HX.statusBlock(cur().name);
    if (b) panel.appendChild(b);
  }

  function runHooks(name, panel) {
    (Hub.hooks[name] || []).forEach(function (fn) {
      try { var n = fn(); if (n) panel.appendChild(n); }
      catch (e) { console.error('[hero-tabs] hook ' + name, e); }
    });
  }

  function goTab(id) { return function () { Hub.setTab(id); window.scrollTo(0, 0); }; }

  function writeBox(summary, formEl) {
    var d = el('details', null, 'ht-write');
    d.appendChild(el('summary', summary));
    d.appendChild(formEl);
    return d;
  }

  function entryList(entries, max, opts) {
    var wrap = el('div', null, 'ht-entries');
    entries.slice(0, max).forEach(function (e) { wrap.appendChild(HX.entryCard(e, opts)); });
    if (entries.length > max) {
      var more = el('details', null, 'ht-more');
      more.appendChild(el('summary', 'Ver mais ' + (entries.length - max)));
      var inner = el('div', null, 'ht-entries');
      entries.slice(max).forEach(function (e) { inner.appendChild(HX.entryCard(e, opts)); });
      more.appendChild(inner);
      wrap.appendChild(more);
    }
    return wrap;
  }

  function sendContrib(extra) {
    return HX.submit(Object.assign({ hero: cur().name }, extra));
  }

  // ───────────── selos do topo ─────────────
  function verdict() {
    var items = U.heroMeta().concat(cur().builds);
    if (!items.length) return { text: 'Sem dados ainda', tone: 'muted', tip: 'Ninguém publicou builds ou meta para este herói.' };
    var p = U.pct(items);
    if (items.length < 3 || p == null) return { text: 'Poucos dados', tone: 'muted', tip: 'Poucas indicações para tirar conclusão.' };
    if (p >= 75) return { text: 'Aprovado pela comunidade', tone: 'green', tip: p + '% de votos positivos' };
    if (p >= 50) return { text: 'Em observação', tone: 'gold', tip: p + '% de votos positivos' };
    return { text: 'Contestado', tone: 'red', tip: p + '% de votos positivos' };
  }

  Hub.hooks.banner.push(function (main, row, facts) {
    var line = el('div', null, 'ht-badges');
    var v = verdict();
    var vb = el('span', 'Veredito: ' + v.text, 'ht-verdict is-' + v.tone);
    vb.title = v.tip;
    line.appendChild(vb);
    var h = HD.ready() ? HD.hero(cur().name) : null;
    ((h && h.spec) || []).forEach(function (s) { line.appendChild(el('span', HD.specPt(s), 'ht-spec')); });
    HD.proTiers(cur().name).forEach(function (p) {
      var b = el('span', 'Pro ' + p.tier + ' · ' + U.laneName(p.lane), 'ht-pro');
      b.title = 'Prioridade de pick no cenário profissional (MPL)';
      line.appendChild(b);
    });
    main.insertBefore(line, facts);
  });

  // ───────────── build de referência (pros) ─────────────
  var proIdx = 0;

  function proBuildBlock(b, heading) {
    var box = el('div', null, 'ht-pro-build');
    if (heading) box.appendChild(el('p', heading, 'hh-label'));
    var items = el('div', null, 'hh-items is-big');
    b.items.forEach(function (alts, i) {
      var cell = el('div', null, 'hh-item');
      var nm = HD.itemName(alts[0]);
      var ic = S().getIcon('itens', nm); ic.title = (i + 1) + '. ' + nm;
      cell.appendChild(ic);
      cell.appendChild(el('span', nm, 'hh-item-name'));
      if (alts.length > 1) cell.appendChild(el('span', 'ou ' + HD.itemName(alts[1]), 'ht-alt'));
      items.appendChild(cell);
    });
    box.appendChild(items);
    var cost = HD.costOfFiles(b.items);
    box.appendChild(el('p', 'Custo total: ' + HD.fmtGold(cost.total) + (cost.partial ? ' (aproximado)' : ''), 'hh-cost'));
    var gear = el('div', null, 'hh-gear-row');
    gear.appendChild(U.gearBox('emblemas', 'EMBLEMA', HD.emblemPt(b.emblem)));
    gear.appendChild(U.gearBox('feiticos', 'FEITIÇO', HD.spellPt(b.spell) || '—'));
    box.appendChild(gear);
    if (b.talents && b.talents.length) {
      var tal = el('div', null, 'ht-talents');
      tal.appendChild(el('small', 'TALENTOS'));
      b.talents.forEach(function (t) {
        var chip = el('span', t, 'ht-talent');
        var d = HD.talentDesc(t);
        if (d) chip.title = d;
        tal.appendChild(chip);
      });
      box.appendChild(tal);
    }
    return box;
  }

  function proCard() {
    var h = HD.ready() ? HD.hero(cur().name) : null;
    if (!h || !h.builds.length) return null;
    if (proIdx >= h.builds.length) proIdx = 0;
    var c = U.card('BUILD DE REFERÊNCIA', 'Setups usados no cenário profissional',
      h.builds.length > 1 ? U.linkBtn('Ver todas →', goTab('builds')) : null);
    c.appendChild(proBuildBlock(h.builds[proIdx]));
    if (h.builds.length > 1) {
      var strip = el('div', null, 'hh-others');
      strip.appendChild(el('small', 'VARIAÇÕES'));
      h.builds.forEach(function (b, i) {
        var chip = el('button', 'Setup ' + (i + 1), 'hh-chip-btn' + (i === proIdx ? ' is-on' : ''));
        chip.type = 'button';
        chip.addEventListener('click', function () { proIdx = i; Hub.rerender(); });
        strip.appendChild(chip);
      });
      c.appendChild(strip);
    }
    c.appendChild(el('p', 'Fonte: ' + HD.source() + '. Não é meta oficial da Moonton.', 'hc-muted ht-source'));
    return c;
  }

  Hub.hooks.overview.push(proCard);

  Hub.hooks.builds.push(function () {
    var h = HD.ready() ? HD.hero(cur().name) : null;
    if (!h || !h.builds.length) return null;
    var wrap = el('section', null, 'ht-pro-section');
    wrap.appendChild(el('h3', 'BUILDS DE REFERÊNCIA (PROS)', 'ht-section-title'));
    h.builds.forEach(function (b, i) {
      var c = el('article', null, 'hh-panel hh-list-card');
      c.appendChild(proBuildBlock(b, 'SETUP ' + (i + 1)));
      wrap.appendChild(c);
    });
    wrap.appendChild(el('p', 'Fonte: ' + HD.source() + '.', 'hc-muted ht-source'));
    return wrap;
  });

  // ───────────── blocos da visão geral (comunidade) ─────────────
  function groupTargets(kind) {
    var map = new Map();
    HX.byKind(cur().name, kind).forEach(function (e) {
      var k = HC.norm(e.target);
      if (!k) return;
      if (!map.has(k)) map.set(k, { target: e.target, entries: [], score: 0 });
      var g = map.get(k);
      g.entries.push(e);
      g.score += net(e) + 1;
    });
    return Array.from(map.values()).sort(function (a, b) { return b.score - a.score; });
  }

  function targetRow(g) {
    var r = el('div', null, 'hh-row');
    r.appendChild(U.portrait(g.target, 'hh-portrait-sm'));
    var copy = el('span', null, 'hh-row-copy');
    copy.append(el('b', g.target), el('small', g.entries.length + (g.entries.length === 1 ? ' relato' : ' relatos')));
    r.appendChild(copy);
    r.appendChild(el('span', (g.score >= 0 ? '▲ ' : '▼ ') + Math.abs(g.score), 'hh-row-score' + (g.score < 0 ? ' is-neg' : '')));
    return r;
  }

  Hub.hooks.overview.push(function () {
    var weak = groupTargets('counter_weak'), strong = groupTargets('counter_strong');
    var c = U.card('MATCHUPS', 'Segundo a comunidade', U.linkBtn('Ver tudo →', goTab('matchups')));
    if (!weak.length && !strong.length) {
      c.appendChild(U.emptyBlock('Ainda não há matchups para ' + cur().name + '.', writable() ? 'Contar minha experiência' : null, goTab('matchups')));
      return c;
    }
    var cols = el('div', null, 'ht-cols is-tight');
    [['SOFRE CONTRA', weak], ['SE DÁ BEM CONTRA', strong]].forEach(function (p) {
      var col = el('div', null, 'ht-col');
      col.appendChild(el('p', p[0], 'hh-label'));
      if (!p[1].length) col.appendChild(el('small', 'Sem relatos', 'hc-muted'));
      p[1].slice(0, 3).forEach(function (g) { col.appendChild(targetRow(g)); });
      cols.appendChild(col);
    });
    c.appendChild(cols);
    return c;
  });

  Hub.hooks.overview.push(function () {
    var combos = HX.byKind(cur().name, 'combo');
    var tips = HX.byKind(cur().name, ['guide_tips', 'guide_when', 'guide_spike']);
    if (!combos.length && !tips.length) return null;
    var c = U.card('DESTAQUES DA COMUNIDADE', 'Combo e dica mais bem votados');
    if (combos.length) {
      c.appendChild(el('p', 'COMBO', 'hh-label'));
      c.appendChild(HX.entryCard(combos[0]));
    }
    if (tips.length) {
      c.appendChild(el('p', 'DICA · ' + HX.KINDS[tips[0].kind].toUpperCase(), 'hh-label'));
      c.appendChild(HX.entryCard(tips[0]));
    }
    return c;
  });

  // ───────────── aba MATCHUPS ─────────────
  function renderMatchups(panel) {
    var name = cur().name;
    runHooks('matchups', panel);
    HX.ensure(name);
    gate(panel);
    var cols = el('div', null, 'ht-cols');
    [['counter_weak', 'SOFRE CONTRA', 'Heróis que costumam atrapalhar ' + name],
     ['counter_strong', 'SE DÁ BEM CONTRA', 'Heróis em que ' + name + ' leva vantagem']].forEach(function (d) {
      var c = U.card(d[1], d[2]);
      var groups = groupTargets(d[0]);
      if (!groups.length) c.appendChild(el('p', 'Sem relatos ainda.', 'hc-muted'));
      groups.forEach(function (g) {
        var det = el('details', null, 'ht-group');
        var sum = el('summary');
        sum.appendChild(targetRow(g));
        det.appendChild(sum);
        det.appendChild(entryList(g.entries.slice().sort(function (a, b) { return net(b) - net(a); }), 5));
        c.appendChild(det);
      });
      cols.appendChild(c);
    });
    panel.appendChild(cols);

    if (!writable()) return;
    var fc = U.card('CONTE SUA EXPERIÊNCIA', 'Um relato curto e específico ajuda mais que uma opinião geral');
    fc.appendChild(HX.form({
      fields: [
        { name: 'kind', label: 'Tipo', type: 'select', options: [['counter_weak', name + ' sofre contra...'], ['counter_strong', name + ' se dá bem contra...']] },
        { name: 'target', label: 'Herói', type: 'hero', placeholder: 'Buscar herói...' },
        { name: 'body', label: 'Por quê?', type: 'textarea', max: 280, min: 10, placeholder: 'Ex.: o controle dele cancela meu combo; fico sem escapatória...' },
        { name: 'patch', label: 'Patch', type: 'text', max: 24, required: false, placeholder: 'Ex.: S42' }
      ],
      submitText: 'Publicar relato',
      onSubmit: function (v) { return sendContrib({ kind: v.kind, target: v.target, body: v.body, patch: v.patch }); }
    }));
    panel.appendChild(fc);
  }

  // ───────────── aba GUIA ─────────────
  var GUIDE = [
    ['guide_when', 'Quando escolher', 'Em que situação vale pegar este herói? Contra quais composições?'],
    ['guide_laning', 'Fase de rota', 'Como jogar o começo da partida e o que evitar.'],
    ['guide_spike', 'Power spike', 'Em que momento (nível, itens, tempo) o herói fica forte?'],
    ['guide_position', 'Posicionamento', 'Onde ficar nas lutas e quem focar.'],
    ['guide_items', 'Itemização', 'Por que essa build? Quando trocar um item?'],
    ['guide_mistakes', 'Erros comuns', 'O que costuma dar errado com esse herói?'],
    ['guide_tips', 'Dicas', 'Truques rápidos que fazem diferença.']
  ];

  function renderGuide(panel) {
    var name = cur().name;
    HX.ensure(name);
    gate(panel);
    panel.appendChild(el('p', 'Guia escrito pela comunidade. Os textos são dos jogadores, não são oficiais; confira o patch e teste no seu elo.', 'hc-muted ht-intro'));
    var grid = el('div', null, 'ht-guide');
    GUIDE.forEach(function (g) {
      var entries = HX.byKind(name, g[0]);
      var c = U.card(g[1].toUpperCase(), g[2]);
      if (!entries.length) c.appendChild(el('p', 'Ninguém escreveu esta seção ainda.', 'hc-muted'));
      else c.appendChild(entryList(entries, 2));
      if (writable()) {
        c.appendChild(writeBox('+ Escrever esta seção', HX.form({
          fields: [
            { name: 'body', label: g[1], type: 'textarea', max: 700, min: 20, placeholder: g[2] },
            { name: 'patch', label: 'Patch', type: 'text', max: 24, required: false, placeholder: 'Ex.: S42' }
          ],
          submitText: 'Publicar',
          onSubmit: function (v) { return sendContrib({ kind: g[0], body: v.body, patch: v.patch }); }
        })));
      }
      grid.appendChild(c);
    });
    panel.appendChild(grid);
  }

  // ───────────── aba SKILLS (combos + habilidades) ─────────────
  var SKILLS = [['skill_p', 'Passiva'], ['skill_1', 'Skill 1'], ['skill_2', 'Skill 2'], ['skill_3', 'Skill 3'], ['skill_u', 'Ultimate']];

  function renderSkills(panel) {
    var name = cur().name;
    runHooks('skills', panel);
    HX.ensure(name);
    gate(panel);

    var combos = HX.byKind(name, 'combo');
    var cc = U.card('COMBOS', 'Sequências que funcionam em teamfight e em duelo');
    if (!combos.length) cc.appendChild(el('p', 'Nenhum combo publicado ainda.', 'hc-muted'));
    else cc.appendChild(entryList(combos, 3));
    if (writable()) {
      cc.appendChild(writeBox('+ Compartilhar um combo', HX.form({
        fields: [
          { name: 'steps', label: 'Sequência', type: 'steps' },
          { name: 'body', label: 'Quando usar', type: 'textarea', max: 280, required: false, placeholder: 'Contra quem, em que situação, o que cuidar...' }
        ],
        submitText: 'Publicar combo',
        onSubmit: function (v) { return sendContrib({ kind: 'combo', steps: v.steps, body: v.body }); }
      })));
    }
    panel.appendChild(cc);

    var grid = el('div', null, 'ht-guide');
    SKILLS.forEach(function (sk) {
      var entries = HX.byKind(name, sk[0]);
      var c = U.card(sk[1].toUpperCase(), 'Como funciona e como aproveitar');
      if (!entries.length) c.appendChild(el('p', 'Sem descrição da comunidade ainda.', 'hc-muted'));
      else c.appendChild(entryList(entries, 2));
      if (writable()) {
        c.appendChild(writeBox('+ Descrever ' + sk[1], HX.form({
          fields: [{ name: 'body', label: 'Descrição e dicas', type: 'textarea', max: 600, min: 20, placeholder: 'Explique com suas palavras: efeito, alcance, dicas de uso...' }],
          submitText: 'Publicar',
          hint: 'Use suas palavras; não copie a descrição de outros sites ou do jogo.',
          onSubmit: function (v) { return sendContrib({ kind: sk[0], body: v.body }); }
        })));
      }
      grid.appendChild(c);
    });
    panel.appendChild(grid);
  }

  // ───────────── aba STATS ─────────────
  function svg(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  function radar(values, labels) {
    var size = 280, c = size / 2, r = 90, n = values.length;
    var root = svg('svg', { viewBox: '0 0 ' + size + ' ' + size, class: 'ht-radar', role: 'img',
      'aria-label': 'Radar Society: ' + labels.map(function (l, i) { return l + ' ' + Math.round(values[i]) + '%'; }).join(', ') });
    var pt = function (i, k) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / n;
      return [c + Math.cos(a) * r * k, c + Math.sin(a) * r * k];
    };
    [0.25, 0.5, 0.75, 1].forEach(function (k) {
      var pts = values.map(function (_, i) { return pt(i, k).join(','); }).join(' ');
      root.appendChild(svg('polygon', { points: pts, class: 'ht-radar-grid' }));
    });
    values.forEach(function (_, i) {
      var p = pt(i, 1);
      root.appendChild(svg('line', { x1: c, y1: c, x2: p[0], y2: p[1], class: 'ht-radar-grid' }));
      var lp = pt(i, 1.2);
      var t = svg('text', { x: lp[0], y: lp[1], class: 'ht-radar-label', 'text-anchor': lp[0] < c - 4 ? 'end' : lp[0] > c + 4 ? 'start' : 'middle', 'dominant-baseline': 'middle' });
      t.textContent = labels[i];
      root.appendChild(t);
    });
    root.appendChild(svg('polygon', { points: values.map(function (v, i) { return pt(i, Math.max(0.03, v / 100)).join(','); }).join(' '), class: 'ht-radar-shape' }));
    values.forEach(function (v, i) {
      var p = pt(i, Math.max(0.03, v / 100));
      root.appendChild(svg('circle', { cx: p[0], cy: p[1], r: 3.5, class: 'ht-radar-dot' }));
    });
    return root;
  }

  function topCounts(list, pick, limit) {
    var count = {}, total = list.length;
    list.forEach(function (b) {
      var seen = {};
      pick(b).forEach(function (x) {
        if (!x || seen[x]) return;
        seen[x] = 1;
        count[x] = (count[x] || 0) + 1;
      });
    });
    return Object.keys(count).map(function (k) { return { name: k, n: count[k], pct: Math.round(count[k] * 100 / total) }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, limit);
  }

  function renderStats(panel) {
    var name = cur().name;
    runHooks('stats', panel);
    var meta = U.heroMeta(), builds = cur().builds, contribs = HX.all(name);
    var lanes = U.LANES.filter(function (l) {
      return meta.some(function (e) { return e.lane === l; }) || builds.some(function (b) { return b.lane === l; });
    });
    var all = meta.concat(builds);
    var latestPatch = all.slice().sort(U.newest)[0];
    var fresh = latestPatch ? Math.round(all.filter(function (e) { return e.patch === latestPatch.patch; }).length * 100 / all.length) : 0;
    var values = [U.pct(builds) || 0, U.pct(meta) || 0, lanes.length * 100 / U.LANES.length,
      Math.min(100, (builds.length + meta.length + contribs.length) * 10), fresh];
    var labels = ['Builds', 'Meta', 'Rotas', 'Atividade', 'Frescor'];

    var grid = el('div', null, 'ht-stats');

    var rc = U.card('RADAR SOCIETY', 'Resumo visual da comunidade sobre ' + name);
    rc.appendChild(radar(values, labels));
    rc.appendChild(el('p', 'Builds e Meta: % de votos positivos. Rotas: quantas das 5 rotas têm indicações. Atividade: volume de contribuições. Frescor: parte das indicações no patch mais recente.', 'hc-muted ht-source'));
    grid.appendChild(rc);

    var tc = U.card('TIERS VOTADOS', 'Indicações de meta por tier');
    if (!meta.length) tc.appendChild(el('p', 'Sem indicações de meta ainda.', 'hc-muted'));
    ['S', 'A', 'B'].forEach(function (t) {
      var n = meta.filter(function (e) { return String(e.tier).charAt(0).toUpperCase() === t; }).length;
      if (meta.length) tc.appendChild(U.bar('TIER ' + t, Math.round(n * 100 / meta.length), t === 'S' ? 'is-gold' : t === 'A' ? 'is-green' : 'is-blue'));
    });
    var lc = el('div', null, 'ht-lane-bars');
    lc.appendChild(el('p', 'ROTAS INDICADAS', 'hh-label'));
    U.LANES.forEach(function (l) {
      var n = meta.filter(function (e) { return e.lane === l; }).length + builds.filter(function (b) { return b.lane === l; }).length;
      var tot = meta.length + builds.length;
      lc.appendChild(U.bar(U.laneName(l).toUpperCase(), tot ? Math.round(n * 100 / tot) : 0, 'is-blue'));
    });
    tc.appendChild(lc);
    grid.appendChild(tc);

    var ic = U.card('ITENS MAIS USADOS', 'Nas builds da comunidade');
    var items = topCounts(builds, function (b) { return b.items || []; }, 6);
    if (!items.length) ic.appendChild(el('p', 'Sem builds publicadas ainda.', 'hc-muted'));
    items.forEach(function (it) {
      var row = el('div', null, 'hh-row');
      row.appendChild(S().getIcon('itens', it.name));
      var copy = el('span', null, 'hh-row-copy'); copy.appendChild(el('b', it.name));
      row.appendChild(copy);
      row.appendChild(el('span', it.pct + '%', 'hh-row-score'));
      ic.appendChild(row);
    });
    var sp = topCounts(builds, function (b) { return [b.spell]; }, 1)[0];
    var em = topCounts(builds, function (b) { return [b.emblem]; }, 1)[0];
    if (sp || em) {
      var gr = el('div', null, 'hh-gear-row');
      if (em) gr.appendChild(U.gearBox('emblemas', 'EMBLEMA MAIS USADO', em.name));
      if (sp) gr.appendChild(U.gearBox('feiticos', 'FEITIÇO MAIS USADO', sp.name));
      ic.appendChild(gr);
    }
    grid.appendChild(ic);

    var h = HD.ready() ? HD.hero(name) : null;
    if (h) {
      var pc = U.card('NO CENÁRIO PRO', 'Dados de referência (MPL)');
      var tiers = HD.proTiers(name);
      var tl = el('div', null, 'ht-badges');
      if (tiers.length) tiers.forEach(function (p) { tl.appendChild(el('span', 'Prioridade ' + p.tier + ' · ' + U.laneName(p.lane), 'ht-pro')); });
      else tl.appendChild(el('span', 'Fora da lista de prioridade do MPL', 'ht-spec'));
      pc.appendChild(tl);
      HD.proItemPopularity(name).slice(0, 6).forEach(function (it) {
        var row = el('div', null, 'hh-row');
        row.appendChild(S().getIcon('itens', HD.itemName(it.file)));
        var copy = el('span', null, 'hh-row-copy');
        copy.append(el('b', HD.itemName(it.file)), el('small', HD.fmtGold(HD.priceOf(it.file) || 0)));
        row.appendChild(copy);
        row.appendChild(el('span', it.pct + '%', 'hh-row-score'));
        pc.appendChild(row);
      });
      pc.appendChild(el('p', 'Fonte: ' + HD.source() + '.', 'hc-muted ht-source'));
      grid.appendChild(pc);
    }
    panel.appendChild(grid);
  }

  // ───────────── abas SKINS e LORE ─────────────
  function renderSkins(panel) {
    var name = cur().name;
    HX.ensure(name);
    gate(panel);
    var entries = HX.byKind(name, 'skin');
    var c = U.card('SKINS', 'Skins de ' + name + ' que a comunidade recomenda ou comenta');
    if (!entries.length) c.appendChild(el('p', 'Nenhuma skin cadastrada ainda.', 'hc-muted'));
    else {
      var list = el('div', null, 'ht-entries');
      entries.forEach(function (e) { list.appendChild(HX.entryCard(e, { badge: e.target || 'Skin' })); });
      c.appendChild(list);
    }
    if (writable()) {
      c.appendChild(writeBox('+ Indicar uma skin', HX.form({
        fields: [
          { name: 'target', label: 'Nome da skin', type: 'text', max: 60, placeholder: 'Nome como aparece no jogo' },
          { name: 'body', label: 'O que você achou?', type: 'textarea', max: 300, required: false, placeholder: 'Efeitos, visual, vale a pena?' }
        ],
        submitText: 'Publicar',
        onSubmit: function (v) { return sendContrib({ kind: 'skin', target: v.target, body: v.body }); }
      })));
    }
    panel.appendChild(c);
  }

  function renderLore(panel) {
    var name = cur().name;
    HX.ensure(name);
    gate(panel);
    var entries = HX.byKind(name, 'lore');
    var c = U.card('LORE', 'História e curiosidades de ' + name + ', contadas pela comunidade');
    if (!entries.length) c.appendChild(el('p', 'Ninguém contou a história deste herói ainda.', 'hc-muted'));
    else c.appendChild(entryList(entries, 3));
    if (writable()) {
      c.appendChild(writeBox('+ Contar a história', HX.form({
        fields: [{ name: 'body', label: 'História ou curiosidade', type: 'textarea', max: 700, min: 40, placeholder: 'Escreva com suas palavras, sem copiar textos do jogo ou de outros sites.' }],
        submitText: 'Publicar',
        onSubmit: function (v) { return sendContrib({ kind: 'lore', body: v.body }); }
      })));
    }
    panel.appendChild(c);
  }

  // ───────────── registro ─────────────
  var count = function (kinds) { return function () { var n = HX.byKind(cur().name, kinds).length; return n ? ' (' + n + ')' : ''; }; };
  var matchCount = count(['counter_weak', 'counter_strong']);
  Hub.register({ id: 'matchups', order: 40, label: function () { return 'Matchups' + matchCount(); }, render: renderMatchups });
  Hub.register({ id: 'guide', order: 50, label: 'Guia', render: renderGuide });
  Hub.register({ id: 'skills', order: 60, label: 'Skills', render: renderSkills });
  Hub.register({ id: 'stats', order: 70, label: 'Stats', render: renderStats });
  Hub.register({ id: 'skins', order: 80, label: 'Skins', render: renderSkins });
  Hub.register({ id: 'lore', order: 90, label: 'Lore', render: renderLore });

  // carrega os dados fixos assim que o app estiver pronto
  function boot() { HD.load(); }
  if (window.Society) boot(); else window.addEventListener('society-app-ready', boot, { once: true });
})();