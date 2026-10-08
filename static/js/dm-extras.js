// /static/js/dm-extras.js
(function () {
  'use strict';
  if (window.__dmExtrasLoaded) return;
  window.__dmExtrasLoaded = true;

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

  const MAX_AVATAR_DATA_LENGTH = 120000;

  let _currentProfile = null;
  let _profileNick = null;
  let _currentNick = null;
  let currentUserId = null;
  let currentUserName = null;
  let _loadingTimer = null;
  let _openingProfile = false;

  // ═══════════════════════════════════════════════════════════
  // 0a. SELOS (staff / vip / streamer / beta)
  // ═══════════════════════════════════════════════════════════
  const BADGE_DEFS = {
    staff: {
      color: '#f2b84b',
      label: { dev: 'DEV verificado', admin: 'Administrador verificado', mod: 'Moderador verificado' },
      defaultLabel: 'Equipe verificada',
      svg:
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">' +
        '<path d="M21.71 20.29l-6.88-6.88a6.5 6.5 0 0 0-7.9-7.9l3.19 3.19-2.83 2.83-3.19-3.19a6.5 6.5 0 0 0 7.9 7.9l6.88 6.88a1 1 0 0 0 1.41 0l1.42-1.42a1 1 0 0 0 0-1.41z"/>' +
        '<circle cx="6.5" cy="17.5" r="1.5"/>' +
        '</svg>',
    },
    vip: {
      color: '#4c8dff',
      label: { vip: 'VIP verificado' },
      defaultLabel: 'Conta verificada',
      svg:
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">' +
        '<path d="M12 1.5l2.85 2.28 3.57-.33 1.07 3.43 3.18 1.62-1.13 3.4 1.13 3.4-3.18 1.62-1.07 3.43-3.57-.33L12 22.5l-2.85-2.28-3.57.33-1.07-3.43-3.18-1.62 1.13-3.4-1.13-3.4 3.18-1.62 1.07-3.43 3.57.33L12 1.5zm-1.4 14.3l6.1-6.1-1.5-1.5-4.6 4.6-2.1-2.1-1.5 1.5 3.6 3.6z"/>' +
        '</svg>',
    },
    streamer: {
      color: '#ff0000',
      label: { streamer: 'Streamer' },
      defaultLabel: 'Streamer',
      svg:
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">' +
        '<path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-5.8 31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6z"/>' +
        '</svg>',
    },
    beta: {
      color: '#ff9d2e',
      label: { beta: 'Beta Tester' },
      defaultLabel: 'Beta Tester',
      emoji: '🚧',
    },
  };
  const ROLE_TO_BADGE = {
    dev: 'staff', admin: 'staff', mod: 'staff',
    vip: 'vip', streamer: 'streamer',
    beta: 'beta',
  };

  function roleKeyFromProfile(data) {
    if (!data) return 'user';
    const raw = String(data.role || '').toLocaleLowerCase('pt-BR').trim();
    if (raw) return raw;
    const roles = Array.isArray(data.community_roles) ? data.community_roles : [];
    for (const role of roles) {
      const key = String(role || '').toLocaleUpperCase('pt-BR').trim();
      if (key === 'DEV') return 'dev';
      if (key === 'ADMIN') return 'admin';
      if (key === 'MOD' || key === 'MODERADOR' || key === 'MODERATOR') return 'mod';
      if (key === 'VIP') return 'vip';
      if (key === 'STREAMER') return 'streamer';
      if (key === 'BETA') return 'beta';
    }
    return 'user';
  }
  function badgeKeyForRole(rawRole) {
    const key = String(rawRole || '').toLocaleLowerCase('pt-BR').trim();
    return ROLE_TO_BADGE[key] || null;
  }
  function badgeDefForRole(rawRole) {
    const k = badgeKeyForRole(rawRole);
    return k ? BADGE_DEFS[k] : null;
  }
  function isVerifiedProfile(data) { return Boolean(badgeDefForRole(roleKeyFromProfile(data))); }
  function labelForRole(roleKey) {
    const def = badgeDefForRole(roleKey);
    if (!def) return 'Conta verificada';
    return def.label[roleKey] || def.defaultLabel;
  }

  const normNick = (v) => String(v == null ? '' : v).trim().toLocaleLowerCase('pt-BR');

  function ensureHeaderBadge() {
    let badge = $('dmWithVerified');
    if (!badge) {
      const nameEl = $('dmWith');
      if (!nameEl || !nameEl.parentNode) return null;
      badge = document.createElement('span');
      badge.id = 'dmWithVerified';
      badge.dataset.dmCreated = '1';
      badge.hidden = true;
      badge.setAttribute('role', 'img');
      badge.style.cssText =
        'display:none;place-items:center;width:16px;height:16px;margin-left:6px;vertical-align:middle;flex:0 0 auto;';
      nameEl.insertAdjacentElement('afterend', badge);
    }
    return badge;
  }

  function setVerifiedBadge(isVerifiedFlag, roleOrProfile) {
    const badge = ensureHeaderBadge();
    if (!badge) return;

    let role = 'user';
    if (roleOrProfile && typeof roleOrProfile === 'object') role = roleKeyFromProfile(roleOrProfile);
    else if (typeof roleOrProfile === 'string') role = roleOrProfile.toLocaleLowerCase('pt-BR').trim();

    const def = badgeDefForRole(role);
    const forceHide = isVerifiedFlag === false;

    if (!def || forceHide) {
      badge.hidden = true;
      badge.removeAttribute('data-badge');
      badge.removeAttribute('data-role');
      badge.setAttribute('aria-label', 'Conta verificada');
      badge.setAttribute('title', 'Conta verificada');
      if (badge.dataset.dmCreated === '1') badge.style.display = 'none';
      return;
    }

    badge.hidden = false;
    badge.dataset.badge = badgeKeyForRole(role) || '';
    badge.dataset.role = role;

    if (def.emoji) {
      badge.innerHTML = '';
      badge.textContent = def.emoji;
      badge.style.color = '';
      badge.style.fontSize = '16px';
      badge.style.lineHeight = '1';
      badge.style.filter = 'drop-shadow(0 0 6px ' + def.color + 'aa)';
    } else {
      badge.innerHTML = def.svg;
      badge.style.fontSize = '';
      badge.style.lineHeight = '';
      badge.style.color = def.color;
      badge.style.filter = 'drop-shadow(0 0 6px ' + def.color + '88)';
    }
    if (badge.dataset.dmCreated === '1') badge.style.display = 'inline-grid';

    const label = labelForRole(role);
    badge.setAttribute('aria-label', label);
    badge.setAttribute('title', label);

    badge.style.animation = 'none';
    void badge.offsetWidth;
    badge.style.animation = '';
  }

  // ═══════════════════════════════════════════════════════════
  // 0b. CABEÇALHO DA CONVERSA
  // ═══════════════════════════════════════════════════════════
  function initialLetter(name) {
    const s = String(name || '?').trim();
    return s.slice(0, 1).toLocaleUpperCase('pt-BR') || '?';
  }
  function isDataAvatar(image) {
    return (
      typeof image === 'string' &&
      /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image) &&
      image.length <= MAX_AVATAR_DATA_LENGTH
    );
  }

  function applyProfileToHeader(profile) {
    if (!profile) return;
    const nameEl = $('dmWith');
    const avatarEl = $('dmWithAvatar');
    const statusEl = $('dmWithStatus');
    const displayName = profile.display_name || profile.username || _currentNick || 'Jogador';

    if (nameEl) nameEl.textContent = displayName;

    if (avatarEl) {
      avatarEl.replaceChildren();
      if (isDataAvatar(profile.avatar)) {
        const img = document.createElement('img');
        img.src = profile.avatar; img.alt = ''; img.loading = 'lazy';
        avatarEl.appendChild(img);
      } else {
        avatarEl.textContent = initialLetter(displayName);
      }
    }

    if (statusEl) {
      const online = typeof profile.online === 'boolean' ? profile.online : null;
      let text;
      if (profile.details_hidden) text = 'Perfil restrito';
      else if (online === true) text = 'Online agora';
      else if (online === false) text = 'Offline';
      else if (profile.rank) text = 'Rank ' + profile.rank;
      else text = 'visto por último recentemente';
      statusEl.textContent = text;
      statusEl.classList.toggle('is-online', online === true);
      statusEl.classList.toggle('is-offline', online === false);
    }

    setVerifiedBadge(
      typeof profile.verified === 'boolean' ? profile.verified : undefined,
      profile
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 0c. DIALOG "VER PERFIL"
  // ═══════════════════════════════════════════════════════════
  function isMythicPlus(rank) {
    const key = String(rank || '').toLocaleLowerCase('pt-BR').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim();
    return key === 'mitico' || key === 'honra mitica' || key === 'gloria mitica' || key === 'imortal';
  }

  function buildProfileDialogRow(icon, label, value) {
    const row = el('div', { class: 'dm-profile-row' });
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--dm-line,rgba(255,255,255,.07));';
    const ic = el('span'); ic.textContent = icon;
    ic.style.cssText = 'width:22px;text-align:center;font-size:1.05rem;';
    const copy = el('div');
    copy.style.cssText = 'display:flex;flex-direction:column;min-width:0;flex:1 1 auto;';
    const lb = el('span'); lb.textContent = label;
    lb.style.cssText = 'color:var(--dm-muted,#9298a3);font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;';
    const vl = el('b'); vl.textContent = value;
    vl.style.cssText = 'font-size:.95rem;';
    copy.append(lb, vl); row.append(ic, copy);
    return row;
  }

  function buildFallbackSummary(profile, displayName) {
    const wrap = el('div');
    const head = el('div');
    head.style.cssText = 'display:flex;align-items:center;gap:14px;margin-bottom:14px;';
    const avatar = el('div');
    avatar.style.cssText = 'width:64px;height:64px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:linear-gradient(145deg,#262b34,#171a20);color:var(--dm-accent,#d4b45a);font-weight:700;font-size:1.4rem;text-transform:uppercase;flex:0 0 auto;';
    if (isDataAvatar(profile.avatar)) {
      const img = document.createElement('img');
      img.src = profile.avatar; img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      avatar.appendChild(img);
    } else avatar.textContent = initialLetter(displayName);

    const info = el('div');
    info.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto;';
    const nmRow = el('div');
    nmRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
    const nm = el('b'); nm.textContent = displayName;
    nm.style.cssText = 'font-size:1.15rem;';
    nmRow.appendChild(nm);

    const role = roleKeyFromProfile(profile);
    const def = badgeDefForRole(role);
    if (def) {
      const badge = el('span');
      if (def.emoji) {
        badge.textContent = def.emoji;
        badge.style.cssText = 'display:inline-grid;place-items:center;width:16px;height:16px;font-size:14px;line-height:1;filter:drop-shadow(0 0 5px ' + def.color + 'aa);';
      } else {
        badge.innerHTML = def.svg;
        badge.style.cssText = 'display:inline-grid;place-items:center;width:16px;height:16px;color:' + def.color + ';filter:drop-shadow(0 0 5px ' + def.color + '88);';
      }
      badge.title = labelForRole(role);
      badge.setAttribute('aria-label', labelForRole(role));
      nmRow.appendChild(badge);
    }

    const nick = el('small');
    nick.textContent = '@' + (profile.username || _currentNick || '');
    nick.style.cssText = 'color:var(--dm-muted,#9298a3);font-size:.82rem;';
    info.append(nmRow, nick);
    head.append(avatar, info);
    wrap.appendChild(head);

    if (profile.details_hidden) {
      const note = el('p');
      note.textContent = '🔒 Este perfil é ' +
        (profile.visibility === 'friends' ? 'visível apenas para amigos.' : 'privado.');
      note.style.cssText = 'margin:0;color:var(--dm-muted,#9298a3);';
      wrap.appendChild(note);
      return wrap;
    }

    if (profile.bio) {
      const bio = el('p');
      bio.textContent = profile.bio;
      bio.style.cssText = 'margin:0 0 12px;color:var(--dm-muted,#9298a3);font-size:.9rem;line-height:1.5;';
      wrap.appendChild(bio);
    }

    const details = el('div');
    details.style.cssText = 'margin:6px 0 4px;';
    if (profile.rank) {
      const stars = (isMythicPlus(profile.rank) && profile.stars != null && profile.stars !== '')
        ? ' · ' + profile.stars + ' ★' : '';
      details.appendChild(buildProfileDialogRow('🏅', 'Rank', profile.rank + stars));
    }
    if (profile.game_role) details.appendChild(buildProfileDialogRow('🎯', 'Função principal', profile.game_role));
    if (profile.hero) details.appendChild(buildProfileDialogRow('🦸', 'Herói principal', profile.hero));
    if (profile.gid) details.appendChild(buildProfileDialogRow('🆔', 'ID no jogo', profile.gid));
    if (profile.title) details.appendChild(buildProfileDialogRow('✨', 'Título', profile.title));
    if (profile.joined_at) {
      try {
        const text = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
          .format(new Date(profile.joined_at));
        details.appendChild(buildProfileDialogRow('📅', 'Na comunidade desde', text));
      } catch (e) {}
    }
    if (details.childElementCount) wrap.appendChild(details);
    return wrap;
  }

  function dialogMessage(text) {
    const p = document.createElement('p');
    p.textContent = text;
    p.style.cssText = 'margin:0;color:var(--dm-muted,#9298a3);';
    return p;
  }

  function renderProfileDialog(profile) {
    const content = $('dmProfileContent');
    const nameEl = $('dmProfileName');
    if (!content) return;

    clearTimeout(_loadingTimer);

    if (!profile) {
      content.replaceChildren(dialogMessage('Carregando perfil…'));
      _loadingTimer = setTimeout(() => {
        const dlg = $('dmProfileDialog');
        if (dlg && dlg.open && !_currentProfile) {
          content.replaceChildren(dialogMessage('Não foi possível carregar o perfil agora.'));
        }
      }, 5000);
      return;
    }

    const displayName = profile.display_name || profile.username || _currentNick || 'Jogador';
    if (nameEl) nameEl.textContent = displayName;

    content.replaceChildren();

    let summary = null;
    if (window.ProfileUI && typeof window.ProfileUI.createProfileSummary === 'function') {
      try {
        summary = window.ProfileUI.createProfileSummary(profile, { nick: _profileNick || _currentNick });
      } catch (err) {
        console.error('[dm-extras] createProfileSummary falhou:', err);
      }
    }
    content.appendChild(summary || buildFallbackSummary(profile, displayName));

    const target = _profileNick || profile.username || _currentNick;
    if (target && typeof window.abrirPerfil === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '👤 Ver perfil completo';
      btn.style.cssText = 'display:block;width:100%;margin-top:14px;min-height:40px;border-radius:10px;background:var(--dm-s3,#1b1f26);box-shadow:inset 0 0 0 1px var(--dm-line-2,rgba(255,255,255,.12));color:var(--dm-text,#f5f5f5);font-weight:600;cursor:pointer;';
      btn.addEventListener('click', () => {
        const dlg = $('dmProfileDialog');
        if (dlg && dlg.open) dlg.close();
        window.abrirPerfil(target);
      });
      content.appendChild(btn);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 0d. APLICAR PERFIL
  // ═══════════════════════════════════════════════════════════
  function activeNick() {
    try {
      const n = window.Society && window.Society.getCurrentDmNick && window.Society.getCurrentDmNick();
      if (n) return n;
    } catch (e) {}
    return currentUserId || _currentNick || null;
  }
  function matchesActive(nick, profile) {
    const active = normNick(activeNick());
    if (!active) return true;
    const candidates = [nick, profile && profile.username, profile && profile.nick]
      .map(normNick).filter(Boolean);
    if (!candidates.length) return true;
    return candidates.includes(active);
  }
  function cachedFor(nick) {
    if (!_currentProfile) return null;
    const want = normNick(nick);
    if (!want) return _currentProfile;
    const have = [_profileNick, _currentProfile.username].map(normNick);
    return have.includes(want) ? _currentProfile : null;
  }
  function applyDmProfile(profile, nick) {
    if (!profile || typeof profile !== 'object') return false;
    if (!matchesActive(nick, profile)) {
      console.log('[dm-extras] perfil ignorado (outra conversa):', nick || profile.username);
      return false;
    }
    _currentProfile = profile;
    _profileNick = nick || profile.username || profile.nick || activeNick();
    _currentNick = _profileNick || _currentNick;
    window.__dmCurrentProfile = profile;

    applyProfileToHeader(profile);

    const dlg = $('dmProfileDialog');
    if (dlg && dlg.open) renderProfileDialog(profile);
    return true;
  }
  function handleServerMessage(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.t === 'dm_history' && msg.profile) return applyDmProfile(msg.profile, msg.nick);
    if (msg.t === 'pview' && msg.p) return applyDmProfile(msg.p, msg.nick);
    return false;
  }

  // ═══════════════════════════════════════════════════════════
  // 0e. REQUEST DE PERFIL via WS
  // ═══════════════════════════════════════════════════════════
  function getSendFn() {
    return (typeof window.appSend === 'function' && window.appSend) ||
           (typeof window.send === 'function' && window.send) ||
           null;
  }
  function requestProfile(nick) {
    if (!nick) return false;
    const sendFn = getSendFn();
    if (!sendFn) {
      console.warn('[dm-extras] requestProfile: sem appSend/send disponível');
      return false;
    }
    try {
      const ok = sendFn({ t: 'profile_view', nick: String(nick) });
      if (ok === false) { console.warn('[dm-extras] profile_view não enviado (WS fechado)'); return false; }
      console.log('[dm-extras] 📡 profile_view enviado para:', nick);
      return true;
    } catch (err) {
      console.warn('[dm-extras] requestProfile falhou:', err);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 0f. RESOLUÇÃO DO USUÁRIO + ABRIR PERFIL
  // ═══════════════════════════════════════════════════════════
  function extractIdFromEl(node) {
    if (!node) return null;
    const d = node.dataset || {};
    const candidates = [
      d.userId, d.userid, d.user, d.uid, d.id,
      d.jid, d.contact, d.contactId, d.peer, d.peerId,
      d.target, d.targetId, d.who, d.whoId,
    ];
    for (const c of candidates) if (c && String(c).length > 0) return String(c);
    return null;
  }
  function extractIdFromTree(node) {
    let cur = node, depth = 0;
    while (cur && depth < 8) {
      const id = extractIdFromEl(cur);
      if (id) return id;
      cur = cur.parentElement; depth++;
    }
    return null;
  }
  function readName() {
    const b = $('dmWith');
    if (b && b.textContent.trim()) return b.textContent.trim();
    const t = $('dmProfileName');
    if (t && t.textContent.trim()) return t.textContent.trim();
    return null;
  }
  function resolveUserId() {
    try {
      const n = window.Society && window.Society.getCurrentDmNick && window.Society.getCurrentDmNick();
      if (n) return n;
    } catch (e) {}
    const chat = $('dmChat');
    if (chat) { const id = extractIdFromTree(chat); if (id) return id; }
    return currentUserId || null;
  }
  function dumpDiagnostic() {
    console.group('[dm-extras] 🔍 DIAGNÓSTICO');
    console.log('Society.getCurrentDmNick():', window.Society?.getCurrentDmNick?.());
    console.log('currentUserId:', currentUserId);
    console.log('currentUserName:', currentUserName);
    console.log('_currentNick:', _currentNick);
    console.log('_profileNick:', _profileNick);
    console.log('_currentProfile:', _currentProfile);
    console.log('Nome no cabeçalho:', readName());
    console.log('appSend disponível?', typeof window.appSend === 'function');
    console.log('ProfileUI.createProfileSummary?', typeof window.ProfileUI?.createProfileSummary);
    console.groupEnd();
  }

  function openCurrentProfile() {
    const userId = resolveUserId();
    if (!userId) {
      console.warn('[dm-extras] ❌ Sem userId na conversa atual — não dá pra abrir o perfil.');
      dumpDiagnostic();
      return false;
    }
    const cached = cachedFor(userId);
    const dlg = $('dmProfileDialog');
    if (dlg && typeof dlg.showModal === 'function') {
      renderProfileDialog(cached);
      _openingProfile = true;
      if (!dlg.open) dlg.showModal();
      setTimeout(() => { _openingProfile = false; }, 0);
    }
    requestProfile(userId);
    return true;
  }

  function onThreadChanged(nick) {
    if (!nick) return;
    if (normNick(nick) !== normNick(_profileNick)) {
      _currentProfile = null;
      window.__dmCurrentProfile = null;
    }
    _currentNick = nick;
    setVerifiedBadge(false);
    setTimeout(() => {
      if (!_currentProfile && normNick(activeNick()) === normNick(nick)) requestProfile(nick);
    }, 1200);
  }

  window.DmProfileBridge = {
    applyProfile: (profile, nick) => applyDmProfile(profile, nick),
    handleMessage: handleServerMessage,
    setCurrentUser(userId, userName) {
      currentUserId = userId || null;
      if (userName) currentUserName = userName;
      const btn = $('dmViewProfile');
      if (btn) {
        if (userId) btn.dataset.userId = String(userId);
        else delete btn.dataset.userId;
      }
      onThreadChanged(userId);
    },
    getCurrentUser() {
      return { userId: resolveUserId(), name: currentUserName || readName() };
    },
    openProfile: openCurrentProfile,
    diagnose: dumpDiagnostic,
    setVerified: (verified, roleOrProfile) => setVerifiedBadge(verified, roleOrProfile),
    getCurrentProfile: () => _currentProfile,
    requestProfile,
  };

  // ═══════════════════════════════════════════════════════════
  // 1. EMOJI
  // ═══════════════════════════════════════════════════════════
  const EMOJI_CATS = [
    { id: 'carinhas', icon: '😀', items: '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 ☠️ 👽 👾 🤖 🎃'.split(' ') },
    { id: 'maos', icon: '👋', items: '👋 🤚 🖐️ ✋ 🖖 👌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🦿 🦵 🦶 👂 👃 🧠 🦷 🦴 👀 👁️ 👅 👄 💋'.split(' ') },
    { id: 'coracoes', icon: '❤️', items: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💯 💢 💥 💫 💦 💨 🕳️ 💬 💭 💤'.split(' ') },
    { id: 'objetos', icon: '🎮', items: '🎮 🕹️ 🎲 🎯 🎰 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎵 🎶 📱 💻 🖥️ ⌨️ 🖱️ 🖨️ 📷 📸 📹 🎥 📽️ 📞 ☎️ 📟 📠 📺 📻 🔋 🔌 💡 🔦 🕯️ 🧯 🛢️ 💸 💵 💴 💶 💷 💰 💳 💎 ⚖️ 🔧 🔨 ⚒️ 🛠️ ⛏️ 🔩 ⚙️ ⛓️ 🔫 💣 🧨 🪓 🔪 🗡️ ⚔️ 🛡️'.split(' ') },
    { id: 'comida', icon: '🍕', items: '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🥙 🧆 🌮 🌯 🫔 🥗 🥘 🫕 🥫 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 ☕ 🫖 🍵 🧃 🥤 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾 🧊'.split(' ') }
  ];

  function initEmoji() {
    const btn = $('dmEmoji'), panel = $('dmEmojiPanel'), input = $('dmInput');
    if (!btn || !panel || !input) return;
    if (btn.dataset.dmBound === '1') return;
    btn.dataset.dmBound = '1';
    console.log('[dm-extras] ✅ emoji bound');

    let rendered = false;
    function render() {
      if (rendered) return;
      panel.replaceChildren();
      const tabs = el('div', { class: 'dm-emoji-tabs', role: 'tablist' });
      const grid = el('div', { class: 'dm-emoji-grid', role: 'tabpanel' });
      EMOJI_CATS.forEach((cat, idx) => {
        const t = el('button', { type: 'button', class: 'dm-emoji-tab', role: 'tab', title: cat.id, 'aria-label': cat.id, 'aria-selected': idx === 0 ? 'true' : 'false' });
        t.textContent = cat.icon;
        t.dataset.cat = cat.id;
        t.addEventListener('click', () => selectCat(cat.id));
        tabs.appendChild(t);
      });
      panel.append(tabs, grid);
      selectCat(EMOJI_CATS[0].id);
      rendered = true;
      function selectCat(id) {
        tabs.querySelectorAll('.dm-emoji-tab').forEach(x => x.setAttribute('aria-selected', x.dataset.cat === id ? 'true' : 'false'));
        grid.replaceChildren();
        const cat = EMOJI_CATS.find(c => c.id === id);
        if (!cat) return;
        cat.items.forEach(em => {
          const b = el('button', { type: 'button', class: 'dm-emoji-item', 'aria-label': em });
          b.textContent = em;
          b.addEventListener('click', () => insert(em));
          grid.appendChild(b);
        });
      }
    }
    function insert(em) {
      const max = parseInt(input.getAttribute('maxlength'), 10) || 200;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const next = input.value.slice(0, start) + em + input.value.slice(end);
      if (next.length > max) return;
      input.value = next;
      const pos = (input.value.slice(0, start) + em).length;
      try { input.setSelectionRange(pos, pos); } catch (e) {}
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }
    function open() {
      render();
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      btn.classList.add('is-on');
      panel.querySelector('.dm-emoji-item')?.focus();
    }
    function close(focusBack) {
      if (panel.hidden) return;
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      btn.classList.remove('is-on');
      if (focusBack) btn.focus();
    }
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); panel.hidden ? open() : close(true); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); close(true); } }, true);
    document.addEventListener('pointerdown', (e) => {
      if (panel.hidden) return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      close(false);
    }, true);
  }

  // ═══════════════════════════════════════════════════════════
  // 2. ANEXO
  // ═══════════════════════════════════════════════════════════
  const MAX_SIZE = 25 * 1024 * 1024;
  const ALLOWED = [
    'image/', 'video/', 'application/pdf', 'text/plain',
    'application/zip', 'application/x-zip-compressed',
  ];

  function initAttach() {
    const btn = $('dmAttach'), file = $('dmFile'), preview = $('dmAttachPreview');
    const thumb = $('dmAttachThumb'), nameEl = $('dmAttachName'), metaEl = $('dmAttachMeta');
    const rm = $('dmAttachRemove'), send = $('dmSend'), input = $('dmInput');
    if (!btn || !file || !preview || !thumb || !nameEl || !metaEl || !rm || !send) return;
    if (btn.dataset.dmBound === '1') return;
    btn.dataset.dmBound = '1';
    console.log('[dm-extras] ✅ attach bound');

    try {
      const cur = file.getAttribute('accept') || '';
      if (!cur.includes('video/')) file.setAttribute('accept', 'image/*,video/*,.pdf,.txt,.zip');
    } catch (e) {}

    let fileRef = null, previewUrl = null;
    const fmt = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
    const okType = (f) => ALLOWED.some(t => f.type === t || f.type.startsWith(t));
    const iconOf = (f) => {
      if (f.type.startsWith('image/')) return '🖼️';
      if (f.type.startsWith('video/')) return '🎬';
      if (f.type === 'application/pdf') return '📄';
      if (f.type === 'text/plain') return '📝';
      if (f.type.includes('zip')) return '🗜️';
      return '📎';
    };

    function reset() {
      if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
      fileRef = null; file.value = '';
      preview.hidden = true; thumb.replaceChildren();
      nameEl.textContent = ''; metaEl.textContent = '';
      metaEl.classList.remove('is-error');
    }
    function showErr(msg) {
      nameEl.textContent = 'Anexo inválido'; metaEl.textContent = msg;
      metaEl.classList.add('is-error'); preview.hidden = false;
      setTimeout(() => { if (metaEl.classList.contains('is-error')) reset(); }, 3500);
    }

    btn.addEventListener('click', () => file.click());

    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (!f) return reset();
      if (f.size > MAX_SIZE) { showErr('Arquivo muito grande (máx 25 MB).'); file.value = ''; return; }
      if (!okType(f)) { showErr('Tipo não permitido.'); file.value = ''; return; }
      fileRef = f;
      nameEl.textContent = f.name;
      metaEl.textContent = fmt(f.size);
      metaEl.classList.remove('is-error');
      thumb.replaceChildren();
      if (f.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(f);
        const img = el('img', { alt: '' }); img.src = previewUrl;
        thumb.appendChild(img);
      } else thumb.textContent = iconOf(f);
      preview.hidden = false;
      try { window.dispatchEvent(new CustomEvent('dm:attach', { detail: { file: f } })); } catch (e) {}
    });

    rm.addEventListener('click', () => { reset(); input?.focus(); });

    async function upload(f) {
      const fd = new FormData(); fd.append('file', f);
      const r = await fetch('/api/dm/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
      if (!r.ok) {
        let msg = 'HTTP ' + r.status;
        try { const j = await r.json(); if (j.detail) msg = j.detail; } catch (e) {}
        throw new Error(msg);
      }
      const j = await r.json();
      return { url: j.url, type: j.type || f.type || '', name: j.name || f.name, size: j.size || f.size };
    }

    send.addEventListener('click', (e) => {
      if (!fileRef) return;
      if (send.dataset.dmUploading === '1') return;
      e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
      send.dataset.dmUploading = '1';
      metaEl.textContent = 'Enviando anexo…';
      const snapshot = fileRef;
      upload(snapshot).then((info) => {
        const max = parseInt(input.getAttribute('maxlength'), 10) || 200;
        const userText = (input.value || '').trim();
        const marker = '\u200B[dm-attach:' + info.url + '|' + info.type + '|' + encodeURIComponent(info.name) + ']';
        let combined;
        if (!userText) combined = marker;
        else {
          const available = Math.max(0, max - marker.length - 1);
          combined = userText.slice(0, available) + ' ' + marker;
        }
        input.value = combined;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        reset();
        send.click();
      }).catch((err) => {
        console.error('[dm-extras] upload falhou:', err);
        metaEl.textContent = err.message || 'Falha ao enviar anexo';
        metaEl.classList.add('is-error');
      }).finally(() => { send.dataset.dmUploading = ''; });
    }, true);
  }

  // ═══════════════════════════════════════════════════════════
  // 2b. RENDER DE ANEXO NAS BOLHAS
  // ═══════════════════════════════════════════════════════════
  const ATTACH_RE = /\u200B\[dm-attach:([^|]+)\|([^|]+)\|([^\]]+)\]/;

  function enhanceBubble(bub) {
    if (!bub || bub.dataset.dmEnhanced === '1') return;
    bub.dataset.dmEnhanced = '1';
    const textEl = bub.querySelector('.bub-text');
    if (!textEl) return;
    const raw = textEl.textContent || '';
    const match = raw.match(ATTACH_RE);
    if (!match) return;

    const url = match[1], type = match[2];
    let name = '';
    try { name = decodeURIComponent(match[3]); } catch (e) { name = match[3]; }
    const clean = raw.replace(ATTACH_RE, '').trim();
    textEl.textContent = clean;

    const wrap = document.createElement('div');
    wrap.className = 'bub-attach';

    if (type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = url; img.alt = name || 'Imagem'; img.loading = 'lazy';
      img.className = 'bub-attach-img';
      img.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
      wrap.appendChild(img);
    } else if (type.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = url; video.controls = true; video.preload = 'metadata';
      video.className = 'bub-attach-video';
      wrap.appendChild(video);
    } else {
      const icon = type === 'application/pdf' ? '📄'
                 : type === 'text/plain' ? '📝'
                 : type.includes('zip') ? '🗜️' : '📎';
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      a.className = 'bub-attach-file';
      const ic = document.createElement('span');
      ic.className = 'bub-attach-file-icon'; ic.textContent = icon;
      const nm = document.createElement('span');
      nm.className = 'bub-attach-file-name';
      nm.textContent = name || url.split('/').pop();
      a.append(ic, nm); wrap.appendChild(a);
    }

    if (clean) bub.insertBefore(wrap, textEl);
    else { textEl.remove(); bub.appendChild(wrap); }
  }

  function scanAllBubbles(root) {
    const scope = root || document;
    scope.querySelectorAll?.('.bub').forEach(enhanceBubble);
  }

  function startAttachObserver() {
    const msgs = $('dmMsgs');
    if (!msgs || msgs.dataset.dmObserved === '1') return;
    msgs.dataset.dmObserved = '1';
    console.log('[dm-extras] ✅ attach observer ativo');

    const obs = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.classList?.contains('bub')) enhanceBubble(node);
          else if (node.querySelectorAll) node.querySelectorAll('.bub').forEach(enhanceBubble);
        }
      }
    });
    obs.observe(msgs, { childList: true, subtree: true });
    scanAllBubbles(msgs);
  }

  // ═══════════════════════════════════════════════════════════
  // 3. MENU ⋯
  // ═══════════════════════════════════════════════════════════
  function initChatMenu() {
    const btn = $('dmChatMenu');
    if (!btn) return;
    if (btn.dataset.dmBound === '1') return;
    btn.dataset.dmBound = '1';
    console.log('[dm-extras] ✅ chat menu bound');

    let menu = null;
    const items = [
      { label: 'Ver perfil', icon: '👤', go: () => { if (!window.DmProfileBridge?.openProfile?.()) $('dmViewProfile')?.click(); } },
      { label: 'Denunciar', icon: '🚩', go: () => $('dmReportPlayer')?.click() },
      { label: 'Bloquear', icon: '🚫', danger: true, go: () => { if (confirm('Bloquear este jogador? Você não receberá mais mensagens dele.')) $('dmBlock')?.click(); } }
    ];

    function build() {
      menu = el('div', { class: 'dm-msg-menu', role: 'menu', 'aria-label': 'Opções da conversa', tabindex: '-1' });
      items.forEach((it, i) => {
        const b = el('button', { type: 'button', role: 'menuitem', class: 'dm-msg-menu-item' + (it.danger ? ' dm-msg-menu-danger' : '') });
        b.tabIndex = i === 0 ? 0 : -1;
        const ic = el('span', { class: 'dm-msg-menu-icon' }); ic.textContent = it.icon;
        const lb = el('span'); lb.textContent = it.label;
        b.append(ic, lb);
        b.addEventListener('click', () => { close(); it.go(); });
        b.addEventListener('keydown', onKey);
        menu.appendChild(b);
      });
      document.body.appendChild(menu);
    }
    function onKey(e) {
      const all = [...menu.querySelectorAll('.dm-msg-menu-item')];
      const i = all.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); const n = (i + 1) % all.length; all.forEach((x, k) => x.tabIndex = k === n ? 0 : -1); all[n].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); const n = (i - 1 + all.length) % all.length; all.forEach((x, k) => x.tabIndex = k === n ? 0 : -1); all[n].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') close(false);
    }
    function position() {
      const r = btn.getBoundingClientRect(); const w = 180;
      menu.style.top = (r.bottom + 6) + 'px';
      menu.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w)) + 'px';
    }
    function open() {
      if (!menu) build();
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      position();
      menu.querySelector('.dm-msg-menu-item')?.focus();
    }
    function close(focusBack) {
      if (!menu || menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (focusBack) btn.focus();
    }
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); (menu && !menu.hidden) ? close(true) : open(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu && !menu.hidden) { e.preventDefault(); close(true); } }, true);
    document.addEventListener('pointerdown', (e) => { if (!menu || menu.hidden) return; if (menu.contains(e.target) || btn.contains(e.target)) return; close(false); }, true);
    window.addEventListener('resize', () => { if (menu && !menu.hidden) position(); });
    window.addEventListener('scroll', () => { if (menu && !menu.hidden) position(); }, true);
  }

  // ═══════════════════════════════════════════════════════════
  // 4. VER PERFIL
  // ═══════════════════════════════════════════════════════════
  function initProfileBridge() {
    const btn = $('dmViewProfile');
    if (!btn) return;
    if (btn.dataset.dmBridge === '1') return;
    btn.dataset.dmBridge = '1';
    console.log('[dm-extras] ✅ profile bridge bound');

    const list = $('dmListBody');
    if (list) {
      list.addEventListener('click', (e) => {
        const thread = e.target.closest('.dm-thread');
        if (!thread) return;
        const id = extractIdFromTree(thread);
        if (id) {
          currentUserId = id;
          currentUserName = thread.querySelector('b')?.textContent?.trim() || null;
          onThreadChanged(id);
        }
      }, true);
    }

    window.addEventListener('dm:new-conversation', (e) => {
      const u = e.detail?.user;
      if (!u) return;
      const id = u.nick || u.username || u.id || u.userId || u.user_id || u.uid || u.jid;
      if (id) {
        currentUserId = String(id);
        currentUserName = u.name || u.displayName || u.username || null;
        onThreadChanged(String(id));
      }
    });

    if (!window.__dmProfileEventsBound) {
      window.__dmProfileEventsBound = true;
      const handleProfileEvent = (ev) => {
        const d = ev?.detail || {};
        const profileData = d.profile || d.p || d.data || null;
        if (!profileData) return;
        applyDmProfile(profileData, d.nick || d.userId || d.username);
      };
      ['dm:profile', 'dm:history', 'dm:open', 'profile:loaded'].forEach((evt) => {
        window.addEventListener(evt, handleProfileEvent);
        document.addEventListener(evt, handleProfileEvent);
      });
    }

    const interceptor = $('dmChat') || document;
    interceptor.addEventListener('click', (e) => {
      const t = e.target;
      if (t !== btn && !btn.contains(t)) return;
      e.stopImmediatePropagation(); e.stopPropagation(); e.preventDefault();
      openCurrentProfile();
    }, true);

    const dmDialog = $('dmProfileDialog');
    if (dmDialog) {
      const obsDialog = new MutationObserver(() => {
        if (!dmDialog.open || _openingProfile) return;
        const nick = resolveUserId();
        const cached = cachedFor(nick);
        if (cached) renderProfileDialog(cached);
        else if (nick) { renderProfileDialog(null); requestProfile(nick); }
      });
      obsDialog.observe(dmDialog, { attributes: true, attributeFilter: ['open'] });
    }

    if (_currentProfile && cachedFor(resolveUserId())) applyProfileToHeader(_currentProfile);
  }

  // ═══════════════════════════════════════════════════════════
  // 5. NOVA CONVERSA
  // ═══════════════════════════════════════════════════════════
  function initNewConversation() {
    const btn = $('dmNewConversation');
    if (!btn) return;
    if (btn.dataset.dmBound === '1') return;
    btn.dataset.dmBound = '1';
    console.log('[dm-extras] ✅ new conversation bound');

    let dialog = null, mode = 'friends', timer = null;

    function build() {
      dialog = el('dialog', { class: 'dm-profile-dialog', id: 'dmNewConversationDialog', 'aria-labelledby': 'dmNewConversationTitle' });
      dialog.style.width = 'min(520px, calc(100vw - 28px))';
      dialog.innerHTML = `
        <header class="dm-profile-head">
          <h2 id="dmNewConversationTitle">Nova conversa</h2>
          <button type="button" class="dm-icon-btn" data-dm-close aria-label="Fechar" title="Fechar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>
        <div class="dm-profile-body" style="padding:16px 18px">
          <label class="dm-search" for="dmNewSearchInput" style="margin:0 0 12px">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="dmNewSearchInput" type="search" autocomplete="off" placeholder="Buscar usuários" aria-label="Buscar usuários">
          </label>
          <div class="dm-filters" role="tablist" style="padding:0 0 12px">
            <button type="button" class="dm-chip" data-dm-tab="friends" aria-pressed="true">Amigos</button>
            <button type="button" class="dm-chip" data-dm-tab="all" aria-pressed="false">Todos os usuários</button>
          </div>
          <div id="dmNewResults" class="dm-list-body" style="max-height:340px;padding:0;background:transparent;border:0" aria-live="polite"></div>
        </div>`;
      document.body.appendChild(dialog);

      dialog.querySelector('[data-dm-close]').addEventListener('click', () => dialog.close());
      dialog.querySelectorAll('[data-dm-tab]').forEach(t => t.addEventListener('click', () => {
        mode = t.dataset.dmTab;
        dialog.querySelectorAll('[data-dm-tab]').forEach(x => x.setAttribute('aria-pressed', x.dataset.dmTab === mode ? 'true' : 'false'));
        loadResults();
      }));
      const search = dialog.querySelector('#dmNewSearchInput');
      search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(loadResults, 250); });
      search.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const first = dialog.querySelector('#dmNewResults .dm-thread');
          if (first) { e.preventDefault(); first.click(); }
        }
      });
      dialog.addEventListener('close', () => { search.value = ''; });
    }

    async function loadResults() {
      if (!dialog) return;
      const results = dialog.querySelector('#dmNewResults');
      const q = dialog.querySelector('#dmNewSearchInput').value.trim();
      if (mode === 'all' && q.length < 2) {
        results.replaceChildren(el('div', { class: 'dm-empty', textContent: 'Digite ao menos 2 caracteres para buscar.' }));
        return;
      }
      results.replaceChildren(el('div', { class: 'dm-empty', textContent: 'Carregando…' }));
      try {
        const url = mode === 'friends' ? '/api/friends/list' : `/api/users/search?q=${encodeURIComponent(q)}`;
        const r = await fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        const users = Array.isArray(data) ? data : (data.users || data.friends || []);
        renderResults(users);
      } catch (err) {
        console.error('[dm-extras] busca falhou:', err);
        results.replaceChildren(el('div', { class: 'dm-empty', textContent: 'Não foi possível carregar a lista agora.' }));
      }
    }

    function renderResults(users) {
      const results = dialog.querySelector('#dmNewResults');
      if (!users.length) { results.replaceChildren(el('div', { class: 'dm-empty', textContent: 'Nenhum usuário encontrado.' })); return; }
      results.replaceChildren();
      users.forEach(u => {
        const item = el('button', { type: 'button', class: 'dm-thread', role: 'listitem' });
        item.style.width = '100%';
        const id = u.id || u.userId || u.user_id || u.username || '';
        if (id) item.dataset.userId = String(id);

        const av = el('span', { class: 'dm-thread-avatar' });
        if (u.avatar || u.picture) { const img = el('img', { alt: '' }); img.src = u.avatar || u.picture; av.appendChild(img); }
        else av.textContent = (u.name || u.username || '?').charAt(0).toUpperCase();
        const cp = el('span', { class: 'dm-thread-copy' });
        cp.append(el('b', { textContent: u.name || u.username || 'Usuário' }), el('span', { class: 'dm-thread-preview', textContent: u.username ? '@' + u.username : '' }));
        const me = el('span', { class: 'dm-thread-meta' });
        if (u.isFriend) me.appendChild(el('span', { class: 'dm-thread-unread', textContent: '★' }));
        item.append(av, cp, me);
        item.addEventListener('click', () => openWith(u));
        results.appendChild(item);
      });
    }

    function openWith(user) {
      const id = user.id || user.userId || user.user_id || user.username;
      const list = $('dmListBody');
      if (list && id) {
        const sel = `.dm-thread[data-user-id="${CSS.escape(String(id))}"], .dm-thread[data-id="${CSS.escape(String(id))}"]`;
        const found = list.querySelector(sel);
        if (found) { found.click(); dialog.close(); return; }
      }
      window.dispatchEvent(new CustomEvent('dm:new-conversation', { detail: { user } }));
      dialog.close();
    }

    btn.addEventListener('click', (e) => {
      if (window.FriendsUI && typeof window.FriendsUI.mount === 'function') return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!dialog) build();
      dialog.showModal();
      setTimeout(() => dialog.querySelector('#dmNewSearchInput')?.focus(), 30);
      loadResults();
    }, true);
  }

  // ═══════════════════════════════════════════════════════════
  // 6. ALIASES GLOBAIS
  // ═══════════════════════════════════════════════════════════
  window.dmSetVerified = (verified, roleOrProfile) =>
    window.DmProfileBridge?.setVerified?.(verified, roleOrProfile);
  window.dmApplyProfile = (profile, nick) =>
    window.DmProfileBridge?.applyProfile?.(profile, nick);
  window.dmRequestProfile = (nick) =>
    window.DmProfileBridge?.requestProfile?.(nick);

  // ═══════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════
  function boot() {
    if (!document.getElementById('dmRoot')) return false;
    initEmoji();
    initAttach();
    initChatMenu();
    initNewConversation();
    initProfileBridge();
    startAttachObserver();
    return true;
  }

  boot();

  let bootQueued = false;
  const observer = new MutationObserver(() => {
    if (bootQueued) return;
    bootQueued = true;
    requestAnimationFrame(() => { bootQueued = false; boot(); });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  let tries = 0;
  const iv = setInterval(() => {
    tries++;
    if (boot() || tries >= 10) clearInterval(iv);
  }, 1000);

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-t="dm"]');
    if (t) setTimeout(boot, 100);
  }, true);

  document.addEventListener('dm:loaded', boot);
  window.addEventListener('dm:loaded', boot);

  window.dmExtras = {
    getPendingAttach: () => window.__dmPendingAttach || null,
    clearPendingAttach: () => { window.__dmPendingAttach = null; },
    applyProfile: (profile, nick) => window.DmProfileBridge?.applyProfile?.(profile, nick),
    getCurrentProfile: () => window.__dmCurrentProfile || null,
    requestProfile: (nick) => window.DmProfileBridge?.requestProfile?.(nick),
    reinit: boot,
  };

  console.log('[dm-extras] script pronto (aguardando #dmRoot)');
})();