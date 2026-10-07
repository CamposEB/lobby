// /static/js/hero-contrib.js
// Contribuições da comunidade por herói (matchups, combos, guia, skills, skins, lore).
// Protocolo WebSocket: veja SERVIDOR-heroi-contrib.md.
// Depende de: window.Society (ponte do app.js) e window.HeroCatalog.
(function () {
  'use strict';

  var HC = window.HeroCatalog;
  var S = function () { return window.Society; };

  var KINDS = {
    counter_weak:   'Sofre contra',
    counter_strong: 'Se dá bem contra',
    combo:          'Combo',
    guide_when:     'Quando escolher',
    guide_laning:   'Fase de rota',
    guide_spike:    'Power spike',
    guide_position: 'Posicionamento',
    guide_items:    'Itemização',
    guide_mistakes: 'Erros comuns',
    guide_tips:     'Dicas',
    skill_p:        'Passiva',
    skill_1:        'Skill 1',
    skill_2:        'Skill 2',
    skill_3:        'Skill 3',
    skill_u:        'Ultimate',
    skin:           'Skin',
    lore:           'Lore'
  };
  var STEP_LABEL = { P: 'Passiva', '1': 'Skill 1', '2': 'Skill 2', '3': 'Skill 3', U: 'Ultimate', A: 'Ataque básico', F: 'Feitiço' };
  var STEP_SHORT = { P: 'P', '1': '1', '2': '2', '3': '3', U: 'ULT', A: 'AT', F: 'FEIT' };

  // estado por herói: { status:'idle'|'loading'|'ready'|'unavailable', list:[], at:ms, timer }
  var store = new Map();
  var key = function (name) { return HC.norm(name); };

  function el(tag, text, cls) {
    var e = document.createElement(tag);
    if (text != null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }
  function emit() { window.dispatchEvent(new CustomEvent('hero-contrib-updated')); }
  function toast(msg) { try { S().toast(msg); } catch (e) { /* ignora */ } }

  function slot(hero) {
    var k = key(hero);
    if (!store.has(k)) store.set(k, { status: 'idle', list: [], at: 0, timer: null });
    return store.get(k);
  }

  function request(hero) {
    var st = slot(hero);
    clearTimeout(st.timer);
    var ok = S().send({ t: 'hero_contrib_list', hero: hero });
    if (!ok) { st.status = st.list.length ? 'ready' : 'unavailable'; emit(); return; }
    if (st.status !== 'ready') st.status = 'loading';
    // servidor sem suporte não responde: avisa depois de 6s
    st.timer = setTimeout(function () {
      if (st.status === 'loading') { st.status = 'unavailable'; emit(); }
    }, 6000);
  }

  function ensure(hero, force) {
    var st = slot(hero);
    if (force || st.status === 'idle' || st.status === 'unavailable' || Date.now() - st.at > 60000) request(hero);
  }

  function status(hero) { return slot(hero).status; }
  function all(hero) { return slot(hero).list; }
  function byKind(hero, kinds) {
    var set = Array.isArray(kinds) ? kinds : [kinds];
    return all(hero).filter(function (e) { return set.indexOf(e.kind) !== -1; }).sort(function (a, b) {
      return (b.helpful - b.not_helpful) - (a.helpful - a.not_helpful) || Number(b.created_at) - Number(a.created_at);
    });
  }

  function submit(payload) {
    var ok = S().send(Object.assign({ t: 'hero_contrib_submit' }, payload));
    if (!ok) toast('Sem conexão com o servidor. Tente novamente.');
    return ok;
  }

  function vote(entry, value) {
    var next = entry.my_vote === value ? 0 : value;
    if (!S().send({ t: 'hero_contrib_vote', id: entry.id, value: next })) { toast('Sem conexão com o servidor.'); return; }
    setTimeout(function () { request(entry.hero); }, 500);
  }

  // ───────────── widgets ─────────────
  function stepsView(steps) {
    var wrap = el('div', null, 'hc-steps');
    (steps || []).forEach(function (s, i) {
      if (i) wrap.appendChild(el('span', '→', 'hc-step-arrow'));
      var chip = el('span', STEP_SHORT[s] || s, 'hc-step hc-step-' + s);
      chip.title = STEP_LABEL[s] || s;
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function voteBox(entry) {
    var box = el('div', null, 'hc-votes');
    var up = el('button', '▲ ' + Number(entry.helpful || 0), 'hc-vote' + (entry.my_vote === 1 ? ' is-on' : ''));
    var down = el('button', '▼ ' + Number(entry.not_helpful || 0), 'hc-vote is-down' + (entry.my_vote === -1 ? ' is-on' : ''));
    up.type = down.type = 'button';
    up.title = 'Útil'; down.title = 'Não ajudou';
    up.setAttribute('aria-pressed', String(entry.my_vote === 1));
    down.setAttribute('aria-pressed', String(entry.my_vote === -1));
    up.addEventListener('click', function () { vote(entry, 1); });
    down.addEventListener('click', function () { vote(entry, -1); });
    box.append(up, down);
    return box;
  }

  function entryCard(entry, opts) {
    opts = opts || {};
    var c = el('article', null, 'hc-entry');
    var head = el('header', null, 'hc-entry-head');
    var who = el('span', null, 'hc-who');
    who.append(el('b', entry.author || 'Jogador da comunidade'),
      document.createTextNode(' · ' + S().relDate(entry.created_at) + (entry.patch ? ' · ' + entry.patch : '')));
    head.appendChild(who);
    if (opts.badge) head.appendChild(el('span', opts.badge, 'hc-badge'));
    c.appendChild(head);
    if (entry.steps && entry.steps.length) c.appendChild(stepsView(entry.steps));
    if (entry.body) c.appendChild(el('p', entry.body, 'hc-body'));
    c.appendChild(voteBox(entry));
    return c;
  }

  // formulário genérico
  // fields: [{name,label,type:'text'|'textarea'|'select'|'hero'|'steps', max, min, options:[[v,label]], required, placeholder, value}]
  function form(opts) {
    var f = el('form', null, 'hc-form');
    var controls = {};
    var steps = [];

    (opts.fields || []).forEach(function (fd) {
      var label = el('label', null, 'hc-field' + (fd.type === 'textarea' || fd.type === 'steps' ? ' is-wide' : ''));
      label.appendChild(el('span', fd.label + (fd.required === false ? ' (opcional)' : ''), 'hc-field-label'));
      var ctl;
      if (fd.type === 'textarea') {
        ctl = el('textarea'); ctl.rows = 3; ctl.maxLength = fd.max || 600;
      } else if (fd.type === 'select') {
        ctl = el('select');
        (fd.options || []).forEach(function (o) { ctl.appendChild(new Option(o[1], o[0])); });
      } else if (fd.type === 'hero') {
        ctl = el('input'); ctl.type = 'text'; ctl.maxLength = 40; ctl.setAttribute('list', 'hcHeroList');
        ensureHeroList();
      } else if (fd.type === 'steps') {
        ctl = el('div', null, 'hc-steps-builder');
        var shown = el('div', null, 'hc-steps-shown');
        var pal = el('div', null, 'hc-steps-palette');
        function paint() {
          shown.replaceChildren();
          if (!steps.length) shown.appendChild(el('small', 'Toque nas teclas abaixo para montar a sequência.', 'hc-muted'));
          else shown.appendChild(stepsView(steps));
        }
        Object.keys(STEP_LABEL).forEach(function (s) {
          var b = el('button', STEP_LABEL[s], 'hc-step-btn'); b.type = 'button';
          b.addEventListener('click', function () { if (steps.length < 8) { steps.push(s); paint(); } });
          pal.appendChild(b);
        });
        var undo = el('button', 'Desfazer', 'hc-step-btn is-ghost'); undo.type = 'button';
        undo.addEventListener('click', function () { steps.pop(); paint(); });
        pal.appendChild(undo);
        ctl.append(shown, pal);
        paint();
        controls[fd.name] = { get: function () { return steps.slice(); }, reset: function () { steps.length = 0; paint(); } };
        label.appendChild(ctl);
        f.appendChild(label);
        return;
      } else {
        ctl = el('input'); ctl.type = 'text'; ctl.maxLength = fd.max || 60;
      }
      if (fd.placeholder) ctl.placeholder = fd.placeholder;
      if (fd.value != null) ctl.value = fd.value;
      controls[fd.name] = ctl;
      label.appendChild(ctl);
      f.appendChild(label);
    });

    var foot = el('div', null, 'hc-form-foot');
    foot.appendChild(el('small', opts.hint || 'Escreva com suas palavras, sem copiar textos de outros sites.', 'hc-muted'));
    var btn = el('button', opts.submitText || 'Publicar', 'hh-cta'); btn.type = 'submit';
    foot.appendChild(btn);
    f.appendChild(foot);

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var values = {};
      var invalid = null;
      (opts.fields || []).forEach(function (fd) {
        var c = controls[fd.name];
        var v = c.get ? c.get() : String(c.value || '').trim();
        if (fd.type === 'hero') {
          var h = v ? HC.find(v) : null;
          if (v && !h) invalid = 'Escolha um herói da lista.';
          v = h ? h.name : v;
        }
        if (fd.required !== false) {
          if (fd.type === 'steps' ? !v.length : !v) invalid = invalid || 'Preencha: ' + fd.label + '.';
        }
        if (fd.min && typeof v === 'string' && v.length < fd.min) invalid = invalid || fd.label + ' muito curto (mínimo ' + fd.min + ' caracteres).';
        values[fd.name] = v;
      });
      if (invalid) { toast(invalid); return; }
      if (opts.onSubmit(values)) {
        btn.disabled = true;
        setTimeout(function () { btn.disabled = false; }, 3000);
        (opts.fields || []).forEach(function (fd) {
          var c = controls[fd.name];
          if (c.reset) c.reset(); else if (fd.type !== 'select') c.value = '';
        });
        if (opts.onSent) opts.onSent();
      }
    });
    return f;
  }

  function ensureHeroList() {
    if (document.getElementById('hcHeroList')) return;
    var dl = document.createElement('datalist');
    dl.id = 'hcHeroList';
    HC.all().forEach(function (h) { dl.appendChild(new Option(h.name)); });
    document.body.appendChild(dl);
  }

  function statusBlock(hero) {
    var s = status(hero);
    if (s === 'ready') return null;
    var d = el('div', null, 'hc-status');
    if (s === 'unavailable') {
      d.appendChild(el('b', 'Contribuições ainda não disponíveis'));
      d.appendChild(el('p', 'O servidor não respondeu ao pedido. Se você acabou de atualizar o site, o servidor pode precisar da atualização das contribuições da comunidade.'));
    } else {
      d.appendChild(el('p', 'Carregando contribuições da comunidade...'));
    }
    return d;
  }

  function init() {
    if (init.done) return;
    init.done = true;
    window.addEventListener('society:ws', function (ev) {
      var m = ev.detail || {};
      if (m.t === 'hero_contrib') {
        var st = slot(m.hero);
        clearTimeout(st.timer);
        st.list = Array.isArray(m.list) ? m.list : [];
        st.status = 'ready';
        st.at = Date.now();
        emit();
      } else if (m.t === 'hero_contrib_saved') {
        toast(m.m || 'Contribuição publicada.');
        if (m.hero) request(m.hero);
      } else if (m.t === 'hero_contrib_error') {
        toast(m.m || 'Não foi possível salvar.');
      }
    });
  }

  window.HeroContrib = {
    KINDS: KINDS, STEP_LABEL: STEP_LABEL,
    ensure: ensure, status: status, all: all, byKind: byKind,
    submit: submit, vote: vote,
    el: el, stepsView: stepsView, voteBox: voteBox, entryCard: entryCard, form: form, statusBlock: statusBlock
  };

  if (window.Society) init();
  else window.addEventListener('society-app-ready', init, { once: true });
})();