// /static/js/hero-data.js
// Dados fixos por herói (dataset MIT Ceplin03/database-mlbb): especialidade, builds de referência (pros),
// preço dos itens e prioridade de pick do MPL. Carrega /static/data/hero-extra.json sob demanda.
// Gerar/atualizar o JSON: python3 tools/build_hero_data.py <repo-clonado> static/data/hero-extra.json
(function () {
  'use strict';
  var HC = window.HeroCatalog;
  var DATA_URL = '/static/data/hero-extra.json';
  var data = null, loading = null;

  var SPEC_PT = {
    'Burst': 'Explosão', 'Charge': 'Investida', 'Chase': 'Perseguição', 'Control': 'Controle',
    'Crowd Control': 'Controle de grupo', 'Damage': 'Dano', 'Finisher': 'Finalizador', 'Guard': 'Proteção',
    'Initiator': 'Iniciador', 'Jungle': 'Selva', 'Magic Damage': 'Dano mágico', 'Mixed Damage': 'Dano misto',
    'Poke': 'Poke', 'Push': 'Empurrar', 'Regen': 'Regeneração', 'Support': 'Suporte'
  };
  var EMBLEM_PT = {
    'Basic Common Emblem': 'Emblema Comum', 'Custom Tank Emblem': 'Emblema de Tanque',
    'Custom Assassin Emblem': 'Emblema de Assassino', 'Custom Mage Emblem': 'Emblema de Mago',
    'Custom Fighter Emblem': 'Emblema de Lutador', 'Custom Support Emblem': 'Emblema de Suporte',
    'Custom Marksman Emblem': 'Emblema de Atirador', 'Custom Magic Emblem': 'Emblema de Mago',
    'Custom Physical Emblem': 'Emblema Físico'
  };
  var SPELL_PT = {
    'Retribution': 'Retribuição', 'Bloody Retribution': 'Retribuição Sangrenta',
    'Flame Retribution': 'Retribuição de Fogo', 'Ice Retribution': 'Retribuição de Gelo'
  };
  var DRAFT_LANE = { EXP: 'exp_lane', Jungle: 'jungler', Mid: 'mid_lane', Gold: 'gold_lane', Roam: 'roamer' };

  function load() {
    if (loading) return loading;
    loading = fetch(DATA_URL, { cache: 'default' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { data = d; })
      .catch(function (e) { console.warn('[hero-data] indisponível:', e.message); data = null; })
      .then(function () { window.dispatchEvent(new CustomEvent('hero-data-ready')); });
    return loading;
  }

  function hero(name) { return data && data.heroes ? data.heroes[HC.norm(name)] || null : null; }
  function priceOf(file) { return data && data.prices[file] ? data.prices[file].g : null; }

  function itemName(file) {
    var pt = window.Society && window.Society.itemName ? window.Society.itemName(file) : null;
    return pt || (data && data.prices[file] ? data.prices[file].n : file);
  }

  // custo de uma build de referência: usa a 1ª opção de cada slot
  function costOfFiles(slots) {
    var total = 0, partial = false;
    slots.forEach(function (alts) {
      var p = priceOf(alts[0]);
      if (p == null) partial = true; else total += p;
    });
    return { total: total, partial: partial };
  }

  // custo de uma build da comunidade (nomes em PT -> arquivo -> preço)
  function communityCost(names, itemFile) {
    var total = 0, partial = false;
    (names || []).forEach(function (n) {
      var f = itemFile ? itemFile(n) : null;
      var p = f ? priceOf(f) : null;
      if (p == null) partial = true; else total += p;
    });
    return { total: total, partial: partial };
  }

  // prioridade pro por rota: [{lane, tier}]
  function proTiers(name) {
    var out = [];
    if (!data || !data.draft) return out;
    Object.keys(DRAFT_LANE).forEach(function (lane) {
      var map = data.draft[DRAFT_LANE[lane]] || {};
      Object.keys(map).forEach(function (h) {
        if (HC.norm(h) === HC.norm(name)) out.push({ lane: lane, tier: map[h] });
      });
    });
    return out;
  }

  // itens mais frequentes nas builds de referência
  function proItemPopularity(name) {
    var h = hero(name), count = {}, total = 0;
    if (!h) return [];
    h.builds.forEach(function (b) {
      total++;
      b.items.forEach(function (alts) { count[alts[0]] = (count[alts[0]] || 0) + 1; });
    });
    return Object.keys(count).map(function (f) { return { file: f, pct: Math.round(count[f] * 100 / total) }; })
      .sort(function (a, b) { return b.pct - a.pct; });
  }

  window.HeroData = {
    load: load,
    ready: function () { return !!data; },
    hero: hero,
    priceOf: priceOf,
    itemName: itemName,
    costOfFiles: costOfFiles,
    communityCost: communityCost,
    proTiers: proTiers,
    proItemPopularity: proItemPopularity,
    specPt: function (s) { return SPEC_PT[s] || s; },
    emblemPt: function (e) { return EMBLEM_PT[e] || e; },
    spellPt: function (s) { return SPELL_PT[s] || s; },
    talentDesc: function (t) { return data && data.talents ? data.talents[t] || '' : ''; },
    source: function () { return data ? data.source : ''; },
    fmtGold: function (n) { return Number(n).toLocaleString('pt-BR') + 'g'; }
  };
})();