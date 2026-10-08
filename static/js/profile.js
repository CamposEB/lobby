/* Reusable profile presentation and editor interactions. */
/* v16 — sistema de selos: staff (dev/admin/mod), vip, streamer, beta (🚧) */
(() => {
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const MAX_AVATAR_DATA_LENGTH = 120000;
  const MAX_BANNER_DATA_LENGTH = 350000;

  const ELOS_DIR = "/static/assets/";
  const HERO_IMAGE_DIR = "/static/img/icons/herois/";

  const defaultAccent = () =>
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();

  const RANK_FILE_SUFFIXES = [
    "-png-ml.png", "-png-ml.webp", "-png-ml.jpg",
    ".png-ml.png", ".png-ml.webp", ".png-ml.jpg",
    ".png", ".webp", ".jpg", ".jpeg", ".svg",
  ];

  const RANK_OPTIONS = [
    { value: "Guerreiro", label: "Guerreiro", bases: ["logo-icon-rank-warrior"] },
    { value: "Elite", label: "Elite", bases: ["logo-icon-rank-elite"] },
    { value: "Mestre", label: "Mestre", bases: ["logo-icon-rank-master"] },
    { value: "Grande Mestre", label: "Grande Mestre",
      bases: ["logo-icon-rank-grandmaster", "logo-icon-rankgrandmaster"] },
    { value: "Épico", label: "Épico", bases: ["logo-icon-rank-epic"] },
    { value: "Lenda", label: "Lenda", bases: ["logo-icon-rank-legend"] },
    { value: "Mítico", label: "Mítico", bases: ["logo-icon-rank-mythic"] },
    { value: "Honra Mítica", label: "Honra Mítica", bases: ["logo-icon-rank-mythical-honor"] },
    { value: "Glória Mítica", label: "Glória Mítica", bases: ["logo-icon-rank-mythical-glory"] },
    { value: "Imortal", label: "Imortal", bases: ["logo-icon-rank-immortal"] },
  ];

  const RANK_ALIASES = [
    { bases: ["logo-icon-rank-mythical-glory"], aliases: ["glória mítica","gloria mitica","mítico glorioso","mitico glorioso","mythical glory","glorioso"] },
    { bases: ["logo-icon-rank-mythical-honor"], aliases: ["honra mítica","honra mitica","mítico honrado","mitico honrado","mythical honor","honrado"] },
    { bases: ["logo-icon-rank-immortal"], aliases: ["imortal","immortal"] },
    { bases: ["logo-icon-rank-grandmaster","logo-icon-rankgrandmaster"], aliases: ["grandemestre","grande mestre","grão-mestre","grao-mestre","grão mestre","grao mestre","grandmaster","grand master"] },
    { bases: ["logo-icon-rank-mythic"], aliases: ["mítico","mitico","mythic"] },
    { bases: ["logo-icon-rank-legend"], aliases: ["lenda","legend"] },
    { bases: ["logo-icon-rank-master"], aliases: ["mestre","master"] },
    { bases: ["logo-icon-rank-epic"], aliases: ["épico","epico","epic"] },
    { bases: ["logo-icon-rank-elite"], aliases: ["elite"] },
    { bases: ["logo-icon-rank-warrior"], aliases: ["guerreiro","warrior"] },
  ];

  function normalizeRank(value) {
    return String(value || "").toLocaleLowerCase("pt-BR").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").trim();
  }
  const MYTHIC_PLUS_KEYS = new Set(["mitico","honra mitica","gloria mitica","imortal"]);
  function isMythicPlusRank(rank) { return MYTHIC_PLUS_KEYS.has(normalizeRank(rank)); }
  function rankFromMythicStars(stars) {
    if (stars >= 100) return "Imortal";
    if (stars >= 50) return "Glória Mítica";
    if (stars >= 25) return "Honra Mítica";
    return "Mítico";
  }
  function parseStarsValue(value) {
    const raw = String(value ?? "").trim();
    if (raw === "") return null;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.min(n, 9999);
  }
  function profileStars(data) {
    if (!data || !isMythicPlusRank(data.rank)) return null;
    return parseStarsValue(data.stars);
  }
  function rankBasesFor(rank) {
    const normalized = normalizeRank(rank);
    if (!normalized) return [];
    const exact = RANK_OPTIONS.find(o => normalizeRank(o.value) === normalized);
    if (exact) return [...exact.bases];
    for (const entry of RANK_ALIASES) {
      for (const alias of entry.aliases) {
        const key = normalizeRank(alias);
        if (key && normalized.includes(key)) return [...entry.bases];
      }
    }
    return [];
  }
  function rankImageCandidatesFromBases(bases) {
    if (!Array.isArray(bases) || !bases.length) return [];
    const urls = [];
    for (const base of bases) {
      const clean = String(base).replace(/(-png-ml)?(\.[a-z0-9]+)?$/i, "");
      for (const suffix of RANK_FILE_SUFFIXES) urls.push(ELOS_DIR + encodeURIComponent(clean + suffix));
    }
    return urls;
  }
  function rankCandidatesForRank(rank) { return rankImageCandidatesFromBases(rankBasesFor(rank)); }
  function heroIconFile(name) {
    const catalog = Array.isArray(window.HERO_CATALOG) ? window.HERO_CATALOG : [];
    if (!name || !catalog.length) return "";
    const lower = String(name).toLocaleLowerCase("pt-BR").trim();
    const hero = catalog.find(h => String(h.name || "").toLocaleLowerCase("pt-BR").trim() === lower);
    return hero && hero.file ? hero.file : "";
  }
  function heroImageUrl(name) {
    const file = heroIconFile(name);
    if (!file) return "";
    if (window.HeroCatalog && window.HeroCatalog.routeImg) return window.HeroCatalog.routeImg(file);
    if (/^(?:https?:)?\/\//i.test(file) || file.charAt(0) === "/") return file;
    return HERO_IMAGE_DIR + file;
  }

  let context = null;
  let draftAvatar = "";
  let draftBanner = "";
  let profile = {};
  let selfProfile = null;
  let currentMode = "self";
  let currentUserId = null;

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function initials(name, username) {
    const source = (name || username || "?").trim();
    return source.slice(0, 1).toLocaleUpperCase("pt-BR") || "?";
  }
  function createAvatar(data, className) {
    const wrapper = node("span", null, className || "user-avatar");
    const name = data.display_name || data.display || data.username || data.nick || "Jogador";
    const image = data.avatar || "";
    wrapper.setAttribute("role", "img");
    wrapper.setAttribute("aria-label", "Foto de perfil de " + name);
    if (/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image) && image.length <= MAX_AVATAR_DATA_LENGTH) {
      const photo = node("img");
      photo.src = image; photo.alt = ""; photo.loading = "lazy";
      wrapper.append(photo);
    } else {
      wrapper.textContent = initials(name, data.username || data.nick);
    }
    return wrapper;
  }
  function setAvatar(container, data, className) {
    if (!container) return;
    const avatar = createAvatar(data, className || container.className);
    container.replaceChildren(...avatar.childNodes);
    container.setAttribute("role", "img");
    container.setAttribute("aria-label", avatar.getAttribute("aria-label"));
    container.classList.toggle("has-photo", Boolean(data.avatar));
  }
  function applyBanner(container, image) {
    if (!container) return;
    container.style.backgroundImage = image && image.length <= MAX_BANNER_DATA_LENGTH
      ? 'linear-gradient(180deg, rgba(var(--bg-rgb), .08), rgba(var(--bg-rgb), .72)), url("' + image + '")' : "";
    container.classList.toggle("has-banner", Boolean(image && image.length <= MAX_BANNER_DATA_LENGTH));
  }
  function safe(id) { return document.getElementById(id); }
  function setText(id, value) { const el = safe(id); if (el) el.textContent = value; }
  function setHidden(id, hidden) { const el = safe(id); if (el) el.hidden = Boolean(hidden); }
  function setChecked(id, checked) { const el = safe(id); if (el) el.checked = Boolean(checked); }
  function setVal(id, value) { const el = safe(id); if (el) el.value = value; }

  function looksLikeSameName(a, b) {
    const clean = (s) => String(s || "").toLocaleLowerCase("pt-BR").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/^@+/, "").replace(/[^a-z0-9]/g, "");
    const ca = clean(a), cb = clean(b);
    if (!ca || !cb) return false;
    return ca === cb;
  }

  // ─────────────────────────────────────────────────────────────
  // SISTEMA DE SELOS (staff / vip / streamer / beta)
  // ─────────────────────────────────────────────────────────────
  const BADGE_DEFS = {
    staff: {
      color: "#f2b84b",
      label: { dev: "DEV verificado", admin: "Administrador verificado", mod: "Moderador verificado" },
      defaultLabel: "Equipe verificada",
      svg:
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' +
        '<path d="M21.71 20.29l-6.88-6.88a6.5 6.5 0 0 0-7.9-7.9l3.19 3.19-2.83 2.83-3.19-3.19a6.5 6.5 0 0 0 7.9 7.9l6.88 6.88a1 1 0 0 0 1.41 0l1.42-1.42a1 1 0 0 0 0-1.41z"/>' +
        '<circle cx="6.5" cy="17.5" r="1.5"/>' +
        "</svg>",
    },
    vip: {
      color: "#4c8dff",
      label: { vip: "VIP verificado" },
      defaultLabel: "Conta verificada",
      svg:
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' +
        '<path d="M12 1.5l2.85 2.28 3.57-.33 1.07 3.43 3.18 1.62-1.13 3.4 1.13 3.4-3.18 1.62-1.07 3.43-3.57-.33L12 22.5l-2.85-2.28-3.57.33-1.07-3.43-3.18-1.62 1.13-3.4-1.13-3.4 3.18-1.62 1.07-3.43 3.57.33L12 1.5zm-1.4 14.3l6.1-6.1-1.5-1.5-4.6 4.6-2.1-2.1-1.5 1.5 3.6 3.6z"/>' +
        "</svg>",
    },
    streamer: {
      color: "#ff0000",
      label: { streamer: "Streamer" },
      defaultLabel: "Streamer",
      svg:
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' +
        '<path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-5.8 31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6z"/>' +
        "</svg>",
    },
    beta: {
      color: "#ff9d2e",
      label: { beta: "Beta Tester" },
      defaultLabel: "Beta Tester",
      emoji: "🚧",
    },
  };

  const ROLE_TO_BADGE = {
    dev: "staff",
    admin: "staff",
    mod: "staff",
    vip: "vip",
    streamer: "streamer",
    beta: "beta",
  };

  function roleFromProfile(data) {
    if (!data) return "";
    const raw = String(data.role || "").toLocaleLowerCase("pt-BR").trim();
    if (raw) return raw;
    const roles = Array.isArray(data.community_roles) ? data.community_roles : [];
    for (const r of roles) {
      const key = String(r || "").toLocaleUpperCase("pt-BR").trim();
      if (key === "DEV") return "dev";
      if (key === "ADMIN") return "admin";
      if (key === "MOD" || key === "MODERADOR" || key === "MODERATOR") return "mod";
      if (key === "VIP") return "vip";
      if (key === "STREAMER") return "streamer";
      if (key === "BETA") return "beta";
    }
    return "";
  }
  function badgeKeyForRole(rawRole) {
    const key = String(rawRole || "").toLocaleLowerCase("pt-BR").trim();
    return ROLE_TO_BADGE[key] || null;
  }
  function badgeDefForRole(rawRole) {
    const k = badgeKeyForRole(rawRole);
    return k ? BADGE_DEFS[k] : null;
  }
  function badgeColorForRole(rawRole) {
    const def = badgeDefForRole(rawRole);
    return def ? def.color : "#4c8dff";
  }
  function badgeLabelForRole(rawRole) {
    const def = badgeDefForRole(rawRole);
    if (!def) return "Conta verificada";
    const key = String(rawRole || "").toLocaleLowerCase("pt-BR").trim();
    return def.label[key] || def.defaultLabel;
  }
  function badgeSvgForRole(rawRole) {
    const def = badgeDefForRole(rawRole);
    return def ? (def.svg || "") : "";
  }
  function badgeEmojiForRole(rawRole) {
    const def = badgeDefForRole(rawRole);
    return def && def.emoji ? def.emoji : "";
  }
  function hasAnyBadge(data) {
    return Boolean(badgeDefForRole(roleFromProfile(data)));
  }

  function hasVerifiedRole(data) { return hasAnyBadge(data); }
  function verifiedRoleKey(data) { return roleFromProfile(data) || "user"; }
  function verifiedRoleLabel(roleKey) { return badgeLabelForRole(roleKey); }

  function renderVerifiedBadge(data) {
    const badge = safe("profileVerifiedBadge");
    if (!badge) return;

    const role = roleFromProfile(data);
    const def = badgeDefForRole(role);

    if (!def) {
      badge.hidden = true;
      badge.removeAttribute("data-badge");
      badge.removeAttribute("data-role");
      return;
    }

    badge.hidden = false;
    badge.dataset.badge = ROLE_TO_BADGE[role] || "";
    badge.dataset.role = role;

    if (def.emoji) {
      badge.innerHTML = "";
      badge.textContent = def.emoji;
      badge.style.color = "";
      badge.style.fontSize = "22px";
      badge.style.lineHeight = "1";
      badge.style.filter = `drop-shadow(0 0 6px ${def.color}aa)`;
    } else {
      badge.innerHTML = def.svg;
      badge.style.fontSize = "";
      badge.style.lineHeight = "";
      badge.style.color = def.color;
      badge.style.filter = `drop-shadow(0 0 6px ${def.color}88)`;
    }

    const label = badgeLabelForRole(role);
    badge.setAttribute("aria-label", label);
    badge.setAttribute("title", label);

    badge.style.animation = "none"; void badge.offsetWidth; badge.style.animation = "";
  }

  let _inlineBadgeStylesInjected = false;
  function ensureInlineBadgeStyles() {
    if (_inlineBadgeStylesInjected) return;
    if (document.getElementById("profile-inline-verified-css")) { _inlineBadgeStylesInjected = true; return; }
    const style = document.createElement("style");
    style.id = "profile-inline-verified-css";
    style.textContent = `
      #sidebarDisplayName.has-verified-badge-support { display:flex; align-items:center; gap:6px; flex-wrap:nowrap; min-width:0; max-width:100%; }
      #sidebarDisplayName > .sidebar-display-name-text { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .profile-verified-badge-inline { display:inline-grid; place-items:center; width:18px; height:18px; flex:0 0 auto; color:#4c8dff; filter:drop-shadow(0 0 5px rgba(76,141,255,.55)); animation:profile-verified-pop 320ms cubic-bezier(.34,1.56,.64,1); pointer-events:auto; vertical-align:middle; }
      .profile-verified-badge-inline svg { display:block; width:100%; height:100%; }
      .profile-verified-badge-inline[hidden] { display:none !important; }
      .profile-verified-badge-inline[data-badge="staff"]    { color:#f2b84b; filter:drop-shadow(0 0 6px rgba(242,184,75,.55)); }
      .profile-verified-badge-inline[data-badge="vip"]      { color:#4c8dff; filter:drop-shadow(0 0 6px rgba(76,141,255,.55)); }
      .profile-verified-badge-inline[data-badge="streamer"] { color:#ff0000; filter:drop-shadow(0 0 6px rgba(255,0,0,.55)); }
      .profile-verified-badge-inline[data-badge="beta"]     { font-size:18px; line-height:1; filter:drop-shadow(0 0 6px rgba(255,157,46,.65)); }
    `;
    document.head.appendChild(style);
    _inlineBadgeStylesInjected = true;
  }

  function renderSidebarVerifiedBadge(data) {
    ensureInlineBadgeStyles();
    const nameEl = safe("sidebarDisplayName");
    if (!nameEl) return false;
    const name = (data && (data.display_name || data.display || data.username || data.nick)) ||
                 (nameEl.textContent || "").trim() || "Jogador";
    let textSpan = nameEl.querySelector(":scope > .sidebar-display-name-text");
    if (!textSpan) {
      textSpan = document.createElement("span");
      textSpan.className = "sidebar-display-name-text";
      nameEl.replaceChildren(textSpan);
    }
    textSpan.textContent = name;
    nameEl.querySelectorAll(":scope > .profile-verified-badge-inline").forEach(b => b.remove());

    const role = roleFromProfile(data);
    const def = badgeDefForRole(role);

    if (!def) { nameEl.classList.remove("has-verified-badge-support"); return true; }

    const badge = document.createElement("span");
    badge.className = "profile-verified-badge-inline";
    badge.setAttribute("role", "img");
    badge.dataset.badge = ROLE_TO_BADGE[role] || "";
    badge.dataset.role = role;

    if (def.emoji) {
      badge.textContent = def.emoji;
      badge.style.color = "";
      badge.style.fontSize = "18px";
      badge.style.lineHeight = "1";
      badge.style.filter = `drop-shadow(0 0 5px ${def.color}aa)`;
    } else {
      badge.innerHTML = def.svg;
      badge.style.fontSize = "";
      badge.style.lineHeight = "";
      badge.style.color = def.color;
      badge.style.filter = `drop-shadow(0 0 5px ${def.color}88)`;
    }

    const label = badgeLabelForRole(role);
    badge.setAttribute("aria-label", label);
    badge.setAttribute("title", label);

    nameEl.classList.add("has-verified-badge-support");
    nameEl.append(badge);
    badge.style.animation = "none"; void badge.offsetWidth; badge.style.animation = "";
    return true;
  }

  function renderSidebarUsername(data, username, displayName) {
    const el = safe("sidebarUsername");
    if (!el) return;
    const nick = (data?.username || username || data?.nick || "").trim();
    const name = (displayName || data?.display_name || "").trim();
    if (!nick) { el.hidden = true; el.textContent = ""; return; }
    if (name && looksLikeSameName(name, nick)) { el.hidden = true; el.textContent = ""; return; }
    el.hidden = false;
    el.textContent = "@" + nick;
  }

  function watchSidebarBadge() {
    if (watchSidebarBadge.__installed) return;
    watchSidebarBadge.__installed = true;
    const tryApply = () => { if (selfProfile) renderSidebarVerifiedBadge(selfProfile); };
    [0, 120, 400, 1200, 2500].forEach(ms => setTimeout(tryApply, ms));
    const obs = new MutationObserver(() => {
      if (!selfProfile) return;
      const nameEl = safe("sidebarDisplayName");
      if (!nameEl) return;
      const hasBadge = nameEl.querySelector(":scope > .profile-verified-badge-inline");
      const needsBadge = hasAnyBadge(selfProfile);
      if (needsBadge !== Boolean(hasBadge)) renderSidebarVerifiedBadge(selfProfile);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function formatJoined(value) {
    if (!value) return "Data de entrada não registrada";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Data de entrada não registrada";
    return "Na comunidade desde " + new Intl.DateTimeFormat("pt-BR",
      { day: "2-digit", month: "long", year: "numeric" }).format(date);
  }
  function formatTime(value) {
    const date = new Date(Number(value) * 1000);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR",
      { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  }
  function loadImageWithFallback(img, candidates, index = 0) {
    if (!img) return;
    if (!Array.isArray(candidates) || !candidates.length || index >= candidates.length) {
      img.removeAttribute("src"); img.onerror = null; img.hidden = true; return;
    }
    img.hidden = false;
    img.onerror = () => loadImageWithFallback(img, candidates, index + 1);
    img.src = candidates[index];
  }

  function buildGameTag(label, value, iconElement) {
    const item = node("span", null, "profile-game-tag");
    if (iconElement) item.append(iconElement);
    const copy = node("span", null, "profile-game-tag-copy");
    copy.append(node("small", label), node("b", value));
    item.append(copy);
    return item;
  }
  function renderDetails() {
    const box = safe("profileGameDetails");
    if (!box) return;
    box.replaceChildren();
    if (profile.rank) {
      const candidates = rankCandidatesForRank(profile.rank);
      let icon = null;
      if (candidates.length) {
        const wrap = node("span", null, "profile-game-tag-icon");
        const img = node("img"); img.alt = ""; img.loading = "lazy";
        loadImageWithFallback(img, candidates);
        wrap.append(img); icon = wrap;
      }
      const stars = profileStars(profile);
      const rankValue = stars == null ? profile.rank : profile.rank + " · " + stars + " ★";
      box.append(buildGameTag("Rank", rankValue, icon));
    }
    if (profile.game_role) box.append(buildGameTag("Função principal", profile.game_role, null));
    if (profile.hero) {
      const url = heroImageUrl(profile.hero);
      let icon = null;
      if (url) {
        const wrap = node("span", null, "profile-game-tag-icon");
        const img = node("img"); img.alt = ""; img.loading = "lazy";
        img.src = url; img.onerror = () => { img.hidden = true; };
        wrap.append(img); icon = wrap;
      }
      box.append(buildGameTag("Herói principal", profile.hero, icon));
    }
    if (profile.gid) box.append(buildGameTag("ID no jogo", profile.gid, null));
    if (!box.childElementCount) {
      box.append(node("p", "Adicione seus dados de jogo ao editar o perfil.", "profile-empty"));
    }
  }

  function renderStats() {
    const section = safe("profileStatsSection");
    const container = safe("profileStats");
    if (!section || !container) return;
    const stats = profile.stats || {};
    section.hidden = profile.show_stats === false;
    container.replaceChildren();
    if (section.hidden) return;
    [
      ["🪙", "Moedas", Number.isFinite(Number(stats.coins)) ? Number(stats.coins).toLocaleString("pt-BR") : "—"],
      ["🧠", "Quizzes respondidos", Number.isFinite(Number(stats.quizzes)) ? Number(stats.quizzes).toLocaleString("pt-BR") : "—"],
    ].forEach(([icon, label, value]) => {
      const card = node("article", null, "profile-stat-card");
      card.append(node("span", icon, "profile-stat-icon"),
        node("span", label, "profile-stat-label"), node("b", value));
      container.append(card);
    });
    container.append(node("p", "Partidas e Win Rate ainda não são registrados pelo site.", "profile-data-note"));
  }

  function renderAchievements() {
    const section = safe("profileAchievementsSection");
    const container = safe("profileAchievements");
    if (!section || !container) return;
    const achievements = profile.achievements || [];
    section.hidden = profile.show_stats === false;
    container.replaceChildren();
    if (section.hidden) return;
    if (!achievements.length) {
      container.append(node("p", "Responda ao quiz diário para desbloquear sua primeira conquista.", "profile-empty"));
      return;
    }
    achievements.forEach(badge => {
      const item = node("article", null, "profile-badge");
      item.append(node("span", badge.icon, "profile-badge-icon"), node("b", badge.name));
      container.append(item);
    });
  }

  function renderActivity() {
    const section = safe("profileActivitySection");
    const container = safe("profileActivity");
    if (!section || !container) return;
    const activity = profile.activity || [];
    section.hidden = profile.show_activity === false;
    container.replaceChildren();
    if (section.hidden) return;
    if (!activity.length) {
      container.append(node("p", "Você ainda não possui atividades recentes.", "profile-empty"));
      return;
    }
    activity.forEach(entry => {
      const item = node("article", null, "profile-activity-item");
      item.append(node("span",
        entry.kind === "quiz" ? "🧠" : entry.kind === "room" ? "🎮" : "✨",
        "profile-activity-icon"));
      const content = node("div");
      content.append(node("b", entry.detail), node("time", formatTime(entry.ts)));
      item.append(content);
      container.append(item);
    });
  }

  function resolveOnlineFlag(data) {
    if (!data || typeof data !== "object") return false;
    if (typeof data.online === "boolean") return data.online;
    if (typeof data.is_online === "boolean") return data.is_online;
    if (typeof data.isOnline === "boolean") return data.isOnline;
    if (data.presence && typeof data.presence.online === "boolean") return data.presence.online;
    if (typeof data.status === "string") return data.status.toLowerCase() === "online";
    return false;
  }
  function renderStatus(data, forcedOnline) {
    const status = safe("profileStatus");
    if (!status) return;
    const isOnline = typeof forcedOnline === "boolean" ? forcedOnline : resolveOnlineFlag(data);
    status.replaceChildren(node("i"), document.createTextNode(isOnline ? " Online" : " Offline"));
    status.classList.toggle("is-online", isOnline);
    status.classList.toggle("is-offline", !isOnline);
    status.setAttribute("data-online", isOnline ? "true" : "false");
    status.setAttribute("aria-label", isOnline ? "Online agora" : "Offline");
  }

  function applyRankBadge(data) {
    const badge = safe("profileRankBadge");
    const image = safe("profileRankImage");
    const label = safe("profileRankLabel");
    if (!badge) return;
    const rank = (data.rank || "").trim();
    const candidates = rankCandidatesForRank(rank);
    if (!rank || !candidates.length) {
      badge.hidden = true;
      if (image) { image.removeAttribute("src"); image.onerror = null; }
      const hiddenStars = safe("profileRankStars");
      if (hiddenStars) hiddenStars.hidden = true;
      return;
    }
    badge.hidden = false;
    if (label) label.textContent = rank;
    if (image) loadImageWithFallback(image, candidates);
    const starsWrap = safe("profileRankStars");
    const starsCount = safe("profileRankStarsCount");
    const stars = profileStars(data);
    if (starsWrap) {
      if (stars == null) { starsWrap.hidden = true; starsWrap.removeAttribute("aria-label"); }
      else {
        starsWrap.hidden = false;
        starsWrap.setAttribute("aria-label", stars === 1 ? "1 estrela" : stars + " estrelas");
        if (starsCount) starsCount.textContent = String(stars);
      }
    }
  }

  function applyPageHeading(data, mode) {
    const isOther = mode === "other";
    if (isOther) {
      const name = (data && (data.display_name || data.username)) || "Jogador";
      setText("profilePageTitle", "Perfil de " + name);
      setText("profilePageSubtitle", "Conheça a jornada de " + name + " na Society.");
      setText("profileEyebrow", "PLAYER CARD");
    } else {
      setText("profilePageTitle", "Meu perfil");
      setText("profilePageSubtitle",
        "Seu espaço na comunidade. Mostre como você joga e personalize sua identidade.");
      setText("profileEyebrow", "SOCIETY · PLAYER CARD");
    }
  }

  function applyFriendshipStatus(data, options = {}) {
    const btn = safe("profileFriendBtn");
    if (!btn) return;
    const isOther = currentMode === "other";
    if (!isOther) { btn.hidden = true; return; }
    btn.hidden = false;

    const status = data.friendship_status || "none";
    const nick = currentUserId || data.nick || data.username || "";
    const label = btn.querySelector("span");
    const svg = btn.querySelector("svg");

    btn.className = "profile-friend-btn";
    btn.disabled = false;
    btn.dataset.action = "";

    const ICONS = {
      add:    '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
      accept: '<polyline points="20 6 9 17 4 12"/>',
      friends:'<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>',
      pending:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      remove: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/>',
    };

    if (status === "friends") {
      btn.classList.add("is-friends");
      if (label) label.textContent = "Amigos ✓";
      btn.dataset.action = "friend_remove";
      btn.title = "Remover amizade";
      if (svg) svg.innerHTML = ICONS.remove;
    } else if (status === "pending_out") {
      btn.classList.add("is-pending");
      if (label) label.textContent = "Pedido enviado";
      btn.disabled = true;
      btn.dataset.action = "";
      if (svg) svg.innerHTML = ICONS.pending;
    } else if (status === "pending_in") {
      btn.classList.add("is-accept");
      if (label) label.textContent = "Aceitar pedido";
      btn.dataset.action = "friend_accept";
      btn.title = "Aceitar pedido de amizade";
      if (svg) svg.innerHTML = ICONS.accept;
    } else {
      if (label) label.textContent = "Adicionar amigo";
      btn.dataset.action = "friend_request";
      if (svg) svg.innerHTML = ICONS.add;
    }
    btn.dataset.nick = String(nick);
  }

  function handleFriendClick() {
    const btn = safe("profileFriendBtn");
    if (!btn) return;
    const action = btn.dataset.action;
    const nick = btn.dataset.nick;
    if (!action || !nick) return;
    if (action === "friend_remove") {
      if (!confirm("Remover @" + nick + " da sua lista de amigos?")) return;
    }
    const ok = context?.send?.({ t: action, nick });
    if (!ok) context?.toast?.("A conexão caiu. Reconecte-se antes de continuar.");
  }

  function applyProfileCard(data, username, options = {}) {
    const displayName = data.display_name || username || "Jogador";
    setText("profileDisplayName", displayName);
    renderVerifiedBadge(data);
    setText("profileUsername", "@" + (data.username || username || "jogador"));

    if (data.details_hidden) {
      setText("profileBio",
        "🔒 Este perfil é " +
        (data.visibility === "friends" ? "visível apenas para amigos" : "privado") +
        ". Envie um pedido de amizade para ver mais detalhes.");
    } else {
      setText("profileBio", data.bio || "Adicione uma bio para que a comunidade conheça você.");
    }
    setText("profileJoined", formatJoined(data.joined_at));
    renderStatus(data, options.forceOnline);
    applyRankBadge(data);
    setText("profileTitle", data.title || "");
    setHidden("profileTitle", !data.title);

    const roles = safe("profileCommunityRoles");
    if (roles) {
      roles.replaceChildren();
      (Array.isArray(data.community_roles) ? data.community_roles : []).forEach(role => {
        const badge = node("span", role, "profile-community-role");
        badge.dataset.role = role.toLocaleLowerCase("pt-BR");
        roles.append(badge);
      });
      roles.hidden = roles.childElementCount === 0;
    }

    const card = safe("profileCard");
    if (card) {
      card.style.setProperty("--profile-accent", data.accent || defaultAccent());
      card.dataset.frame = data.frame || "default";
    }
    const page = safe("profileRoot") || document.querySelector(".profile-page");
    if (page) {
      page.dataset.theme = data.theme || "classic";
      page.style.setProperty("--profile-accent", data.accent || defaultAccent());
    }
    setAvatar(safe("profileAvatar"), data, "profile-avatar");
    applyBanner(safe("profileBanner"), data.banner || "");

    renderDetails();
    renderStats();
    renderAchievements();
    renderActivity();
    applyFriendshipStatus(data);
  }

  function applySelfChrome(data, username) {
    const displayName = data.display_name || username || "Jogador";
    const usernameHandle = "@" + (data.username || username || "jogador");
    setAvatar(safe("sidebarAvatar"), data, "sidebar-avatar");
    const navAvatar = safe("profileNavAvatar");
    if (navAvatar) {
      const newAvatar = createAvatar(data, "nav-profile-avatar");
      navAvatar.replaceChildren(newAvatar.childNodes[0] ||
        document.createTextNode(initials(displayName, data.username)));
    }
    renderSidebarVerifiedBadge({ ...data, display_name: displayName });
    renderSidebarUsername(data, username, displayName);
    setText("settingsDisplayName", displayName);
    setText("settingsUsername", usernameHandle);
    setChecked("cfgProfilePrivate", Boolean(data.is_private));
    setChecked("cfgShowStats", data.show_stats !== false);
    setChecked("cfgShowActivity", data.show_activity !== false);
    const notifications = data.notifications || {};
    setChecked("notifyMessages", notifications.messages !== false);
    setChecked("notifyInvites", notifications.invites !== false);
    setChecked("notifyEvents", notifications.events !== false);
    setChecked("notifyActivity", notifications.activity !== false);
    syncDraftPreviews();
  }

  function setChromeVisibility() {
    const editBtn = safe("profileEditButton");
    const actions = safe("profileActions");
    const backBtn = safe("profileBack");
    if (currentMode === "other") {
      if (editBtn) editBtn.hidden = true;
      if (actions) actions.hidden = false;
      if (backBtn) backBtn.hidden = false;
    } else {
      if (editBtn) editBtn.hidden = false;
      if (actions) actions.hidden = true;
      if (backBtn) backBtn.hidden = true;
    }
    const page = safe("profileRoot") || document.querySelector(".profile-page");
    if (page) page.dataset.profileMode = currentMode;
  }

  function renderProfile(nextProfile, username) {
    selfProfile = nextProfile || {};
    if (currentMode !== "self") return;
    profile = selfProfile;
    applyPageHeading(profile, "self");
    applyProfileCard(profile, username, { forceOnline: true });
    applySelfChrome(profile, username);
    setChromeVisibility();
  }
  function renderOtherProfile(nextProfile, username, userId) {
    currentMode = "other";
    currentUserId = userId != null ? userId : null;
    profile = nextProfile || {};
    applyPageHeading(profile, "other");
    applyProfileCard(profile, username);
    setChromeVisibility();
    const editor = safe("profileEditor");
    if (editor && editor.open) editor.close();
  }
  function returnToSelf() {
    if (currentMode === "self") return;
    currentMode = "self"; currentUserId = null;
    profile = selfProfile || {};
    const username = context?.getUsername ? context.getUsername() : undefined;
    applyPageHeading(profile, "self");
    applyProfileCard(profile, username, { forceOnline: true });
    applySelfChrome(profile, username);
    setChromeVisibility();
  }
  function getMode() { return currentMode; }
  function getCurrentUserId() { return currentUserId; }

  function handleBack() {
    if (typeof context?.goBack === "function") { context.goBack(); return; }
    returnToSelf();
    document.dispatchEvent(new CustomEvent("profile:back"));
  }
  function handleMessage() {
    if (currentMode !== "other" || currentUserId == null) return;
    if (typeof context?.openDM === "function") { context.openDM(currentUserId); return; }
    document.dispatchEvent(new CustomEvent("profile:message", { detail: { userId: currentUserId } }));
  }
  function handleReport() {
    if (currentMode !== "other" || currentUserId == null) return;
    if (typeof context?.reportUser === "function") { context.reportUser(currentUserId); return; }
    document.dispatchEvent(new CustomEvent("profile:report", { detail: { userId: currentUserId } }));
  }

  function populateRankOptions(currentValue) {
    const select = safe("pRank");
    if (!select) return;
    const desired = currentValue != null ? currentValue : select.value || "";
    while (select.options.length > 1) select.remove(1);
    RANK_OPTIONS.forEach(option => {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      select.append(opt);
    });
    if (desired) {
      const exists = Array.from(select.options).some(o => o.value === desired);
      if (!exists) {
        const opt = document.createElement("option");
        opt.value = desired;
        opt.textContent = desired + " (personalizado)";
        select.append(opt);
      }
      select.value = desired;
    } else select.value = "";
  }

  function populateHeroOptions(currentValue) {
    const select = safe("pHero");
    if (!select) return;
    const desired = currentValue != null ? currentValue : select.value || "";
    while (select.options.length > 1) select.remove(1);
    const catalog = Array.isArray(window.HERO_CATALOG) ? window.HERO_CATALOG : [];
    const sorted = [...catalog].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
    sorted.forEach(hero => {
      if (!hero || !hero.name) return;
      const opt = document.createElement("option");
      opt.value = hero.name;
      opt.textContent = hero.name;
      select.append(opt);
    });
    if (desired) {
      const exists = Array.from(select.options).some(o => o.value === desired);
      if (!exists) {
        const opt = document.createElement("option");
        opt.value = desired;
        opt.textContent = desired + " (personalizado)";
        select.append(opt);
      }
      select.value = desired;
    } else select.value = "";
  }

  function syncStarsField() {
    const select = safe("pRank");
    const input = safe("pStars");
    const field = safe("pStarsField");
    const enabled = isMythicPlusRank(select?.value || "");
    if (input) { input.disabled = !enabled; if (!enabled) input.value = ""; }
    if (field) field.classList.toggle("is-disabled", !enabled);
  }
  function applyStarsToRank() {
    const input = safe("pStars");
    const select = safe("pRank");
    if (!input || !select || input.disabled) return;
    const stars = parseStarsValue(input.value);
    if (stars == null) return;
    const next = rankFromMythicStars(stars);
    if (select.value !== next) { populateRankOptions(next); refreshRankPreview(); }
  }
  function refreshRankPreview() {
    const select = safe("pRank");
    const img = safe("pRankPreviewImage");
    const wrap = safe("pRankPreview");
    if (!select || !img) return;
    const value = (select.value || "").trim();
    const candidates = rankCandidatesForRank(value);
    if (!value || !candidates.length) {
      img.removeAttribute("src"); img.onerror = null; img.hidden = true;
      if (wrap) wrap.classList.add("is-empty"); return;
    }
    if (wrap) wrap.classList.remove("is-empty");
    loadImageWithFallback(img, candidates);
  }
  function refreshHeroPreview() {
    const select = safe("pHero");
    const img = safe("pHeroPreviewImage");
    const wrap = safe("pHeroPreview");
    if (!select || !img) return;
    const value = (select.value || "").trim();
    const url = heroImageUrl(value);
    if (!value || !url) {
      img.removeAttribute("src"); img.onerror = null; img.hidden = true;
      if (wrap) wrap.classList.add("is-empty"); return;
    }
    if (wrap) wrap.classList.remove("is-empty");
    img.hidden = false;
    img.onerror = () => { img.hidden = true; };
    img.src = url;
  }

  function syncDraftPreviews() {
    const inputName = safe("profileDisplayNameInput");
    const name = (inputName?.value) || profile.display_name || "Jogador";
    const username = profile.username || "";
    setAvatar(safe("profilePreviewAvatar"),
      { display_name: name, username, avatar: draftAvatar },
      "profile-avatar profile-preview-avatar");
    applyBanner(safe("profilePreviewBanner"), draftBanner);
  }

  function openEditor() {
    if (currentMode !== "self") return;
    const form = safe("profileForm");
    if (!form) return;
    form.reset();
    setText("profileFormMessage", "");
    safe("profileFormMessage")?.classList.remove("is-error");

    populateRankOptions(profile.rank || "");
    populateHeroOptions(profile.hero || "");
    syncStarsField();
    const savedStars = profileStars(profile);
    setVal("pStars", savedStars == null ? "" : String(savedStars));
    setVal("profileDisplayNameInput", profile.display_name || "");
    setVal("profileUsernameInput", "@" + (profile.username || ""));
    setVal("pRole", profile.game_role || "Qualquer");
    setVal("pGid", profile.gid || "");
    setVal("pBio", profile.bio || "");
    setVal("profileTitleInput", profile.title || "");
    setVal("profileAccentInput", profile.accent || defaultAccent());
    setVal("profileFrameInput", profile.frame || "default");
    setVal("profileThemeInput", profile.theme || "classic");

    const visibility = profile.visibility ||
      (profile.is_private ? "private" : "public");
    setVal("profileVisibilityInput", visibility);

    setChecked("profileShowStatsInput", profile.show_stats !== false);
    setChecked("profileShowActivityInput", profile.show_activity !== false);

    setVal("profileAvatarFile", "");
    setVal("profileBannerFile", "");
    draftAvatar = profile.avatar || "";
    draftBanner = profile.banner || "";
    syncDraftPreviews();
    refreshRankPreview();
    refreshHeroPreview();
    const dialog = safe("profileEditor");
    if (dialog && typeof dialog.showModal === "function") dialog.showModal();
  }

  function imageData(file, width, height, maxDataLength) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) { reject(new Error("Selecione um arquivo de imagem.")); return; }
      if (file.size > MAX_IMAGE_BYTES) { reject(new Error("A imagem deve ter no máximo 8 MB.")); return; }
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const scale = Math.min(1, width / image.naturalWidth, height / image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context2d = canvas.getContext("2d");
        if (!context2d) { reject(new Error("Não foi possível processar esta imagem.")); return; }
        context2d.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error("Não foi possível otimizar esta imagem.")); return; }
          const reader = new FileReader();
          reader.onload = () => {
            const result = String(reader.result || "");
            if (result.length > maxDataLength) {
              reject(new Error("A imagem otimizada ainda ficou grande demais. Escolha outra imagem."));
            } else resolve(result);
          };
          reader.onerror = () => reject(new Error("Não foi possível ler esta imagem."));
          reader.readAsDataURL(blob);
        }, "image/jpeg", 0.78);
      };
      image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("O arquivo selecionado não pôde ser aberto como imagem.")); };
      image.src = objectUrl;
    });
  }
  function showImageError(message) {
    const msg = safe("profileFormMessage");
    if (!msg) return;
    msg.textContent = message;
    msg.classList.add("is-error");
  }

  function saveProfile(event) {
    event.preventDefault();
    if (currentMode !== "self") return;
    const displayName = safe("profileDisplayNameInput")?.value.trim();
    if (!displayName) { showImageError("Informe um nome de exibição."); safe("profileDisplayNameInput")?.focus(); return; }
    const msg = safe("profileFormMessage");
    if (msg) { msg.textContent = "Salvando perfil…"; msg.classList.remove("is-error"); }

    let rank = safe("pRank")?.value || "";
    const stars = parseStarsValue(safe("pStars")?.value);
    if (stars != null && (isMythicPlusRank(rank) || rank === "")) rank = rankFromMythicStars(stars);
    const payloadStars = isMythicPlusRank(rank) ? stars : null;

    const visibility = safe("profileVisibilityInput")?.value || "public";
    const isPrivate = visibility === "private";

    const ok = context?.send?.({
      t: "profile_set",
      display_name: displayName,
      rank,
      stars: payloadStars,
      role: safe("pRole")?.value || "",
      hero: safe("pHero")?.value || "",
      gid: safe("pGid")?.value || "",
      bio: safe("pBio")?.value || "",
      title: safe("profileTitleInput")?.value || "",
      accent: safe("profileAccentInput")?.value || "",
      frame: safe("profileFrameInput")?.value || "default",
      theme: safe("profileThemeInput")?.value || "classic",
      avatar: draftAvatar,
      banner: draftBanner,
      visibility,
      is_private: isPrivate,
      show_stats: Boolean(safe("profileShowStatsInput")?.checked),
      show_activity: Boolean(safe("profileShowActivityInput")?.checked),
    });
    if (!ok) showImageError("A conexão caiu. Reconecte-se antes de salvar o perfil.");
  }

  function getNotifications() {
    return {
      messages: Boolean(safe("notifyMessages")?.checked),
      invites: Boolean(safe("notifyInvites")?.checked),
      events: Boolean(safe("notifyEvents")?.checked),
      activity: Boolean(safe("notifyActivity")?.checked),
    };
  }
  function savePrivacy() {
    const message = safe("privacySettingsMessage");
    if (!message) return;
    message.textContent = "Salvando…";
    message.classList.remove("is-error");
    const ok = context?.send?.({
      t: "settings_set",
      notifications: getNotifications(),
      is_private: Boolean(safe("cfgProfilePrivate")?.checked),
      show_stats: Boolean(safe("cfgShowStats")?.checked),
      show_activity: Boolean(safe("cfgShowActivity")?.checked),
    });
    if (!ok) {
      message.textContent = "A conexão caiu. Reconecte-se antes de salvar as preferências.";
      message.classList.add("is-error");
    }
  }
  function saveNotifications() {
    const message = safe("notificationSettingsMessage");
    if (!message) return;
    message.textContent = "Salvando…";
    message.classList.remove("is-error");
    const ok = context?.send?.({
      t: "settings_set",
      notifications: getNotifications(),
      is_private: Boolean(safe("cfgProfilePrivate")?.checked),
      show_stats: Boolean(safe("cfgShowStats")?.checked),
      show_activity: Boolean(safe("cfgShowActivity")?.checked),
    });
    if (!ok) {
      message.textContent = "A conexão caiu. Reconecte-se antes de salvar as preferências.";
      message.classList.add("is-error");
    }
  }
  function submitPasswordChange(event) {
    event.preventDefault();
    const current = safe("passwordCurrent")?.value || "";
    const next = safe("passwordNew")?.value || "";
    const confirmation = safe("passwordConfirm")?.value || "";
    const message = safe("passwordChangeMessage");
    if (!message) return;
    message.classList.remove("is-error");
    if (next.length < 10 || next.length > 128) {
      message.textContent = "A nova senha deve ter entre 10 e 128 caracteres.";
      message.classList.add("is-error");
      return;
    }
    if (next !== confirmation) {
      message.textContent = "A confirmação não corresponde à nova senha.";
      message.classList.add("is-error");
      safe("passwordConfirm")?.focus();
      return;
    }
    message.textContent = "Alterando senha…";
    const ok = context?.send?.({ t: "password_change", current, new: next });
    if (!ok) {
      message.textContent = "A conexão caiu. Reconecte-se antes de alterar sua senha.";
      message.classList.add("is-error");
    }
  }

  function mount(options) {
    context = options || {};

    const editBtn = safe("profileEditButton");
    if (editBtn) editBtn.addEventListener("click", openEditor);
    const settingsEdit = safe("settingsEditProfile");
    if (settingsEdit) settingsEdit.addEventListener("click", () => { context?.openProfile?.(); openEditor(); });
    const backBtn = safe("profileBack");
    if (backBtn) backBtn.addEventListener("click", handleBack);
    const msgBtn = safe("profileMessageBtn");
    if (msgBtn) msgBtn.addEventListener("click", handleMessage);
    const repBtn = safe("profileReportBtn");
    if (repBtn) repBtn.addEventListener("click", handleReport);
    const friendBtn = safe("profileFriendBtn");
    if (friendBtn) friendBtn.addEventListener("click", handleFriendClick);

    const editorClose = safe("profileEditorClose");
    if (editorClose) editorClose.addEventListener("click", () => safe("profileEditor")?.close());
    const cancelBtn = safe("profileCancelButton");
    if (cancelBtn) cancelBtn.addEventListener("click", () => safe("profileEditor")?.close());

    const form = safe("profileForm");
    if (form) form.addEventListener("submit", saveProfile);
    const nameInput = safe("profileDisplayNameInput");
    if (nameInput) nameInput.addEventListener("input", syncDraftPreviews);

    ["profileAccentInput", "profileFrameInput"].forEach(id => {
      const el = safe(id);
      if (!el) return;
      el.addEventListener("input", () => {
        const editor = safe("profileEditor");
        const accent = safe("profileAccentInput")?.value;
        if (editor && accent) editor.style.setProperty("--profile-accent", accent);
      });
    });

    const rankSelect = safe("pRank");
    if (rankSelect) rankSelect.addEventListener("change", () => { syncStarsField(); refreshRankPreview(); });
    const starsInput = safe("pStars");
    if (starsInput) starsInput.addEventListener("input", applyStarsToRank);
    const heroSelect = safe("pHero");
    if (heroSelect) heroSelect.addEventListener("change", refreshHeroPreview);

    const avatarFile = safe("profileAvatarFile");
    if (avatarFile) {
      avatarFile.addEventListener("change", async (event) => {
        try {
          draftAvatar = await imageData(event.target.files[0], 360, 360, MAX_AVATAR_DATA_LENGTH);
          const msg = safe("profileFormMessage");
          if (msg) msg.textContent = "";
          syncDraftPreviews();
        } catch (error) { showImageError(error.message); event.target.value = ""; }
      });
    }
    const bannerFile = safe("profileBannerFile");
    if (bannerFile) {
      bannerFile.addEventListener("change", async (event) => {
        try {
          draftBanner = await imageData(event.target.files[0], 1280, 460, MAX_BANNER_DATA_LENGTH);
          const msg = safe("profileFormMessage");
          if (msg) msg.textContent = "";
          syncDraftPreviews();
        } catch (error) { showImageError(error.message); event.target.value = ""; }
      });
    }
    const removeAvatar = safe("profileRemoveAvatar");
    if (removeAvatar) removeAvatar.addEventListener("click", () => {
      draftAvatar = "";
      const inp = safe("profileAvatarFile");
      if (inp) inp.value = "";
      syncDraftPreviews();
    });
    const removeBanner = safe("profileRemoveBanner");
    if (removeBanner) removeBanner.addEventListener("click", () => {
      draftBanner = "";
      const inp = safe("profileBannerFile");
      if (inp) inp.value = "";
      syncDraftPreviews();
    });

    const savePriv = safe("savePrivacySettings");
    if (savePriv) savePriv.addEventListener("click", savePrivacy);
    const saveNotif = safe("saveNotificationSettings");
    if (saveNotif) saveNotif.addEventListener("click", saveNotifications);
    const pwForm = safe("passwordChangeForm");
    if (pwForm) pwForm.addEventListener("submit", submitPasswordChange);

    document.querySelectorAll("[data-toggle-password]").forEach(button => {
      button.addEventListener("click", () => {
        const input = safe(button.dataset.togglePassword);
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        button.textContent = show ? "Ocultar" : "Mostrar";
        const label = button.closest("label")?.firstChild?.textContent?.trim() || "";
        button.setAttribute("aria-label", (show ? "Ocultar " : "Mostrar ") + label);
      });
    });

    window.addEventListener("hero-catalog-ready", () => {
      populateHeroOptions();
      const editor = safe("profileEditor");
      if (editor && editor.open) refreshHeroPreview();
    });

    watchSidebarBadge();
    setChromeVisibility();
  }

  // ─────────────────────────────────────────────────────────────
  // RESUMO DE PERFIL REUTILIZÁVEL (DM, LFG, dialogs)
  // ─────────────────────────────────────────────────────────────
  let _summaryStylesInjected = false;
  function ensureSummaryStyles() {
    if (_summaryStylesInjected) return;
    if (document.getElementById("profile-summary-css")) { _summaryStylesInjected = true; return; }
    const style = document.createElement("style");
    style.id = "profile-summary-css";
    style.textContent = `
      .profile-summary { display:flex; flex-direction:column; gap:12px; min-width:0; }
      .profile-summary-head { display:flex; align-items:center; gap:14px; min-width:0; }
      .profile-summary-avatar { width:64px; height:64px; border-radius:50%; overflow:hidden; display:grid; place-items:center; flex:0 0 auto; background:linear-gradient(145deg,#262b34,#171a20); color:var(--profile-accent, var(--accent, #d4b45a)); font-weight:700; font-size:1.4rem; text-transform:uppercase; box-shadow:0 0 0 2px var(--profile-accent, var(--accent, #d4b45a)); }
      .profile-summary-avatar img { width:100%; height:100%; object-fit:cover; display:block; }
      .profile-summary-id { display:flex; flex-direction:column; gap:2px; min-width:0; flex:1 1 auto; }
      .profile-summary-name { display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width:0; }
      .profile-summary-name b { font-size:1.15rem; overflow-wrap:anywhere; }
      .profile-summary-nick { color:var(--muted, #9298a3); font-size:.82rem; }
      .profile-summary-title { align-self:flex-start; margin-top:4px; padding:2px 8px; border-radius:999px; font-size:.72rem; font-weight:600; color:var(--profile-accent, var(--accent, #d4b45a)); background:rgba(255,255,255,.06); }
      .profile-summary-status { display:inline-flex; align-items:center; gap:5px; font-size:.75rem; color:var(--muted, #9298a3); }
      .profile-summary-status i { width:8px; height:8px; border-radius:50%; background:#6b7280; display:inline-block; }
      .profile-summary-status.is-online i { background:#3ddc84; box-shadow:0 0 6px rgba(61,220,132,.7); }
      .profile-summary-bio { margin:0; color:var(--muted, #9298a3); font-size:.9rem; line-height:1.5; overflow-wrap:anywhere; white-space:pre-wrap; }
      .profile-summary-note { margin:0; padding:10px 12px; border-radius:10px; background:rgba(255,255,255,.04); color:var(--muted, #9298a3); font-size:.9rem; }
      .profile-summary-tags { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:8px; }
      .profile-summary-tag { display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:10px; background:rgba(255,255,255,.04); box-shadow:inset 0 0 0 1px rgba(255,255,255,.07); min-width:0; }
      .profile-summary-tag-icon { width:30px; height:30px; flex:0 0 auto; display:grid; place-items:center; }
      .profile-summary-tag-icon img { width:100%; height:100%; object-fit:contain; display:block; }
      .profile-summary-tag-copy { display:flex; flex-direction:column; min-width:0; }
      .profile-summary-tag-copy small { color:var(--muted, #9298a3); font-size:.66rem; text-transform:uppercase; letter-spacing:.06em; }
      .profile-summary-tag-copy b { font-size:.92rem; overflow-wrap:anywhere; }
      .profile-summary-roles { display:flex; flex-wrap:wrap; gap:6px; }
      .profile-summary-role { padding:2px 8px; border-radius:999px; font-size:.7rem; font-weight:700; letter-spacing:.04em; background:rgba(255,255,255,.07); }
      .profile-summary-role[data-role="dev"]       { color:#f2b84b; }
      .profile-summary-role[data-role="admin"]     { color:#f2b84b; }
      .profile-summary-role[data-role="mod"]       { color:#f2b84b; }
      .profile-summary-role[data-role="moderador"] { color:#f2b84b; }
      .profile-summary-role[data-role="vip"]       { color:#4c8dff; }
      .profile-summary-role[data-role="streamer"]  { color:#b46bff; }
      .profile-summary-role[data-role="beta"]      { color:#ff9d2e; }
      .profile-summary-role[data-role="membro"]    { color:#9298a3; }
      .profile-summary-joined { color:var(--muted, #9298a3); font-size:.78rem; }
    `;
    document.head.appendChild(style);
    _summaryStylesInjected = true;
  }

  function summaryRankIcon(rank) {
    const candidates = rankCandidatesForRank(rank);
    if (!candidates.length) return null;
    const wrap = node("span", null, "profile-summary-tag-icon");
    const img = node("img"); img.alt = ""; img.loading = "lazy";
    loadImageWithFallback(img, candidates);
    wrap.append(img);
    return wrap;
  }
  function summaryHeroIcon(name) {
    const url = heroImageUrl(name);
    if (!url) return null;
    const wrap = node("span", null, "profile-summary-tag-icon");
    const img = node("img"); img.alt = ""; img.loading = "lazy";
    img.src = url; img.onerror = () => { img.hidden = true; };
    wrap.append(img);
    return wrap;
  }
  function summaryTag(label, value, icon) {
    const item = node("span", null, "profile-summary-tag");
    if (icon) item.append(icon);
    const copy = node("span", null, "profile-summary-tag-copy");
    copy.append(node("small", label), node("b", value));
    item.append(copy);
    return item;
  }

  function createProfileSummary(data, options) {
    ensureSummaryStyles();
    ensureInlineBadgeStyles();
    const d = data && typeof data === "object" ? data : {};
    const opts = options || {};
    const nick = d.username || d.nick || opts.nick || "";
    const displayName = d.display_name || d.display || nick || "Jogador";

    const root = node("div", null, "profile-summary");

    const head = node("div", null, "profile-summary-head");
    head.append(createAvatar({ ...d, display_name: displayName, username: nick }, "profile-summary-avatar"));
    const identity = node("div", null, "profile-summary-id");
    const nameRow = node("div", null, "profile-summary-name");
    nameRow.append(node("b", displayName));

    const role = roleFromProfile(d);
    const def = badgeDefForRole(role);
    if (def) {
      const badge = node("span", null, "profile-verified-badge-inline");
      badge.setAttribute("role", "img");
      badge.dataset.badge = ROLE_TO_BADGE[role] || "";
      badge.dataset.role = role;
      if (def.emoji) {
        badge.textContent = def.emoji;
        badge.style.color = "";
        badge.style.fontSize = "18px";
        badge.style.lineHeight = "1";
        badge.style.filter = `drop-shadow(0 0 5px ${def.color}aa)`;
      } else {
        badge.innerHTML = def.svg;
        badge.style.color = def.color;
        badge.style.filter = `drop-shadow(0 0 5px ${def.color}88)`;
      }
      const label = badgeLabelForRole(role);
      badge.setAttribute("aria-label", label);
      badge.setAttribute("title", label);
      nameRow.append(badge);
    }

    identity.append(nameRow, node("small", "@" + (nick || "jogador"), "profile-summary-nick"));
    if (!d.details_hidden && d.title) identity.append(node("span", d.title, "profile-summary-title"));
    const onlineFlag = typeof d.online === "boolean" ? d.online
      : typeof opts.online === "boolean" ? opts.online : null;
    if (onlineFlag !== null) {
      const status = node("span", null, "profile-summary-status" + (onlineFlag ? " is-online" : ""));
      status.append(node("i"), document.createTextNode(onlineFlag ? "Online agora" : "Offline"));
      identity.append(status);
    }
    head.append(identity);
    root.append(head);

    if (d.details_hidden) {
      root.append(node("p", "🔒 Este perfil é " +
        (d.visibility === "friends" ? "visível apenas para amigos." : "privado."), "profile-summary-note"));
      return root;
    }
    if (d.is_private && !opts.isSelf) {
      root.append(node("p", "Este jogador mantém o perfil privado.", "profile-summary-note"));
      return root;
    }

    if (d.bio) root.append(node("p", d.bio, "profile-summary-bio"));

    const tags = node("div", null, "profile-summary-tags");
    if (d.rank) {
      const stars = profileStars(d);
      tags.append(summaryTag("Rank", stars == null ? d.rank : d.rank + " · " + stars + " ★",
        summaryRankIcon(d.rank)));
    }
    if (d.game_role) tags.append(summaryTag("Função principal", d.game_role, null));
    if (d.hero) tags.append(summaryTag("Herói principal", d.hero, summaryHeroIcon(d.hero)));
    if (d.gid) tags.append(summaryTag("ID no jogo", d.gid, null));
    if (tags.childElementCount) root.append(tags);
    else root.append(node("p", "Este jogador ainda não preencheu os dados de jogo.", "profile-summary-note"));

    const roles = Array.isArray(d.community_roles) ? d.community_roles : [];
    if (roles.length) {
      const box = node("div", null, "profile-summary-roles");
      roles.forEach(roleName => {
        const chip = node("span", String(roleName), "profile-summary-role");
        chip.dataset.role = String(roleName).toLocaleLowerCase("pt-BR");
        box.append(chip);
      });
      root.append(box);
    }

    if (d.joined_at) root.append(node("small", formatJoined(d.joined_at), "profile-summary-joined"));
    return root;
  }

  function setProfile(nextProfile, username) {
    renderProfile(nextProfile, username);
    const dialog = safe("profileEditor");
    if (dialog && dialog.open) {
      dialog.close();
      context?.toast?.("Perfil atualizado com sucesso.");
    }
  }
  function settingsSaved(nextProfile) {
    renderProfile(nextProfile, context?.getUsername?.());
    const pmsg = safe("privacySettingsMessage");
    if (pmsg) { pmsg.textContent = "Preferências salvas."; pmsg.classList.remove("is-error"); }
    const nmsg = safe("notificationSettingsMessage");
    if (nmsg) { nmsg.textContent = "Preferências salvas."; nmsg.classList.remove("is-error"); }
  }
  function showError(targetId, message) {
    const target = safe(targetId);
    if (!target) return;
    target.textContent = message;
    target.classList.add("is-error");
  }

  window.ProfileUI = {
    createAvatar, mount, renderProfile, setProfile, settingsSaved, showError,
    renderOtherProfile, returnToSelf, getMode, getCurrentUserId,

    roleFromProfile,
    hasAnyBadge,
    badgeKeyForRole, badgeColorForRole, badgeLabelForRole, badgeSvgForRole,
    badgeEmojiForRole,
    renderVerifiedBadge, renderSidebarVerifiedBadge,
    renderSidebarUsername, looksLikeSameName,
    hasVerifiedRole, verifiedRoleKey, verifiedRoleLabel,

    applyFriendshipStatus, handleFriendClick,

    rankBasesFor, rankImageCandidatesFromBases, rankCandidatesForRank,
    heroImageUrl, RANK_OPTIONS,

    createProfileSummary, profileStars, formatJoined,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (window.__selfProfile) {
        renderSidebarVerifiedBadge(window.__selfProfile);
        renderSidebarUsername(window.__selfProfile,
          window.__selfProfile.username, window.__selfProfile.display_name);
      }
    });
  } else {
    if (window.__selfProfile) {
      renderSidebarVerifiedBadge(window.__selfProfile);
      renderSidebarUsername(window.__selfProfile,
        window.__selfProfile.username, window.__selfProfile.display_name);
    }
  }

  document.addEventListener("profile:self-updated", (ev) => {
    const data = ev?.detail?.profile;
    if (data) {
      renderSidebarVerifiedBadge(data);
      renderSidebarUsername(data, data.username, data.display_name);
    }
  });
  window.addEventListener("profile:self-updated", (ev) => {
    const data = ev?.detail?.profile;
    if (data) {
      renderSidebarVerifiedBadge(data);
      renderSidebarUsername(data, data.username, data.display_name);
    }
  });
})();