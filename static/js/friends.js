// /static/js/friends.js — Sistema de amigos (modal + lista + pedidos)
(function () {
  'use strict';
  if (window.__friendsUILoaded) return;
  window.__friendsUILoaded = true;

  const $ = (id) => document.getElementById(id);
  const el = (tag, props) => {
    const n = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'textContent') n.textContent = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else n.setAttribute(k, v);
    }
    return n;
  };

  let context = null;
  let _friends = [];
  let _incoming = [];
  let _outgoing = [];
  let _dialog = null;
  let _tab = 'friends';
  let _searchTimer = null;

  // ─── CSS injetado ───
  let _cssInjected = false;
  function ensureStyles() {
    if (_cssInjected) return;
    if (document.getElementById('friends-ui-css')) { _cssInjected = true; return; }
    const style = document.createElement('style');
    style.id = 'friends-ui-css';
    style.textContent = `
      .friends-dialog {
        width: min(560px, calc(100vw - 28px));
        max-height: min(86dvh, 720px);
        padding: 0;
        border: 1px solid var(--line-2, rgba(255,255,255,.12));
        border-radius: 20px;
        background: var(--s1, #0e1013);
        color: var(--fg, #f5f5f5);
        overflow: hidden;
        box-shadow: 0 24px 70px rgba(0,0,0,.65);
      }
      .friends-dialog::backdrop { background: rgba(0,0,0,.72); backdrop-filter: blur(5px); }
      .friends-head {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 16px 18px;
        border-bottom: 1px solid var(--line, rgba(255,255,255,.07));
        background: linear-gradient(180deg, rgba(139,114,255,.12), transparent), var(--s2, #14171c);
      }
      .friends-head h2 { margin: 0; font-size: 1.05rem; }
      .friends-head-close {
        display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%;
        background: transparent; border: 0; color: var(--muted, #9298a3); cursor: pointer;
      }
      .friends-head-close:hover { background: rgba(255,255,255,.08); color: var(--fg, #f5f5f5); }
      .friends-tabs {
        display: flex; gap: 4px; padding: 10px 14px 8px;
        border-bottom: 1px solid var(--line, rgba(255,255,255,.07));
      }
      .friends-tab {
        display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px;
        border: 0; border-radius: 10px; background: transparent; color: var(--muted, #9298a3);
        font: inherit; font-size: .88rem; font-weight: 600; cursor: pointer;
        transition: background .15s, color .15s;
      }
      .friends-tab:hover { background: rgba(255,255,255,.05); color: var(--fg, #f5f5f5); }
      .friends-tab[aria-selected="true"] { background: rgba(139,114,255,.18); color: #b9a8ff; }
      .friends-tab .friends-tab-badge {
        display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px;
        border-radius: 9px; background: #ff5f5f; color: #fff; font-size: .7rem; font-weight: 700;
        line-height: 1;
      }
      .friends-body {
        padding: 14px 16px 18px; max-height: min(64dvh, 540px);
        overflow-y: auto; scrollbar-width: thin;
      }
      .friends-search {
        display: flex; align-items: center; gap: 8px;
        height: 42px; padding: 0 14px; margin-bottom: 12px;
        border-radius: 12px; background: var(--s3, #1b1f26);
        border: 1px solid transparent; color: var(--muted, #9298a3);
      }
      .friends-search:focus-within { border-color: rgba(139,114,255,.45); }
      .friends-search input {
        flex: 1 1 auto; min-width: 0; height: 100%; border: 0; background: transparent;
        color: var(--fg, #f5f5f5); font: inherit; font-size: .92rem; outline: none;
      }
      .friends-empty {
        padding: 36px 18px; text-align: center; color: var(--muted, #9298a3);
        font-size: .9rem; line-height: 1.55;
      }
      .friends-empty b { display: block; margin-bottom: 4px; color: var(--fg, #f5f5f5); font-size: .98rem; }
      .friends-row {
        display: grid; grid-template-columns: 46px minmax(0,1fr) auto;
        align-items: center; gap: 12px; padding: 10px 10px;
        border-radius: 12px; transition: background .15s;
      }
      .friends-row:hover { background: rgba(255,255,255,.04); }
      .friends-avatar {
        display: grid; place-items: center; width: 46px; height: 46px;
        border-radius: 50%; overflow: hidden; flex: 0 0 auto;
        background: linear-gradient(145deg, #262b34, #171a20); color: #b9a8ff;
        font-weight: 700; text-transform: uppercase;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.12);
      }
      .friends-avatar img { display: block; width: 100%; height: 100%; object-fit: cover; }
      .friends-row-copy { min-width: 0; }
      .friends-row-copy b {
        display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        font-size: .98rem;
      }
      .friends-row-copy small {
        display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        color: var(--muted, #9298a3); font-size: .82rem;
      }
      .friends-row-copy small.is-online { color: #3ecf8e; }
      .friends-row-actions { display: flex; gap: 6px; flex-shrink: 0; }
      .friends-btn {
        display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px;
        border-radius: 10px; border: 1px solid transparent;
        background: rgba(255,255,255,.06); color: var(--fg, #f5f5f5);
        font: inherit; font-size: .82rem; font-weight: 600; cursor: pointer;
        transition: background .15s, transform .1s;
      }
      .friends-btn:hover { background: rgba(255,255,255,.12); }
      .friends-btn:active { transform: scale(.96); }
      .friends-btn.is-primary { background: #8b72ff; color: #fff; }
      .friends-btn.is-primary:hover { background: #a08cff; }
      .friends-btn.is-success { background: #3ecf8e; color: #0a1f16; }
      .friends-btn.is-danger { color: #ff6b6b; }
      .friends-btn.is-danger:hover { background: rgba(255,107,107,.14); }
      .friends-sections-label {
        margin: 14px 0 6px; padding: 0 4px;
        color: var(--muted, #9298a3); font-size: .72rem;
        letter-spacing: .08em; text-transform: uppercase;
      }
    `;
    document.head.appendChild(style);
    _cssInjected = true;
  }

  // ─── Helpers ───
  function avatarCard(nick, name, avatar) {
    const wrap = el('span', { class: 'friends-avatar' });
    const initial = (name || nick || '?').slice(0, 1).toUpperCase();
    if (avatar && /^data:image\/jpeg;base64,/.test(avatar)) {
      const img = el('img', { alt: '', loading: 'lazy' });
      img.src = avatar;
      img.onerror = () => { wrap.textContent = initial; };
      wrap.append(img);
    } else {
      wrap.textContent = initial;
    }
    return wrap;
  }

  function rowCard(user, opts = {}) {
    const { onPrimary, onSecondary, primaryLabel, primaryClass, secondaryLabel, onCard } = opts;
    const row = el('div', { class: 'friends-row' });
    if (user.nick) row.dataset.userId = String(user.nick);

    row.append(avatarCard(user.nick, user.name || user.display_name, user.avatar));

    const copy = el('div', { class: 'friends-row-copy' });
    copy.append(el('b', { textContent: user.name || user.display_name || user.nick }));
    const status = el('small', {
      textContent: user.online ? '@' + user.nick + ' · Online agora' : '@' + user.nick,
      class: user.online ? 'is-online' : ''
    });
    copy.append(status);
    row.append(copy);

    const actions = el('div', { class: 'friends-row-actions' });
    if (primaryLabel) {
      const b = el('button', {
        type: 'button',
        class: 'friends-btn ' + (primaryClass || 'is-primary'),
        textContent: primaryLabel,
      });
      b.addEventListener('click', () => onPrimary && onPrimary(user));
      actions.append(b);
    }
    if (secondaryLabel) {
      const b = el('button', {
        type: 'button',
        class: 'friends-btn',
        textContent: secondaryLabel,
      });
      b.addEventListener('click', () => onSecondary && onSecondary(user));
      actions.append(b);
    }
    if (actions.childElementCount) row.append(actions);

    if (onCard) {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        onCard(user);
      });
      row.style.cursor = 'pointer';
    }
    return row;
  }

  // ─── Renders ───
  function renderFriendsTab(body) {
    body.replaceChildren();

    if (_tab === 'search') {
      // Busca de usuários
      const searchBox = el('label', { class: 'friends-search' });
      searchBox.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
      const input = el('input', {
        type: 'search', placeholder: 'Buscar por nick ou nome…',
        autocomplete: 'off', 'aria-label': 'Buscar usuários'
      });
      searchBox.append(input);
      body.append(searchBox);
      const results = el('div', { id: 'friendsSearchResults' });
      body.append(results);
      renderSearchResults(results, '');

      input.addEventListener('input', () => {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => renderSearchResults(results, input.value.trim()), 250);
      });
      setTimeout(() => input.focus(), 40);
      return;
    }

    if (!_friends.length && !_incoming.length && !_outgoing.length) {
      body.append(el('div', { class: 'friends-empty' }, )
        );
      const empty = el('div', { class: 'friends-empty' });
      empty.append(el('b', { textContent: 'Nenhum amigo ainda' }));
      empty.append(document.createTextNode('Vá na aba "Buscar" e envie um pedido de amizade.'));
      body.replaceChildren(empty);
      return;
    }

    if (_incoming.length) {
      body.append(el('p', { class: 'friends-sections-label', textContent: '📥 Pedidos recebidos (' + _incoming.length + ')' }));
      _incoming.forEach(user => body.append(rowCard(user, {
        primaryLabel: 'Aceitar', primaryClass: 'is-success',
        onPrimary: () => context.send({ t: 'friend_accept', nick: user.nick }),
        secondaryLabel: 'Recusar',
        onSecondary: () => context.send({ t: 'friend_decline', nick: user.nick }),
        onCard: () => openProfile(user.nick),
      })));
    }

    if (_friends.length) {
      body.append(el('p', { class: 'friends-sections-label', textContent: '👥 Amigos (' + _friends.length + ')' }));
      _friends.forEach(user => body.append(rowCard(user, {
        primaryLabel: 'Mensagem',
        onPrimary: () => { close(); context.openDM && context.openDM(user.nick, user.name); },
        secondaryLabel: 'Perfil',
        onSecondary: () => openProfile(user.nick),
        onCard: () => openProfile(user.nick),
      })));
    }

    if (_outgoing.length) {
      body.append(el('p', { class: 'friends-sections-label', textContent: '📤 Pedidos enviados (' + _outgoing.length + ')' }));
      _outgoing.forEach(user => body.append(rowCard(user, {
        secondaryLabel: 'Cancelar',
        onSecondary: () => context.send({ t: 'friend_decline', nick: user.nick }),
        onCard: () => openProfile(user.nick),
      })));
    }
  }

  function renderSearchResults(container, query) {
    container.replaceChildren();
    if (query.length < 2) {
      container.append(el('div', { class: 'friends-empty', textContent: 'Digite ao menos 2 caracteres para buscar.' }));
      return;
    }
    container.append(el('div', { class: 'friends-empty', textContent: 'Buscando…' }));
    fetch('/api/users/search?q=' + encodeURIComponent(query) +
          '&viewer=' + encodeURIComponent(context.getSelf() || ''))
      .then(r => r.json())
      .then(list => {
        container.replaceChildren();
        if (!Array.isArray(list) || !list.length) {
          container.append(el('div', { class: 'friends-empty', textContent: 'Nenhum usuário encontrado.' }));
          return;
        }
        list.forEach(user => {
          const status = user.friendship_status || 'none';
          let primaryLabel = 'Adicionar', primaryClass = 'is-primary';
          let disabled = false;
          if (status === 'friends') { primaryLabel = '✓ Amigos'; disabled = true; }
          else if (status === 'pending_out') { primaryLabel = 'Pedido enviado'; disabled = true; }
          else if (status === 'pending_in') {
            primaryLabel = 'Aceitar';
            primaryClass = 'is-success';
          }
          const opts = {
            primaryLabel, primaryClass,
            onPrimary: () => {
              if (disabled) return;
              if (status === 'pending_in') context.send({ t: 'friend_accept', nick: user.nick });
              else context.send({ t: 'friend_request', nick: user.nick });
            },
            secondaryLabel: 'Perfil',
            onSecondary: () => openProfile(user.nick),
            onCard: () => openProfile(user.nick),
          };
          const row = rowCard(user, opts);
          if (disabled && row.querySelector('.friends-btn.is-primary')) {
            row.querySelector('.friends-btn.is-primary').disabled = true;
          }
          container.append(row);
        });
      })
      .catch(() => {
        container.replaceChildren();
        container.append(el('div', { class: 'friends-empty', textContent: 'Falha ao buscar. Tente novamente.' }));
      });
  }

  function openProfile(nick) {
    close();
    if (typeof context.openProfile === 'function') context.openProfile(nick);
    else if (window.abrirPerfil) window.abrirPerfil(nick);
  }

  // ─── Modal ───
  function buildDialog() {
    if (_dialog) return _dialog;
    ensureStyles();
    _dialog = el('dialog', { class: 'friends-dialog', 'aria-labelledby': 'friendsDialogTitle' });

    const head = el('header', { class: 'friends-head' });
    head.append(el('h2', { id: 'friendsDialogTitle', textContent: 'Amigos' }));
    const closeBtn = el('button', { type: 'button', class: 'friends-head-close', 'aria-label': 'Fechar' });
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    closeBtn.addEventListener('click', close);
    head.append(closeBtn);
    _dialog.append(head);

    const tabs = el('div', { class: 'friends-tabs', role: 'tablist' });
    [
      { id: 'friends', label: 'Amigos' },
      { id: 'search', label: 'Buscar' },
    ].forEach(t => {
      const btn = el('button', { type: 'button', class: 'friends-tab', role: 'tab', 'aria-selected': 'false' });
      btn.dataset.tab = t.id;
      btn.textContent = t.label;
      if (t.id === 'friends') {
        const badge = el('span', { class: 'friends-tab-badge', textContent: '' });
        badge.style.display = 'none';
        badge.id = 'friendsTabBadge';
        btn.append(badge);
      }
      btn.addEventListener('click', () => setTab(t.id));
      tabs.append(btn);
    });
    _dialog.append(tabs);

    const body = el('div', { class: 'friends-body', id: 'friendsBody' });
    _dialog.append(body);

    document.body.appendChild(_dialog);
    _dialog.addEventListener('click', (e) => { if (e.target === _dialog) close(); });
    return _dialog;
  }

  function setTab(tab) {
    _tab = tab;
    _dialog.querySelectorAll('.friends-tab').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    renderFriendsTab($('friendsBody'));
  }

  function refreshBadge() {
    refreshBell();
    const badge = $('friendsTabBadge');
    if (!badge) return;
    if (_incoming.length > 0) {
      badge.textContent = String(_incoming.length);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  function open() {
    buildDialog();
    if (!_dialog.open) _dialog.showModal();
    setTab(_tab);
    refreshBadge();
    if (!_friends.length && !_incoming.length && !_outgoing.length) {
      context.send({ t: 'friends_list' });
    }
  }

  function close() {
    if (_dialog && _dialog.open) _dialog.close();
  }

  // ─── Eventos do WS (chamados pelo app.js) ───
  function setFriends(payload) {
    _friends = Array.isArray(payload.friends) ? payload.friends : [];
    _incoming = Array.isArray(payload.incoming) ? payload.incoming : [];
    _outgoing = Array.isArray(payload.outgoing) ? payload.outgoing : [];
    refreshBadge();
    if (_dialog && _dialog.open) renderFriendsTab($('friendsBody'));
  }
  function onFriendUpdated() {
    context.send({ t: 'friends_list' });
    if (window.ProfileUI && typeof window.ProfileUI.getCurrentUserId === 'function') {
      const target = window.ProfileUI.getCurrentUserId();
      if (target) context.send({ t: 'profile_view', nick: target });
    }
  }
  function onRequestReceived(info) {
    // O toast já vem do evento 'friend_notice' (app.js); aqui só atualizamos o sino.
    context.send({ t: 'friends_list' });
  }
  function refresh() { context.send({ t: 'friends_list' }); }

  // ─── Sino de notificações de amizade ───
  let _bellBtn = null, _bellBadge = null, _bellPanel = null;
  let _prevIncoming = null;

  function ensureBellStyles() {
    ensureStyles();
    if (document.getElementById('friends-bell-css')) return;
    const style = document.createElement('style');
    style.id = 'friends-bell-css';
    style.textContent = `
      .friends-bell {
        position: relative; display: grid; place-items: center; flex: 0 0 auto;
        width: 40px; height: 40px; border-radius: 50%;
        border: 1px solid var(--line, rgba(255,255,255,.07));
        background: var(--s2, #14171c); color: var(--muted, #9298a3);
        cursor: pointer; transition: background .15s, color .15s, border-color .15s;
      }
      .friends-bell:hover, .friends-bell[aria-expanded="true"] {
        background: var(--s3, #1b1f26); color: var(--fg, #f5f5f5);
      }
      .friends-bell.has-pending { color: #b9a8ff; border-color: rgba(139,114,255,.45); }
      .friends-bell svg { display: block; width: 20px; height: 20px; }
      .friends-bell-badge {
        position: absolute; top: -3px; right: -3px;
        display: grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px;
        border-radius: 9px; background: #ff5f5f; color: #fff;
        font-size: .68rem; font-weight: 700; line-height: 1;
        box-shadow: 0 0 0 2px var(--s1, #0e1013);
      }
      .friends-bell.is-ringing svg { animation: friends-bell-ring .9s ease-in-out; transform-origin: 50% 10%; }
      @keyframes friends-bell-ring {
        0%,100% { transform: rotate(0); }
        15% { transform: rotate(16deg); } 30% { transform: rotate(-14deg); }
        45% { transform: rotate(10deg); } 60% { transform: rotate(-8deg); }
        75% { transform: rotate(4deg); }
      }
      @media (prefers-reduced-motion: reduce) { .friends-bell.is-ringing svg { animation: none; } }
      .friends-bell-panel {
        position: fixed; z-index: 1200; width: 360px; max-width: calc(100vw - 24px);
        max-height: min(70dvh, 460px); display: flex; flex-direction: column;
        border: 1px solid var(--line-2, rgba(255,255,255,.12)); border-radius: 16px;
        background: var(--s1, #0e1013); color: var(--fg, #f5f5f5);
        box-shadow: 0 18px 50px rgba(0,0,0,.6); overflow: hidden;
      }
      .friends-bell-panel[hidden] { display: none; }
      .friends-bell-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 14px; font-weight: 700; font-size: .95rem;
        border-bottom: 1px solid var(--line, rgba(255,255,255,.07));
        background: linear-gradient(180deg, rgba(139,114,255,.12), transparent), var(--s2, #14171c);
      }
      .friends-bell-head small { color: var(--muted, #9298a3); font-weight: 600; }
      .friends-bell-list { overflow-y: auto; padding: 6px; scrollbar-width: thin; }
      .friends-bell-list .friends-row { grid-template-columns: 40px minmax(0,1fr); row-gap: 8px; }
      .friends-bell-list .friends-avatar { width: 40px; height: 40px; }
      .friends-bell-list .friends-row-actions { grid-column: 2 / -1; }
      .friends-bell-list .friends-btn { flex: 1 1 0; justify-content: center; }
      .friends-bell-list .friends-btn:disabled { opacity: .55; cursor: default; }
      .friends-bell-foot { padding: 8px; border-top: 1px solid var(--line, rgba(255,255,255,.07)); }
      .friends-bell-foot .friends-btn { width: 100%; justify-content: center; }
    `;
    document.head.appendChild(style);
  }

  function mountBell() {
    if (_bellBtn && document.body.contains(_bellBtn)) return;
    const account = $('topbarAccount');
    if (!account) return;
    ensureBellStyles();

    _bellBtn = el('button', {
      type: 'button', id: 'friendsBellBtn', class: 'friends-bell',
      'aria-label': 'Notificações de amizade', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
    });
    _bellBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
    _bellBadge = el('span', { class: 'friends-bell-badge' });
    _bellBadge.hidden = true;
    _bellBtn.append(_bellBadge);
    account.insertBefore(_bellBtn, $('sideProfile') || null);

    _bellPanel = el('div', { id: 'friendsBellPanel', class: 'friends-bell-panel', role: 'dialog', 'aria-label': 'Pedidos de amizade' });
    _bellPanel.hidden = true;
    document.body.appendChild(_bellPanel);

    _bellBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleBell(); });
    document.addEventListener('click', (e) => {
      if (_bellPanel.hidden) return;
      if (_bellPanel.contains(e.target) || _bellBtn.contains(e.target)) return;
      closeBell();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !_bellPanel.hidden) { closeBell(); _bellBtn.focus(); }
    });
    window.addEventListener('resize', () => { if (!_bellPanel.hidden) positionBell(); });
    refreshBell();
  }

  function positionBell() {
    const r = _bellBtn.getBoundingClientRect();
    const w = Math.min(360, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12));
    _bellPanel.style.width = w + 'px';
    _bellPanel.style.left = left + 'px';
    _bellPanel.style.top = (r.bottom + 8) + 'px';
  }

  function toggleBell() { _bellPanel.hidden ? openBell() : closeBell(); }

  function openBell() {
    if (!_bellPanel) return;
    renderBellPanel();
    _bellPanel.hidden = false;
    _bellBtn.setAttribute('aria-expanded', 'true');
    positionBell();
    context.send && context.send({ t: 'friends_list' }); // garante lista atualizada
  }

  function closeBell() {
    if (!_bellPanel) return;
    _bellPanel.hidden = true;
    _bellBtn.setAttribute('aria-expanded', 'false');
  }

  function renderBellPanel() {
    _bellPanel.replaceChildren();

    const head = el('div', { class: 'friends-bell-head' });
    head.append(el('span', { textContent: 'Pedidos de amizade' }));
    if (_incoming.length) head.append(el('small', { textContent: String(_incoming.length) }));
    _bellPanel.append(head);

    const list = el('div', { class: 'friends-bell-list' });
    if (!_incoming.length) {
      const empty = el('div', { class: 'friends-empty' });
      empty.append(el('b', { textContent: 'Tudo em dia' }));
      empty.append(document.createTextNode('Você não tem pedidos de amizade pendentes.'));
      list.append(empty);
    } else {
      _incoming.forEach(user => {
        const row = rowCard(user, {
          primaryLabel: 'Aceitar', primaryClass: 'is-success',
          onPrimary: () => { lockRow(row); context.send({ t: 'friend_accept', nick: user.nick }); },
          secondaryLabel: 'Recusar',
          onSecondary: () => { lockRow(row); context.send({ t: 'friend_decline', nick: user.nick }); },
          onCard: () => { closeBell(); openProfile(user.nick); },
        });
        list.append(row);
      });
    }
    _bellPanel.append(list);

    const foot = el('div', { class: 'friends-bell-foot' });
    const all = el('button', { type: 'button', class: 'friends-btn', textContent: 'Ver todos os amigos' });
    all.addEventListener('click', () => { closeBell(); open(); });
    foot.append(all);
    _bellPanel.append(foot);
  }

  function lockRow(row) {
    row.querySelectorAll('button').forEach(b => { b.disabled = true; });
  }

  function refreshBell() {
    if (!_bellBtn) return;
    const n = _incoming.length;
    _bellBadge.hidden = n === 0;
    _bellBadge.textContent = n > 99 ? '99+' : String(n);
    _bellBtn.classList.toggle('has-pending', n > 0);
    _bellBtn.setAttribute('aria-label', n > 0
      ? 'Notificações: ' + n + (n === 1 ? ' pedido de amizade' : ' pedidos de amizade')
      : 'Notificações de amizade');

    // Balança o sino quando chega um pedido novo (não no primeiro carregamento)
    if (_prevIncoming !== null && n > _prevIncoming) {
      _bellBtn.classList.remove('is-ringing');
      void _bellBtn.offsetWidth;
      _bellBtn.classList.add('is-ringing');
    }
    _prevIncoming = n;

    if (_bellPanel && !_bellPanel.hidden) { renderBellPanel(); positionBell(); }
  }

  // ─── Init ───
  function mount(opts) {
    context = opts || {};
    mountBell();
    // Substitui o botão "Nova conversa" da DM por "Amigos"
    const oldBtn = $('dmNewConversation');
    if (oldBtn && !oldBtn.dataset.friendsReplaced) {
      const newBtn = oldBtn.cloneNode(true);
      oldBtn.replaceWith(newBtn);
      newBtn.dataset.friendsReplaced = '1';
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        open();
      });
    }
    // Expoõe API
    window.FriendsUI = {
      open, close, mount,
      setFriends, onFriendUpdated, onRequestReceived, refresh,
      getPendingCount: () => _incoming.length,
    };
  }

  // Auto-init quando o app estiver pronto
  function boot() {
    if (!document.getElementById('dmRoot')) return false;
    if (!context) {
      // Sem contexto ainda: aguarda app.js chamar mount()
      return true;
    }
    return true;
  }
  boot();
  window.addEventListener('society-app-ready', () => {
    setTimeout(() => {
      if (window.__friendsContext) return;
      // Fallback: se app.js não chamar mount, usa Society global
      if (window.Society && !context) {
        mount({
          send: window.Society.send,
          getSelf: () => document.querySelector('#sidebarDisplayName')?.textContent || null,
          toast: window.Society.toast,
          openProfile: (nick) => window.abrirPerfil && window.abrirPerfil(nick),
          openDM: () => {},
        });
      }
    }, 400);
  });

  window.FriendsUI = {
    open: () => (buildDialog(), _dialog.open || _dialog.showModal(), setTab(_tab), refreshBadge()),
    close,
    mount,
    setFriends,
    onFriendUpdated,
    onRequestReceived,
    refresh,
    getPendingCount: () => _incoming.length,
  };
})();