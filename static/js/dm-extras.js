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

  // ═══════════════════════════════════════════════════════════
  // 0. SELO DE VERIFICADO (Dev / Admin / Mod)
  // ═══════════════════════════════════════════════════════════
  const VERIFIED_ROLE_KEYS = new Set([
    'DEV', 'ADMIN', 'MOD', 'MODERADOR', 'MODERATOR'
  ]);

  function roleKeyFromProfile(data) {
    if (!data) return 'user';
    const raw = String(data.role || '').toLocaleLowerCase('pt-BR').trim();
    if (raw === 'dev' || raw === 'admin' || raw === 'mod') return raw;

    const roles = Array.isArray(data.community_roles) ? data.community_roles : [];
    for (const role of roles) {
      const key = String(role || '').toLocaleUpperCase('pt-BR').trim();
      if (key === 'DEV') return 'dev';
      if (key === 'ADMIN') return 'admin';
      if (key === 'MOD' || key === 'MODERADOR' || key === 'MODERATOR') return 'mod';
    }
    return 'user';
  }

  function isVerifiedProfile(data) {
    if (!data) return false;
    if (typeof data.verified === 'boolean' && data.verified) return true;
    const key = roleKeyFromProfile(data);
    return key === 'dev' || key === 'admin' || key === 'mod';
  }

  function labelForRole(roleKey) {
    if (roleKey === 'dev')   return 'DEV verificado';
    if (roleKey === 'admin') return 'Administrador verificado';
    if (roleKey === 'mod')   return 'Moderador verificado';
    return 'Conta verificada';
  }

  function setVerifiedBadge(isVerifiedFlag, roleOrProfile) {
    const badge = $('dmWithVerified');
    if (!badge) return;

    let roleKey = 'user';
    let verified = Boolean(isVerifiedFlag);

    if (roleOrProfile && typeof roleOrProfile === 'object') {
      roleKey = roleKeyFromProfile(roleOrProfile);
      verified = isVerifiedProfile(roleOrProfile);
    } else if (typeof roleOrProfile === 'string') {
      const key = String(roleOrProfile).toLocaleLowerCase('pt-BR').trim();
      if (key === 'dev' || key === 'admin' || key === 'mod') {
        roleKey = key;
        verified = true;
      }
    }

    if (isVerifiedFlag === false) verified = false;

    badge.hidden = !verified;

    if (verified) {
      const label = labelForRole(roleKey);
      badge.dataset.role = roleKey;
      badge.setAttribute('aria-label', label);
      badge.setAttribute('title', label);
      badge.style.animation = 'none';
      void badge.offsetWidth;
      badge.style.animation = '';
    } else {
      badge.removeAttribute('data-role');
      badge.setAttribute('aria-label', 'Conta verificada');
      badge.setAttribute('title', 'Conta verificada');
    }
  }

  // Cache simples por nick → role, para não depender do WS
  const _roleCache = new Map();
  function rememberRole(nick, profile) {
    if (!nick || !profile) return;
    const key = roleKeyFromProfile(profile);
    if (key !== 'user') _roleCache.set(String(nick).toLowerCase(), key);
  }
  function recallRole(nick) {
    if (!nick) return null;
    return _roleCache.get(String(nick).toLowerCase()) || null;
  }

  // ═══════════════════════════════════════════════════════════
  // 0b. APLICAR PERFIL CONFIGURADO NA DM
  //     Nome, avatar, status, bio, rank, herói, título, etc.
  // ═══════════════════════════════════════════════════════════
  let _currentProfile = null;
  let _currentNick = null;

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

    // 1) Nome
    if (nameEl) nameEl.textContent = displayName;

    // 2) Avatar
    if (avatarEl) {
      avatarEl.replaceChildren();
      if (isDataAvatar(profile.avatar)) {
        const img = document.createElement('img');
        img.src = profile.avatar;
        img.alt = '';
        img.loading = 'lazy';
        avatarEl.appendChild(img);
      } else {
        avatarEl.textContent = initialLetter(displayName);
      }
    }

    // 3) Status (online/offline)
    if (statusEl) {
      const online = typeof profile.online === 'boolean' ? profile.online : null;
      let text;
      if (online === true)  text = 'Online agora';
      else if (online === false) text = 'Offline';
      else text = 'visto por último recentemente';
      statusEl.textContent = text;
      statusEl.classList.toggle('is-online', online === true);
      statusEl.classList.toggle('is-offline', online === false);
    }

    // 4) Selo de verificado
    setVerifiedBadge(
      typeof profile.verified === 'boolean' ? profile.verified : undefined,
      profile
    );

    // 5) Guarda para reuso
    _currentProfile = profile;
    window.__dmCurrentProfile = profile;
  }

  function buildProfileDialogRow(icon, label, value) {
    const row = el('div', { class: 'dm-profile-row' });
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--dm-line,rgba(255,255,255,.07));';
    const ic = el('span');
    ic.textContent = icon;
    ic.style.cssText = 'width:22px;text-align:center;font-size:1.05rem;';
    const copy = el('div');
    copy.style.cssText = 'display:flex;flex-direction:column;min-width:0;flex:1 1 auto;';
    const lb = el('span');
    lb.textContent = label;
    lb.style.cssText = 'color:var(--dm-muted,#9298a3);font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;';
    const vl = el('b');
    vl.textContent = value;
    vl.style.cssText = 'font-size:.95rem;';
    copy.append(lb, vl);
    row.append(ic, copy);
    return row;
  }

  function renderProfileDialog(profile) {
    const content = $('dmProfileContent');
    const nameEl = $('dmProfileName');
    if (!content) return;

    if (!profile) {
      content.textContent = 'Sem informações do perfil ainda.';
      return;
    }

    const displayName = profile.display_name || profile.username || _currentNick || 'Jogador';
    if (nameEl) nameEl.textContent = displayName;

    content.replaceChildren();

    // Cabeçalho: avatar + nome + selo
    const head = el('div');
    head.style.cssText = 'display:flex;align-items:center;gap:14px;margin-bottom:14px;';

    const avatar = el('div');
    avatar.style.cssText = 'width:64px;height:64px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:linear-gradient(145deg,#262b34,#171a20);color:var(--dm-accent,#d4b45a);font-weight:700;font-size:1.4rem;text-transform:uppercase;flex:0 0 auto;';
    if (isDataAvatar(profile.avatar)) {
      const img = document.createElement('img');
      img.src = profile.avatar;
      img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      avatar.appendChild(img);
    } else {
      avatar.textContent = initialLetter(displayName);
    }

    const info = el('div');
    info.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto;';
    const nmRow = el('div');
    nmRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
    const nm = el('b');
    nm.textContent = displayName;
    nm.style.cssText = 'font-size:1.15rem;';
    nmRow.appendChild(nm);

    // Selo inline no dialog
    if (isVerifiedProfile(profile)) {
      const roleKey = roleKeyFromProfile(profile);
      const colors = { dev: '#ff5f5f', admin: '#f2b84b', mod: '#4c8dff' };
      const badge = el('span');
      badge.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 1.5l2.85 2.28 3.57-.33 1.07 3.43 3.18 1.62-1.13 3.4 1.13 3.4-3.18 1.62-1.07 3.43-3.57-.33L12 22.5l-2.85-2.28-3.57.33-1.07-3.43-3.18-1.62 1.13-3.4-1.13-3.4 3.18-1.62 1.07-3.43 3.57.33L12 1.5zm-1.4 14.3l6.1-6.1-1.5-1.5-4.6 4.6-2.1-2.1-1.5 1.5 3.6 3.6z"/></svg>';
      badge.style.cssText = `display:inline-grid;place-items:center;width:16px;height:16px;color:${colors[roleKey] || '#4c8dff'};filter:drop-shadow(0 0 5px ${colors[roleKey] || '#4c8dff'}88);`;
      badge.title = labelForRole(roleKey);
      nmRow.appendChild(badge);
    }

    const nick = el('small');
    nick.textContent = '@' + (profile.username || _currentNick || '');
    nick.style.cssText = 'color:var(--dm-muted,#9298a3);font-size:.82rem;';

    info.append(nmRow, nick);
    head.append(avatar, info);
    content.appendChild(head);

    // Bio
    if (profile.bio) {
      const bio = el('p');
      bio.textContent = profile.bio;
      bio.style.cssText = 'margin:0 0 12px;color:var(--dm-muted,#9298a3);font-size:.9rem;line-height:1.5;';
      content.appendChild(bio);
    }

    // Detalhes (Rank, Função, Herói, ID)
    const details = el('div');
    details.style.cssText = 'margin:6px 0 4px;';

    if (profile.rank) {
      const stars = profile.stars != null ? ' · ' + profile.stars + ' ★' : '';
      details.appendChild(buildProfileDialogRow('🏅', 'Rank', profile.rank + stars));
    }
    if (profile.game_role) {
      details.appendChild(buildProfileDialogRow('🎯', 'Função principal', profile.game_role));
    }
    if (profile.hero) {
      details.appendChild(buildProfileDialogRow('🦸', 'Herói principal', profile.hero));
    }
    if (profile.gid) {
      details.appendChild(buildProfileDialogRow('🆔', 'ID no jogo', profile.gid));
    }
    if (profile.title) {
      details.appendChild(buildProfileDialogRow('✨', 'Título', profile.title));
    }
    if (profile.joined_at) {
      try {
        const d = new Date(profile.joined_at);
        const text = new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit', month: 'long', year: 'numeric'
        }).format(d);
        details.appendChild(buildProfileDialogRow('📅', 'Na comunidade desde', text));
      } catch (e) {}
    }

    if (details.childElementCount) content.appendChild(details);

    // Botão para abrir o perfil completo
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '👤 Ver perfil completo';
    btn.style.cssText = 'display:block;width:100%;margin-top:14px;min-height:40px;border-radius:10px;background:var(--dm-s3,#1b1f26);box-shadow:inset 0 0 0 1px var(--dm-line-2,rgba(255,255,255,.12));color:var(--dm-text,#f5f5f5);font-weight:600;cursor:pointer;';
    btn.addEventListener('click', () => {
      const dlg = $('dmProfileDialog');
      if (dlg) dlg.close();
      if (window.DmProfileBridge?.openProfile) window.DmProfileBridge.openProfile();
    });
    content.appendChild(btn);
  }

  function applyDmProfile(profile) {
    if (!profile) return;
    _currentProfile = profile;
    window.__dmCurrentProfile = profile;
    _currentNick = profile.username || profile.nick || _currentNick;

    rememberRole(_currentNick, profile);
    applyProfileToHeader(profile);

    // Se o dialog estiver aberto, atualiza
    const dlg = $('dmProfileDialog');
    if (dlg && dlg.open) renderProfileDialog(profile);
  }

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
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      panel.hidden ? open() : close(true);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); close(true); }
    }, true);
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
    'image/', 'video/',
    'application/pdf', 'text/plain',
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
      if (!cur.includes('video/')) {
        file.setAttribute('accept', 'image/*,video/*,.pdf,.txt,.zip');
      }
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
      } else {
        thumb.textContent = iconOf(f);
      }
      preview.hidden = false;
      try { window.dispatchEvent(new CustomEvent('dm:attach', { detail: { file: f } })); } catch (e) {}
    });

    rm.addEventListener('click', () => { reset(); input?.focus(); });

    async function upload(f) {
      const fd = new FormData();
      fd.append('file', f);
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
      upload(snapshot)
        .then((info) => {
          const max = parseInt(input.getAttribute('maxlength'), 10) || 200;
          const userText = (input.value || '').trim();
          const marker = '\u200B[dm-attach:' + info.url + '|' + info.type + '|' + encodeURIComponent(info.name) + ']';
          let combined;
          if (!userText) {
            combined = marker;
          } else {
            const available = Math.max(0, max - marker.length - 1);
            combined = userText.slice(0, available) + ' ' + marker;
          }
          input.value = combined;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          reset();
          send.click();
        })
        .catch((err) => {
          console.error('[dm-extras] upload falhou:', err);
          metaEl.textContent = err.message || 'Falha ao enviar anexo';
          metaEl.classList.add('is-error');
        })
        .finally(() => { send.dataset.dmUploading = ''; });
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

    const url = match[1];
    const type = match[2];
    let name = '';
    try { name = decodeURIComponent(match[3]); } catch (e) { name = match[3]; }

    const clean = raw.replace(ATTACH_RE, '').trim();
    textEl.textContent = clean;

    const wrap = document.createElement('div');
    wrap.className = 'bub-attach';

    if (type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = name || 'Imagem';
      img.loading = 'lazy';
      img.className = 'bub-attach-img';
      img.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
      wrap.appendChild(img);
    } else if (type.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.preload = 'metadata';
      video.className = 'bub-attach-video';
      wrap.appendChild(video);
    } else {
      const icon = type === 'application/pdf' ? '📄'
                 : type === 'text/plain' ? '📝'
                 : type.includes('zip') ? '🗜️'
                 : '📎';
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'bub-attach-file';
      const ic = document.createElement('span');
      ic.className = 'bub-attach-file-icon';
      ic.textContent = icon;
      const nm = document.createElement('span');
      nm.className = 'bub-attach-file-name';
      nm.textContent = name || url.split('/').pop();
      a.append(ic, nm);
      wrap.appendChild(a);
    }

    if (clean) {
      bub.insertBefore(wrap, textEl);
    } else {
      textEl.remove();
      bub.appendChild(wrap);
    }
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
      { label: 'Ver perfil', icon: '👤', go: () => window.DmProfileBridge?.openProfile?.() || $('dmViewProfile')?.click() },
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
      const r = btn.getBoundingClientRect();
      const w = 180;
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
  // 4. VER PERFIL — bridge + preenchimento do dialog
  // ═══════════════════════════════════════════════════════════
  function initProfileBridge() {
    const btn = $('dmViewProfile');
    if (!btn) return;
    if (btn.dataset.dmBridge === '1') return;
    btn.dataset.dmBridge = '1';
    console.log('[dm-extras] ✅ profile bridge bound');

    let currentUserId = null;
    let currentUserName = null;

    function extractIdFromEl(node) {
      if (!node) return null;
      const d = node.dataset || {};
      const candidates = [
        d.userId, d.userid, d.user, d.uid, d.id,
        d.jid, d.contact, d.contactId, d.peer, d.peerId,
        d.target, d.targetId, d.who, d.whoId,
      ];
      for (const c of candidates) {
        if (c && String(c).length > 0) return String(c);
      }
      return null;
    }

    function extractRoleFromEl(node) {
      if (!node) return { role: null, verified: null };
      const d = node.dataset || {};
      const role = (d.role || d.userRole || d.userrole || '').toLowerCase().trim() || null;
      let verified = null;
      if (d.verified === 'true') verified = true;
      else if (d.verified === 'false') verified = false;
      return { role, verified };
    }

    function extractIdFromTree(node) {
      let cur = node;
      let depth = 0;
      while (cur && depth < 8) {
        const id = extractIdFromEl(cur);
        if (id) return id;
        cur = cur.parentElement;
        depth++;
      }
      return null;
    }

    function extractRoleFromTree(node) {
      let cur = node;
      let depth = 0;
      while (cur && depth < 8) {
        const info = extractRoleFromEl(cur);
        if (info.role || info.verified !== null) return info;
        cur = cur.parentElement;
        depth++;
      }
      return { role: null, verified: null };
    }

    function readName() {
      const b = $('dmWith');
      if (b && b.textContent.trim()) return b.textContent.trim();
      const t = $('dmProfileName');
      if (t && t.textContent.trim()) return t.textContent.trim();
      return null;
    }

    function resolveIdByName(name) {
      if (!name) return null;
      const norm = String(name).trim().toLowerCase();

      const globals = [
        window.players, window.users, window.contacts, window.friends,
        window.Players, window.Users, window.Contacts, window.dmContacts,
        window.dm?.contacts, window.dm?.users,
        window.state?.players, window.state?.users, window.state?.contacts,
        window.app?.players, window.app?.users,
        window.store?.players, window.store?.users,
      ];

      for (const bag of globals) {
        if (!bag) continue;
        const list = Array.isArray(bag) ? bag : Object.values(bag);
        for (const u of list) {
          if (!u || typeof u !== 'object') continue;
          const candName = (u.name || u.display_name || u.displayName || u.username || u.nick || '').toLowerCase();
          if (candName === norm) {
            return u.id || u.userId || u.user_id || u.uid || u.jid || u.username || u.nick || null;
          }
        }
      }
      return null;
    }

    // Reavalia selo/cache ao trocar de conversa
    function refreshBadgeForCurrent() {
      const nick = (_currentNick || currentUserName || readName() || '').toLowerCase();
      const cached = recallRole(nick);
      if (cached) setVerifiedBadge(true, cached);
      else setVerifiedBadge(false);
    }

    // Fonte 1: clique na thread da lista
    const list = $('dmListBody');
    if (list) {
      list.addEventListener('click', (e) => {
        const thread = e.target.closest('.dm-thread');
        if (!thread) return;
        const id = extractIdFromTree(thread);
        const roleInfo = extractRoleFromTree(thread);
        if (id) {
          currentUserId = id;
          currentUserName = thread.querySelector('b')?.textContent?.trim() || null;
          _currentNick = currentUserName;
          console.log('[dm-extras] 🧲 userId capturado via thread:', id);
        }
        if (roleInfo.role) {
          setVerifiedBadge(roleInfo.verified !== false, roleInfo.role);
          if (currentUserName) rememberRole(currentUserName, { role: roleInfo.role, verified: roleInfo.verified });
        } else {
          refreshBadgeForCurrent();
        }

        // ✨ Limpa o perfil atual ao trocar de conversa
        _currentProfile = null;
        window.__dmCurrentProfile = null;
      }, true);
    }

    // Fonte 2: evento custom de nova conversa
    window.addEventListener('dm:new-conversation', (e) => {
      const u = e.detail?.user;
      if (!u) return;
      const id = u.id || u.userId || u.user_id || u.uid || u.username || u.jid || u.nick;
      if (id) {
        currentUserId = id;
        currentUserName = u.name || u.displayName || u.username || null;
        _currentNick = currentUserName;
        console.log('[dm-extras] 🧲 userId capturado via dm:new-conversation:', id);
      }
      if (u.role || u.verified !== undefined) {
        setVerifiedBadge(u.verified !== false, u);
        if (currentUserName) rememberRole(currentUserName, u);
      }
    });

    // Fonte 3: clique com data-*
    document.addEventListener('click', (e) => {
      const node = e.target.closest('[data-user-id], [data-userid], [data-user], [data-jid], [data-contact-id]');
      if (!node) return;
      const id = extractIdFromEl(node);
      if (id) {
        currentUserId = id;
        currentUserName = node.querySelector('b')?.textContent?.trim() || null;
        _currentNick = currentUserName;
        console.log('[dm-extras] 🧲 userId capturado via clique com data-*:', id);
      }
      const roleInfo = extractRoleFromEl(node);
      if (roleInfo.role) {
        setVerifiedBadge(roleInfo.verified !== false, roleInfo.role);
        if (currentUserName) rememberRole(currentUserName, { role: roleInfo.role, verified: roleInfo.verified });
      }
    }, true);

    // Fonte 4: observar mudança de nome no cabeçalho
    const headerB = $('dmWith');
    if (headerB) {
      const obs = new MutationObserver(() => {
        const name = readName();
        if (!name) return;
        currentUserName = name;
        _currentNick = name;
        const id = resolveIdByName(name);
        if (id) {
          currentUserId = id;
          console.log('[dm-extras] 🧲 userId resolvido por nome:', name, '→', id);
        }
        refreshBadgeForCurrent();
      });
      obs.observe(headerB, { childList: true, characterData: true, subtree: true });
      const initialName = readName();
      if (initialName) { currentUserName = initialName; _currentNick = initialName; }
      refreshBadgeForCurrent();
    }

    // 🔔 Eventos de perfil carregado (custom)
    function handleProfileEvent(ev) {
      const d = ev?.detail || {};
      const profileData = d.profile || d.p || d.data || null;
      const nick = d.nick || d.userId || d.username || currentUserName;
      if (!profileData) return;

      rememberRole(nick, profileData);

      const isCurrent =
        (nick && currentUserName && String(nick).toLowerCase() === String(currentUserName).toLowerCase()) ||
        (d.userId && currentUserId && String(d.userId) === String(currentUserId)) ||
        (!currentUserName);

      if (isCurrent) {
        if (nick) _currentNick = nick;
        applyDmProfile(profileData);
      }
    }

    ['dm:profile', 'dm:history', 'dm:open', 'profile:loaded'].forEach((evt) => {
      window.addEventListener(evt, handleProfileEvent);
      document.addEventListener(evt, handleProfileEvent);
    });

    // ─────────────────────────────────────────────
    // Intercepta dm_history via WebSocket (patch)
    // ─────────────────────────────────────────────
    try {
      const OrigWS = window.WebSocket;
      if (OrigWS && !OrigWS.__dmPatched) {
        const Patched = function (...args) {
          const ws = new OrigWS(...args);
          ws.addEventListener('message', (ev) => {
            if (typeof ev.data !== 'string' || ev.data.length < 20) return;
            if (ev.data.indexOf('dm_history') === -1 && ev.data.indexOf('"profile"') === -1) return;
            try {
              const msg = JSON.parse(ev.data);
              if (msg && msg.t === 'dm_history' && msg.profile) {
                const nick = msg.nick || msg.name;
                rememberRole(nick, msg.profile);
                if (nick) _currentNick = nick;
                applyDmProfile(msg.profile);
              }
            } catch (e) { /* ignora */ }
          });
          return ws;
        };
        Patched.__dmPatched = true;
        Patched.prototype = OrigWS.prototype;
        ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k) => {
          try { Patched[k] = OrigWS[k]; } catch (e) {}
        });
        window.WebSocket = Patched;
      }
    } catch (e) { /* ignora */ }

    // ─────────────────────────────────────────────
    // resolveUserId
    // ─────────────────────────────────────────────
    function resolveUserId() {
      if (currentUserId) return currentUserId;

      const chat = $('dmChat');
      if (chat) {
        const id = extractIdFromTree(chat);
        if (id) return id;
      }

      const active = $('dmListBody')?.querySelector('.dm-thread.is-active');
      if (active) {
        const id = extractIdFromTree(active);
        if (id) return id;
      }

      const name = readName();
      if (name) {
        currentUserName = name;
        _currentNick = name;
        const id = resolveIdByName(name);
        if (id) return id;
      }

      const opened = document.querySelector('.dm-thread[aria-current="true"], .dm-thread[data-active="1"]');
      if (opened) {
        const id = extractIdFromTree(opened);
        if (id) return id;
      }

      return null;
    }

    function dumpDiagnostic() {
      const chat = $('dmChat');
      const list = $('dmListBody');
      const active = list?.querySelector('.dm-thread.is-active');

      console.group('[dm-extras] 🔍 DIAGNÓSTICO — sem userId');
      console.log('Nome no cabeçalho:', readName());
      console.log('#dmChat dataset:', chat ? { ...chat.dataset } : null);
      console.log('#dmChat attrs:', chat ? [...chat.attributes].map(a => a.name + '=' + a.value) : null);
      console.log('thread ativa dataset:', active ? { ...active.dataset } : null);
      console.log('thread ativa attrs:', active ? [...active.attributes].map(a => a.name + '=' + a.value) : null);
      console.log('Globais disponíveis:', ['players','users','contacts','friends','Players','Users','Contacts','dmContacts'].filter(k => window[k]));
      console.groupEnd();
    }

    function openCurrentProfile() {
      const userId = resolveUserId();

      if (!userId) {
        console.warn('[dm-extras] ❌ Sem userId na conversa atual — não dá pra abrir o perfil.');
        dumpDiagnostic();
        try { window.dispatchEvent(new CustomEvent('dm:profile-missing-user', { detail: { name: readName() } })); } catch (e) {}
        return;
      }

      console.log('[dm-extras] 🎯 Abrindo perfil de:', userId, '(nome:', currentUserName || '?', ')');

      // Se já temos o perfil, abre o dialog direto com os dados
      const dlg = $('dmProfileDialog');
      if (dlg && _currentProfile && typeof dlg.showModal === 'function') {
        renderProfileDialog(_currentProfile);
        if (!dlg.open) dlg.showModal();
        // Ainda tenta acionar o perfil completo, mas com o dialog preenchido
        // (assim, mesmo que abrirPerfil não exista, o usuário vê o perfil)
      }

      if (typeof window.abrirPerfil === 'function') {
        window.abrirPerfil(userId);
        return;
      }

      if (window.ProfileUI && typeof window.ProfileUI.renderOtherProfile === 'function') {
        const sendFn = window.appSend || window.send;
        if (typeof sendFn === 'function') {
          sendFn({ t: 'profile_get', user_id: userId });
          if (typeof window.navegarParaAba === 'function') {
            window.navegarParaAba('profile');
          } else {
            const tab = document.querySelector('[data-t="profile"]') || $('tab-profile');
            if (tab) tab.click();
          }
          return;
        }
      }

      // Fallback: abre o dialog com o que temos
      if (dlg && typeof dlg.showModal === 'function' && !dlg.open) {
        renderProfileDialog(_currentProfile);
        dlg.showModal();
      }

      window.dispatchEvent(new CustomEvent('profile:open', { detail: { userId, name: currentUserName } }));
    }

    // Interceptor em CAPTURE no pai (#dmChat)
    const chatEl = $('dmChat');
    const interceptor = chatEl || document;

    interceptor.addEventListener('click', (e) => {
      const t = e.target;
      if (t !== btn && !btn.contains(t)) return;

      e.stopImmediatePropagation();
      e.stopPropagation();
      e.preventDefault();

      openCurrentProfile();
    }, true);

    // Fallback: se o dialog abrir sem conteúdo, injeta o perfil guardado
    const dmDialog = $('dmProfileDialog');
    if (dmDialog) {
      const obsDialog = new MutationObserver(() => {
        if (!dmDialog.open) return;
        if (_currentProfile) {
          renderProfileDialog(_currentProfile);
        }
      });
      obsDialog.observe(dmDialog, { attributes: true, attributeFilter: ['open'] });
    }

    // API pública
    window.DmProfileBridge = {
      setCurrentUser(userId, userName) {
        currentUserId = userId || null;
        if (userName) { currentUserName = userName; _currentNick = userName; }
        if (userId) btn.dataset.userId = String(userId);
        else delete btn.dataset.userId;
        console.log('[dm-extras] 👤 usuário da conversa definido:', userId, userName || '');
        refreshBadgeForCurrent();
      },
      getCurrentUser() {
        return { userId: resolveUserId(), name: currentUserName || readName() };
      },
      openProfile: openCurrentProfile,
      diagnose: dumpDiagnostic,

      // Selo + perfil
      setVerified: (verified, roleOrProfile) => setVerifiedBadge(verified, roleOrProfile),
      applyProfile: (profile) => applyDmProfile(profile),
      getCurrentProfile: () => _currentProfile,
      rememberRole,
      recallRole,
    };
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
        if (u.role) item.dataset.role = String(u.role).toLowerCase();
        if (typeof u.verified === 'boolean') item.dataset.verified = u.verified ? 'true' : 'false';

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
  window.dmApplyProfile = (profile) =>
    window.DmProfileBridge?.applyProfile?.(profile);

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
  const observer = new MutationObserver(() => { boot(); });
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
    applyProfile: (profile) => window.DmProfileBridge?.applyProfile?.(profile),
    getCurrentProfile: () => window.__dmCurrentProfile || null,
    reinit: boot,
  };

  console.log('[dm-extras] script pronto (aguardando #dmRoot)');
})();