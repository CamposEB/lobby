/* Reusable profile presentation and editor interactions. */
/* v7 — caminho e sufixo corretos: /static/assets/ + "-png-ml.png" */
(() => {
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const MAX_AVATAR_DATA_LENGTH = 120000;
  const MAX_BANNER_DATA_LENGTH = 350000;

  // 🛠️ CORRIGIDO: os arquivos estão em /static/assets/, não em /elos/
  const ELOS_DIR = "/static/assets/";
  const HERO_IMAGE_DIR = "/static/img/icons/herois/";

  const defaultAccent = () =>
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();

  // ─────────────────────────────────────────────────────────────
  // Sufixos testados em ordem. O primeiro é o que existe HOJE na
  // pasta (D:\lobby\static\assets\*-png-ml.png). Os demais ficam
  // como reserva para o caso de os arquivos serem renomeados no
  // futuro para o padrão "tradicional" (.png, .webp).
  // ─────────────────────────────────────────────────────────────
  const RANK_FILE_SUFFIXES = [
    "-png-ml.png",
    "-png-ml.webp",
    "-png-ml.jpg",
    ".png-ml.png",
    ".png-ml.webp",
    ".png-ml.jpg",
    ".png",
    ".webp",
    ".jpg",
    ".jpeg",
    ".svg",
  ];

  // ─────────────────────────────────────────────────────────────
  // Bases (sem sufixo). Cada opção pode ter mais de uma base
  // porque "grandmaster" aparece de duas formas em diferentes
  // distribuições do dataset.
  // ─────────────────────────────────────────────────────────────
  const RANK_OPTIONS = [
    { value: "Guerreiro",     label: "Guerreiro",     bases: ["logo-icon-rank-warrior"] },
    { value: "Elite",         label: "Elite",         bases: ["logo-icon-rank-elite"] },
    { value: "Mestre",        label: "Mestre",        bases: ["logo-icon-rank-master"] },
    {
      value: "Grande Mestre",
      label: "Grande Mestre",
      bases: ["logo-icon-rank-grandmaster", "logo-icon-rankgrandmaster"],
    },
    { value: "Épico",         label: "Épico",         bases: ["logo-icon-rank-epic"] },
    { value: "Lenda",         label: "Lenda",         bases: ["logo-icon-rank-legend"] },
    { value: "Mítico",        label: "Mítico",        bases: ["logo-icon-rank-mythic"] },
    {
      value: "Honra Mítica",
      label: "Honra Mítica",
      bases: ["logo-icon-rank-mythical-honor"],
    },
    {
      value: "Glória Mítica",
      label: "Glória Mítica",
      bases: ["logo-icon-rank-mythical-glory"],
    },
    { value: "Imortal",       label: "Imortal",       bases: ["logo-icon-rank-immortal"] },
  ];

  // Aliases de texto aceitos para o rank digitado (tolera acentos,
  // variações em inglês e escrita livre).
  const RANK_ALIASES = [
    {
      bases: ["logo-icon-rank-mythical-glory"],
      aliases: [
        "glória mítica", "gloria mitica",
        "mítico glorioso", "mitico glorioso",
        "mythical glory", "glorioso",
      ],
    },
    {
      bases: ["logo-icon-rank-mythical-honor"],
      aliases: [
        "honra mítica", "honra mitica",
        "mítico honrado", "mitico honrado",
        "mythical honor", "honrado",
      ],
    },
    { bases: ["logo-icon-rank-immortal"],    aliases: ["imortal", "immortal"] },
    {
      bases: ["logo-icon-rank-grandmaster", "logo-icon-rankgrandmaster"],
      aliases: [
        "grandemestre", "grande mestre",
        "grão-mestre", "grao-mestre",
        "grão mestre", "grao mestre",
        "grandmaster", "grand master",
      ],
    },
    { bases: ["logo-icon-rank-mythic"],      aliases: ["mítico", "mitico", "mythic"] },
    { bases: ["logo-icon-rank-legend"],      aliases: ["lenda", "legend"] },
    { bases: ["logo-icon-rank-master"],      aliases: ["mestre", "master"] },
    { bases: ["logo-icon-rank-epic"],        aliases: ["épico", "epico", "epic"] },
    { bases: ["logo-icon-rank-elite"],       aliases: ["elite"] },
    { bases: ["logo-icon-rank-warrior"],     aliases: ["guerreiro", "warrior"] },
  ];

  function normalizeRank(value) {
    return String(value || "")
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  /** Lista de bases candidatas para um rank digitado. */
  function rankBasesFor(rank) {
    const normalized = normalizeRank(rank);
    if (!normalized) return [];

    const exact = RANK_OPTIONS.find(
      (option) => normalizeRank(option.value) === normalized
    );
    if (exact) return [...exact.bases];

    for (const entry of RANK_ALIASES) {
      for (const alias of entry.aliases) {
        const key = normalizeRank(alias);
        if (key && normalized.includes(key)) return [...entry.bases];
      }
    }
    return [];
  }

  /**
   * Constrói as URLs candidatas: para cada base, cada sufixo.
   * Com ELOS_DIR = "/static/assets/" e base = "logo-icon-rank-elite",
   * a primeira URL fica:
   *   /static/assets/logo-icon-rank-elite-png-ml.png
   */
  function rankImageCandidatesFromBases(bases) {
    if (!Array.isArray(bases) || !bases.length) return [];
    const urls = [];
    for (const base of bases) {
      const clean = String(base).replace(
        /(-png-ml)?(\.[a-z0-9]+)?$/i,
        ""
      );
      for (const suffix of RANK_FILE_SUFFIXES) {
        urls.push(ELOS_DIR + encodeURIComponent(clean + suffix));
      }
    }
    return urls;
  }

  function rankCandidatesForRank(rank) {
    return rankImageCandidatesFromBases(rankBasesFor(rank));
  }

  function heroIconFile(name) {
    const catalog = Array.isArray(window.HERO_CATALOG) ? window.HERO_CATALOG : [];
    if (!name || !catalog.length) return "";
    const lower = String(name).toLocaleLowerCase("pt-BR").trim();
    const hero = catalog.find(
      (h) => String(h.name || "").toLocaleLowerCase("pt-BR").trim() === lower
    );
    return hero && hero.file ? hero.file : "";
  }

  function heroImageUrl(name) {
    const file = heroIconFile(name);
    return file ? HERO_IMAGE_DIR + file : "";
  }

  // ─────────────────────────────────────────────────────────────
  // ESTADO
  // ─────────────────────────────────────────────────────────────
  let context = null;
  let draftAvatar = "";
  let draftBanner = "";

  let profile = {};
  let selfProfile = null;
  let currentMode = "self";
  let currentUserId = null;

  // ─────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────
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
    const name =
      data.display_name || data.display || data.username || data.nick || "Jogador";
    const image = data.avatar || "";
    wrapper.setAttribute("role", "img");
    wrapper.setAttribute("aria-label", "Foto de perfil de " + name);

    if (
      /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image) &&
      image.length <= MAX_AVATAR_DATA_LENGTH
    ) {
      const photo = node("img");
      photo.src = image;
      photo.alt = "";
      photo.loading = "lazy";
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
    container.style.backgroundImage =
      image && image.length <= MAX_BANNER_DATA_LENGTH
        ? 'linear-gradient(180deg, rgba(var(--bg-rgb), .08), rgba(var(--bg-rgb), .72)), url("' +
          image +
          '")'
        : "";
    container.classList.toggle(
      "has-banner",
      Boolean(image && image.length <= MAX_BANNER_DATA_LENGTH)
    );
  }

  function safe(id) { return document.getElementById(id); }

  function setText(id, value) {
    const el = safe(id);
    if (el) el.textContent = value;
  }

  function setHidden(id, hidden) {
    const el = safe(id);
    if (el) el.hidden = Boolean(hidden);
  }

  function setChecked(id, checked) {
    const el = safe(id);
    if (el) el.checked = Boolean(checked);
  }

  function setVal(id, value) {
    const el = safe(id);
    if (el) el.value = value;
  }

  // ─────────────────────────────────────────────────────────────
  // FORMATAÇÃO
  // ─────────────────────────────────────────────────────────────
  function formatJoined(value) {
    if (!value) return "Data de entrada não registrada";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Data de entrada não registrada";
    return (
      "Na comunidade desde " +
      new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(date)
    );
  }

  function formatTime(value) {
    const date = new Date(Number(value) * 1000);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  // ─────────────────────────────────────────────────────────────
  // CARREGAMENTO COM FALLBACK
  // ─────────────────────────────────────────────────────────────
  function loadImageWithFallback(img, candidates, index = 0) {
    if (!img) return;
    if (!Array.isArray(candidates) || !candidates.length || index >= candidates.length) {
      img.removeAttribute("src");
      img.onerror = null;
      img.hidden = true;
      return;
    }
    img.hidden = false;
    img.onerror = () => loadImageWithFallback(img, candidates, index + 1);
    img.src = candidates[index];
  }

  // ─────────────────────────────────────────────────────────────
  // SEÇÕES DO CARD
  // ─────────────────────────────────────────────────────────────
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
        const img = node("img");
        img.alt = "";
        img.loading = "lazy";
        loadImageWithFallback(img, candidates);
        wrap.append(img);
        icon = wrap;
      }
      box.append(buildGameTag("Rank", profile.rank, icon));
    }

    if (profile.role) {
      box.append(buildGameTag("Função principal", profile.role, null));
    }

    if (profile.hero) {
      const url = heroImageUrl(profile.hero);
      let icon = null;
      if (url) {
        const wrap = node("span", null, "profile-game-tag-icon");
        const img = node("img");
        img.alt = "";
        img.loading = "lazy";
        img.src = url;
        img.onerror = () => { img.hidden = true; };
        wrap.append(img);
        icon = wrap;
      }
      box.append(buildGameTag("Herói principal", profile.hero, icon));
    }

    if (profile.gid) {
      box.append(buildGameTag("ID no jogo", profile.gid, null));
    }

    if (!box.childElementCount) {
      box.append(
        node(
          "p",
          "Adicione seus dados de jogo ao editar o perfil.",
          "profile-empty"
        )
      );
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
      [
        "🪙",
        "Moedas",
        Number.isFinite(Number(stats.coins))
          ? Number(stats.coins).toLocaleString("pt-BR")
          : "—",
      ],
      [
        "🧠",
        "Quizzes respondidos",
        Number.isFinite(Number(stats.quizzes))
          ? Number(stats.quizzes).toLocaleString("pt-BR")
          : "—",
      ],
    ].forEach(([icon, label, value]) => {
      const card = node("article", null, "profile-stat-card");
      card.append(
        node("span", icon, "profile-stat-icon"),
        node("span", label, "profile-stat-label"),
        node("b", value)
      );
      container.append(card);
    });
    container.append(
      node(
        "p",
        "Partidas e Win Rate ainda não são registrados pelo site.",
        "profile-data-note"
      )
    );
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
      container.append(
        node(
          "p",
          "Responda ao quiz diário para desbloquear sua primeira conquista.",
          "profile-empty"
        )
      );
      return;
    }
    achievements.forEach((badge) => {
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
      container.append(
        node("p", "Você ainda não possui atividades recentes.", "profile-empty")
      );
      return;
    }
    activity.forEach((entry) => {
      const item = node("article", null, "profile-activity-item");
      item.append(
        node(
          "span",
          entry.kind === "quiz" ? "🧠" : entry.kind === "room" ? "🎮" : "✨",
          "profile-activity-icon"
        )
      );
      const content = node("div");
      content.append(node("b", entry.detail), node("time", formatTime(entry.ts)));
      item.append(content);
      container.append(item);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // STATUS ONLINE/OFFLINE
  // ─────────────────────────────────────────────────────────────
  function resolveOnlineFlag(data) {
    if (!data || typeof data !== "object") return false;
    if (typeof data.online === "boolean") return data.online;
    if (typeof data.is_online === "boolean") return data.is_online;
    if (typeof data.isOnline === "boolean") return data.isOnline;
    if (data.presence && typeof data.presence.online === "boolean") {
      return data.presence.online;
    }
    if (typeof data.status === "string") {
      return data.status.toLowerCase() === "online";
    }
    return false;
  }

  function renderStatus(data, forcedOnline) {
    const status = safe("profileStatus");
    if (!status) return;

    const isOnline =
      typeof forcedOnline === "boolean"
        ? forcedOnline
        : resolveOnlineFlag(data);

    status.replaceChildren(
      node("i"),
      document.createTextNode(isOnline ? " Online" : " Offline")
    );
    status.classList.toggle("is-online", isOnline);
    status.classList.toggle("is-offline", !isOnline);
    status.setAttribute("data-online", isOnline ? "true" : "false");
    status.setAttribute("aria-label", isOnline ? "Online agora" : "Offline");
  }

  // ─────────────────────────────────────────────────────────────
  // BADGE DE ELO no card
  // ─────────────────────────────────────────────────────────────
  function applyRankBadge(data) {
    const badge = safe("profileRankBadge");
    const image = safe("profileRankImage");
    const label = safe("profileRankLabel");
    if (!badge) return;

    const rank = (data.rank || "").trim();
    const candidates = rankCandidatesForRank(rank);

    if (!rank || !candidates.length) {
      badge.hidden = true;
      if (image) {
        image.removeAttribute("src");
        image.onerror = null;
      }
      return;
    }

    badge.hidden = false;
    if (label) label.textContent = rank;
    if (image) loadImageWithFallback(image, candidates);
  }

  // ─────────────────────────────────────────────────────────────
  // TÍTULO DINÂMICO
  // ─────────────────────────────────────────────────────────────
  function applyPageHeading(data, mode) {
    const isOther = mode === "other";
    if (isOther) {
      const name = (data && (data.display_name || data.username)) || "Jogador";
      setText("profilePageTitle", "Perfil de " + name);
      setText(
        "profilePageSubtitle",
        "Conheça a jornada de " + name + " na comunidade Society."
      );
      setText("profileEyebrow", "PLAYER CARD");
    } else {
      setText("profilePageTitle", "Meu perfil");
      setText(
        "profilePageSubtitle",
        "Seu espaço na comunidade. Mostre como você joga e personalize sua identidade."
      );
      setText("profileEyebrow", "SOCIETY · PLAYER CARD");
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CARD
  // ─────────────────────────────────────────────────────────────
  function applyProfileCard(data, username, options = {}) {
    const displayName = data.display_name || username || "Jogador";

    setText("profileDisplayName", displayName);
    setText("profileUsername", "@" + (data.username || username || "jogador"));
    setText(
      "profileBio",
      data.bio || "Adicione uma bio para que a comunidade conheça você."
    );
    setText("profileJoined", formatJoined(data.joined_at));

    renderStatus(data, options.forceOnline);
    applyRankBadge(data);

    setText("profileTitle", data.title || "");
    setHidden("profileTitle", !data.title);

    const roles = safe("profileCommunityRoles");
    if (roles) {
      roles.replaceChildren();
      (Array.isArray(data.community_roles) ? data.community_roles : []).forEach(
        (role) => {
          const badge = node("span", role, "profile-community-role");
          badge.dataset.role = role.toLocaleLowerCase("pt-BR");
          roles.append(badge);
        }
      );
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
  }

  // ─────────────────────────────────────────────────────────────
  // CHROME (self)
  // ─────────────────────────────────────────────────────────────
  function applySelfChrome(data, username) {
    const displayName = data.display_name || username || "Jogador";
    const usernameHandle = "@" + (data.username || username || "jogador");

    setAvatar(safe("sidebarAvatar"), data, "sidebar-avatar");

    const navAvatar = safe("profileNavAvatar");
    if (navAvatar) {
      const newAvatar = createAvatar(data, "nav-profile-avatar");
      navAvatar.replaceChildren(
        newAvatar.childNodes[0] ||
          document.createTextNode(initials(displayName, data.username))
      );
    }

    setText("sidebarDisplayName", displayName);
    setText("sidebarUsername", usernameHandle);

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

  // ─────────────────────────────────────────────────────────────
  // SELF / OTHER
  // ─────────────────────────────────────────────────────────────
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

    currentMode = "self";
    currentUserId = null;
    profile = selfProfile || {};
    const username = context?.getUsername ? context.getUsername() : undefined;

    applyPageHeading(profile, "self");
    applyProfileCard(profile, username, { forceOnline: true });
    applySelfChrome(profile, username);
    setChromeVisibility();
  }

  function getMode() { return currentMode; }
  function getCurrentUserId() { return currentUserId; }

  // ─────────────────────────────────────────────────────────────
  // AÇÕES DO HEADER
  // ─────────────────────────────────────────────────────────────
  function handleBack() {
    if (typeof context?.goBack === "function") {
      context.goBack();
      return;
    }
    returnToSelf();
    document.dispatchEvent(new CustomEvent("profile:back"));
  }

  function handleMessage() {
    if (currentMode !== "other" || currentUserId == null) return;
    if (typeof context?.openDM === "function") {
      context.openDM(currentUserId);
      return;
    }
    document.dispatchEvent(
      new CustomEvent("profile:message", { detail: { userId: currentUserId } })
    );
  }

  function handleReport() {
    if (currentMode !== "other" || currentUserId == null) return;
    if (typeof context?.reportUser === "function") {
      context.reportUser(currentUserId);
      return;
    }
    document.dispatchEvent(
      new CustomEvent("profile:report", { detail: { userId: currentUserId } })
    );
  }

  // ─────────────────────────────────────────────────────────────
  // SELECTS: RANK e HERÓI
  // ─────────────────────────────────────────────────────────────
  function populateRankOptions(currentValue) {
    const select = safe("pRank");
    if (!select) return;
    const desired = currentValue != null ? currentValue : select.value || "";

    while (select.options.length > 1) select.remove(1);

    RANK_OPTIONS.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      select.append(opt);
    });

    if (desired) {
      const exists = Array.from(select.options).some((o) => o.value === desired);
      if (!exists) {
        const opt = document.createElement("option");
        opt.value = desired;
        opt.textContent = desired + " (personalizado)";
        select.append(opt);
      }
      select.value = desired;
    } else {
      select.value = "";
    }
  }

  function populateHeroOptions(currentValue) {
    const select = safe("pHero");
    if (!select) return;
    const desired = currentValue != null ? currentValue : select.value || "";

    while (select.options.length > 1) select.remove(1);

    const catalog = Array.isArray(window.HERO_CATALOG) ? window.HERO_CATALOG : [];
    const sorted = [...catalog].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "pt-BR")
    );
    sorted.forEach((hero) => {
      if (!hero || !hero.name) return;
      const opt = document.createElement("option");
      opt.value = hero.name;
      opt.textContent = hero.name;
      select.append(opt);
    });

    if (desired) {
      const exists = Array.from(select.options).some((o) => o.value === desired);
      if (!exists) {
        const opt = document.createElement("option");
        opt.value = desired;
        opt.textContent = desired + " (personalizado)";
        select.append(opt);
      }
      select.value = desired;
    } else {
      select.value = "";
    }
  }

  function refreshRankPreview() {
    const select = safe("pRank");
    const img = safe("pRankPreviewImage");
    const wrap = safe("pRankPreview");
    if (!select || !img) return;

    const value = (select.value || "").trim();
    const candidates = rankCandidatesForRank(value);

    if (!value || !candidates.length) {
      img.removeAttribute("src");
      img.onerror = null;
      img.hidden = true;
      if (wrap) wrap.classList.add("is-empty");
      return;
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
      img.removeAttribute("src");
      img.onerror = null;
      img.hidden = true;
      if (wrap) wrap.classList.add("is-empty");
      return;
    }

    if (wrap) wrap.classList.remove("is-empty");
    img.hidden = false;
    img.onerror = () => { img.hidden = true; };
    img.src = url;
  }

  // ─────────────────────────────────────────────────────────────
  // EDITOR
  // ─────────────────────────────────────────────────────────────
  function syncDraftPreviews() {
    const inputName = safe("profileDisplayNameInput");
    const name = (inputName?.value) || profile.display_name || "Jogador";
    const username = profile.username || "";

    setAvatar(
      safe("profilePreviewAvatar"),
      { display_name: name, username, avatar: draftAvatar },
      "profile-avatar profile-preview-avatar"
    );
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

    setVal("profileDisplayNameInput", profile.display_name || "");
    setVal("profileUsernameInput", "@" + (profile.username || ""));
    setVal("pRole", profile.role || "Qualquer");
    setVal("pGid", profile.gid || "");
    setVal("pBio", profile.bio || "");
    setVal("profileTitleInput", profile.title || "");
    setVal("profileAccentInput", profile.accent || defaultAccent());
    setVal("profileFrameInput", profile.frame || "default");
    setVal("profileThemeInput", profile.theme || "classic");

    setChecked("profilePrivateInput", Boolean(profile.is_private));
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
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("Selecione um arquivo de imagem."));
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        reject(new Error("A imagem deve ter no máximo 8 MB."));
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const scale = Math.min(
          1,
          width / image.naturalWidth,
          height / image.naturalHeight
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context2d = canvas.getContext("2d");
        if (!context2d) {
          reject(new Error("Não foi possível processar esta imagem."));
          return;
        }
        context2d.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Não foi possível otimizar esta imagem."));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              const result = String(reader.result || "");
              if (result.length > maxDataLength) {
                reject(
                  new Error(
                    "A imagem otimizada ainda ficou grande demais. Escolha outra imagem."
                  )
                );
              } else {
                resolve(result);
              }
            };
            reader.onerror = () =>
              reject(new Error("Não foi possível ler esta imagem."));
            reader.readAsDataURL(blob);
          },
          "image/jpeg",
          0.78
        );
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("O arquivo selecionado não pôde ser aberto como imagem."));
      };
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
    if (!displayName) {
      showImageError("Informe um nome de exibição.");
      safe("profileDisplayNameInput")?.focus();
      return;
    }

    const msg = safe("profileFormMessage");
    if (msg) {
      msg.textContent = "Salvando perfil…";
      msg.classList.remove("is-error");
    }

    const ok = context?.send?.({
      t: "profile_set",
      display_name: displayName,
      rank: safe("pRank")?.value || "",
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
      is_private: Boolean(safe("profilePrivateInput")?.checked),
      show_stats: Boolean(safe("profileShowStatsInput")?.checked),
      show_activity: Boolean(safe("profileShowActivityInput")?.checked),
    });

    if (!ok) {
      showImageError("A conexão caiu. Reconecte-se antes de salvar o perfil.");
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SETTINGS / SENHA
  // ─────────────────────────────────────────────────────────────
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
      message.textContent =
        "A conexão caiu. Reconecte-se antes de salvar as preferências.";
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
      message.textContent =
        "A conexão caiu. Reconecte-se antes de salvar as preferências.";
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
      message.textContent =
        "A conexão caiu. Reconecte-se antes de alterar sua senha.";
      message.classList.add("is-error");
    }
  }

  // ─────────────────────────────────────────────────────────────
  // MOUNT
  // ─────────────────────────────────────────────────────────────
  function mount(options) {
    context = options || {};

    const editBtn = safe("profileEditButton");
    if (editBtn) editBtn.addEventListener("click", openEditor);

    const settingsEdit = safe("settingsEditProfile");
    if (settingsEdit) {
      settingsEdit.addEventListener("click", () => {
        context?.openProfile?.();
        openEditor();
      });
    }

    const backBtn = safe("profileBack");
    if (backBtn) backBtn.addEventListener("click", handleBack);

    const msgBtn = safe("profileMessageBtn");
    if (msgBtn) msgBtn.addEventListener("click", handleMessage);

    const repBtn = safe("profileReportBtn");
    if (repBtn) repBtn.addEventListener("click", handleReport);

    const editorClose = safe("profileEditorClose");
    if (editorClose) {
      editorClose.addEventListener("click", () => safe("profileEditor")?.close());
    }
    const cancelBtn = safe("profileCancelButton");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => safe("profileEditor")?.close());
    }

    const form = safe("profileForm");
    if (form) form.addEventListener("submit", saveProfile);

    const nameInput = safe("profileDisplayNameInput");
    if (nameInput) nameInput.addEventListener("input", syncDraftPreviews);

    ["profileAccentInput", "profileFrameInput"].forEach((id) => {
      const el = safe(id);
      if (!el) return;
      el.addEventListener("input", () => {
        const editor = safe("profileEditor");
        const accent = safe("profileAccentInput")?.value;
        if (editor && accent) editor.style.setProperty("--profile-accent", accent);
      });
    });

    const rankSelect = safe("pRank");
    if (rankSelect) rankSelect.addEventListener("change", refreshRankPreview);

    const heroSelect = safe("pHero");
    if (heroSelect) heroSelect.addEventListener("change", refreshHeroPreview);

    const avatarFile = safe("profileAvatarFile");
    if (avatarFile) {
      avatarFile.addEventListener("change", async (event) => {
        try {
          draftAvatar = await imageData(
            event.target.files[0],
            360,
            360,
            MAX_AVATAR_DATA_LENGTH
          );
          const msg = safe("profileFormMessage");
          if (msg) msg.textContent = "";
          syncDraftPreviews();
        } catch (error) {
          showImageError(error.message);
          event.target.value = "";
        }
      });
    }

    const bannerFile = safe("profileBannerFile");
    if (bannerFile) {
      bannerFile.addEventListener("change", async (event) => {
        try {
          draftBanner = await imageData(
            event.target.files[0],
            1280,
            460,
            MAX_BANNER_DATA_LENGTH
          );
          const msg = safe("profileFormMessage");
          if (msg) msg.textContent = "";
          syncDraftPreviews();
        } catch (error) {
          showImageError(error.message);
          event.target.value = "";
        }
      });
    }

    const removeAvatar = safe("profileRemoveAvatar");
    if (removeAvatar) {
      removeAvatar.addEventListener("click", () => {
        draftAvatar = "";
        const inp = safe("profileAvatarFile");
        if (inp) inp.value = "";
        syncDraftPreviews();
      });
    }

    const removeBanner = safe("profileRemoveBanner");
    if (removeBanner) {
      removeBanner.addEventListener("click", () => {
        draftBanner = "";
        const inp = safe("profileBannerFile");
        if (inp) inp.value = "";
        syncDraftPreviews();
      });
    }

    const savePriv = safe("savePrivacySettings");
    if (savePriv) savePriv.addEventListener("click", savePrivacy);

    const saveNotif = safe("saveNotificationSettings");
    if (saveNotif) saveNotif.addEventListener("click", saveNotifications);

    const pwForm = safe("passwordChangeForm");
    if (pwForm) pwForm.addEventListener("submit", submitPasswordChange);

    document.querySelectorAll("[data-toggle-password]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = safe(button.dataset.togglePassword);
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        button.textContent = show ? "Ocultar" : "Mostrar";
        const label = button.closest("label")?.firstChild?.textContent?.trim() || "";
        button.setAttribute(
          "aria-label",
          (show ? "Ocultar " : "Mostrar ") + label
        );
      });
    });

    window.addEventListener("hero-catalog-ready", () => {
      populateHeroOptions();
      const editor = safe("profileEditor");
      if (editor && editor.open) refreshHeroPreview();
    });

    setChromeVisibility();
  }

  // ─────────────────────────────────────────────────────────────
  // HANDLERS EXTERNOS
  // ─────────────────────────────────────────────────────────────
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
    if (pmsg) {
      pmsg.textContent = "Preferências salvas.";
      pmsg.classList.remove("is-error");
    }
    const nmsg = safe("notificationSettingsMessage");
    if (nmsg) {
      nmsg.textContent = "Preferências salvas.";
      nmsg.classList.remove("is-error");
    }
  }

  function showError(targetId, message) {
    const target = safe(targetId);
    if (!target) return;
    target.textContent = message;
    target.classList.add("is-error");
  }

  // ─────────────────────────────────────────────────────────────
  // EXPOR
  // ─────────────────────────────────────────────────────────────
  window.ProfileUI = {
    createAvatar,
    mount,
    renderProfile,
    setProfile,
    settingsSaved,
    showError,

    renderOtherProfile,
    returnToSelf,
    getMode,
    getCurrentUserId,

    rankBasesFor,
    rankImageCandidatesFromBases,
    rankCandidatesForRank,
    heroImageUrl,
    RANK_OPTIONS,
  };
})();