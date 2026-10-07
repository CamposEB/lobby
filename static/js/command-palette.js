// /static/js/command-palette.js
// Busca rápida (Ctrl/⌘+K, "/" ou clique na barra do topo): páginas, heróis, builds e meta.
// Depende de: window.Society (ponte do app.js) e window.HeroCatalog.
(function () {
  'use strict';

  var HC = window.HeroCatalog;
  var S = function () { return window.Society; };
  var $ = function (id) { return document.getElementById(id); };
  var norm = function (s) { return HC.norm(s); };

  var root, input, list, hint;
  var items = [];
  var active = 0;
  var isOpen = false;
  var prevFocus = null;

  function el(tag, text, cls) {
    var e = document.createElement(tag);
    if (text != null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  // ───────────── montagem ─────────────
  function build() {
    if (root) return;
    root = el('div', null, 'cmdk');
    root.id = 'cmdk';
    root.hidden = true;

    var backdrop = el('div', null, 'cmdk-backdrop');
    backdrop.addEventListener('mousedown', close);

    var box = el('div', null, 'cmdk-box');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Busca rápida');

    var top = el('div', null, 'cmdk-input');
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'cmdk-search-ico');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4.2 4.2"/>';
    input = el('input');
    input.id = 'cmdkInput';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Busque heróis, páginas, builds...';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', 'cmdkList');
    input.setAttribute('aria-autocomplete', 'list');
    top.append(svg, input);

    list = el('div', null, 'cmdk-list');
    list.id = 'cmdkList';
    list.setAttribute('role', 'listbox');

    var foot = el('div', null, 'cmdk-foot');
    hint = el('span', 'Digite para buscar', 'cmdk-hint');
    var keys = el('span', null, 'cmdk-keys');
    [['↑↓', 'navegar'], ['↵', 'selecionar'], ['esc', 'fechar']].forEach(function (k) {
      keys.append(el('kbd', k[0]), document.createTextNode(' ' + k[1] + '  '));
    });
    foot.append(hint, keys);

    box.append(top, list, foot);
    root.append(backdrop, box);
    document.body.appendChild(root);

    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('keydown', onKey);
  }

  // ───────────── fontes de resultado ─────────────
  function iconFromNav(btn) {
    var svg = btn.querySelector('svg');
    if (svg) {
      var c = svg.cloneNode(true);
      c.setAttribute('class', 'cmdk-ico');
      c.setAttribute('aria-hidden', 'true');
      return c;
    }
    var av = btn.querySelector('.nav-profile-avatar');
    return el('span', av ? av.textContent : '•', 'cmdk-ico-text');
  }

  function pages() {
    return Array.prototype.slice.call(document.querySelectorAll('#nav button[data-t]'))
      .filter(function (b) { return !b.hidden; })
      .map(function (b) {
        var t = b.querySelector('b');
        var s = b.querySelector('small');
        return {
          group: 'Páginas',
          title: t ? t.textContent : b.dataset.t,
          sub: s ? s.textContent : '',
          icon: iconFromNav(b),
          run: function () { S().tab(b.dataset.t); }
        };
      });
  }

  function heroThumb(name) {
    var wrap = el('span', null, 'cmdk-thumb');
    var h = HC.find(name);
    if (h && h.file) {
      var img = new Image();
      img.alt = '';
      img.src = HC.imageUrl(h);
      img.addEventListener('error', function () { wrap.textContent = name.slice(0, 2).toUpperCase(); }, { once: true });
      wrap.appendChild(img);
    } else {
      wrap.textContent = String(name).slice(0, 2).toUpperCase();
    }
    return wrap;
  }

  function knownBuilds() {
    var st = S().state();
    var map = new Map();
    [].concat(st.builds || [], st.trending || [], st.recent || []).forEach(function (b) { map.set(b.id, b); });
    return Array.from(map.values());
  }

  function search(q) {
    var n = norm(q);
    var out = [];

    var pg = pages().filter(function (p) { return norm(p.title + ' ' + p.sub).indexOf(n) !== -1; });
    out = out.concat(pg);

    var heroes = HC.all().filter(function (h) {
      return norm(h.name).indexOf(n) !== -1 ||
        h.roles.some(function (r) { return norm(HC.roleLabel(r)).indexOf(n) !== -1; });
    }).sort(function (a, b) {
      var as = norm(a.name).indexOf(n) === 0 ? 0 : 1, bs = norm(b.name).indexOf(n) === 0 ? 0 : 1;
      return as - bs || a.name.localeCompare(b.name, 'pt-BR');
    }).slice(0, 6);
    heroes.forEach(function (h) {
      out.push({
        group: 'Heróis', title: h.name,
        sub: h.roles.map(function (r) { return HC.roleLabel(r); }).join(' / '),
        icon: heroThumb(h.name),
        run: function () { window.SocietyHero ? window.SocietyHero.open(h.name) : S().tab('heroes'); }
      });
    });

    knownBuilds().filter(function (b) {
      return norm([b.hero, b.author, b.patch, S().laneName(b.lane)].join(' ')).indexOf(n) !== -1;
    }).slice(0, 4).forEach(function (b) {
      out.push({
        group: 'Builds', title: b.hero + ' · ' + S().laneName(b.lane),
        sub: 'Build por ' + b.author + ' · ' + b.patch,
        icon: heroThumb(b.hero),
        run: function () { window.SocietyHero ? window.SocietyHero.open(b.hero, b.id) : S().tab('builds'); }
      });
    });

    (S().state().meta || []).filter(function (e) {
      return norm([e.hero, e.patch, S().laneName(e.lane)].join(' ')).indexOf(n) !== -1;
    }).slice(0, 3).forEach(function (e) {
      out.push({
        group: 'Meta', title: e.hero + ' · Tier ' + e.tier,
        sub: S().laneName(e.lane) + ' · ' + e.patch,
        icon: heroThumb(e.hero),
        run: function () { window.SocietyHero ? window.SocietyHero.open(e.hero, null, 'meta') : S().tab('meta'); }
      });
    });

    out.push({
      group: 'Buscar em', title: 'Procurar “' + q.trim() + '” nas builds',
      sub: 'Abre a lista de builds filtrada', icon: el('span', '↗', 'cmdk-ico-text'),
      run: function () { S().searchBuilds(q.trim()); }
    });
    return out;
  }

  // ───────────── render ─────────────
  function render(q) {
    var query = (q || '').trim();
    items = query ? search(query) : pages().map(function (p) { p.group = 'Links rápidos'; return p; });
    list.replaceChildren();
    var lastGroup = '';
    items.forEach(function (it, i) {
      if (it.group !== lastGroup) {
        lastGroup = it.group;
        list.appendChild(el('div', it.group.toUpperCase(), 'cmdk-group'));
      }
      var row = el('div', null, 'cmdk-item');
      row.id = 'cmdk-opt-' + i;
      row.setAttribute('role', 'option');
      var ic = el('span', null, 'cmdk-icon');
      ic.appendChild(it.icon);
      var copy = el('span', null, 'cmdk-copy');
      copy.append(el('b', it.title), el('small', it.sub));
      row.append(ic, copy, el('span', '→', 'cmdk-arrow'));
      row.addEventListener('mousemove', function () { if (active !== i) setActive(i, false); });
      row.addEventListener('mousedown', function (e) { e.preventDefault(); });
      row.addEventListener('click', function () { choose(i); });
      list.appendChild(row);
    });
    var results = query ? Math.max(0, items.length - 1) : 0;
    hint.textContent = query
      ? (results ? results + (results === 1 ? ' resultado' : ' resultados') : 'Nenhum resultado direto')
      : 'Digite para buscar';
    setActive(0, true);
  }

  function setActive(i, scroll) {
    active = i;
    var rows = list.querySelectorAll('.cmdk-item');
    rows.forEach(function (r, k) {
      var on = k === i;
      r.classList.toggle('is-active', on);
      r.setAttribute('aria-selected', String(on));
      if (on) {
        input.setAttribute('aria-activedescendant', r.id);
        if (scroll !== false) r.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function choose(i) {
    var it = items[i];
    if (!it) return;
    close(true);
    it.run();
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length) setActive((active + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length) setActive((active - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  }

  // ───────────── abrir / fechar ─────────────
  function loggedIn() {
    var g = $('game');
    return g && getComputedStyle(g).display !== 'none';
  }

  function open(q) {
    if (!window.Society || !loggedIn()) return;
    build();
    if (isOpen) { input.focus(); return; }
    isOpen = true;
    prevFocus = document.activeElement;
    var topInput = $('topbarSearchInput');
    if (topInput && prevFocus === topInput) { topInput.blur(); prevFocus = null; }
    root.hidden = false;
    document.body.classList.add('cmdk-open');
    input.value = q || '';
    render(input.value);
    input.focus();
  }

  function close(skipRestore) {
    if (!isOpen) return;
    isOpen = false;
    root.hidden = true;
    document.body.classList.remove('cmdk-open');
    if (!skipRestore && prevFocus && prevFocus.focus && document.contains(prevFocus)) {
      try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignora */ }
    }
    prevFocus = null;
  }

  function isTyping(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  function init() {
    if (init.done) return;
    init.done = true;

    var topInput = $('topbarSearchInput');
    if (topInput) {
      topInput.placeholder = 'Buscar heróis, páginas, builds...';
      topInput.setAttribute('aria-label', 'Abrir busca rápida');
      topInput.addEventListener('focus', function () { open(topInput.value); topInput.value = ''; });
      topInput.addEventListener('click', function () { open(''); });
    }

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault();
        isOpen ? close() : open('');
      } else if (e.key === '/' && !isTyping(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        open('');
      }
    });

    window.SocietyPalette = { open: open, close: close };
  }

  if (window.Society) init();
  else window.addEventListener('society-app-ready', init, { once: true });
})();