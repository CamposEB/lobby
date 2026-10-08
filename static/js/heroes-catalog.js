// /static/js/heroes-catalog.js
// Catálogo de heróis — estilo MLBBHub.
// Substitui a renderização do hero-hub.js na página #/heroes.
// Depende de: hero-catalog.js (HeroCatalog + index) e hero-official.js (cdnUrl).
(function () {
  'use strict';

  var RECENT_COUNT = 6;

  // ─── Estado dos filtros ───
  var state = {
    q: '',
    sort: 'name',
    role: '',
    lane: '',
    tier: '',
    difficulty: '',
    speciality: ''
  };

  var _all = null;   // cache da lista completa

  // ─── Helpers ───
  function $(id) { return document.getElementById(id); }
  function el(tag, text, cls) {
    var e = document.createElement(tag);
    if (text != null) e.textContent = String(text);
    if (cls) e.className = cls;
    return e;
  }
  function empty(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function imgUrl(url) {
    if (!url) return '';
    if (window.HeroCatalog && window.HeroCatalog.routeImg) {
      return window.HeroCatalog.routeImg(url);
    }
    return url;
  }

  function roleLabel(r) {
    return (window.HeroCatalog && window.HeroCatalog.roleLabel)
      ? window.HeroCatalog.roleLabel(r)
      : r;
  }

  function fmtPct(v) {
    if (v == null) return '—';
    return v.toFixed(1) + '%';
  }

  // ─── Carrega dados ───
  function carregar() {
    if (_all) return Promise.resolve(_all);
    return fetch('/static/data/official/index.json', { cache: 'force-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        _all = d.heroes || [];
        return _all;
      });
  }

  // ─── Popula os selects ───
  function uniq(arr) {
    var set = new Set();
    arr.forEach(function (v) { if (v) set.add(v); });
    return Array.from(set).sort();
  }

  function popularFiltros(heroes) {
    var roleSel = $('hcRole');
    if (roleSel && roleSel.children.length <= 1) {
      uniq(heroes.flatMap(function (h) { return h.roles || []; }))
        .forEach(function (r) {
          roleSel.appendChild(new Option(roleLabel(r), r.toLowerCase()));
        });
    }
    var specSel = $('hcSpeciality');
    if (specSel && specSel.children.length <= 1) {
      uniq(heroes.flatMap(function (h) { return h.speciality || []; }))
        .forEach(function (s) {
          specSel.appendChild(new Option(s, s));
        });
    }
  }

  // ─── Filtro + sort ───
  function applyFilters(heroes) {
    var q = state.q.toLowerCase().trim();
    var list = heroes.slice();

    if (q) {
      list = list.filter(function (h) {
        return h.name.toLowerCase().indexOf(q) !== -1;
      });
    }
    if (state.role) {
      list = list.filter(function (h) {
        return (h.roles || []).some(function (r) { return r.toLowerCase() === state.role; });
      });
    }
    if (state.lane) {
      list = list.filter(function (h) {
        return (h.lanes || []).some(function (l) { return l === state.lane; });
      });
    }
    if (state.tier) {
      list = list.filter(function (h) { return h.tier === state.tier; });
    }
    if (state.difficulty) {
      list = list.filter(function (h) { return h.difficulty_bucket === state.difficulty; });
    }
    if (state.speciality) {
      list = list.filter(function (h) {
        return (h.speciality || []).indexOf(state.speciality) !== -1;
      });
    }

    // Sort
    if (state.sort === 'name') {
      list.sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });
    } else if (state.sort === 'win') {
      list.sort(function (a, b) { return (b.win || 0) - (a.win || 0); });
    } else if (state.sort === 'pick') {
      list.sort(function (a, b) { return (b.pick || 0) - (a.pick || 0); });
    } else if (state.sort === 'ban') {
      list.sort(function (a, b) { return (b.ban || 0) - (a.ban || 0); });
    } else if (state.sort === 'recent') {
      list.sort(function (a, b) { return (b.hero_id || 0) - (a.hero_id || 0); });
    }

    return list;
  }

  // ─── Cria um card ───
  function makeCard(h) {
    var a = document.createElement('a');
    a.className = 'hc-card';
    a.href = '#/heroi/' + h.slug;
    a.setAttribute('data-slug', h.slug);

    // ─── Art ───
    var art = el('div', null, 'hc-card-art');

    var img = document.createElement('img');
    img.className = 'hc-card-bg';
    img.referrerPolicy = 'no-referrer';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = h.name;
    img.src = imgUrl(h.wallpaper || h.head || h.square);
    art.appendChild(img);

    // Tier badge
    if (h.tier) {
      var tier = el('span', h.tier, 'hc-card-tier');
      tier.setAttribute('data-tier', h.tier);
      art.appendChild(tier);
    }

    // Year badge
    if (h.released_year) {
      art.appendChild(el('span', h.released_year, 'hc-card-year'));
    }

    a.appendChild(art);

    // ─── Info ───
    var info = el('div', null, 'hc-card-info');

    var nameRow = el('div', null, 'hc-card-name-row');
    nameRow.appendChild(el('b', h.name, 'hc-card-name'));
    var arrow = el('span', null, 'hc-card-arrow');
    arrow.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9"/></svg>';
    nameRow.appendChild(arrow);
    info.appendChild(nameRow);

    if (h.roles && h.roles.length) {
      var rolesTxt = h.roles.map(roleLabel).join(' / ');
      info.appendChild(el('span', rolesTxt, 'hc-card-roles'));
    }

    // Stats row
    var stats = el('div', null, 'hc-card-stats');
    stats.appendChild(statCol('WIN',  h.win,  'win'));
    stats.appendChild(statCol('PICK', h.pick, 'pick'));
    stats.appendChild(statCol('BAN',  h.ban,  'ban'));
    info.appendChild(stats);

    a.appendChild(info);
    return a;
  }

  function statCol(label, value, kind) {
    var col = el('div', null, 'hc-stat');
    col.setAttribute('data-kind', kind);
    col.appendChild(el('small', label));
    col.appendChild(el('b', fmtPct(value)));
    return col;
  }

  // ─── Render: recentes ───
  function renderRecent(heroes) {
    var grid = $('hcRecent');
    if (!grid) return;
    empty(grid);

    var recent = heroes.slice()
      .sort(function (a, b) { return (b.hero_id || 0) - (a.hero_id || 0); })
      .slice(0, RECENT_COUNT);

    recent.forEach(function (h) { grid.appendChild(makeCard(h)); });
  }

  // ─── Render: todos ───
  function renderAll(heroes) {
    var grid = $('hcGrid');
    var counter = $('hcCount');
    var emptyMsg = $('hcEmpty');
    if (!grid) return;

    var filtered = applyFilters(heroes);
    empty(grid);

    filtered.forEach(function (h) { grid.appendChild(makeCard(h)); });

    if (counter) {
      counter.textContent = 'Mostrando ' + filtered.length + ' de ' + heroes.length + ' heróis';
    }
    if (emptyMsg) {
      emptyMsg.hidden = filtered.length > 0;
    }
  }

  // ─── Bind dos filtros ───
  function bindFiltros() {
    var search = $('hcSearch');
    if (search) {
      var t;
      search.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          state.q = search.value;
          renderAll(_all);
        }, 150);
      });
    }

    [
      ['hcSort',       'sort',       'name'],
      ['hcRole',       'role',       ''],
      ['hcLane',       'lane',       ''],
      ['hcTier',       'tier',       ''],
      ['hcDifficulty', 'difficulty', ''],
      ['hcSpeciality', 'speciality', '']
    ].forEach(function (p) {
      var sel = $(p[0]);
      if (!sel) return;
      sel.value = p[2];
      sel.addEventListener('change', function () {
        state[p[1]] = sel.value;
        renderAll(_all);
      });
    });
  }

  // ─── Init ───
    // ─── Init ───
  function init() {
    // Se a aba de heróis ainda não foi injetada no DOM, espera.
    if (!$('hcRecent') || !$('hcGrid')) return false;

    // Já iniciamos antes e continua tudo no lugar? Não repete.
    if (init.done && document.getElementById('hcGrid').childElementCount > 0) {
      return true;
    }
    init.done = true;

    // Bind só na primeira vez
    if (!init.bound) {
      bindFiltros();
      init.bound = true;
    }

    carregar().then(function (heroes) {
      popularFiltros(heroes);
      renderRecent(heroes);
      renderAll(heroes);
    }).catch(function (err) {
      console.error('[heroes-catalog] falha:', err);
      var grid = $('hcGrid');
      if (grid) {
        grid.replaceChildren();
        grid.appendChild(el('p', 'Falha ao carregar catálogo: ' + err.message, 'hc-empty'));
      }
    });
    return true;
  }

  // ─── Gatilhos ───
  // 1. Quando o catálogo base (índice) estiver pronto
  window.addEventListener('hero-catalog-ready', init);

  // 2. Quando o usuário abrir a aba de heróis (a view já foi injetada)
  window.addEventListener('society:tab', function (e) {
    if (e && e.detail === 'heroes') {
      // Pequeno delay: garante que o innerHTML foi aplicado
      setTimeout(init, 0);
    }
  });

  // 3. Tentativa imediata (caso a view já esteja no DOM)
  if (!init()) {
    // Se falhou por DOM ausente, tenta quando o app terminar de inicializar
    window.addEventListener('society-app-ready', function () {
      // Tenta também quando o hero-catalog base chegar
      setTimeout(init, 0);
    });
    // Última rede de segurança: poll leve por ~5s
    (function poll(n) {
      if (init()) return;
      if (n <= 0) return;
      setTimeout(function () { poll(n - 1); }, 250);
    })(20);
  }

  // API pública
  window.HeroesCatalog = {
    refresh: function () {
      _all = null;
      init.done = false;
      init();
    },
  };
})();