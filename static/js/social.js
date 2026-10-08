// /static/js/social.js — Rede social da comunidade
// Contadores (amigos / seguidores / seguindo), seguir, posts, republicados,
// curtidas, comentários e ações rápidas para o mini perfil (DM).
// Depende de: profile.js (ProfileUI) e app.js (monta e roteia mensagens "social_*").
(function () {
  'use strict';
  if (window.SocialUI) return;

  const MAX_POST = 500;
  const MAX_COMMENT = 300;
  const SESSION_KEY = 'society.session';

  const $ = (id) => document.getElementById(id);
  const el = (tag, props, ...kids) => {
    const n = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach(c => { if (c != null && c !== false) n.append(c); });
    return n;
  };

  // ─── estado ───
  let ctx = null;
  const CARDS = {};                 // nick -> card (nome, avatar, selo)
  const COUNTS = {};                // nick -> { friends, followers, following, posts, reposts, is_following, follows_you }
  let view = { nick: null, isSelf: false, hidden: false };
  let feed = { tab: 'posts', items: [], more: false, loading: false, hidden: false, loadedFor: null, pages: 0 };
  let pendingFocus = null;
  let composer = { busy: false, file: null, previewUrl: '' };
  let listState = { nick: null, kind: null, items: [] };
  let lastRendered = null;          // último evento profile:rendered (antes do mount)

  // ─── utilidades ───
  const self = () => String((ctx && ctx.getSelf && ctx.getSelf()) || '').toLowerCase();
  const send = (o) => {
    const fn = (ctx && ctx.send) || window.appSend;
    return typeof fn === 'function' ? fn(o) : false;
  };
  const toast = (msg) => { try { (ctx && ctx.toast ? ctx.toast : () => {})(msg); } catch (e) {} };
  const plural = (n, one, many) => (n === 1 ? one : many);
  const fmtNum = (n) => Number(n || 0).toLocaleString('pt-BR');

  function mergeCards(cards) {
    if (cards && typeof cards === 'object') Object.assign(CARDS, cards);
  }
  function getCard(nick) {
    return CARDS[nick] || { nick, username: nick, name: nick, display_name: nick, avatar: '' };
  }
  function cardName(c) { return c.display_name || c.name || c.nick || 'Jogador'; }

  function timeAgo(ts) {
    const s = Math.max(0, Date.now() / 1000 - Number(ts || 0));
    if (s < 45) return 'agora';
    if (s < 3600) return Math.round(s / 60) + ' min';
    if (s < 86400) return Math.round(s / 3600) + ' h';
    if (s < 7 * 86400) return Math.round(s / 86400) + ' d';
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(ts * 1000));
  }

  function avatar(c, cls) {
    const name = cardName(c);
    if (window.ProfileUI && typeof window.ProfileUI.createAvatar === 'function') {
      return window.ProfileUI.createAvatar(
        { display_name: name, username: c.nick || c.username, avatar: c.avatar || '' }, cls);
    }
    return el('span', { class: cls, text: name.slice(0, 1).toUpperCase() });
  }

  // selo (verificado / VIP / streamer / beta) ao lado do nome
  function nameBadge(c) {
    const P = window.ProfileUI;
    if (!P || !c || !c.role || !P.badgeKeyForRole || !P.badgeKeyForRole(c.role)) return null;
    const color = P.badgeColorForRole(c.role);
    const emoji = P.badgeEmojiForRole && P.badgeEmojiForRole(c.role);
    const b = el('span', { class: 'soc-badge', title: P.badgeLabelForRole(c.role), role: 'img',
                           'aria-label': P.badgeLabelForRole(c.role) });
    if (emoji) b.textContent = emoji;
    else { b.innerHTML = P.badgeSvgForRole(c.role); b.style.color = color; }
    return b;
  }

  function closeOpenDialogs() {
    document.querySelectorAll('dialog[open]').forEach(d => { try { d.close(); } catch (e) {} });
  }
  function goProfile(nick) {
    closeOpenDialogs();
    if (ctx && ctx.openProfile) ctx.openProfile(nick);
    else if (window.abrirPerfil) window.abrirPerfil(nick);
  }

  // ─── CSS ───
  function ensureStyles() {
    if (document.getElementById('social-ui-css')) return;
    const st = document.createElement('style');
    st.id = 'social-ui-css';
    st.textContent = `
      .soc-counts { display:flex; flex-wrap:wrap; align-items:center; gap:6px 18px; margin:14px 0 0; }
      .soc-count { display:inline-flex; align-items:baseline; gap:6px; padding:4px 2px; border:0; border-radius:8px;
        background:transparent; color:var(--muted,#9298a3); font:inherit; font-size:.88rem; cursor:pointer; transition:color .15s; }
      .soc-count:hover:not(:disabled) { background:transparent; color:var(--text,#f5f5f5); transform:none; }
      .soc-composer[hidden], .soc-preview[hidden], .soc-quick[hidden], .soc-follow-btn[hidden] { display:none !important; }
      .soc-count b { color:var(--text,#f5f5f5); font-size:1.08rem; font-variant-numeric:tabular-nums; }
      .soc-chip { padding:2px 9px; border-radius:99px; background:rgba(255,255,255,.07); color:var(--muted,#9298a3);
        font-size:.72rem; font-weight:600; }
      .soc-follow-btn.is-following { background:var(--surface-2,#1b1f26); color:var(--text,#f5f5f5);
        box-shadow:inset 0 0 0 1px var(--border,rgba(255,255,255,.14)); }
      .soc-follow-btn.is-following:hover:not(:disabled) { background:rgba(255,107,107,.14); color:#ff6b6b; }
      .soc-follow-btn:disabled { opacity:.6; cursor:default; }

      .soc-section .profile-section-heading { margin-bottom:10px; }
      .soc-tabs { display:flex; gap:4px; margin:0 0 12px; border-bottom:1px solid var(--border,rgba(255,255,255,.08)); }
      .soc-tab { display:inline-flex; align-items:center; gap:7px; padding:9px 14px; margin-bottom:-1px; border:0;
        border-bottom:2px solid transparent; border-radius:0; background:transparent; color:var(--muted,#9298a3);
        font:inherit; font-size:.9rem; font-weight:600; cursor:pointer; }
      .soc-tab:hover:not(:disabled) { background:transparent; color:var(--text,#f5f5f5); transform:none; }
      .soc-tab[aria-selected="true"] { color:var(--profile-accent,var(--accent,#8b72ff));
        border-bottom-color:var(--profile-accent,var(--accent,#8b72ff)); }
      .soc-tab small { padding:1px 7px; border-radius:99px; background:rgba(255,255,255,.08); font-size:.72rem; }

      .soc-composer { display:grid; gap:10px; margin-bottom:14px; padding:12px; border-radius:14px;
        background:var(--surface,#14171c); border:1px solid var(--border,rgba(255,255,255,.08)); }
      .soc-composer textarea { width:100%; min-height:74px; max-height:260px; resize:vertical; padding:10px 12px;
        border-radius:10px; border:1px solid var(--border,rgba(255,255,255,.1)); background:var(--surface-2,#1b1f26);
        color:var(--text,#f5f5f5); font:inherit; font-size:.95rem; line-height:1.45; box-sizing:border-box; }
      .soc-composer textarea:focus { outline:none; border-color:var(--profile-accent,#8b72ff); }
      .soc-composer-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .soc-composer-bar .soc-grow { flex:1 1 auto; }
      .soc-counter { color:var(--muted,#9298a3); font-size:.78rem; font-variant-numeric:tabular-nums; }
      .soc-counter.is-over { color:#ff6b6b; }
      .soc-ghost { display:inline-flex; align-items:center; gap:6px; padding:7px 12px; border-radius:10px; border:0;
        background:rgba(255,255,255,.06); color:var(--text,#f5f5f5); font:inherit; font-size:.84rem; font-weight:600; cursor:pointer; }
      .soc-ghost:hover:not(:disabled) { background:rgba(255,255,255,.12); transform:none; }
      .soc-primary { padding:8px 18px; border-radius:10px; border:0; background:var(--profile-accent,var(--primary,#8b72ff));
        color:#fff; font:inherit; font-size:.88rem; font-weight:700; cursor:pointer; }
      .soc-primary:disabled { opacity:.5; cursor:default; }
      .soc-preview { position:relative; width:fit-content; max-width:100%; }
      .soc-preview img { display:block; max-width:100%; max-height:240px; border-radius:12px; }
      .soc-preview button { position:absolute; top:6px; right:6px; width:28px; height:28px; padding:0; border-radius:50%;
        background:rgba(0,0,0,.7); color:#fff; border:0; cursor:pointer; line-height:1; }

      .soc-feed { display:grid; gap:12px; }
      .soc-empty { padding:28px 16px; text-align:center; color:var(--muted,#9298a3); font-size:.92rem; line-height:1.55;
        border-radius:14px; background:var(--surface,#14171c); border:1px dashed var(--border,rgba(255,255,255,.12)); }
      .soc-more { display:flex; justify-content:center; margin-top:12px; }

      .soc-post { padding:14px; border-radius:14px; background:var(--surface,#14171c);
        border:1px solid var(--border,rgba(255,255,255,.08)); transition:box-shadow .3s, border-color .3s; }
      .soc-post.is-focus { border-color:var(--profile-accent,#8b72ff);
        box-shadow:0 0 0 3px color-mix(in srgb, var(--profile-accent,#8b72ff) 30%, transparent); }
      .soc-repost-label { display:flex; align-items:center; gap:6px; margin:-2px 0 8px; color:var(--muted,#9298a3);
        font-size:.78rem; font-weight:600; }
      .soc-post-head { display:flex; align-items:center; gap:10px; }
      .soc-avatar { display:grid; place-items:center; width:42px; height:42px; flex:0 0 42px; overflow:hidden;
        border-radius:50%; background:linear-gradient(145deg,#262b34,#171a20); color:#b9a8ff; font-weight:700;
        text-transform:uppercase; cursor:pointer; box-shadow:inset 0 0 0 1px rgba(255,255,255,.12); }
      .soc-avatar img { width:100%; height:100%; object-fit:cover; display:block; }
      .soc-who { min-width:0; flex:1 1 auto; cursor:pointer; }
      .soc-who b { display:inline-flex; align-items:center; gap:5px; max-width:100%; font-size:.95rem; }
      .soc-who b span.soc-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .soc-who small { display:block; color:var(--muted,#9298a3); font-size:.78rem; }
      .soc-badge { display:inline-grid; place-items:center; width:15px; height:15px; flex:0 0 auto; font-size:13px; line-height:1; }
      .soc-badge svg { width:100%; height:100%; display:block; }
      .soc-icon-btn { display:grid; place-items:center; width:32px; height:32px; padding:0; border:0; border-radius:50%;
        background:transparent; color:var(--muted,#9298a3); cursor:pointer; }
      .soc-icon-btn:hover:not(:disabled) { background:rgba(255,107,107,.14); color:#ff6b6b; transform:none; }
      .soc-post-body { margin:10px 0 0; white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.5; font-size:.95rem; }
      .soc-post-img { display:block; width:100%; max-height:460px; margin-top:10px; object-fit:cover;
        border-radius:12px; cursor:zoom-in; background:var(--surface-2,#1b1f26); }
      .soc-actions { display:flex; gap:4px; margin-top:10px; margin-left:-8px; }
      .soc-act { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border:0; border-radius:99px;
        background:transparent; color:var(--muted,#9298a3); font:inherit; font-size:.84rem; font-weight:600; cursor:pointer;
        transition:background .15s, color .15s; }
      .soc-act svg { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
      .soc-act:hover:not(:disabled) { background:rgba(255,255,255,.07); color:var(--text,#f5f5f5); transform:none; }
      .soc-act[data-act="like"][aria-pressed="true"] { color:#ff5f7e; }
      .soc-act[data-act="like"][aria-pressed="true"] svg { fill:#ff5f7e; }
      .soc-act[data-act="repost"][aria-pressed="true"] { color:#3ecf8e; }
      .soc-act:disabled { opacity:.5; cursor:default; }

      .soc-comments { margin-top:10px; padding-top:10px; border-top:1px solid var(--border,rgba(255,255,255,.07)); display:grid; gap:10px; }
      .soc-comments[hidden] { display:none; }
      .soc-comment { display:flex; gap:9px; }
      .soc-comment .soc-avatar { width:30px; height:30px; flex-basis:30px; font-size:.8rem; }
      .soc-comment-body { min-width:0; flex:1 1 auto; padding:7px 11px; border-radius:12px; background:var(--surface-2,#1b1f26); }
      .soc-comment-body b { font-size:.82rem; }
      .soc-comment-body small { margin-left:6px; color:var(--muted,#9298a3); font-size:.72rem; }
      .soc-comment-body p { margin:2px 0 0; font-size:.88rem; line-height:1.4; overflow-wrap:anywhere; white-space:pre-wrap; }
      .soc-comment .soc-icon-btn { width:26px; height:26px; align-self:flex-start; }
      .soc-comment-form { display:flex; gap:8px; }
      .soc-comment-form input { flex:1 1 auto; min-width:0; padding:8px 12px; border-radius:99px;
        border:1px solid var(--border,rgba(255,255,255,.1)); background:var(--surface-2,#1b1f26); color:var(--text,#f5f5f5); font:inherit; font-size:.88rem; }
      .soc-comment-form input:focus { outline:none; border-color:var(--profile-accent,#8b72ff); }
      .soc-muted { color:var(--muted,#9298a3); font-size:.84rem; }

      .soc-dialog { width:min(460px, calc(100vw - 28px)); max-height:min(80dvh, 640px); padding:0; overflow:hidden;
        border:1px solid var(--border,rgba(255,255,255,.12)); border-radius:18px; background:var(--surface,#0e1013);
        color:var(--text,#f5f5f5); box-shadow:0 24px 70px rgba(0,0,0,.65); }
      .soc-dialog::backdrop { background:rgba(0,0,0,.7); backdrop-filter:blur(4px); }
      .soc-dialog-head { display:flex; align-items:center; justify-content:space-between; padding:14px 16px;
        border-bottom:1px solid var(--border,rgba(255,255,255,.08)); }
      .soc-dialog-head h2 { margin:0; font-size:1.02rem; }
      .soc-dialog-body { padding:8px; overflow-y:auto; max-height:min(66dvh, 540px); scrollbar-width:thin; }
      .soc-row { display:flex; align-items:center; gap:11px; padding:9px 10px; border-radius:12px; }
      .soc-row:hover { background:rgba(255,255,255,.04); }
      .soc-row .soc-who { cursor:pointer; }
      .soc-mini-btn { padding:7px 13px; border:0; border-radius:10px; background:var(--profile-accent,var(--primary,#8b72ff));
        color:#fff; font:inherit; font-size:.8rem; font-weight:700; cursor:pointer; flex:0 0 auto; }
      .soc-mini-btn.is-on { background:var(--surface-2,#1b1f26); color:var(--text,#f5f5f5); box-shadow:inset 0 0 0 1px rgba(255,255,255,.14); }
      .soc-mini-btn:hover:not(:disabled), .soc-primary:hover:not(:disabled) {
        background:var(--profile-accent,var(--primary,#8b72ff)); filter:brightness(1.12); transform:none; }
      .soc-mini-btn.is-on:hover:not(:disabled) { background:var(--surface-2,#1b1f26); filter:none; }
      .soc-mini-btn:disabled { opacity:.55; cursor:default; }

      .soc-quick { display:grid; gap:10px; margin-top:12px; }
      .soc-quick-actions { display:flex; gap:8px; flex-wrap:wrap; }
      .soc-quick-actions .soc-mini-btn { flex:1 1 130px; min-height:38px; }
      @media (max-width:520px) { .soc-tab { padding:9px 10px; } .soc-actions { margin-left:-10px; } }
    `;
    document.head.appendChild(st);
  }

  // ─── ícones ───
  const ICON = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.6-.8L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5z"/></svg>',
    repost: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
    image: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  };

  // ═══════════════════════════════════════════════════════════
  // SEGUIR
  // ═══════════════════════════════════════════════════════════
  function toggleFollow(nick, currentlyFollowing) {
    const ok = send({ t: currentlyFollowing ? 'unfollow' : 'follow', nick });
    if (!ok) toast('A conexão caiu. Reconecte-se e tente de novo.');
    return ok;
  }

  function renderFollowBtn() {
    const btn = $('profileFollowBtn');
    if (!btn) return;
    const other = !view.isSelf && view.nick;
    btn.hidden = !other;
    if (!other) return;
    const c = COUNTS[view.nick] || {};
    btn.disabled = false;
    btn.classList.toggle('is-following', Boolean(c.is_following));
    btn.textContent = c.is_following ? 'Seguindo ✓' : 'Seguir';
    btn.title = c.is_following ? 'Deixar de seguir' : 'Seguir para ver os posts nas notificações';
  }

  function renderCounts() {
    const bar = $('socialCounts');
    if (!bar || !view.nick) return;
    const c = COUNTS[view.nick] || {};
    bar.replaceChildren();
    [['friends', 'Amigos'], ['followers', plural(c.followers, 'Seguidor', 'Seguidores')],
     ['following', 'Seguindo']].forEach(([kind, label]) => {
      const b = el('button', { type: 'button', class: 'soc-count', dataset: { kind },
                               'aria-label': fmtNum(c[kind]) + ' ' + label });
      b.append(el('b', { text: fmtNum(c[kind]) }), el('span', { text: label }));
      b.addEventListener('click', () => openList(view.nick, kind));
      bar.append(b);
    });
    if (c.follows_you) bar.append(el('span', { class: 'soc-chip', text: 'Segue você' }));
  }

  // ═══════════════════════════════════════════════════════════
  // LISTA DE AMIGOS / SEGUIDORES / SEGUINDO
  // ═══════════════════════════════════════════════════════════
  let _listDialog = null;
  const LIST_TITLES = { friends: 'Amigos', followers: 'Seguidores', following: 'Seguindo' };

  function buildListDialog() {
    if (_listDialog) return _listDialog;
    ensureStyles();
    _listDialog = el('dialog', { class: 'soc-dialog', 'aria-labelledby': 'socListTitle' });
    const close = el('button', { type: 'button', class: 'soc-icon-btn', 'aria-label': 'Fechar' });
    close.innerHTML = ICON.close;
    close.addEventListener('click', () => _listDialog.close());
    _listDialog.append(
      el('header', { class: 'soc-dialog-head' }, el('h2', { id: 'socListTitle' }), close),
      el('div', { class: 'soc-dialog-body', id: 'socListBody' }));
    _listDialog.addEventListener('click', (e) => { if (e.target === _listDialog) _listDialog.close(); });
    document.body.appendChild(_listDialog);
    return _listDialog;
  }

  function openList(nick, kind) {
    const dlg = buildListDialog();
    listState = { nick, kind, items: [] };
    const who = nick === self() ? '' : ' de ' + cardName(getCard(nick));
    dlg.querySelector('#socListTitle').textContent = LIST_TITLES[kind] + who;
    dlg.querySelector('#socListBody').replaceChildren(el('div', { class: 'soc-empty', text: 'Carregando…' }));
    if (!dlg.open) dlg.showModal();
    send({ t: 'social_list', nick, kind });
  }

  function renderList(m) {
    if (!_listDialog || !_listDialog.open) return;
    if (m.nick !== listState.nick || m.kind !== listState.kind) return;
    const body = _listDialog.querySelector('#socListBody');
    body.replaceChildren();
    if (m.hidden) {
      body.append(el('div', { class: 'soc-empty', text: '🔒 Esta lista não está disponível para você.' }));
      return;
    }
    listState.items = m.items || [];
    if (!listState.items.length) {
      const msg = { friends: 'Nenhum amigo ainda.', followers: 'Ninguém segue este perfil ainda.',
                    following: 'Este perfil ainda não segue ninguém.' }[m.kind];
      body.append(el('div', { class: 'soc-empty', text: msg }));
      return;
    }
    listState.items.forEach(item => {
      mergeCards({ [item.nick]: item });
      const who = el('div', { class: 'soc-who' },
        el('b', null, el('span', { class: 'soc-name', text: cardName(item) }), nameBadge(item)),
        el('small', { text: '@' + item.nick }));
      who.addEventListener('click', () => goProfile(item.nick));
      const av = avatar(item, 'soc-avatar');
      av.addEventListener('click', () => goProfile(item.nick));
      const row = el('div', { class: 'soc-row' }, av, who);
      if (!item.is_self) {
        const btn = el('button', { type: 'button', class: 'soc-mini-btn' });
        const paint = () => {
          btn.textContent = item.is_following ? 'Seguindo' : 'Seguir';
          btn.classList.toggle('is-on', Boolean(item.is_following));
        };
        paint();
        btn.addEventListener('click', () => {
          if (toggleFollow(item.nick, item.is_following)) { item.is_following = !item.is_following; paint(); }
        });
        row.append(btn);
      }
      body.append(row);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // POSTS
  // ═══════════════════════════════════════════════════════════
  function sessionToken() {
    try { return localStorage.getItem(SESSION_KEY) || ''; } catch (e) { return ''; }
  }

  // reduz a imagem antes do upload (GIF segue original)
  function shrinkImage(file, maxSide = 1280) {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.type === 'image/gif') return resolve(file);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        if (scale === 1 && file.size < 900 * 1024) return resolve(file);
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.naturalWidth * scale));
        cv.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const g = cv.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
        g.drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(b => resolve(b || file), 'image/jpeg', 0.84);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  async function uploadPostImage(file) {
    const body = new FormData();
    body.append('file', file, file.name && /\.(jpe?g|png|gif|webp)$/i.test(file.name) ? file.name : 'imagem.jpg');
    const res = await fetch('/api/posts/upload', { method: 'POST', headers: { 'X-Session-Token': sessionToken() }, body });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data.detail || 'Falha ao enviar a imagem.');
    return data.url;
  }

  function resetComposer() {
    if (composer.previewUrl) URL.revokeObjectURL(composer.previewUrl);
    composer = { busy: false, file: null, previewUrl: '' };
    renderComposer(true);
  }

  function renderComposer(force) {
    const box = $('socialComposer');
    if (!box) return;
    const show = view.isSelf && feed.tab === 'posts' && !feed.hidden;
    box.hidden = !show;
    if (!show) { box.replaceChildren(); return; }
    if (box.childElementCount && !force) return;

    const ta = el('textarea', { maxlength: String(MAX_POST), rows: '3',
      placeholder: 'Compartilhe algo com a comunidade…', 'aria-label': 'Escrever publicação' });
    const counter = el('span', { class: 'soc-counter', text: '0/' + MAX_POST });
    const publish = el('button', { type: 'button', class: 'soc-primary', text: 'Publicar' });
    const attach = el('button', { type: 'button', class: 'soc-ghost', 'aria-label': 'Anexar imagem' });
    attach.innerHTML = ICON.image + '<span>Imagem</span>';
    const file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/gif,image/webp', hidden: true });
    const previewBox = el('div', { class: 'soc-preview', hidden: true });

    const refresh = () => {
      const len = ta.value.length;
      counter.textContent = len + '/' + MAX_POST;
      counter.classList.toggle('is-over', len > MAX_POST);
      publish.disabled = composer.busy || (!ta.value.trim() && !composer.file) || len > MAX_POST;
      publish.textContent = composer.busy ? 'Publicando…' : 'Publicar';
    };
    const paintPreview = () => {
      previewBox.replaceChildren();
      previewBox.hidden = !composer.file;
      if (!composer.file) return;
      const img = el('img', { src: composer.previewUrl, alt: 'Pré-visualização da imagem' });
      const rm = el('button', { type: 'button', 'aria-label': 'Remover imagem', text: '✕' });
      rm.addEventListener('click', () => {
        URL.revokeObjectURL(composer.previewUrl);
        composer.file = null; composer.previewUrl = ''; file.value = '';
        paintPreview(); refresh();
      });
      previewBox.append(img, rm);
    };

    composer.refresh = refresh;
    ta.addEventListener('input', refresh);
    attach.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      if (!f.type.startsWith('image/')) { toast('Selecione um arquivo de imagem.'); file.value = ''; return; }
      if (f.size > 12 * 1024 * 1024) { toast('A imagem deve ter no máximo 12 MB.'); file.value = ''; return; }
      const small = await shrinkImage(f);
      if (small.size > 5 * 1024 * 1024) { toast('A imagem ficou grande demais (máx. 5 MB).'); file.value = ''; return; }
      if (composer.previewUrl) URL.revokeObjectURL(composer.previewUrl);
      composer.file = small; composer.previewUrl = URL.createObjectURL(small);
      paintPreview(); refresh();
    });
    publish.addEventListener('click', async () => {
      if (composer.busy) return;
      composer.busy = true; refresh();
      try {
        let image = '';
        if (composer.file) image = await uploadPostImage(composer.file);
        const ok = send({ t: 'post_create', body: ta.value.trim(), image });
        if (!ok) throw new Error('A conexão caiu. Reconecte-se para publicar.');
        // o composer é limpo quando chega "social_post_created"
      } catch (err) {
        composer.busy = false; refresh();
        toast(err.message || 'Não foi possível publicar.');
      }
    });

    box.replaceChildren(ta, previewBox,
      el('div', { class: 'soc-composer-bar' }, attach, el('span', { class: 'soc-grow' }), counter, publish), file);
    refresh();
  }

  function postActionBtn(act, icon, label) {
    const b = el('button', { type: 'button', class: 'soc-act', dataset: { act }, 'aria-pressed': 'false', 'aria-label': label });
    b.innerHTML = icon + '<span class="soc-n"></span>';
    return b;
  }

  function applyPostState(card, p) {
    const set = (act, n, pressed, label) => {
      const b = card.querySelector('.soc-act[data-act="' + act + '"]');
      if (!b) return;
      b.querySelector('.soc-n').textContent = n > 0 ? fmtNum(n) : '';
      if (pressed != null) b.setAttribute('aria-pressed', String(Boolean(pressed)));
      if (label) b.setAttribute('aria-label', label);
      b.disabled = false;
    };
    set('like', p.likes, p.liked, p.liked ? 'Descurtir' : 'Curtir');
    set('comment', p.comments, null);
    set('repost', p.reposts, p.reposted, p.reposted ? 'Desfazer republicação' : 'Republicar');
    const rep = card.querySelector('.soc-act[data-act="repost"]');
    if (rep && p.mine) { rep.disabled = true; rep.title = 'Você não pode republicar sua própria publicação'; }
  }

  function postCard(p) {
    const a = getCard(p.author);
    const head = el('header', { class: 'soc-post-head' });
    const av = avatar(a, 'soc-avatar');
    av.addEventListener('click', () => goProfile(a.nick));
    const who = el('div', { class: 'soc-who' },
      el('b', null, el('span', { class: 'soc-name', text: cardName(a) }), nameBadge(a)),
      el('small', { text: '@' + a.nick + ' · ' + timeAgo(p.ts) }));
    who.addEventListener('click', () => goProfile(a.nick));
    head.append(av, who);

    const card = el('article', { class: 'soc-post', dataset: { postId: String(p.id) } });
    if (p.repost_by) {
      const rb = getCard(p.repost_by);
      const label = el('div', { class: 'soc-repost-label' });
      label.innerHTML = ICON.repost.replace('<svg ', '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" ');
      label.append(el('span', { text: (rb.nick === self() ? 'Você' : cardName(rb)) + ' republicou' }));
      card.append(label);
    }
    if (p.mine) {
      const del = el('button', { type: 'button', class: 'soc-icon-btn', 'aria-label': 'Excluir publicação', title: 'Excluir' });
      del.innerHTML = ICON.trash;
      del.addEventListener('click', () => {
        if (confirm('Excluir esta publicação? Essa ação não pode ser desfeita.')) send({ t: 'post_delete', id: p.id });
      });
      head.append(del);
    }
    card.append(head);
    if (p.body) card.append(el('p', { class: 'soc-post-body', text: p.body }));
    if (p.image) {
      const img = el('img', { class: 'soc-post-img', src: p.image, alt: 'Imagem da publicação', loading: 'lazy' });
      img.addEventListener('click', () => window.open(p.image, '_blank', 'noopener'));
      card.append(img);
    }

    const like = postActionBtn('like', ICON.heart, 'Curtir');
    const comment = postActionBtn('comment', ICON.comment, 'Comentar');
    comment.removeAttribute('aria-pressed');
    const repost = postActionBtn('repost', ICON.repost, 'Republicar');
    const panel = el('div', { class: 'soc-comments', hidden: true });
    card.append(el('footer', { class: 'soc-actions' }, like, comment, repost), panel);
    applyPostState(card, p);

    like.addEventListener('click', () => {
      like.disabled = true;
      const on = like.getAttribute('aria-pressed') !== 'true';
      if (!send({ t: 'post_like', id: p.id, on })) { like.disabled = false; toast('A conexão caiu.'); }
    });
    repost.addEventListener('click', () => {
      repost.disabled = true;
      const on = repost.getAttribute('aria-pressed') !== 'true';
      if (!send({ t: 'post_repost', id: p.id, on })) { repost.disabled = false; toast('A conexão caiu.'); }
    });
    comment.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        panel.replaceChildren(el('span', { class: 'soc-muted', text: 'Carregando comentários…' }));
        send({ t: 'post_comments', id: p.id });
      }
    });
    return card;
  }

  function renderComments(m) {
    mergeCards(m.cards);
    const card = document.querySelector('.soc-post[data-post-id="' + m.post_id + '"]');
    if (!card) return;
    const panel = card.querySelector('.soc-comments');
    if (!panel || panel.hidden) return;
    const keep = panel.querySelector('input') ? panel.querySelector('input').value : '';
    panel.replaceChildren();
    (m.items || []).forEach(c => {
      const a = getCard(c.author);
      const av = avatar(a, 'soc-avatar');
      av.addEventListener('click', () => goProfile(a.nick));
      const body = el('div', { class: 'soc-comment-body' },
        el('b', { text: cardName(a) }), el('small', { text: timeAgo(c.ts) }), el('p', { text: c.body }));
      const row = el('div', { class: 'soc-comment' }, av, body);
      if (c.can_delete) {
        const del = el('button', { type: 'button', class: 'soc-icon-btn', 'aria-label': 'Excluir comentário' });
        del.innerHTML = ICON.trash;
        del.addEventListener('click', () => send({ t: 'comment_delete', id: c.id }));
        row.append(del);
      }
      panel.append(row);
    });
    if (!(m.items || []).length) panel.append(el('span', { class: 'soc-muted', text: 'Seja o primeiro a comentar.' }));

    const input = el('input', { type: 'text', maxlength: String(MAX_COMMENT), placeholder: 'Escreva um comentário…', 'aria-label': 'Comentário' });
    input.value = keep;
    const go = el('button', { type: 'button', class: 'soc-mini-btn', text: 'Enviar' });
    const submit = () => {
      const v = input.value.trim();
      if (!v) return;
      if (send({ t: 'post_comment', id: m.post_id, body: v })) input.value = '';
    };
    go.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    panel.append(el('div', { class: 'soc-comment-form' }, input, go));
  }

  // ─── feed ───
  function resetFeed() {
    feed.items = []; feed.more = false; feed.hidden = false; feed.pages = 0; feed.loadedFor = null;
    renderFeed();
  }

  function loadPosts(append) {
    if (!view.nick) return;
    feed.loading = true;
    const last = feed.items[feed.items.length - 1];
    const before = append && last ? (feed.tab === 'reposts' ? last.repost_ts : last.ts) : undefined;
    send({ t: 'posts_list', nick: view.nick, tab: feed.tab, before });
    renderFeed();
  }

  function renderFeed() {
    const box = $('socialFeed');
    const more = $('socialMore');
    if (!box) return;
    box.replaceChildren();
    if (more) more.replaceChildren();

    if (feed.hidden) {
      box.append(el('div', { class: 'soc-empty', text: '🔒 As publicações deste perfil não estão disponíveis para você.' }));
      return;
    }
    if (!feed.items.length) {
      if (feed.loading) { box.append(el('div', { class: 'soc-empty', text: 'Carregando…' })); return; }
      const msg = feed.tab === 'reposts'
        ? (view.isSelf ? 'Você ainda não republicou nada. Use 🔁 nos posts que você curtir.' : 'Nenhuma publicação republicada ainda.')
        : (view.isSelf ? 'Você ainda não publicou nada. Que tal se apresentar para a comunidade?' : 'Este jogador ainda não publicou nada.');
      box.append(el('div', { class: 'soc-empty', text: msg }));
      return;
    }
    feed.items.forEach(p => box.append(postCard(p)));
    if (feed.more && more) {
      const b = el('button', { type: 'button', class: 'soc-ghost', text: feed.loading ? 'Carregando…' : 'Carregar mais' });
      b.disabled = feed.loading;
      b.addEventListener('click', () => loadPosts(true));
      more.append(b);
    }
  }

  function renderTabs() {
    const tabs = $('socialTabs');
    if (!tabs || !view.nick) return;
    const c = COUNTS[view.nick] || {};
    tabs.querySelectorAll('.soc-tab').forEach(b => {
      b.setAttribute('aria-selected', String(b.dataset.tab === feed.tab));
      const n = b.querySelector('small');
      const v = b.dataset.tab === 'posts' ? c.posts : c.reposts;
      if (n) n.textContent = fmtNum(v);
    });
  }

  function switchTab(tab) {
    if (feed.tab === tab && feed.loadedFor === view.nick) return;
    feed.tab = tab;
    resetFeed();
    renderTabs();
    renderComposer(true);
    loadPosts();
  }

  function consumePendingFocus() {
    if (!pendingFocus || pendingFocus.nick !== view.nick) return;
    const card = document.querySelector('.soc-post[data-post-id="' + pendingFocus.id + '"]');
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('is-focus');
      setTimeout(() => card.classList.remove('is-focus'), 2600);
      pendingFocus = null;
    } else if (feed.more && !feed.loading && feed.pages < 4) {
      loadPosts(true);
    } else {
      pendingFocus = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // INJEÇÃO NO PERFIL
  // ═══════════════════════════════════════════════════════════
  function ensureProfileDom() {
    const bio = $('profileBio');
    if (!bio) return false;
    ensureStyles();

    if (!$('socialCounts')) {
      bio.insertAdjacentElement('afterend', el('div', { id: 'socialCounts', class: 'soc-counts' }));
    }

    if (!$('profileFollowBtn')) {
      const btn = el('button', { type: 'button', id: 'profileFollowBtn', class: 'profile-action-btn soc-follow-btn', hidden: true });
      btn.addEventListener('click', () => {
        const c = COUNTS[view.nick] || {};
        btn.disabled = true;
        if (!toggleFollow(view.nick, Boolean(c.is_following))) { btn.disabled = false; return; }
        setTimeout(() => { btn.disabled = false; }, 4000);   // trava de segurança
      });
      const friendBtn = $('profileFriendBtn');
      const actions = $('profileActions');
      if (friendBtn) friendBtn.insertAdjacentElement('afterend', btn);
      else if (actions) actions.prepend(btn);
    }

    if (!$('socialSection')) {
      const sec = el('section', { id: 'socialSection', class: 'profile-section soc-section' });
      sec.append(
        el('div', { class: 'profile-section-heading' },
          el('div', null, el('span', { class: 'profile-eyebrow', text: 'COMUNIDADE' }), el('h2', { text: 'Publicações' }))),
        el('div', { id: 'socialTabs', class: 'soc-tabs', role: 'tablist' },
          ...[['posts', 'Publicações'], ['reposts', 'Republicados']].map(([id, label]) => {
            const b = el('button', { type: 'button', class: 'soc-tab', role: 'tab', dataset: { tab: id }, 'aria-selected': 'false' },
              el('span', { text: label }), el('small', { text: '0' }));
            b.addEventListener('click', () => switchTab(id));
            return b;
          })),
        el('div', { id: 'socialComposer', class: 'soc-composer', hidden: true }),
        el('div', { id: 'socialFeed', class: 'soc-feed' }),
        el('div', { id: 'socialMore', class: 'soc-more' }));
      const anchor = $('profileStatsSection') || $('profileAchievementsSection') || $('profileActivitySection');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(sec, anchor);
      else ($('profileCard') || bio).insertAdjacentElement('afterend', sec);
    }
    return true;
  }

  function onProfileRendered(d) {
    if (!d || !d.nick) return;
    lastRendered = d;
    if (!ctx) return;                           // processa no mount()
    if (!ensureProfileDom()) return;

    const nick = String(d.nick).toLowerCase();
    const changed = view.nick !== nick;
    view = { nick, isSelf: d.mode === 'self' || nick === self(), hidden: Boolean(d.data && d.data.details_hidden) };
    if (d.data && d.data.social) COUNTS[nick] = d.data.social;
    if (d.data) mergeCards({ [nick]: { nick, username: nick, display_name: d.data.display_name,
                                       name: d.data.display_name, avatar: d.data.avatar || '', role: d.data.role } });

    renderCounts();
    renderFollowBtn();

    const focusHere = pendingFocus && pendingFocus.nick === nick;
    if (changed || focusHere || feed.loadedFor !== nick) {
      feed.tab = 'posts';
      resetFeed();
      renderTabs();
      renderComposer(true);
      loadPosts();
    } else {
      renderTabs();
      renderComposer(false);
    }
  }
  document.addEventListener('profile:rendered', (ev) => onProfileRendered(ev.detail));

  // ═══════════════════════════════════════════════════════════
  // AÇÕES RÁPIDAS (mini perfil da DM e outros cartões)
  // ═══════════════════════════════════════════════════════════
  function createQuickActions(profile, nick, opts) {
    ensureStyles();
    const root = el('div', { class: 'soc-quick' });
    const target = String(nick || (profile && (profile.username || profile.nick)) || '').toLowerCase();
    if (!target || target === self() || !profile) { root.hidden = true; return root; }

    const social = profile.social || {};
    const fs = profile.friendship_status || 'none';
    mergeCards({ [target]: { nick: target, display_name: profile.display_name, name: profile.display_name,
                             avatar: profile.avatar || '', role: profile.role } });
    COUNTS[target] = Object.assign({}, COUNTS[target], social);

    // contadores clicáveis
    const bar = el('div', { class: 'soc-counts', style: 'margin:0' });
    [['friends', 'Amigos'], ['followers', plural(social.followers, 'Seguidor', 'Seguidores')],
     ['following', 'Seguindo']].forEach(([kind, label]) => {
      const b = el('button', { type: 'button', class: 'soc-count' }, el('b', { text: fmtNum(social[kind]) }), el('span', { text: label }));
      b.addEventListener('click', () => openList(target, kind));
      bar.append(b);
    });
    if (social.follows_you) bar.append(el('span', { class: 'soc-chip', text: 'Segue você' }));
    root.append(bar);

    // seguir
    const actions = el('div', { class: 'soc-quick-actions' });
    const refreshProfile = () => send({ t: 'profile_view', nick: target });
    const follow = el('button', { type: 'button', class: 'soc-mini-btn' + (social.is_following ? ' is-on' : ''),
                                  text: social.is_following ? 'Seguindo ✓' : 'Seguir' });
    follow.addEventListener('click', () => {
      follow.disabled = true;
      if (toggleFollow(target, Boolean(social.is_following))) refreshProfile(); else follow.disabled = false;
    });
    actions.append(follow);

    // amizade
    const friend = el('button', { type: 'button', class: 'soc-mini-btn' });
    const act = (type) => {
      if (type === 'friend_remove' && !confirm('Remover @' + target + ' da sua lista de amigos?')) return;
      friend.disabled = true;
      if (send({ t: type, nick: target })) refreshProfile(); else friend.disabled = false;
    };
    if (fs === 'friends') { friend.textContent = 'Amigos ✓'; friend.classList.add('is-on'); friend.addEventListener('click', () => act('friend_remove')); }
    else if (fs === 'pending_out') { friend.textContent = 'Pedido enviado'; friend.classList.add('is-on'); friend.disabled = true; }
    else if (fs === 'pending_in') { friend.textContent = 'Aceitar pedido'; friend.addEventListener('click', () => act('friend_accept')); }
    else { friend.textContent = 'Adicionar amigo'; friend.addEventListener('click', () => act('friend_request')); }
    actions.append(friend);

    root.append(actions);
    return root;
  }

  // ═══════════════════════════════════════════════════════════
  // NOTIFICAÇÕES → navegar até o conteúdo
  // ═══════════════════════════════════════════════════════════
  function openNotification(n) {
    if (!n) return;
    if (n.post_id && n.post_owner) {
      pendingFocus = { id: n.post_id, nick: n.post_owner };
      goProfile(n.post_owner);
      if (n.post_owner === self()) {
        // voltar ao próprio perfil nem sempre re-renderiza: recarrega o feed manualmente
        setTimeout(() => {
          if (view.nick === self() && !feed.loading) { feed.tab = 'posts'; resetFeed(); renderTabs(); renderComposer(true); loadPosts(); }
        }, 80);
      }
    } else {
      goProfile(n.actor);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MENSAGENS DO SERVIDOR (roteadas pelo app.js: tipos "social_*")
  // ═══════════════════════════════════════════════════════════
  function onMessage(m) {
    if (!m || typeof m.t !== 'string') return;
    mergeCards(m.cards);
    switch (m.t) {
      case 'social_state':
        COUNTS[m.nick] = Object.assign({}, COUNTS[m.nick], m.social);
        if (m.nick === view.nick) { renderCounts(); renderFollowBtn(); renderTabs(); }
        break;
      case 'social_posts':
        if (m.nick !== view.nick || m.tab !== feed.tab) break;
        feed.loading = false;
        feed.hidden = Boolean(m.hidden);
        feed.more = Boolean(m.more);
        feed.items = m.append ? feed.items.concat(m.items || []) : (m.items || []);
        feed.loadedFor = view.nick;
        feed.pages = m.append ? feed.pages + 1 : 1;
        renderFeed();
        renderComposer(false);
        consumePendingFocus();
        break;
      case 'social_post_created': {
        resetComposer();
        if (view.isSelf && feed.tab === 'posts' && m.post) {
          feed.items.unshift(m.post);
          feed.hidden = false;
          renderFeed();
        }
        break;
      }
      case 'social_post_update': {
        const p = m.post;
        if (!p) break;
        const idx = feed.items.findIndex(x => x.id === p.id);
        if (idx >= 0) feed.items[idx] = Object.assign({}, feed.items[idx], p, { repost_by: feed.items[idx].repost_by, repost_ts: feed.items[idx].repost_ts });
        document.querySelectorAll('.soc-post[data-post-id="' + p.id + '"]').forEach(c => applyPostState(c, p));
        break;
      }
      case 'social_post_deleted':
        feed.items = feed.items.filter(x => x.id !== m.id);
        document.querySelectorAll('.soc-post[data-post-id="' + m.id + '"]').forEach(c => c.remove());
        if (!feed.items.length) renderFeed();
        break;
      case 'social_comments': renderComments(m); break;
      case 'social_list': renderList(m); break;
      case 'social_error':
        composer.busy = false;
        if (composer.refresh) composer.refresh();
        toast(m.m || 'Não foi possível concluir a ação.');
        break;
      case 'social_notifs':
      case 'social_notif_new':
      case 'social_unread':
      case 'social_prefs':
        if (window.FriendsUI && typeof window.FriendsUI.onSocialMessage === 'function') window.FriendsUI.onSocialMessage(m);
        break;
      default: break;
    }
  }

  function mount(opts) {
    ctx = opts || {};
    ensureStyles();
    if (lastRendered) onProfileRendered(lastRendered);
  }

  window.SocialUI = { mount, onMessage, createQuickActions, openNotification, getCard, openList };
})();