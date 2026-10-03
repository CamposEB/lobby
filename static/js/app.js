const views = {
  home: "/static/views/home.html",
  meta: "/static/views/meta.html",
  builds: "/static/views/builds.html",
  lobby: "/static/views/lobby.html",
  guide: "/static/views/guide.html",
  lfg: "/static/views/lfg.html",
  dm: "/static/views/dm.html",
  quiz: "/static/views/quiz.html",
  profile: "/static/views/profile.html",
  settings: "/static/views/settings.html",
  tournaments: "/static/views/tournaments.html",
  admin: "/static/views/admin.html"
};

Promise.all(Object.entries(views).map(async ([name, url]) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Falha ao carregar a aba " + name + ": HTTP " + response.status);
  return [name, await response.text()];
})).then(entries => {
  entries.forEach(([name, markup]) => {
    document.getElementById("tab-" + name).innerHTML = markup;
  });
  initializeApp();
}).catch(error => {
  console.error(error);
  document.querySelectorAll(".tab-loading").forEach(message => {
    message.textContent = "Não foi possível carregar esta aba. Atualize a página e tente novamente.";
  });
});

function initializeApp() {
const $ = id => document.getElementById(id);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const send = o => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(o));
  return true;
};
const ROOMS = {lobby:{name:"Salão Principal", floor:"#2b6f8f", wall:"#1d4a63"}, praca:{name:"Praça", floor:"#3d8b5a", wall:"#285c3b"}, arena:{name:"Arena", floor:"#8a3d5c", wall:"#5c2640"}};
const TITLES = {home:"", meta:"", builds:"", lobby:"", guide:"Guia do jogo", rooms:"Salas", lfg:"", dm:"Mensagens", shop:"Loja", inv:"Inventário", quiz:"Quiz do dia", tools:"", tournaments:"", profile:"", settings:"", admin:""};
const WW = 800, WH = 500, TILE = 50;
let ws, SHOP = {}, ME = {coins:0, owned:[], equip:{}}, SELF = null, ROOM = "lobby", LFG = [];
let PROFILE = {}, DM = {with:null}, DM_PROFILE_TARGET = null, UNREAD = 0, QZ = null, cam = {x:0, y:0}, drag = null;
let LFG_DETAILS = {}, LFG_PROFILE_TARGET = null, LFG_TOAST_TIMER = null, LFG_LOADED = false;
let IS_ADMIN = false, IS_MODERATOR = false, TOURNAMENTS = [], TOURNAMENT_EDIT_ID = null;
let COMMUNITY_META = [], COMMUNITY_BUILDS = [], COMMUNITY_BUILDS_TRENDING = [], COMMUNITY_BUILDS_RECENT = [];
let COMMUNITY_META_LANE = "all", BUILD_REQUEST_ID = 0, BUILD_LOAD_TIMER = null, BUILD_FILTER_TIMER = null;
let BUILD_LIST_STATE = "idle", BUILD_DETAIL_ID = null;

const HERO_JSON_URL = "https://raw.githubusercontent.com/Ceplin03/database-mlbb.Mobile-Legends-Bang-Bang/master/hero.json";
const HERO_IMAGE_DIR = "/static/img/icons/herois/";
const ITEM_IMAGE_DIR = "/static/img/icons/itens/";

const ITEM_CATEGORIES = [
  {id:"botas",   label:"Botas"},
  {id:"fisico",  label:"Dano Físico"},
  {id:"magico",  label:"Dano Mágico"},
  {id:"defesa",  label:"Defesa"},
  {id:"selva",   label:"Selva"},
  {id:"roaming", label:"Roaming"}
];

// file = nome do arquivo em static/img/icons/itens/ (sem .png)
const BUILD_ITEM_CATALOG = [
  // ===== BOTAS =====
  {name:"Botas de Guerreiro",  category:"botas", file:"warrior_boots"},
  {name:"Botas Resistentes",   category:"botas", file:"tough_boots"},
  {name:"Botas Rápidas",       category:"botas", file:"swift_boots"},
  {name:"Botas Arcanas",       category:"botas", file:"arcane_boots"},
  {name:"Botas Mágicas",       category:"botas", file:"magic_boots"},
  {name:"Botas Demoníacas",    category:"botas", file:"demon_boots"},
  {name:"Botas Ligeiras",      category:"botas", file:"rapid_boots"},

  // ===== FÍSICO (Tier 3) =====
  {name:"Lâmina do Desespero",           category:"fisico", file:"blade_of_despair",       aliases:["Lâmina da Desespero"]},
  {name:"Fúria do Berserker",            category:"fisico", file:"berserkers_fury"},
  {name:"Garras de Haas",                category:"fisico", file:"haass_claws"},
  {name:"Vento da Natureza",             category:"fisico", file:"wind_of_nature"},
  {name:"Espada do Caçador de Demônios", category:"fisico", file:"demon_hunter_sword"},
  {name:"Bastão Dourado",                category:"fisico", file:"golden_staff"},
  {name:"Foice da Corrosão",             category:"fisico", file:"corrosion_scythe"},
  {name:"Falador do Vento",              category:"fisico", file:"windtalker",             aliases:["Garras da Tempestade"]},
  {name:"Rugido Maléfico",               category:"fisico", file:"malefic_roar",           aliases:["Rugido do Maléfico"]},
  {name:"Lâmina dos Sete Mares",         category:"fisico", file:"blade_of_the_heptaseas", aliases:["Lâmina das Heptaseas"]},
  {name:"Batalha Infinita",              category:"fisico", file:"endless_battle"},
  {name:"Machado de Guerra",             category:"fisico", file:"war_axe"},
  {name:"Alabarda Marinha",              category:"fisico", file:"sea_halberd",            aliases:["Foice da Natureza"]},
  {name:"Lança do Dragão",               category:"fisico", file:"great_dragon_spear",     aliases:["Flecha do Grande Dragão"]},
  {name:"Martelo da Fúria",              category:"fisico", file:"fury_hammer"},
  {name:"Meteoro de Ouro Rosa",          category:"fisico", file:"rose_gold_meteor"},
  {name:"Golpe do Caçador",              category:"fisico", file:"hunter_strike",          aliases:["Ataque do Caçador"]},
  {name:"Perfurador Celeste",            category:"fisico", file:"sky_piercer"},
  {name:"Arma Maléfica",                 category:"fisico", file:"malefic_gun"},

  // ===== FÍSICO (Tier 1/2) =====
  {name:"Meteoro Renegado",              category:"fisico", file:"rogue_meteor"},
  {name:"Marreta Vampírica",             category:"fisico", file:"vampire_mallet"},
  {name:"Machadinha do Ogro",            category:"fisico", file:"ogre_tomahawk"},
  {name:"Espada da Legião",              category:"fisico", file:"legion_sword"},
  {name:"Lança Comum",                   category:"fisico", file:"regular_spear"},
  {name:"Arco de Caça de Ferro",         category:"fisico", file:"iron_hunting_bow"},
  {name:"Dardo",                         category:"fisico", file:"javelin"},
  {name:"Faca",                          category:"fisico", file:"knife"},
  {name:"Adaga",                         category:"fisico", file:"dagger"},
  {name:"Besta Rápida",                  category:"fisico", file:"swift_crossbow"},

  // ===== MÁGICO (Tier 3) =====
  {name:"Talismã Encantado",          category:"magico", file:"enchanted_talisman"},
  {name:"Cristal Sagrado",            category:"magico", file:"holy_crystal"},
  {name:"Glaive Divina",              category:"magico", file:"divine_glaive"},
  {name:"Varinha do Gênio",           category:"magico", file:"genius_wand"},
  {name:"Varinha da Rainha do Gelo",  category:"magico", file:"ice_queen_wand"},
  {name:"Varinha Brilhante",          category:"magico", file:"glowing_wand"},
  {name:"Asas de Sangue",             category:"magico", file:"blood_wings"},
  {name:"Coroa do Inverno",           category:"magico", file:"winter_crown"},
  {name:"Relógio do Destino",         category:"magico", file:"clock_of_destiny"},
  {name:"Energia Concentrada",        category:"magico", file:"concentrated_energy"},
  {name:"Pena do Paraíso",            category:"magico", file:"feather_of_heaven"},
  {name:"Frasco do Oásis",            category:"magico", file:"flask_of_the_oasis"},
  {name:"Lanterna dos Desejos",       category:"magico", file:"wishing_lantern"},
  {name:"Gema Elegante",              category:"magico", file:"elegant_gem"},
  {name:"Lâmina Azure",               category:"magico", file:"azure_blade",            aliases:["Espada Azure"]},
  {name:"Cajado do Trovão",           category:"magico", file:"lightning_truncheon"},
  {name:"Foice Estelar",              category:"magico", file:"starlium_scythe"},
  {name:"Tempo Fugaz",                category:"magico", file:"fleeting_time"},
  {name:"Flor da Esperança",          category:"magico", file:"flower_of_hope"},
  {name:"Lanterna da Esperança",      category:"magico", file:"lantern_of_hope"},
  {name:"Lâmina Mágica",              category:"magico", file:"magic_blade"},

  // ===== MÁGICO (Tier 1/2) =====
  {name:"Livro dos Sábios",           category:"magico", file:"book_of_sages"},
  {name:"Códice Misterioso",          category:"magico", file:"mystery_codex"},
  {name:"Tomo do Mal",                category:"magico", file:"tome_of_evil"},
  {name:"Varinha Mágica",             category:"magico", file:"magic_wand"},
  {name:"Colar Mágico",               category:"magico", file:"magic_necklace"},
  {name:"Cristal de Poder",           category:"magico", file:"power_crystal"},
  {name:"Cristal de Vitalidade",      category:"magico", file:"vitality_crystal"},
  {name:"Poção Mágica",               category:"magico", file:"magic_potion"},
  {name:"Poção de Poder",             category:"magico", file:"power_potion"},
  {name:"Poção de Pedra",             category:"magico", file:"rock_potion"},

  // ===== DEFESA =====
  {name:"Cinto do Trovão",          category:"defesa", file:"thunder_belt"},
  {name:"Armadura de Lâminas",      category:"defesa", file:"blade_armor"},
  {name:"Imortalidade",             category:"defesa", file:"immortality"},
  {name:"Peitoral Antigo",          category:"defesa", file:"antique_cuirass",        aliases:["Armadura Antiga"]},
  {name:"Armadura Radiante",        category:"defesa", file:"radiant_armor"},
  {name:"Escudo de Atena",          category:"defesa", file:"athenas_shield"},
  {name:"Dominância do Gelo",       category:"defesa", file:"dominance_ice"},
  {name:"Oráculo",                  category:"defesa", file:"oracle"},
  {name:"Capacete Guardião",        category:"defesa", file:"guardian_helmet"},
  {name:"Peitoral da Força Bruta",  category:"defesa", file:"brute_force_breastplate"},
  {name:"Capacete Amaldiçoado",     category:"defesa", file:"cursed_helmet"},
  {name:"Asas da Rainha",           category:"defesa", file:"queens_wings"},
  {name:"Cinto de Ares",            category:"defesa", file:"ares_belt"},
  {name:"Escudo de Gelo Negro",     category:"defesa", file:"black_ice_shield"},
  {name:"Armadura Couraçada",       category:"defesa", file:"dreadnaught_armor"},
  {name:"Véu Exótico",              category:"defesa", file:"exotic_veil"},
  {name:"Túnica do Silêncio",       category:"defesa", file:"silence_robe"},
  {name:"Perneiras de Aço",         category:"defesa", file:"steel_legplates"},
  {name:"Peitoral de Couro",        category:"defesa", file:"leather_jerkin"},
  {name:"Essência Derretida",       category:"defesa", file:"molten_essence"},
  {name:"Contêiner Místico",        category:"defesa", file:"mystic_container"},
  {name:"Ombreira de Punição",      category:"defesa", file:"chastise_pauldron"},
  {name:"Luvas de Especialista",    category:"defesa", file:"expert_gloves"},
  {name:"Colar de Cura",            category:"defesa", file:"healing_necklace"},
  {name:"Manto de Resistência Mágica", category:"defesa", file:"magic_resist_cloak"},

  // ===== SELVA =====
  {name:"Retribuição de Gelo",      category:"selva", file:"ice_retribution"},
  {name:"Retribuição de Fogo",      category:"selva", file:"flame_retribution"},
  {name:"Retribuição Sangrenta",    category:"selva", file:"bloody_retribution"},

  // ===== ROAMING =====
  {name:"Bênção do Encorajamento",  category:"roaming", file:"encourage"},
  {name:"Bênção da Ocultação",      category:"roaming", file:"conceal"},
  {name:"Bênção do Golpe Certeiro", category:"roaming", file:"dire_hit"},
  {name:"Bênção do Favor",          category:"roaming", file:"favor"}
];

let HERO_CATALOG = [];

async function loadHeroCatalog() {
  try {
    const response = await fetch(HERO_JSON_URL);
    const data = await response.json();
    HERO_CATALOG = data
      .map(hero => ({
        name: hero.name_hero || hero["name-hero"] || "",
        file: hero["images-hero"] || hero.images_hero || ""
      }))
      .filter(hero => hero.name && hero.file);
    console.log("Catálogo de heróis carregado:", HERO_CATALOG.length);
  } catch (error) {
    console.error("Falha ao carregar o catálogo de heróis:", error);
    HERO_CATALOG = [];
  }
}

loadHeroCatalog().then(() => {
  if (typeof renderCommunityBuilds === "function" && BUILD_LIST_STATE === "ready") {
    try { renderCommunityBuilds(); } catch (e) { /* ignora */ }
  }
});

let HOME_COMMUNITY_REQUESTED = false;
let CFG = {names:true, bubbles:true};
const players = {};

function gameSettingsKey(){ return "society.settings." + SELF; }
function loadGameSettings(){
  let localSettings = null, legacySettings = null, storageAvailable = true;
  try {
    localSettings = localStorage.getItem(gameSettingsKey());
    legacySettings = localStorage.getItem("cfg");
    const parsed = JSON.parse(localSettings || legacySettings || "{}");
    CFG = Object.assign({names:true, bubbles:true},
      parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {});
  } catch (error) {
    console.warn("Não foi possível carregar as preferências locais de jogo.", error);
    storageAvailable = false;
    CFG = {names:true, bubbles:true};
  }
  $("cfgNames").checked = CFG.names;
  $("cfgBubbles").checked = CFG.bubbles;
  if (storageAvailable && !localSettings && legacySettings) {
    try {
      localStorage.setItem(gameSettingsKey(), JSON.stringify(CFG));
      localStorage.removeItem("cfg");
    } catch (error) {
      console.error("Não foi possível migrar as preferências de jogo para a conta atual.", error);
      showLfgToast("As preferências antigas não puderam ser migradas neste dispositivo.");
    }
  }
}

function saveGameSettings(){
  try {
    localStorage.setItem(gameSettingsKey(), JSON.stringify(CFG));
  } catch (error) {
    console.error("Não foi possível salvar as preferências locais de jogo.", error);
    showLfgToast("As preferências não puderam ser salvas neste dispositivo.");
  }
}

function connect(authentication){
  if (ws && ws.readyState === WebSocket.OPEN) { try { ws.close(); } catch (e) {} }
  ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
  ws.onopen = () => {
    if (authentication) { send(authentication); return; }
    const savedToken = (() => { try { return localStorage.getItem("society.session"); } catch (e) { return null; } })();
    if (savedToken) { send({t:"session_login", token:savedToken}); }
    else { send({t:"login", nick:$("nick").value, password:$("password").value}); }
  };
  ws.onmessage = e => { try { handle(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  ws.onclose = () => {
    if (SELF) addLog("Conexão perdida. Recarregue a página.");
    if (BUILD_LIST_STATE === "loading") showBuildLoadError();
  };
}
async function logout(){
  const w = ws;
  SELF = null;
  try { localStorage.removeItem("society.session"); } catch (e) {}
  if (w) w.close();
  if (window.societyFirebaseSignOut) await window.societyFirebaseSignOut();
  location.reload();
}

function handle(m){
  const t = m.t;
  if (t === "error") {
    $("err").textContent = m.m;
    window.dispatchEvent(new CustomEvent("society-auth-error", {detail:m.m}));
  }
  else if (t === "google_profile_required") {
    window.dispatchEvent(new CustomEvent("society-google-profile-required", {
      detail:{suggestedName:m.suggested_name || ""}
    }));
  }
  else if (t === "init"){
    if (m.token) { try { localStorage.setItem("society.session", m.token); } catch (e) {} }
    SHOP = m.shop; ME = m.me; SELF = m.self; QZ = m.quiz; PROFILE = m.profile || {};
    $("nick").value = SELF;
    $("password").value = "";
    $("registerPassword").value = "";
    $("registerPasswordConfirm").value = "";
    IS_ADMIN = Boolean(m.is_admin);
    IS_MODERATOR = Boolean(m.is_moderator);
    $("passwordCurrentField").hidden = m.auth_provider === "google";
    $("passwordCurrent").required = m.auth_provider !== "google";
    $("passwordSecurityDescription").textContent = m.auth_provider === "google"
      ? "Você entrou com Google; escolha uma senha para também acessar usando nick e senha."
      : "Use uma senha forte, exclusiva e com pelo menos 10 caracteres.";
    loadGameSettings();
    loadLfgDetails();
    loadBuildFiltersFromUrl();
    $("login").style.display = "none"; $("game").style.display = "block";
    setRoom("lobby", m.players); tab("home"); requestAnimationFrame(loop);
    try {
      if (QZ) renderQuiz();
      fillProfile();
      setUnread(m.unread || 0);
      renderItems();
      updateCoins();
      setupTournaments();
      setupModeration();
      setupCommunity();
    } catch (err) { console.error(err); }
  }
  else if (t === "session_invalid"){
    try { localStorage.removeItem("society.session"); } catch (e) {}
  }
  else if (t === "room") setRoom(m.id, m.players);
  else if (t === "rooms") renderRooms(m.list);
  else if (t === "pview"){
    fillCard(m);
    if (LFG_PROFILE_TARGET === m.nick) fillLfgProfile(m);
    if (DM_PROFILE_TARGET === m.nick) fillDmProfile(m);
  }
  else if (t === "join") addPlayer(m.p);
  else if (t === "leave") delete players[m.nick];
  else if (t === "move" && players[m.nick]){
    players[m.nick].tx = m.x; players[m.nick].ty = m.y;
    updatePlayerFacing(players[m.nick], m.x - players[m.nick].x, m.y - players[m.nick].y);
  }
  else if (t === "look" && players[m.nick]) players[m.nick].equip = m.equip;
  else if (t === "chat"){
    addLog(m.m, m.name);
    if (players[m.nick]){ players[m.nick].bubble = m.m; players[m.nick].until = Date.now() + 5000; }
  }
  else if (t === "lfg"){ LFG = m.list; LFG_LOADED = true; renderLfg(); }
  else if (t === "lfg_error") showLfgToast(m.m);
  else if (t === "tournaments"){ TOURNAMENTS = m.list || []; renderTournaments(); }
  else if (t === "community_meta"){ COMMUNITY_META = m.list || []; renderCommunityMeta(); renderHomeCommunityPreviews(); }
  else if (t === "community_builds"){
    if (m.request_id != null && m.request_id !== BUILD_REQUEST_ID) return;
    COMMUNITY_BUILDS = m.list || [];
    COMMUNITY_BUILDS_TRENDING = m.trending || COMMUNITY_BUILDS;
    COMMUNITY_BUILDS_RECENT = m.recent || COMMUNITY_BUILDS;
    BUILD_LIST_STATE = "ready";
    clearTimeout(BUILD_LOAD_TIMER);
    $("buildLoadError").hidden = true;
    renderCommunityBuilds();
    renderHomeCommunityPreviews();
    if ($("buildDetailDialog").open) {
      const updated = [...COMMUNITY_BUILDS_TRENDING, ...COMMUNITY_BUILDS_RECENT]
        .find(entry => entry.id === BUILD_DETAIL_ID);
      if (updated) openBuildDetail(updated);
    }
  }
  else if (t === "community_saved"){
    showCommunityMessage(m.scope, m.m, false);
    showLfgToast(m.m);
    if (m.scope === "meta") $("metaForm").reset();
    if (m.scope === "builds") $("buildForm").reset();
  }
  else if (t === "community_error") showCommunityMessage(m.scope, m.m, true);
  else if (t === "tournament_error") showTournamentMessage(m.m, true);
  else if (t === "tournament_saved") showTournamentMessage(m.m, false);
  else if (t === "report_submitted") closeCommunityReport(m.m, false);
  else if (t === "report_error") showCommunityReportError(m.m);
  else if (t === "moderation_data") renderModeration(m);
  else if (t === "admin_roles") renderAdminRoles(m.list || []);
  else if (t === "admin_roles_error") showModerationMessage(m.m, true);
  else if (t === "admin_roles_saved") showModerationMessage(m.m, false);
  else if (t === "moderation_error") showModerationMessage(m.m, true);
  else if (t === "moderation_saved") showModerationMessage(m.m, false);
  else if (t === "moderation_notice"){
    showLfgToast(m.m);
    if (m.until) {
      $("msg").disabled = $("send").disabled = true;
      $("dmInput").disabled = $("dmSend").disabled = true;
      window.setTimeout(() => {
        $("msg").disabled = $("send").disabled = false;
        $("dmInput").disabled = $("dmSend").disabled = false;
      }, Math.max(0, m.until * 1000 - Date.now()));
    } else {
      $("msg").disabled = $("send").disabled = false;
      $("dmInput").disabled = $("dmSend").disabled = false;
    }
  }
  else if (t === "role_updated"){
    IS_ADMIN = m.role === "admin";
    IS_MODERATOR = m.role === "admin" || m.role === "mod";
    document.querySelector("#nav button[data-t='admin']").hidden = !IS_MODERATOR;
    $("adminRoleManagement").hidden = !IS_ADMIN;
    if (!IS_MODERATOR && $("tab-admin").classList.contains("on")) tab("home");
  }
  else if (t === "block_result") showLfgToast(m.m);
  else if (t === "dm_threads") renderThreads(m.list, m.unread);
  else if (t === "dm_history") openChat(m);
  else if (t === "dm") onDm(m);
  else if (t === "profile"){ PROFILE = m.p; fillProfile(true); }
  else if (t === "profile_error") ProfileUI.showError("profileFormMessage", m.m);
  else if (t === "settings"){ PROFILE = m.profile; ProfileUI.settingsSaved(PROFILE, SELF); }
  else if (t === "settings_error") ProfileUI.showError("notificationSettingsMessage", m.m);
  else if (t === "password_error"){
    $("passwordChangeMessage").textContent = m.m;
    $("passwordChangeMessage").classList.add("is-error");
  }
  else if (t === "password_changed"){
    $("passwordChangeForm").reset();
    $("passwordChangeMessage").textContent = m.m;
    $("passwordChangeMessage").classList.remove("is-error");
    showLfgToast(m.m);
  }
  else if (t === "player_profile" && players[m.nick]){
    players[m.nick].name = m.p.display_name || players[m.nick].name;
  }
  else if (t === "quiz_result"){ QZ.done = true; renderQuiz(); $("qMsg").textContent = m.ok ? "Acertou! +10 moedas." : "Errou. A resposta era: " + QZ.o[m.correct]; }
  else if (t === "me"){ ME = {coins:m.coins, owned:m.owned, equip:m.equip}; renderItems(); updateCoins(); }
}

function addPlayer(p){ players[p.nick] = {x:p.x, y:p.y, tx:p.x, ty:p.y, name:p.name, equip:p.equip, bubble:"", until:0, facing:"front-right"}; }
function updatePlayerFacing(player, dx, dy){
  const screenX = (dx - dy) * .5, screenY = (dx + dy) * .25;
  if (Math.hypot(screenX, screenY) < .01) return;
  const side = screenX < 0 ? "left" : "right";
  if (screenY < -Math.abs(screenX) * .45) player.facing = "back-" + side;
  else if (screenY > Math.abs(screenX) * .45) player.facing = "front-" + side;
  else player.facing = "side-" + side;
}
function setRoom(id, list){
  ROOM = id; Object.keys(players).forEach(k => delete players[k]); list.forEach(addPlayer);
  $("log").textContent = ""; closePanel(); closeCard(); addLog("Você entrou em " + ROOMS[id].name); center();
}
function updateCoins(){ $("coinsAmount").textContent = Number(ME.coins || 0).toLocaleString("pt-BR"); }
function addLog(text, who){
  const d = el("div"); if (who) d.append(el("b", who + ": "), text); else d.textContent = text;
  $("log").append(d); setTimeout(() => d.remove(), 25000);
}

/* ---------- navegação ---------- */
function tab(n){
  document.querySelectorAll(".tab").forEach(s => s.classList.toggle("on", s.id === "tab-" + n));
  document.querySelectorAll("#nav button[data-t], #mobileNav button[data-t]").forEach(b => {
    const active = b.dataset.t === n;
    b.classList.toggle("on", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  setMobileMenu(false, true);
  $("pageTitle").textContent = TITLES[n]; $("pageTitle").style.display = TITLES[n] ? "block" : "none";
  if (n === "home" && !HOME_COMMUNITY_REQUESTED) {
    HOME_COMMUNITY_REQUESTED = true;
    send({t:"community_meta_list"});
    requestCommunityBuilds();
  }
  if (n === "lobby"){ fit(); center(); }
  if (n === "lfg"){
    LFG_LOADED = false;
    $("lfgLoading").hidden = false;
    $("lfgEmpty").hidden = true;
    send({t:"lfg_list"});
  }
  if (n === "tournaments") send({t:"tournament_list"});
  if (n === "meta") send({t:"community_meta_list"});
  if (n === "builds") requestCommunityBuilds(true);
  if (n === "admin") send({t:"moderation_list"});
  if (n === "dm"){ DM.with = null; $("dmChat").style.display = "none"; $("dmList").style.display = "block"; send({t:"dm_threads"}); }
}
let mobileMenuTrigger = null;
function setMobileMenu(open, restoreFocus, trigger){
  const wasOpen = document.body.classList.contains("menu");
  if (open && !wasOpen) mobileMenuTrigger = trigger || document.activeElement;
  document.body.classList.toggle("menu", open);
  $("menuBtn").setAttribute("aria-expanded", String(open));
  $("mobileMore").setAttribute("aria-expanded", String(open));
  if (open) {
    requestAnimationFrame(() => document.querySelector("#nav button:not([hidden])")?.focus({preventScroll:true}));
  } else if (wasOpen && restoreFocus && mobileMenuTrigger instanceof HTMLElement) {
    mobileMenuTrigger.focus({preventScroll:true});
    mobileMenuTrigger = null;
  }
}
document.querySelectorAll("#nav button[data-t]").forEach(b => b.onclick = () => tab(b.dataset.t));
document.querySelectorAll("#mobileNav button[data-t]").forEach(b => b.onclick = () => tab(b.dataset.t));
document.querySelectorAll("[data-shortcut]").forEach(b => b.onclick = () => tab(b.dataset.shortcut));
$("logoutBtn").onclick = $("logout2").onclick = logout;
$("menuBtn").onclick = event => setMobileMenu(!document.body.classList.contains("menu"), true, event.currentTarget);
$("menuClose").onclick = () => setMobileMenu(false, true);
$("scrim").onclick = () => setMobileMenu(false, true);
$("sideProfile").onclick = () => tab("profile");
$("mobileMore").onclick = event => setMobileMenu(!document.body.classList.contains("menu"), true, event.currentTarget);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && document.body.classList.contains("menu")) {
    event.preventDefault();
    setMobileMenu(false, true);
  }
});
$("topbarSearch").addEventListener("submit", event => {
  event.preventDefault();
  const query = $("topbarSearchInput").value.trim();
  $("buildHeroFilter").value = query;
  tab("builds");
  $("buildHeroFilter").focus({preventScroll:true});
});
$("enter").onclick = () => {
  $("err").textContent = "";
  connect({t:"password_login", nick:$("nick").value, password:$("password").value});
};
window.societyPasswordRegister = credentials => {
  $("err").textContent = "";
  connect({t:"password_register", ...credentials});
};
window.societyGoogleLogin = detail => {
  $("err").textContent = "";
  connect({t:"google_login", ...detail});
};
window.societyGoogleProfileSubmit = profileName =>
  send({t:"google_profile_name", profile_name:profileName});
window.societyGoogleProfileCancel = () => send({t:"google_profile_cancel"});
window.dispatchEvent(new Event("society-app-ready"));

const savedSession = (() => { try { return localStorage.getItem("society.session"); } catch (e) { return null; } })();
if (savedSession) connect();

function showCommunityMessage(scope, message, isError){
  const target = scope === "meta" ? $("metaMessage") : $("buildMessage");
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("is-error", Boolean(isError));
}

function communityDate(timestamp){
  return new Intl.DateTimeFormat("pt-BR", {dateStyle:"short", timeStyle:"short"})
    .format(new Date(timestamp * 1000));
}

function communityRelativeDate(timestamp){
  const date = new Date(Number(timestamp) * 1000);
  if (Number.isNaN(date.getTime())) return "Data não disponível";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [
    ["year", 31536000], ["month", 2592000], ["week", 604800],
    ["day", 86400], ["hour", 3600], ["minute", 60]
  ];
  for (const [unit, length] of units) {
    if (Math.abs(seconds) >= length) {
      return new Intl.RelativeTimeFormat("pt-BR", {numeric:"auto"})
        .format(Math.round(seconds / length), unit);
    }
  }
  return new Intl.RelativeTimeFormat("pt-BR", {numeric:"auto"}).format(seconds, "second");
}

function communityLaneName(lane){
  return ({EXP:"EXP", Jungle:"Selva · Jungle", Mid:"Meio · Mid",
    Gold:"Ouro · Gold", Roam:"Roam · Suporte"})[lane] || lane;
}

function communityRating(entry){ return Number(entry.helpful || 0); }

function homeCommunityRow(title, details, metric, destination){
  const button = el("button", null, "home-preview-row");
  button.type = "button";
  const copy = el("span", null, "home-preview-copy");
  copy.append(el("b", title), el("small", details));
  const summary = el("span", null, "home-preview-summary");
  summary.append(el("small", metric), el("span", "→", "home-preview-arrow"));
  button.append(copy, summary);
  button.setAttribute("aria-label", title + ". " + details + ". Abrir " +
    (destination === "builds" ? "builds" : "meta por rota"));
  button.addEventListener("click", () => tab(destination));
  return button;
}

function renderHomeCommunityPreviews(){
  const trending = $("homeBuildTrending"), recent = $("homeBuildRecent"), meta = $("homeMetaLanes");
  if (!trending || !recent || !meta) return;
  const buildRatingOrder = (a, b) => communityRating(b) - communityRating(a) ||
    Number(b.created_at) - Number(a.created_at);
  const topBuilds = COMMUNITY_BUILDS_TRENDING.slice(0, 3);
  const recentBuilds = COMMUNITY_BUILDS_RECENT.slice(0, 3);

  trending.replaceChildren();
  recent.replaceChildren();
  if (!topBuilds.length) trending.append(el("p", "Ainda não há builds para destacar.", "home-preview-empty"));
  topBuilds.forEach(entry => trending.append(homeCommunityRow(
    entry.hero,
    communityLaneName(entry.lane) + " · " + entry.patch + " · por " + entry.author,
    entry.helpful_30d + " úteis nos últimos 30 dias",
    "builds"
  )));
  if (!recentBuilds.length) recent.append(el("p", "Ainda não há builds publicadas.", "home-preview-empty"));
  recentBuilds.forEach(entry => recent.append(homeCommunityRow(
    entry.hero,
    communityLaneName(entry.lane) + " · " + entry.patch + " · por " + entry.author,
    communityDate(entry.created_at),
    "builds"
  )));

  const laneOrder = ["EXP", "Jungle", "Mid", "Gold", "Roam"];
  const laneHighlights = laneOrder.map(lane => COMMUNITY_META
    .filter(entry => entry.lane === lane)
    .sort(buildRatingOrder)[0]).filter(Boolean);
  meta.replaceChildren();
  if (!laneHighlights.length) meta.append(el("p", "Ainda não há contribuições de meta.", "home-preview-empty"));
  laneHighlights.forEach(entry => meta.append(homeCommunityRow(
    communityLaneName(entry.lane),
    entry.hero + " · Tier " + entry.tier + " · " + entry.patch,
    entry.helpful + " avaliações positivas",
    "meta"
  )));
}

function getBuildFilters(){
  return {
    hero:$("buildHeroFilter").value.trim(),
    lane:$("buildLaneFilter").value,
    period:$("buildPeriodFilter").value,
    sort:$("buildSortFilter").value
  };
}

function loadBuildFiltersFromUrl(){
  const params = new URLSearchParams(location.search);
  $("buildHeroFilter").value = params.get("hero") || "";
  $("buildLaneFilter").value = ["EXP","Jungle","Mid","Gold","Roam"].includes(params.get("lane"))
    ? params.get("lane") : "";
  $("buildPeriodFilter").value = ["7d","30d","all"].includes(params.get("period"))
    ? params.get("period") : "30d";
  $("buildSortFilter").value = ["popular","recent"].includes(params.get("sort"))
    ? params.get("sort") : "popular";
}

function updateBuildUrl(filters){
  const url = new URL(location.href);
  ["hero","lane","period","sort"].forEach(key => url.searchParams.delete(key));
  if (filters.hero) url.searchParams.set("hero", filters.hero);
  if (filters.lane) url.searchParams.set("lane", filters.lane);
  url.searchParams.set("period", filters.period);
  url.searchParams.set("sort", filters.sort);
  history.pushState(null, "", url);
}

function showBuildSkeletons(list){
  list.replaceChildren();
  for (let index = 0; index < 4; index++) {
    const row = el("div", null, "build-row build-row-skeleton");
    row.setAttribute("aria-hidden", "true");
    const hero = el("span", null, "build-skeleton build-skeleton-hero");
    const identity = el("span", null, "build-skeleton build-skeleton-identity");
    const items = el("span", null, "build-skeleton build-skeleton-items");
    const meta = el("span", null, "build-skeleton build-skeleton-meta");
    row.append(hero, identity, items, meta);
    list.append(row);
  }
  list.setAttribute("aria-busy", "true");
}

function showBuildLoadError(){
  clearTimeout(BUILD_LOAD_TIMER);
  BUILD_LIST_STATE = "error";
  $("buildLoadError").hidden = false;
  renderCommunityBuilds();
}

function requestCommunityBuilds(updateUrl){
  const filters = getBuildFilters();
  if (updateUrl) updateBuildUrl(filters);
  BUILD_LIST_STATE = "loading";
  $("buildLoadError").hidden = true;
  showBuildSkeletons($("buildPopularList"));
  showBuildSkeletons($("buildRecentList"));
  $("buildPopularEmpty").hidden = true;
  $("buildRecentEmpty").hidden = true;
  const requestId = ++BUILD_REQUEST_ID;
  if (!send({t:"community_build_list", ...filters, request_id:requestId})) {
    showBuildLoadError();
    return;
  }
  clearTimeout(BUILD_LOAD_TIMER);
  BUILD_LOAD_TIMER = setTimeout(() => {
    if (BUILD_REQUEST_ID === requestId && BUILD_LIST_STATE === "loading") showBuildLoadError();
  }, 10000);
}

function scheduleBuildFilterRequest(){
  clearTimeout(BUILD_FILTER_TIMER);
  BUILD_FILTER_TIMER = setTimeout(() => requestCommunityBuilds(true), 220);
}

function setupCommunity(){
  document.querySelectorAll("[data-meta-lane]").forEach(button => {
    button.addEventListener("click", () => {
      COMMUNITY_META_LANE = button.dataset.metaLane;
      document.querySelectorAll("[data-meta-lane]").forEach(option => {
        option.setAttribute("aria-pressed", String(option === button));
      });
      renderCommunityMeta();
    });
  });
  $("metaPatchFilter").addEventListener("change", renderCommunityMeta);
  $("buildFilters").addEventListener("submit", event => event.preventDefault());
  $("buildHeroFilter").addEventListener("input", scheduleBuildFilterRequest);
  $("buildLaneFilter").addEventListener("change", () => requestCommunityBuilds(true));
  $("buildPeriodFilter").addEventListener("change", () => requestCommunityBuilds(true));
  $("buildSortFilter").addEventListener("change", () => requestCommunityBuilds(true));
  $("buildRetry").addEventListener("click", () => requestCommunityBuilds(false));
  setupBuildItemPicker();
  $("buildFormToggle").addEventListener("click", () => {
    const panel = $("buildFormPanel");
    panel.hidden = !panel.hidden;
    $("buildFormToggle").setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) $("buildHero").focus({preventScroll:true});
  });
  $("buildDetailDialog").addEventListener("click", event => {
    if (event.target === $("buildDetailDialog")) $("buildDetailDialog").close();
  });
  $("buildDetailDialog").addEventListener("cancel", event => {
    event.preventDefault();
    $("buildDetailDialog").close();
  });
  $("buildDetailDialog").addEventListener("close", () => { BUILD_DETAIL_ID = null; });
  window.addEventListener("popstate", () => {
    loadBuildFiltersFromUrl();
    requestCommunityBuilds(false);
  });
  $("metaForm").addEventListener("submit", event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    send({
      t:"community_meta_submit",
      hero:$("metaHero").value,
      lane:$("metaLane").value,
      tier:$("metaTier").value,
      patch:$("metaPatch").value,
      notes:$("metaNotes").value
    });
  });
  $("buildForm").addEventListener("submit", event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    if (selectedBuildItems.length < 3) {
      $("buildItemsMessage").textContent = "Selecione pelo menos 3 itens para publicar a build.";
      $("buildItemsMessage").classList.add("is-error");
      $("buildItemGrid").focus();
      return;
    }
    send({
      t:"community_build_submit",
      hero:$("buildHero").value,
      lane:$("buildLane").value,
      patch:$("buildPatch").value,
      spell:$("buildSpell").value,
      emblem:$("buildEmblem").value,
      items:$("buildItems").value,
      notes:$("buildNotes").value
    });
  });
}

let selectedBuildItems = [];
let selectedItemCategory = "all";

function setupBuildItemPicker(){
  const grid = $("buildItemGrid");
  const search = $("buildItemSearch");

  let categoriesBar = $("buildItemCategories");
  if (!categoriesBar) {
    categoriesBar = el("div", null, "build-item-categories");
    categoriesBar.id = "buildItemCategories";
    categoriesBar.setAttribute("role", "tablist");
    categoriesBar.setAttribute("aria-label", "Categorias de itens");

    const allBtn = el("button", "Todos", "build-item-category is-active");
    allBtn.type = "button";
    allBtn.dataset.category = "all";
    allBtn.setAttribute("aria-pressed", "true");
    categoriesBar.append(allBtn);

    ITEM_CATEGORIES.forEach(cat => {
      const btn = el("button", cat.label, "build-item-category");
      btn.type = "button";
      btn.dataset.category = cat.id;
      btn.setAttribute("aria-pressed", "false");
      categoriesBar.append(btn);
    });

    grid.parentNode.insertBefore(categoriesBar, grid);

    categoriesBar.addEventListener("click", event => {
      const button = event.target.closest(".build-item-category");
      if (!button) return;
      selectedItemCategory = button.dataset.category;
      categoriesBar.querySelectorAll(".build-item-category").forEach(b => {
        const active = b === button;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", String(active));
      });
      renderBuildItemGrid();
    });
  }

  search.addEventListener("input", renderBuildItemGrid);

  $("buildForm").addEventListener("reset", () => {
    selectedBuildItems = [];
    selectedItemCategory = "all";
    search.value = "";
    $("buildItemsMessage").textContent = "";
    $("buildItemsMessage").classList.remove("is-error");
    if (categoriesBar) {
      categoriesBar.querySelectorAll(".build-item-category").forEach(b => {
        const active = b.dataset.category === "all";
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", String(active));
      });
    }
    renderBuildItemGrid();
    renderBuildItemSelection();
  });

  renderBuildItemGrid();
  renderBuildItemSelection();
}

function renderBuildItemGrid(){
  const grid = $("buildItemGrid");
  const search = $("buildItemSearch");
  if (!grid || !search) return;
  grid.replaceChildren();

  const query = search.value.trim().toLocaleLowerCase("pt-BR");
  const filtered = BUILD_ITEM_CATALOG.filter(item => {
    const matchesCategory = selectedItemCategory === "all" || item.category === selectedItemCategory;
    const matchesQuery = query === "" || item.name.toLocaleLowerCase("pt-BR").includes(query);
    return matchesCategory && matchesQuery;
  });

  if (!filtered.length) {
    grid.append(el("p", "Nenhum item encontrado nesta categoria.", "build-item-empty"));
    return;
  }

  filtered.forEach(item => {
    const button = el("button", null, "build-item-option");
    button.type = "button";
    button.dataset.itemName = item.name;
    button.setAttribute("aria-pressed", "false");
    button.append(getIcon("itens", item.name), el("span", item.name));
    button.addEventListener("click", () => toggleBuildItem(item.name));
    grid.append(button);
  });

  const selected = new Set(selectedBuildItems);
  grid.querySelectorAll(".build-item-option").forEach(btn => {
    const active = selected.has(btn.dataset.itemName);
    btn.setAttribute("aria-pressed", String(active));
    btn.classList.toggle("is-selected", active);
  });
}

function toggleBuildItem(name){
  const index = selectedBuildItems.indexOf(name);
  if (index >= 0) {
    selectedBuildItems.splice(index, 1);
  } else if (selectedBuildItems.length < 6) {
    selectedBuildItems.push(name);
  } else {
    $("buildItemsMessage").textContent = "A build já tem 6 itens. Remova um antes de escolher outro.";
    $("buildItemsMessage").classList.add("is-error");
    return;
  }
  $("buildItemsMessage").textContent = "";
  $("buildItemsMessage").classList.remove("is-error");
  renderBuildItemSelection();
}

function renderBuildItemSelection(){
  const selected = new Set(selectedBuildItems);
  const grid = $("buildItemGrid");
  if (grid) {
    grid.querySelectorAll(".build-item-option").forEach(button => {
      const active = selected.has(button.dataset.itemName);
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-selected", active);
    });
  }
  $("buildItemCount").textContent = selectedBuildItems.length + "/6";
  $("buildItems").value = selectedBuildItems.join(", ");
  const order = $("buildItemOrder");
  order.replaceChildren();
  if (!selectedBuildItems.length) {
    order.append(el("span", "Os itens escolhidos aparecerão aqui, na ordem de compra.", "build-item-order-empty"));
    return;
  }
  selectedBuildItems.forEach((name, index) => {
    const item = el("span", null, "build-item-order-entry");
    item.append(el("b", String(index + 1)), getIcon("itens", name), el("span", name));
    const remove = el("button", "Remover " + name, "build-item-remove");
    remove.type = "button";
    remove.setAttribute("aria-label", "Remover " + name + " da ordem de compra");
    remove.addEventListener("click", () => toggleBuildItem(name));
    item.append(remove);
    order.append(item);
  });
}

function refreshMetaPatchFilter(){
  const select = $("metaPatchFilter"), selected = select.value;
  const patches = [...new Set(COMMUNITY_META.map(entry => entry.patch))].sort().reverse();
  select.textContent = "";
  select.append(new Option("Todos", ""));
  patches.forEach(patch => select.append(new Option(patch, patch)));
  select.value = patches.includes(selected) ? selected : "";
}

function renderCommunityMeta(){
  const list = $("metaList");
  if (!list) return;
  refreshMetaPatchFilter();
  list.textContent = "";
  const patch = $("metaPatchFilter").value;
  const entries = COMMUNITY_META.filter(entry =>
    (COMMUNITY_META_LANE === "all" || entry.lane === COMMUNITY_META_LANE) &&
    (!patch || entry.patch === patch)
  );
  $("metaEmpty").hidden = entries.length > 0;
  entries.forEach(entry => {
    const card = el("article", null, "community-meta-card");
    const top = el("div", null, "community-meta-top");
    const identity = el("div");
    const title = el("div", null, "community-meta-title");
    const heroWrap = el("span", null, "community-meta-hero-icon");
    heroWrap.append(getIcon("herois", entry.hero));
    title.append(heroWrap, el("h4", entry.hero), el("span", communityLaneName(entry.lane), "community-game-tag"));
    title.append(el("span", entry.tier, "community-game-tag community-meta-tier community-tier-" + entry.tier));
    identity.append(title);
    identity.append(el("p", entry.patch + " · por " + entry.author + " · " + communityDate(entry.created_at),
      "community-meta-subline"));
    top.append(identity);
    card.append(top);
    if (entry.notes) card.append(el("p", entry.notes, "community-meta-notes"));
    card.append(createCommunityVoteActions("meta", entry));
    list.append(card);
  });
}

function createCommunityVoteActions(scope, entry){
  const actions = el("div", null, scope === "builds"
    ? "community-vote-actions community-build-row-actions"
    : "community-vote-actions");
  const kind = scope === "meta" ? "community_meta_vote" : "community_build_vote";
  const choices = scope === "meta"
    ? [[1, "👍 Relevante", entry.helpful], [-1, "👎 Não concordo", entry.not_helpful]]
    : [[1, "▲ " + entry.helpful, entry.helpful], [-1, "▼ " + entry.not_helpful, entry.not_helpful]];
  choices.forEach(([value, label]) => {
    const button = el("button", label);
    button.type = "button";
    button.disabled = entry.own;
    button.setAttribute("aria-pressed", String(entry.my_vote === value));
    if (scope === "builds") {
      button.setAttribute("aria-label", value === 1
        ? "Marcar build como útil" : "Marcar build como não funcionou");
      button.title = entry.own ? "Você não pode avaliar sua própria publicação."
        : value === 1 ? "Útil na partida" : "Não funcionou";
    } else if (entry.own) {
      button.title = "Você não pode avaliar sua própria publicação.";
    }
    button.addEventListener("click", () => send({t:kind, id:entry.id, value}));
    actions.append(button);
  });
  return actions;
}

function iconSlug(name){
  return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getIcon(tipo, nome){
  const folders = {herois:"herois", itens:"itens", emblemas:"emblemas", feiticos:"feiticos"};
  const folder = folders[tipo];
  if (!folder) throw new Error("Tipo de ícone inválido: " + tipo);
  const name = String(nome || "").trim();
  const wrapper = el("span", null, "build-icon build-icon-" + tipo);
  wrapper.setAttribute("role", "img");
  wrapper.setAttribute("aria-label", name || "Ícone não informado");
  wrapper.title = name || "Ícone não informado";

  const size = tipo === "herois" ? 40 : tipo === "itens" ? 30 : 22;
  const image = el("img");
  const nameLower = name.toLocaleLowerCase("pt-BR");
  const nameSlug = iconSlug(name);
  let imageUrl = null;

  if (tipo === "herois") {
    const knownHero = HERO_CATALOG.find(hero => hero.name.toLocaleLowerCase("pt-BR") === nameLower);
    if (knownHero && knownHero.file) imageUrl = HERO_IMAGE_DIR + knownHero.file;
  } else if (tipo === "itens") {
    const knownItem = BUILD_ITEM_CATALOG.find(item => {
      if (item.name.toLocaleLowerCase("pt-BR") === nameLower) return true;
      if (Array.isArray(item.aliases) &&
          item.aliases.some(a => a.toLocaleLowerCase("pt-BR") === nameLower)) return true;
      if (iconSlug(item.name) === nameSlug) return true;
      if (Array.isArray(item.aliases) && item.aliases.some(a => iconSlug(a) === nameSlug)) return true;
      return false;
    });
    if (knownItem && knownItem.file) imageUrl = ITEM_IMAGE_DIR + knownItem.file + ".png";
  }

  if (!imageUrl) {
    wrapper.classList.add("is-placeholder");
    wrapper.append(el("span", name ? name.slice(0, 2).toLocaleUpperCase("pt-BR") : "—",
      "build-icon-placeholder"));
    return wrapper;
  }

  image.src = imageUrl;
  image.alt = "";
  image.width = size;
  image.height = size;
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => {
    wrapper.classList.add("is-placeholder");
    wrapper.replaceChildren(el("span", name.slice(0, 2).toLocaleUpperCase("pt-BR"),
      "build-icon-placeholder"));
  }, {once:true});
  wrapper.append(image);
  return wrapper;
}

function createBuildVoteSummary(entry, period){
  const helpful = period === "7d" ? Number(entry.helpful_7d || 0)
    : period === "30d" ? Number(entry.helpful_30d || 0) : Number(entry.helpful || 0);
  const score = el("span", helpful ? "▲ " + helpful : "0", "build-row-score");
  score.classList.toggle("has-votes", helpful > 0);
  score.setAttribute("aria-label", helpful + " avaliações positivas");
  return score;
}

function createBuildRow(entry, period){
  const row = el("article", null, "build-row");
  const open = el("button", null, "build-row-open");
  open.type = "button";
  open.setAttribute("aria-label", "Ver detalhes da build de " + entry.hero + ", rota " +
    communityLaneName(entry.lane) + ", publicada " + communityRelativeDate(entry.created_at));

  const hero = el("span", null, "build-row-hero");
  hero.append(getIcon("herois", entry.hero));
  const identity = el("span", null, "build-row-identity");
  identity.append(el("b", entry.hero), el("small", communityLaneName(entry.lane)));
  hero.append(identity);

  const itemIcons = el("span", null, "build-row-items");
  itemIcons.setAttribute("aria-label", "Itens na ordem de compra");
  const items = Array.isArray(entry.items) ? entry.items.slice(0, 6) : [];
  for (let index = 0; index < 6; index++) {
    const itemName = items[index] || "";
    const icon = getIcon("itens", itemName);
    icon.title = itemName ? (index + 1) + ". " + itemName : "Item " + (index + 1) + " não informado";
    icon.setAttribute("aria-label", itemName
      ? "Item " + (index + 1) + ": " + itemName : "Item " + (index + 1) + " não informado");
    itemIcons.append(icon);
  }

  const auxiliaryIcons = el("span", null, "build-row-auxiliary");
  auxiliaryIcons.append(getIcon("emblemas", entry.emblem), getIcon("feiticos", entry.spell));
  const author = el("span", null, "build-row-author");
  author.append(el("b", entry.author), el("small", communityRelativeDate(entry.created_at)));
  open.append(hero, itemIcons, auxiliaryIcons, author);
  open.addEventListener("click", () => openBuildDetail(entry));
  const voteArea = el("span", null, "build-row-voting");
  voteArea.append(createBuildVoteSummary(entry, period), createCommunityVoteActions("builds", entry));
  row.append(open, voteArea);
  return row;
}

function openBuildDetail(entry){
  BUILD_DETAIL_ID = entry.id;
  const content = $("buildDetailContent");
  content.replaceChildren();
  const header = el("header", null, "build-detail-heading");
  const identity = el("div", null, "build-detail-identity");
  identity.append(getIcon("herois", entry.hero));
  const title = el("div");
  title.append(el("p", "DETALHES DA BUILD", "community-game-eyebrow"));
  const detailTitle = el("h2", entry.hero, "build-detail-title");
  detailTitle.id = "buildDetailTitle";
  title.append(detailTitle, el("p", communityLaneName(entry.lane) + " · " + entry.patch,
    "build-detail-subline"));
  identity.append(title);
  const close = el("button", "Fechar", "build-detail-close");
  close.type = "button";
  close.addEventListener("click", () => $("buildDetailDialog").close());
  header.append(identity, close);

  const metadata = el("p", "Por " + entry.author + " · " + communityDate(entry.created_at) +
    " (" + communityRelativeDate(entry.created_at) + ")", "build-detail-author");
  const itemsSection = el("section", null, "build-detail-section");
  itemsSection.append(el("h3", "Itens em ordem"));
  const itemList = el("div", null, "build-detail-items");
  (Array.isArray(entry.items) ? entry.items : []).forEach((item, index) => {
    const cell = el("div", null, "build-detail-item");
    cell.append(getIcon("itens", item), el("span", (index + 1) + ". " + item));
    itemList.append(cell);
  });
  itemsSection.append(itemList);
  const equipment = el("div", null, "build-detail-equipment");
  [["emblemas", "Emblema e talentos", entry.emblem], ["feiticos", "Feitiço de batalha", entry.spell]]
    .forEach(([type, label, value]) => {
      const field = el("div", null, "build-detail-equipment-item");
      field.append(getIcon(type, value), el("span", null));
      field.lastElementChild.append(el("small", label), el("b", value));
      equipment.append(field);
    });
  const notes = el("section", null, "build-detail-notes");
  notes.append(el("h3", "Quando usar / observações"), el("p", entry.notes || "Sem observações."));
  const votes = el("section", null, "build-detail-votes");
  votes.append(createBuildVoteSummary(entry, $("buildPeriodFilter").value),
    el("span", entry.helpful + " úteis · " + entry.not_helpful + " não funcionaram", "build-detail-vote-counts"),
    createCommunityVoteActions("builds", entry));
  content.append(header, metadata, itemsSection, equipment, notes, votes);
  if (!$("buildDetailDialog").open) $("buildDetailDialog").showModal();
}

function renderBuildRows(list, entries, period, empty){
  list.replaceChildren();
  list.setAttribute("aria-busy", "false");
  empty.hidden = entries.length > 0;
  entries.forEach(entry => list.append(createBuildRow(entry, period)));
}

function renderCommunityBuilds(){
  if (BUILD_LIST_STATE === "loading") return;
  const popularList = $("buildPopularList"), recentList = $("buildRecentList");
  const popularSection = $("buildPopularSection"), recentSection = $("buildRecentSection");
  const filters = getBuildFilters();
  const periodLabel = filters.period === "all" ? "sempre"
    : filters.period === "7d" ? "últimos 7 dias" : "últimos 30 dias";
  $("buildPopularTitle").textContent = "Mais curtidas, " + periodLabel;
  const lists = $("buildLists");
  if (filters.sort === "popular") lists.append(popularSection, recentSection);
  else lists.append(recentSection, popularSection);
  if (BUILD_LIST_STATE === "error") {
    popularList.replaceChildren();
    recentList.replaceChildren();
    popularList.setAttribute("aria-busy", "false");
    recentList.setAttribute("aria-busy", "false");
    $("buildPopularEmpty").hidden = true;
    $("buildRecentEmpty").hidden = true;
    return;
  }
  renderBuildRows(popularList, COMMUNITY_BUILDS_TRENDING, filters.period, $("buildPopularEmpty"));
  renderBuildRows(recentList, COMMUNITY_BUILDS_RECENT, filters.period, $("buildRecentEmpty"));
}

function formatTournamentDate(value){
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data a confirmar";
  return new Intl.DateTimeFormat("pt-BR", {dateStyle:"medium", timeStyle:"short"}).format(date);
}

function tournamentDateInput(value){
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function tournamentState(tournament){
  if (tournament.status === "completed") return "finished";
  if (tournament.status === "cancelled") return "cancelled";
  const now = Date.now(), start = new Date(tournament.start_at).getTime(), end = new Date(tournament.end_at).getTime();
  if (end <= now) return "finished";
  if (tournament.status === "live" || (start <= now && end > now)) return "live";
  return "upcoming";
}

function showTournamentMessage(message, isError){
  const status = $("tournamentAdminMessage");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", Boolean(isError));
  if (!isError && message) showLfgToast(message);
}

function setTournamentEditor(tournament){
  $("tournamentAdminForm").reset();
  TOURNAMENT_EDIT_ID = tournament ? tournament.id : null;
  $("tournamentEditId").value = tournament ? tournament.id : "";
  $("tournamentTitle").value = tournament ? tournament.title : "";
  $("tournamentGame").value = tournament ? tournament.game : "Mobile Legends: Bang Bang";
  $("tournamentFormat").value = tournament ? tournament.format : "";
  $("tournamentPrize").value = tournament ? tournament.prize : "";
  $("tournamentStart").value = tournament ? tournamentDateInput(tournament.start_at) : "";
  $("tournamentEnd").value = tournament ? tournamentDateInput(tournament.end_at) : "";
  $("tournamentMaxTeams").value = tournament ? tournament.max_teams : 16;
  $("tournamentStatus").value = tournament ? tournament.status : "scheduled";
  $("tournamentWinner").required = $("tournamentStatus").value === "completed";
  $("tournamentDescription").value = tournament ? tournament.description : "";
  $("tournamentWinner").value = tournament ? tournament.winner : "";
  $("tournamentSubmit").textContent = tournament ? "Salvar alterações" : "＋ Cadastrar torneio";
  $("tournamentCancelEdit").hidden = !tournament;
  showTournamentMessage(tournament ? "Editando: " + tournament.title : "", false);
  $("tournamentAdminForm").scrollIntoView({behavior:"smooth", block:"center"});
}

function renderTournaments(){
  const list = $("tournamentList");
  if (!list) return;
  const filterButton = document.querySelector("[data-tournament-filter][aria-pressed='true']");
  const filter = filterButton ? filterButton.dataset.tournamentFilter : "all";
  const visible = TOURNAMENTS.filter(tournament => {
    const state = tournamentState(tournament);
    if (filter === "all") return true;
    if (filter === "live") return state === "live";
    if (filter === "upcoming") return state === "upcoming";
    return state === "finished" || state === "cancelled";
  });
  $("tournamentCount").textContent = visible.length + (visible.length === 1 ? " campeonato" : " campeonatos");
  list.textContent = "";
  $("tournamentEmpty").hidden = visible.length > 0;
  visible.forEach(tournament => {
    const state = tournamentState(tournament);
    const card = el("article", null, "tournament-card");
    const header = el("div", null, "tournament-card-header");
    const heading = el("div", null, "tournament-card-title");
    const badgeLabels = {live:"● AO VIVO", upcoming:"PRÓXIMO", finished:"ENCERRADO", cancelled:"CANCELADO"};
    heading.append(el("span", badgeLabels[state], "tournament-status tournament-status-" + state));
    heading.append(el("h4", tournament.title));
    header.append(heading);
    if (IS_ADMIN) {
      const actions = el("div", null, "tournament-admin-actions");
      const edit = el("button", "Editar", "tournament-button-secondary");
      edit.type = "button";
      edit.addEventListener("click", () => setTournamentEditor(tournament));
      const remove = el("button", "Excluir", "tournament-button-danger");
      remove.type = "button";
      remove.addEventListener("click", () => {
        if (window.confirm("Excluir o torneio “" + tournament.title + "” e todas as inscrições?")) {
          send({t:"tournament_delete", id:tournament.id});
        }
      });
      actions.append(edit, remove);
      header.append(actions);
    }
    card.append(header);

    const meta = el("div", null, "tournament-meta");
    meta.append(el("span", "🎮 " + tournament.game));
    meta.append(el("span", "⚔️ " + tournament.format));
    meta.append(el("span", "📅 " + formatTournamentDate(tournament.start_at)));
    if (tournament.prize) meta.append(el("span", "🏅 " + tournament.prize));
    card.append(meta);
    if (tournament.description) card.append(el("p", tournament.description, "tournament-description"));

    const teamHeading = el("div", null, "tournament-teams-heading");
    teamHeading.append(el("b", "Equipes inscritas"));
    teamHeading.append(el("span", tournament.team_count + "/" + tournament.max_teams));
    card.append(teamHeading);
    if (tournament.teams.length) {
      const teams = el("ul", null, "tournament-team-list");
      tournament.teams.forEach(entry => {
        const item = el("li");
        item.append(el("b", entry.team));
        if (entry.players.length) item.append(el("span", entry.players.join(" · ")));
        teams.append(item);
      });
      card.append(teams);
    } else {
      card.append(el("p", "Ainda não há equipes inscritas. Seja a primeira!", "tournament-no-teams"));
    }
    if (tournament.winner) {
      card.append(el("p", "🏆 Campeã: " + tournament.winner, "tournament-winner"));
    }
    if (state === "upcoming" && (tournament.team_count < tournament.max_teams || tournament.registered)) {
      const registration = document.createElement("form");
      registration.className = "tournament-register";
      const teamLabel = document.createElement("label");
      teamLabel.textContent = tournament.registered ? "Atualize sua equipe" : "Inscreva sua equipe";
      const teamInput = document.createElement("input");
      teamInput.name = "team";
      teamInput.maxLength = 50;
      teamInput.required = true;
      teamInput.placeholder = "Nome da equipe";
      const ownEntry = tournament.my_entry;
      teamInput.value = ownEntry ? ownEntry.team : "";
      teamLabel.append(teamInput);
      const playersLabel = document.createElement("label");
      playersLabel.textContent = "Jogadores (um nome por linha, até 5)";
      const playersInput = document.createElement("textarea");
      playersInput.name = "players";
      playersInput.rows = 2;
      playersInput.maxLength = 180;
      playersInput.placeholder = "Opcional";
      playersInput.value = ownEntry ? ownEntry.players.join("\n") : "";
      playersLabel.append(playersInput);
      const register = el("button", tournament.registered ? "Atualizar inscrição" : "Inscrever equipe", "tournament-button-primary");
      register.type = "submit";
      registration.append(teamLabel, playersLabel, register);
      registration.addEventListener("submit", event => {
        event.preventDefault();
        if (!teamInput.value.trim()) return teamInput.focus();
        send({t:"tournament_register", id:tournament.id, team:teamInput.value.trim(), players:playersInput.value});
      });
      card.append(registration);
    } else if (state === "upcoming") {
      card.append(el("p", "As vagas desta competição foram preenchidas.", "tournament-full"));
    }
    list.append(card);
  });

  const preview = $("lobbyTournamentPreview");
  if (preview) {
    preview.textContent = "";
    const featured = TOURNAMENTS.find(tournament => tournamentState(tournament) === "live") ||
      TOURNAMENTS.find(tournament => tournamentState(tournament) === "upcoming") ||
      TOURNAMENTS.find(tournament => tournamentState(tournament) === "finished" && tournament.winner);
    if (!featured) {
      preview.append(el("span", "🗓️"));
      const copy = el("div", null, "home-preview-copy");
      copy.append(el("b", "Seu próximo campeonato começa aqui"));
      copy.append(el("small", "Acompanhe os torneios da comunidade e chame sua equipe."));
      preview.append(copy);
    } else {
      const state = tournamentState(featured);
      preview.append(el("span", state === "live" ? "🔴" : state === "finished" ? "🎉" : "🏆"));
      const copy = el("div", null, "home-preview-copy");
      copy.append(el("b", featured.title));
      const detail = state === "live" ? "Em andamento agora" :
        state === "finished" ? "Campeã: " + featured.winner : formatTournamentDate(featured.start_at);
      copy.append(el("small", detail + " · " + featured.team_count + "/" + featured.max_teams + " equipes"));
      preview.append(copy);
    }
  }
}

function setupTournaments(){
  $("tournamentAdmin").hidden = !IS_ADMIN;
  document.querySelectorAll("[data-tournament-filter]").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-tournament-filter]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
      renderTournaments();
    });
  });
  $("tournamentAdminForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const start = new Date($("tournamentStart").value), end = new Date($("tournamentEnd").value);
    if (end <= start) return showTournamentMessage("O término precisa ser depois do início.", true);
    send({
      t:"tournament_save",
      id:TOURNAMENT_EDIT_ID,
      title:$("tournamentTitle").value.trim(),
      game:$("tournamentGame").value.trim(),
      format:$("tournamentFormat").value.trim(),
      prize:$("tournamentPrize").value.trim(),
      start_at:start.toISOString(),
      end_at:end.toISOString(),
      max_teams:Number($("tournamentMaxTeams").value),
      status:$("tournamentStatus").value,
      description:$("tournamentDescription").value.trim(),
      winner:$("tournamentWinner").value.trim()
    });
    setTournamentEditor(null);
  });
  $("tournamentCancelEdit").addEventListener("click", () => setTournamentEditor(null));
  $("tournamentStatus").addEventListener("change", () => {
    $("tournamentWinner").required = $("tournamentStatus").value === "completed";
  });
  setInterval(() => {
    if (TOURNAMENTS.length) renderTournaments();
  }, 60000);
}

function openCommunityReport(target, displayName){
  if (!target || target === SELF) return;
  $("communityReportForm").reset();
  $("communityReportDialog").dataset.target = target;
  $("communityReportTarget").textContent = displayName || target;
  $("communityReportMessage").textContent = "";
  $("communityReportMessage").classList.remove("is-error");
  $("communityReportDialog").showModal();
}

function showCommunityReportError(message){
  $("communityReportMessage").textContent = message;
  $("communityReportMessage").classList.add("is-error");
}

function closeCommunityReport(message, isError){
  if (isError) return showCommunityReportError(message);
  $("communityReportDialog").close();
  showLfgToast(message);
}

function appendReportButton(container, target, displayName){
  if (!target || target === SELF) return;
  const button = el("button", "⚑ Denunciar jogador", "community-report-trigger");
  button.type = "button";
  button.addEventListener("click", () => openCommunityReport(target, displayName));
  container.append(button);
}

function showModerationMessage(message, isError){
  const status = $("moderationMessage");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", Boolean(isError));
}

function renderModeration(data){
  const reports = $("moderationReports"), mutes = $("moderationMutes");
  if (!reports || !mutes) return;
  reports.textContent = "";
  const openReports = data.reports.filter(report => report.status === "open" || report.status === "reviewed");
  $("moderationReportsEmpty").hidden = openReports.length > 0;
  openReports.forEach(report => {
    const card = el("article", null, "moderation-report-card");
    const heading = el("div", null, "moderation-report-heading");
    const identity = el("div", null, "moderation-report-identity");
    identity.append(el("span", "#" + report.id, "moderation-report-id"));
    identity.append(el("b", "@" + report.target));
    identity.append(el("small", "Denunciado por @" + report.reporter + " · " +
      new Intl.DateTimeFormat("pt-BR", {dateStyle:"short", timeStyle:"short"}).format(new Date(report.created_at * 1000))));
    heading.append(identity);
    heading.append(el("span", report.status === "open" ? "PENDENTE" : "EM ANÁLISE",
      "moderation-status moderation-status-" + report.status));
    card.append(heading);
    card.append(el("b", ({harassment:"Assédio ou intimidação",hate:"Discurso de ódio",spam:"Spam ou golpe",
      cheating:"Trapaça ou antidesportivo",inappropriate:"Conteúdo impróprio",other:"Outro problema"})[report.category] || "Outro problema",
      "moderation-category"));
    card.append(el("p", report.details, "moderation-details"));
    const actions = el("div", null, "moderation-actions");
    if (report.status === "open") {
      actions.append(moderationActionButton("Marcar em análise", "review", report.id, "moderation-secondary"));
    }
    actions.append(moderationActionButton("Silenciar 10 min", "mute_10m", report.id, "moderation-secondary"));
    actions.append(moderationActionButton("Silenciar 1 hora", "mute_1h", report.id, "moderation-secondary"));
    actions.append(moderationActionButton("Silenciar 24 h", "mute_24h", report.id, "moderation-warn"));
    actions.append(moderationActionButton("Encerrar denúncia", "close", report.id, "moderation-secondary"));
    actions.append(moderationActionButton("Descartar", "dismiss", report.id, "moderation-secondary"));
    card.append(actions);
    reports.append(card);
  });
  mutes.textContent = "";
  $("moderationMutesEmpty").hidden = data.mutes.length > 0;
  data.mutes.forEach(mute => {
    const item = el("div", null, "moderation-mute-item");
    const info = el("div");
    info.append(el("b", "@" + mute.nick));
    info.append(el("small", "Até " + new Intl.DateTimeFormat("pt-BR", {dateStyle:"short", timeStyle:"short"})
      .format(new Date(mute.muted_until * 1000)) + (mute.reason ? " · " + mute.reason : "")));
    const unmute = el("button", "Remover silenciamento", "moderation-secondary");
    unmute.type = "button";
    unmute.addEventListener("click", () => send({t:"moderation_unmute", target:mute.nick}));
    item.append(info, unmute);
    mutes.append(item);
  });
}

function moderationActionButton(label, action, id, className){
  const button = el("button", label, className);
  button.type = "button";
  button.addEventListener("click", () => send({t:"moderation_action", id, action}));
  return button;
}

function renderAdminRoles(accounts){
  const list = $("adminRoleList");
  if (!list) return;
  list.textContent = "";
  accounts.forEach(account => {
    const row = el("article", null, "moderation-role-item");
    const identity = el("div");
    identity.append(el("b", "@" + account.nick));
    identity.append(el("small", (account.google_linked ? "Google vinculado" : "Conta antiga sem vínculo") +
      " · " + (account.source === "google" ? "Google" : "legada")));
    const role = document.createElement("select");
    role.setAttribute("aria-label", "Papel de @" + account.nick);
    [["user","Jogador"],["mod","Moderador"],["admin","Administrador"]].forEach(([value,label]) => {
      role.append(new Option(label, value));
    });
    role.value = account.role;
    const save = el("button", "Salvar papel", "moderation-secondary");
    save.type = "button";
    save.disabled = account.nick === SELF || role.value === account.role;
    role.addEventListener("change", () => {
      save.disabled = account.nick === SELF || role.value === account.role;
    });
    save.addEventListener("click", () => send({t:"admin_role_set", nick:account.nick, role:role.value}));
    row.append(identity, role, save);
    list.append(row);
  });
  if (!accounts.length) list.append(el("p", "Nenhuma conta encontrada no Firebase.", "moderation-empty"));
}

function setupModeration(){
  document.querySelector("#nav button[data-t='admin']").hidden = !IS_MODERATOR;
  $("adminRoleManagement").hidden = !IS_ADMIN;
  if (IS_MODERATOR) send({t:"moderation_list"});
  if (IS_ADMIN) send({t:"admin_roles_list"});
  $("moderationRefresh").addEventListener("click", () => send({t:"moderation_list"}));
  $("adminRolesRefresh").addEventListener("click", () => send({t:"admin_roles_list"}));
  $("communityReportClose").addEventListener("click", () => $("communityReportDialog").close());
  $("communityReportCancel").addEventListener("click", () => $("communityReportDialog").close());
  $("communityReportForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    send({
      t:"report_submit",
      target:$("communityReportDialog").dataset.target,
      category:$("communityReportCategory").value,
      details:$("communityReportDetails").value.trim()
    });
  });
}

ProfileUI.mount({
  getUsername: () => SELF,
  send,
  toast: showLfgToast,
  openProfile: () => tab("profile")
});

/* ---------- chat do lobby ---------- */
function sendChat(){ const v = $("msg").value.trim(); if (v){ send({t:"chat", m:v}); $("msg").value = ""; } }
$("send").onclick = sendChat;
$("msg").onkeydown = e => { if (e.key === "Enter") sendChat(); };

/* ---------- salas ---------- */
function renderRooms(list){
  const box = $("roomList"); box.textContent = "";
  list.forEach(r => {
    const c = el("div", null, "card thread"); c.append(el("div", r.name + " · " + r.count + " online"));
    const b = el("button", r.id === ROOM ? "Você está aqui" : "Entrar"); b.disabled = r.id === ROOM;
    b.onclick = () => { send({t:"room", id:r.id}); };
    c.append(b); box.append(c);
  });
}

/* ---------- loja e inventário ---------- */
function renderItems(){
  const shop = $("shopItems"), inv = $("invItems"); shop.textContent = ""; inv.textContent = "";
  Object.entries(SHOP).forEach(([id, it]) => {
    const owned = ME.owned.includes(id), on = ME.equip[it.slot] === id, row = el("div", null, "item");
    const icon = it.slot === "hat" ? el("span", it.value, "ico") : el("span", "", "sw");
    if (it.slot === "color") icon.style.background = it.value;
    row.append(icon, el("span", it.name + (it.slot === "hat" ? " (acessório)" : " (cor)"), "nm"));
    let b;
    if (!owned){ b = el("button", it.price + " moedas"); b.disabled = ME.coins < it.price; b.onclick = () => send({t:"buy", id}); }
    else { b = el("button", on ? (it.slot === "hat" ? "Tirar" : "Em uso") : "Usar"); b.disabled = on && it.slot !== "hat";
           b.onclick = () => send(on ? {t:"equip", id, off:true} : {t:"equip", id}); }
    row.append(b); (owned ? inv : shop).append(row);
  });
  if (!shop.childElementCount) shop.textContent = "Você já tem todos os itens!";
}

/* ---------- procurar duo ---------- */
function lfgStorageKey(){ return "society_lfg_details_" + SELF; }
function loadLfgDetails(){
  try {
    const stored = localStorage.getItem(lfgStorageKey());
    LFG_DETAILS = stored ? JSON.parse(stored) : {};
    if (!LFG_DETAILS || typeof LFG_DETAILS !== "object" || Array.isArray(LFG_DETAILS)) LFG_DETAILS = {};
  } catch (error) {
    console.error("Não foi possível carregar os detalhes locais dos anúncios.", error);
    LFG_DETAILS = {};
    showLfgToast("Não foi possível carregar os detalhes salvos dos seus anúncios.");
  }
}
function saveLfgDetails(){
  try {
    localStorage.setItem(lfgStorageKey(), JSON.stringify(LFG_DETAILS));
    return true;
  } catch (error) {
    console.error("Não foi possível salvar os detalhes locais do anúncio.", error);
    showLfgToast("O anúncio foi enviado, mas os detalhes opcionais não puderam ser salvos neste dispositivo.");
    return false;
  }
}
function showLfgToast(message){
  const toast = $("lfgToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(LFG_TOAST_TIMER);
  LFG_TOAST_TIMER = setTimeout(() => toast.classList.remove("visible"), 3200);
}
function lfgDetails(player){
  const local = LFG_DETAILS[player.nick] || {};
  return {
    ...local,
    desiredRank:player.role || local.desiredRank,
    winRate:player.win_rate !== undefined && player.win_rate !== null ? player.win_rate : local.winRate,
    matches:player.matches || local.matches,
    message:player.message || local.message
  };
}
function formatLfgWinRate(value){
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("pt-BR", {maximumFractionDigits:1}) : value;
}
function availabilityLabel(player, details){
  if (!player.online) return "Offline";
  if (details.availability) return details.availability;
  const advertised = (player.hour || "").toLocaleLowerCase("pt-BR");
  if (advertised === "agora") return "Agora";
  if (advertised === "hoje") return "Hoje";
  if (advertised === "mais tarde") return "Mais tarde";
  return player.hour ? "Horário específico" : "Agora";
}
function availabilityClass(player, details){
  if (!player.online) return "lfg-status-offline";
  return availabilityLabel(player, details) === "Agora" ? "lfg-status-now" : "lfg-status-soon";
}
function openLfgForm(editing){
  const dialog = $("lfgFormDialog");
  $("lfgForm").reset();
  $("lfgFormError").textContent = "";
  $("lfgFormTitle").textContent = editing ? "Editar anúncio" : "Criar anúncio";
  if (editing && SELF) {
    const own = LFG.find(player => player.nick === SELF);
    const details = lfgDetails(own);
    if (own) {
      $("lfgRank").value = own.rank || "";
      $("lfgMode").value = own.mode || "Ranked";
      $("lfgHour").value = details.hour || own.hour || "";
      $("lfgGid").value = own.gid || "";
      $("lfgDesiredRank").value = details.desiredRank || "Qualquer";
      $("lfgAvailability").value = details.availability || "Agora";
      $("lfgMessage").value = details.message || "";
      $("lfgWinRate").value = details.winRate || "";
      $("lfgMatches").value = details.matches || "";
    }
  } else {
    $("lfgRank").value = PROFILE.rank || "";
    $("lfgGid").value = PROFILE.gid || "";
  }
  updateLfgForm();
  dialog.showModal();
}
function closeLfgForm(){ $("lfgFormDialog").close(); }
function updateLfgForm(){
  const availability = $("lfgAvailability").value;
  $("lfgHourField").hidden = availability !== "Horário específico";
  $("lfgHour").required = availability === "Horário específico";
  $("lfgCharCount").textContent = $("lfgMessage").value.length + "/160";
  const rank = $("lfgRank").value.trim() || "Seu rank";
  const desired = $("lfgDesiredRank").value;
  const mode = $("lfgMode").value;
  const available = availability === "Horário específico" ? $("lfgHour").value.trim() || "Defina o horário" : availability;
  const message = $("lfgMessage").value.trim() || "Ainda não adicionou uma mensagem.";
  const stats = [$("lfgWinRate").value && formatLfgWinRate($("lfgWinRate").value) + "% WR",
    $("lfgMatches").value && Number($("lfgMatches").value).toLocaleString("pt-BR") + " partidas"].filter(Boolean).join(" · ");
  $("lfgPreview").replaceChildren(el("p", rank + " · " + mode, "lfg-preview-card"),
    el("p", "Busca: " + desired + " · Disponibilidade: " + available, "lfg-preview-card"),
    ...(stats ? [el("p", stats, "lfg-preview-card")] : []),
    el("p", message, "lfg-preview-card"));
}
function submitLfg(event){
  event.preventDefault();
  const rank = $("lfgRank").value.trim();
  const availability = $("lfgAvailability").value;
  const hour = $("lfgHour").value.trim();
  if (!rank) { $("lfgFormError").textContent = "Informe seu rank para publicar o anúncio."; $("lfgRank").focus(); return; }
  if (availability === "Horário específico" && !hour) { $("lfgFormError").textContent = "Informe o horário em que estará disponível."; $("lfgHour").focus(); return; }
  const winRate = $("lfgWinRate").value.trim();
  const matches = $("lfgMatches").value.trim();
  if (winRate && (!Number.isFinite(Number(winRate.replace(",", "."))) || Number(winRate.replace(",", ".")) < 0 || Number(winRate.replace(",", ".")) > 100)) {
    $("lfgFormError").textContent = "O Win Rate deve estar entre 0% e 100%."; $("lfgWinRate").focus(); return;
  }
  if (matches && (!Number.isInteger(Number(matches)) || Number(matches) <= 0)) {
    $("lfgFormError").textContent = "Informe um número válido de partidas."; $("lfgMatches").focus(); return;
  }
  if (!ws || ws.readyState !== WebSocket.OPEN || !SELF) {
    $("lfgFormError").textContent = "Sua conexão foi interrompida. Entre novamente para publicar o anúncio.";
    return;
  }

  const mode = $("lfgMode").value;
  LFG_DETAILS[SELF] = {
    desiredRank: $("lfgDesiredRank").value,
    availability,
    hour: availability === "Horário específico" ? hour : ""
  };
  saveLfgDetails();
  send({t:"lfg_post", rank, role:$("lfgDesiredRank").value, mode,
    hour:availability === "Horário específico" ? hour : availability,
    gid:$("lfgGid").value.trim(),
    win_rate:winRate ? Number(winRate.replace(",", ".")) : "",
    matches:matches ? Number(matches) : "",
    message:$("lfgMessage").value.trim()});
  closeLfgForm();
  showLfgToast("Anúncio publicado! Ele ficará ativo por até 3 horas.");
}
function clearLfgFilters(){
  $("lfgSearch").value = "";
  $("fRank").value = "";
  $("fMode").value = "";
  $("fAvailability").value = "";
  renderLfg();
}
function removeOwnLfg(){
  if (!confirm("Remover seu anúncio ativo?")) return;
  if (LFG_DETAILS[SELF]) {
    delete LFG_DETAILS[SELF];
    saveLfgDetails();
  }
  send({t:"lfg_del"});
  showLfgToast("Seu anúncio foi removido.");
}
function openLfgProfile(player){
  LFG_PROFILE_TARGET = player.nick;
  $("lfgProfileName").textContent = player.display;
  if (player.nick !== SELF) {
    $("lfgProfileContent").textContent = "Carregando perfil…";
    $("lfgProfileDialog").showModal();
    send({t:"profile_view", nick:player.nick});
    return;
  }
  const details = lfgDetails(player);
  $("lfgProfileContent").replaceChildren(
    ProfileUI.createAvatar({
      display_name:player.display, username:player.nick, avatar:player.avatar
    }, "profile-dialog-avatar"),
    el("h3", player.display),
    el("div", "Rank: " + (player.rank || "Não informado")),
    el("div", "Modo: " + (player.mode || "Não informado")),
    el("div", "Status: " + availabilityLabel(player, details)),
    el("div", "Herói principal: " + (player.hero || "Não informado")),
    el("div", "Sobre: " + (player.bio || "Este jogador ainda não preencheu o perfil.")),
    el("small", "Estatísticas de Win Rate e partidas não estão disponíveis no perfil atual.")
  );
  $("lfgProfileDialog").showModal();
}
function fillLfgProfile(message){
  const profile = message.p || {};
  const content = $("lfgProfileContent");
  if (profile.is_private) {
    content.replaceChildren(
      el("div", "@" + profile.username),
      el("p", "Este jogador mantém o perfil privado.")
    );
    appendReportButton(content, message.nick, profile.display_name || profile.username);
    return;
  }
  content.replaceChildren(
    ProfileUI.createAvatar(profile, "profile-dialog-avatar"),
    el("h3", profile.display_name || profile.username || "Jogador"),
    el("div", "Rank: " + (profile.rank || "Não informado")),
    el("div", "Função principal: " + (profile.role || "Não informada")),
    el("div", "Herói principal: " + (profile.hero || "Não informado")),
    el("div", "Sobre: " + (profile.bio || "Este jogador ainda não preencheu o perfil.")),
    el("small", "Estatísticas de Win Rate e partidas não estão disponíveis no perfil atual.")
  );
  appendReportButton(content, message.nick, profile.display_name || profile.username);
}
function setOwnLfgSection(player){
  const section = $("lfgOwnSection");
  if (!player) { section.hidden = true; section.replaceChildren(); return; }
  section.hidden = false;
  const details = lfgDetails(player);
  const remaining = Math.max(0, 10800 - (Date.now() / 1000 - player.ts));
  const hours = Math.floor(remaining / 3600), minutes = Math.floor(remaining % 3600 / 60);
  const timeLeft = hours ? hours + "h " + minutes + "min" : minutes + "min";
  section.replaceChildren(
    el("div", null, "lfg-own-top"),
    el("div", (player.rank || "Rank não informado") + " · " + (player.mode || "Modo não informado"), "lfg-own-details"),
    el("div", details.message || ("Procurando duo · " + availabilityLabel(player, details)), "lfg-player-message"),
    el("div", "◉ " + (details.views || 0) + " visualizações　 ·　 ⏱ Expira em " + timeLeft, "lfg-own-meta")
  );
  const title = section.querySelector(".lfg-own-top");
  title.append(el("span"), el("b", "SEU ANÚNCIO ESTÁ ATIVO"));
  const actions = el("div", null, "lfg-own-actions");
  const edit = el("button", "Editar", "lfg-secondary");
  edit.type = "button";
  edit.onclick = () => openLfgForm(true);
  const remove = el("button", "Remover", "lfg-danger");
  remove.type = "button";
  remove.onclick = removeOwnLfg;
  actions.append(edit, remove);
  section.append(actions);
}
function rankTier(value){
  const rank = (value || "").toLowerCase();
  if (rank.includes("glorioso")) return "Mítico Glorioso";
  if (rank.includes("honrado")) return "Mítico Honrado";
  if (rank.includes("mítico") || rank.includes("mythic")) return "Mítico";
  if (rank.includes("lenda") || rank.includes("legend")) return "Lenda";
  if (rank.includes("épico") || rank.includes("epic")) return "Épico";
  return "";
}
function renderRecommendations(){
  const box = $("lfgRecommended");
  box.textContent = "";
  const own = LFG.find(player => player.nick === SELF);
  const myRank = rankTier((own && own.rank) || PROFILE.rank);
  const recommendations = LFG.filter(player => player.nick !== SELF && player.online)
    .sort((a, b) => Number(rankTier(b.rank) === myRank) - Number(rankTier(a.rank) === myRank))
    .slice(0, 3);
  $("lfgRecommendedHint").textContent = myRank ? "Selecionados por atividade e rank semelhante" : "Jogadores online com anúncio ativo";
  if (!recommendations.length) {
    box.append(el("p", "Ainda não há outros jogadores online com anúncio ativo. Volte em breve!", "lfg-recommended-empty"));
    return;
  }
  recommendations.forEach(player => {
    const card = el("article", null, "lfg-recommended-card");
    const top = el("div", null, "lfg-recommended-top");
    const details = lfgDetails(player);
    top.append(ProfileUI.createAvatar({
      display_name: player.display, username: player.nick, avatar: player.avatar
    }, "lfg-avatar"), el("h4", player.display));
    const similar = myRank && rankTier(player.rank) === myRank;
    card.append(top, el("p", (player.rank || "Rank não informado") + " · " + (player.mode || "Modo não informado")),
      el("p", (details.winRate !== undefined && details.winRate !== "" ? formatLfgWinRate(details.winRate) + "% WR" : "WR não informado") +
        (details.matches ? " · " + Number(details.matches).toLocaleString("pt-BR") + " partidas" : ""), ""),
      el("span", similar ? "Rank semelhante ao seu" : "Online agora", "lfg-recommend-reason"));
    const view = el("button", "Ver perfil", "lfg-secondary");
    view.type = "button";
    view.onclick = () => openLfgProfile(player);
    card.append(view);
    box.append(card);
  });
}
const ago = ts => { const m = Math.floor((Date.now() / 1000 - ts) / 60); return m < 1 ? "agora" : m < 60 ? m + " min" : Math.floor(m / 60) + " h"; };
function renderLfg(){
  const box = $("lfgList");
  box.textContent = "";
  $("lfgLoading").hidden = LFG_LOADED;
  if (!LFG_LOADED) return;
  const search = $("lfgSearch").value.trim().toLocaleLowerCase("pt-BR");
  const rankFilter = $("fRank").value;
  const modeFilter = $("fMode").value;
  const availabilityFilter = $("fAvailability").value;
  const own = LFG.find(player => player.nick === SELF);
  $("lfgActivityCount").textContent = LFG.length + (LFG.length === 1 ? " jogador" : " jogadores");
  $("lfgResultCount").textContent = LFG.length + (LFG.length === 1 ? " jogador encontrado" : " jogadores encontrados");
  setOwnLfgSection(own);
  renderRecommendations();
  const list = LFG.filter(player => {
    const details = lfgDetails(player);
    const desiredAvailability = availabilityLabel(player, details);
    const searchable = [player.display, player.rank, player.mode, player.role, player.hour,
      details.message, details.desiredRank, details.availability, details.winRate, details.matches].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    return (!search || searchable.includes(search)) &&
      (!rankFilter || rankTier(player.rank) === rankFilter) &&
      (!modeFilter || player.mode === modeFilter) &&
      (!availabilityFilter || (availabilityFilter === "offline" ? !player.online : desiredAvailability === availabilityFilter));
  });
  $("lfgResultCount").textContent = list.length + (list.length === 1 ? " jogador encontrado" : " jogadores encontrados");
  $("lfgEmpty").hidden = list.length > 0;
  list.forEach(p => {
    const details = lfgDetails(p);
    const card = el("article", null, "lfg-player-card");
    const main = el("div", null, "lfg-player-main");
    const top = el("div", null, "lfg-player-top");
    const name = el("div", null, "lfg-player-name");
    const status = availabilityLabel(p, details);
    name.append(el("h4", p.display), el("span", status === "Agora" ? "Online · Disponível agora" :
      p.online ? "Online · " + status : "Offline", "lfg-status " + availabilityClass(p, details)));
    top.append(ProfileUI.createAvatar({
      display_name: p.display, username: p.nick, avatar: p.avatar
    }, "lfg-avatar"), name);
    main.append(top, el("p", p.rank || "Rank não informado", "lfg-player-rank"));
    const stats = el("div", null, "lfg-player-stats");
    if (details.winRate !== undefined && details.winRate !== "") stats.append(el("span", formatLfgWinRate(details.winRate) + "% WR"));
    if (details.matches) stats.append(el("span", Number(details.matches).toLocaleString("pt-BR") + " partidas"));
    if (!stats.childElementCount) stats.append(el("span", p.hero ? "Main: " + p.hero : "Estatísticas não informadas"));
    const tags = el("div", null, "lfg-player-tags");
    tags.append(el("span", "🎮 " + (p.mode || "Modo não informado")));
    tags.append(el("span", "🏅 Busca: " + (details.desiredRank || p.role || "Qualquer")));
    if (p.hour && p.hour !== "Agora" && p.hour !== "Hoje" && p.hour !== "Mais tarde") tags.append(el("span", "⏰ " + p.hour));
    main.append(stats, tags);
    if (details.message || p.bio) main.append(el("p", details.message || p.bio, "lfg-player-message"));
    main.append(el("small", "Anúncio publicado " + ago(p.ts), "lfg-muted"));
    const actions = el("div", null, "lfg-player-actions");
    const invite = el("button", "Convidar para jogar", "lfg-invite");
    invite.type = "button";
    invite.disabled = p.nick === SELF || !p.online;
    invite.onclick = () => {
      showLfgToast("Conversa aberta com " + p.display + " para combinar a partida.");
      openDm(p.nick, p.display);
    };
    const profile = el("button", "Ver perfil", "lfg-secondary");
    profile.type = "button";
    profile.onclick = () => openLfgProfile(p);
    actions.append(invite, profile);
    card.append(main, actions);
    box.append(card);
  });
}
$("lfgOpenForm").onclick = () => openLfgForm(Boolean(LFG.find(player => player.nick === SELF)));
$("lfgForm").addEventListener("submit", submitLfg);
$("lfgCloseForm").onclick = closeLfgForm;
$("lfgCancelForm").onclick = closeLfgForm;
$("lfgAvailability").onchange = updateLfgForm;
$("lfgForm").addEventListener("input", updateLfgForm);
$("lfgForm").addEventListener("change", updateLfgForm);
$("lfgCloseProfile").onclick = () => $("lfgProfileDialog").close();
$("lfgSearch").oninput = renderLfg;
["fRank", "fMode", "fAvailability"].forEach(id => { $(id).onchange = renderLfg; });
$("lfgClearFilters").onclick = $("lfgEmptyClear").onclick = clearLfgFilters;
$("lfgEmptyCreate").onclick = () => openLfgForm(false);
setInterval(() => {
  if (SELF && $("lfgOwnSection") && !$("lfgOwnSection").hidden) {
    setOwnLfgSection(LFG.find(player => player.nick === SELF));
  }
}, 60000);

/* ---------- mensagens diretas ---------- */
function setUnread(n){ UNREAD = n; $("dmBadge").textContent = n > 0 ? n : ""; }
function openDm(nick, name){
  tab("dm");
  DM.with = nick; DM.name = name; $("dmList").style.display = "none"; $("dmChat").style.display = "block";
  $("dmWith").textContent = name; $("dmMsgs").textContent = "";
  const match = LFG.find(player => player.nick === nick);
  $("dmWithAvatar").replaceChildren(ProfileUI.createAvatar({
    display_name:name, username:nick, avatar:match ? match.avatar : ""
  }, "dm-with-avatar").childNodes[0] || document.createTextNode((name || nick).slice(0,1).toUpperCase()));
  send({t:"dm_open", with:nick});
}
function openDmProfile(){
  if (!DM.with) return;
  DM_PROFILE_TARGET = DM.with;
  $("dmProfileName").textContent = DM.name || DM.with;
  $("dmProfileContent").textContent = "Carregando perfil...";
  $("dmProfileDialog").showModal();
  send({t:"profile_view", nick:DM.with});
}
function fillDmProfile(message){
  const profile = message.p || {};
  const content = $("dmProfileContent");
  if (profile.is_private) {
    content.replaceChildren(
      el("div", "@" + profile.username),
      el("p", "Este jogador mantém o perfil privado.")
    );
    appendReportButton(content, message.nick, profile.display_name || profile.username);
    return;
  }
  content.replaceChildren(
    ProfileUI.createAvatar(profile, "profile-dialog-avatar"),
    el("h3", profile.display_name || profile.username || "Jogador"),
    el("div", "Rank: " + (profile.rank || "Não informado")),
    el("div", "Função principal: " + (profile.role || "Não informada")),
    el("div", "Herói principal: " + (profile.hero || "Não informado")),
    el("div", "Sobre: " + (profile.bio || "Este jogador ainda não preencheu o perfil."))
  );
  appendReportButton(content, message.nick, profile.display_name || profile.username);
}
function renderThreads(list, unread){
  setUnread(unread); const box = $("dmList"); box.textContent = "";
  if (!list.length){ box.textContent = "Nenhuma conversa ainda. Toque em Chamar em um anúncio da aba Procurar duo."; return; }
  list.forEach(t => {
    const d = el("button", null, "card thread dm-thread"), a = el("div", null, "dm-thread-copy");
    d.type = "button";
    d.append(ProfileUI.createAvatar({display_name:t.name, username:t.nick, avatar:t.avatar}, "dm-thread-avatar"));
    a.append(el("b", t.name), el("div", t.last.slice(0, 40))); d.append(a);
    if (t.unread) d.append(el("em", t.unread, "pill"));
    d.onclick = () => openDm(t.nick, t.name); box.append(d);
  });
}
function addBubble(from, text){ $("dmMsgs").append(el("div", text, "bub" + (from === SELF ? " me" : ""))); $("dmMsgs").scrollTop = 1e9; }
function openChat(m){
  if (DM.with !== m.nick) return;
  DM.name = m.name || DM.name;
  $("dmWith").textContent = DM.name;
  const avatar = ProfileUI.createAvatar(m.profile || {display_name:DM.name, username:m.nick}, "dm-with-avatar");
  $("dmWithAvatar").replaceChildren(...avatar.childNodes);
  $("dmMsgs").textContent = ""; m.msgs.forEach(x => addBubble(x.from, x.m));
  if (!m.msgs.length) $("dmMsgs").append(el("small", "Nenhuma mensagem ainda. Diga oi!"));
}
function onDm(m){
  const other = m.from === SELF ? m.to : m.from;
  if (DM.with === other && $("dmChat").style.display !== "none"){
    addBubble(m.from, m.m); if (m.from !== SELF) send({t:"dm_seen", nick:other});
  } else if (m.from !== SELF) setUnread(UNREAD + 1);
}
function sendDm(){ const v = $("dmInput").value.trim(); if (v && DM.with){ send({t:"dm_send", to:DM.with, m:v}); $("dmInput").value = ""; } }
$("dmSend").onclick = sendDm; $("dmInput").onkeydown = e => { if (e.key === "Enter") sendDm(); };
$("dmViewProfile").onclick = openDmProfile;
$("dmReportPlayer").onclick = () => openCommunityReport(DM.with, DM.name);
$("dmProfileClose").onclick = () => $("dmProfileDialog").close();
$("dmBack").onclick = () => tab("dm");
$("dmBlock").onclick = () => { if (DM.with && confirm("Bloquear este jogador? Ele não conseguirá mais te enviar mensagens.")){ send({t:"block", nick:DM.with}); tab("dm"); } };

/* ---------- perfil, quiz, ferramentas, configurações ---------- */
function profileUpdated(){
  ProfileUI.setProfile(PROFILE, SELF);
  if (LFG_LOADED) send({t:"lfg_list"});
}
function fillProfile(saved){
  if (saved) profileUpdated();
  else ProfileUI.renderProfile(PROFILE, SELF);
}
function renderQuiz(){
  $("qText").textContent = QZ.q; const o = $("qOpts"); o.textContent = "";
  QZ.o.forEach((x, i) => { const b = el("button", x, "opt"); b.disabled = QZ.done; b.onclick = () => send({t:"quiz_answer", i}); o.append(b); });
  $("qMsg").textContent = QZ.done ? "Você já respondeu hoje. Volte amanhã!" : "Acertou = +10 moedas. Uma tentativa por dia.";
}
const num = id => parseFloat(($(id).value || "").replace(",", "."));
$("cfgNames").onchange = $("cfgBubbles").onchange = () => {
 CFG = {names:$("cfgNames").checked, bubbles:$("cfgBubbles").checked};
 saveGameSettings();
};

/* ---------- painéis dentro do jogo (salas, loja, inventário) ---------- */
const PTITLES = {rooms:"Salas", shop:"Loja", inv:"Inventário"}, PIDS = {rooms:"roomList", shop:"shopItems", inv:"invItems"};
function openPanel(n){
  if ($("panel").classList.contains("open") && $("pTitle").dataset.n === n) return closePanel();
  closeCard(); document.querySelectorAll(".pp").forEach(d => d.style.display = d.id === PIDS[n] ? "block" : "none");
  $("pTitle").textContent = PTITLES[n]; $("pTitle").dataset.n = n; $("panel").classList.add("open");
  if (n === "rooms") send({t:"room_list"});
}
function closePanel(){ $("panel").classList.remove("open"); }
function closeCard(){ $("pcard").classList.remove("open"); }
document.querySelectorAll("#hud button").forEach(b => b.onclick = () => openPanel(b.dataset.p));
$("pClose").onclick = closePanel;
function showCard(nick){
  const p = players[nick]; if (!p) return; closePanel();
  const c = $("pcard"); c.textContent = ""; c.append(el("b", p.name), el("div", "Carregando perfil…", "cinfo"));
  const row = el("div", null, "crow");
  if (nick !== SELF){
    const b = el("button", "Enviar mensagem"); b.onclick = () => { closeCard(); openDm(nick, p.name); }; row.append(b);
    const report = el("button", "Denunciar"); report.className = "community-report-trigger";
    report.onclick = () => openCommunityReport(nick, p.name); row.append(report);
  }
  const x = el("button", "Fechar"); x.onclick = closeCard; row.append(x); c.append(row);
  c.classList.add("open"); send({t:"profile_view", nick});
}
function fillCard(m){
  const i = document.querySelector("#pcard .cinfo"); if (!i) return; i.textContent = "";
  const profile = m.p || {};
  i.append(ProfileUI.createAvatar(profile, "profile-dialog-avatar"), el("b", profile.display_name || profile.username || m.nick));
  if (profile.is_private) {
    i.append(el("div", "Este jogador mantém o perfil privado."));
    return;
  }
  [profile.rank, profile.role, profile.hero].filter(Boolean).forEach(x => i.append(el("span", x, "tag")));
  if (profile.bio) i.append(el("div", profile.bio));
  if (!profile.rank && !profile.role && !profile.hero && !profile.bio) i.append(el("div", "Este jogador ainda não preencheu o perfil."));
}
function hitPlayer(u, v){
  let best = null;
  Object.entries(players).forEach(([n, p]) => {
    const f = P(p.x, p.y);
    if (Math.abs(u - f.x) < 16 && v > f.y - 52 && v < f.y + 8 && (!best || p.x + p.y > players[best].x + players[best].y)) best = n;
  });
  return best;
}

/* ---------- sala isométrica com câmera ---------- */
const cv = $("c"), ctx = cv.getContext("2d");
const P = (x, y) => ({x:(x - y) * 0.5, y:(x + y) * 0.25});
function fit(){
  const w = $("wrap").clientWidth; if (!w) return;
  cv.width = w; cv.height = Math.max(320, Math.min(620, innerHeight * 0.6)); cv.style.height = cv.height + "px";
}
function center(){
  const me = players[SELF], f = me ? P(me.x, me.y) : P(WW / 2, WH / 2);
  cam.x = cv.width / 2 - f.x; cam.y = cv.height / 2 - f.y + 40;
}
addEventListener("resize", () => { fit(); center(); });
$("centerBtn").onclick = center;

cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); drag = {x:e.clientX, y:e.clientY, cx:cam.x, cy:cam.y, moved:false}; };
cv.onpointermove = e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
  if (drag.moved){ cam.x = drag.cx + dx; cam.y = drag.cy + dy; }
};
cv.onpointerup = e => {
  if (drag && !drag.moved){
    const r = cv.getBoundingClientRect(), k = cv.width / r.width;
    const u = (e.clientX - r.left) * k - cam.x, v = (e.clientY - r.top) * k - cam.y;
    const hit = hitPlayer(u, v);
    if (hit) showCard(hit);
    else {
      closeCard();
      const wx = u + 2 * v, wy = 2 * v - u;
      if (wx >= 0 && wx <= WW && wy >= 0 && wy <= WH) send({t:"move", x:Math.round(wx), y:Math.round(wy)});
    }
  }
  drag = null;
};

function poly(pts, fill, stroke){
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
  if (fill){ ctx.fillStyle = fill; ctx.fill(); } if (stroke){ ctx.strokeStyle = stroke; ctx.stroke(); }
}
function wall(ax, ay, bx, by, color){
  const a = P(ax, ay), b = P(bx, by), h = 130;
  poly([a, b, {x:b.x, y:b.y - h}, {x:a.x, y:a.y - h}], color, "rgba(0,0,0,.25)");
}
function drawRoom(){
  const R = ROOMS[ROOM];
  wall(0, 0, WW, 0, R.wall); wall(0, 0, 0, WH, R.wall);
  ctx.fillStyle = "rgba(0,0,0,.18)"; const a = P(0, 0), b = P(WW, 0);
  poly([a, b, {x:b.x, y:b.y - 130}, {x:a.x, y:a.y - 130}], "rgba(0,0,0,.18)");
  for (let i = 0; i < WW / TILE; i++) for (let j = 0; j < WH / TILE; j++){
    const x = i * TILE, y = j * TILE;
    poly([P(x, y), P(x + TILE, y), P(x + TILE, y + TILE), P(x, y + TILE)], null, null);
    ctx.fillStyle = R.floor; ctx.fill();
    ctx.fillStyle = (i + j) % 2 ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.07)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.stroke();
  }
  poly([P(0, 0), P(WW, 0), P(WW, WH), P(0, WH)], null, "rgba(0,0,0,.45)");
}
const SKINS = ["#f1c9a5", "#e0ac84", "#c68a5c", "#8d5a3a"], HAIRS = ["#2b1b12", "#6b3f1d", "#d9a441", "#c0392b", "#222a44"];
const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
function drawPlayer(p, nick){
  const f = P(p.x, p.y), x = Math.round(f.x), y = Math.round(f.y), hs = hash(nick);
  const skin = SKINS[hs % 4], hair = HAIRS[(hs >> 3) % 5];
  const shirt = SHOP[p.equip.color]?.value || "#4c8dff", hat = SHOP[p.equip.hat]?.value;
  const moving = Math.hypot(p.tx - p.x, p.ty - p.y) > 2, ph = Math.floor(Date.now() / 160) % 2;
  const l1 = moving && ph ? 3 : 0, l2 = moving && !ph ? 3 : 0;
  const facing = p.facing || "front-right";
  const back = facing.startsWith("back");
  const side = facing.startsWith("side");
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(x, y, 14, 6, 0, 0, 7); ctx.fill();
  if (nick === SELF){ ctx.strokeStyle = "#f2b84b"; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; }
  ctx.save();
  ctx.translate(x, y);
  if (facing.endsWith("left")) ctx.scale(-1, 1);
  const R = (a, b, w, h2, color) => { ctx.fillStyle = color; ctx.fillRect(a, b, w, h2); };
  R(-6, -12, 5, 12 - l1, "#2f3a5c"); R(1, -12, 5, 12 - l2, "#2f3a5c");
  R(-6, -3 - l1, 5, 3, "#111"); R(1, -3 - l2, 5, 3, "#111");
  R(-8, -29, 16, 18, shirt); R(-8, -29, 3, 18, "rgba(0,0,0,.14)"); R(-8, -13, 16, 2, "rgba(0,0,0,.25)");
  R(-12, -28, 4, 14, shirt); R(8, -28, 4, 14, shirt); R(-12, -14, 4, 3, skin); R(8, -14, 4, 3, skin);
  R(-7, -43, 14, 14, back ? hair : skin);
  if (back) {
    R(-8, -46, 16, 15, hair);
    R(-4, -35, 8, 4, "rgba(0,0,0,.14)");
  } else {
    R(-8, -46, 16, 7, hair); R(-8, -46, 3, 13, hair);
    if (side) {
      R(2, -38, 2, 3, "#222");
      R(5, -36, 2, 2, skin);
    } else {
      R(-4, -38, 2, 3, "#222"); R(2, -38, 2, 3, "#222");
    }
  }
  ctx.strokeStyle = "rgba(0,0,0,.45)";
  ctx.strokeRect(-8, -29, 16, 18); ctx.strokeRect(-7, -43, 14, 14);
  ctx.restore();
  ctx.textAlign = "center";
  if (hat){ ctx.font = "22px serif"; ctx.fillText(hat, x, y - 45); }
  if (CFG.names){ ctx.font = "600 12px system-ui, sans-serif"; ctx.fillStyle = "#fff"; ctx.fillText(p.name, x, y + 17); }
  if (CFG.bubbles && p.bubble && Date.now() < p.until){
    ctx.font = "13px system-ui, sans-serif";
    const txt = p.bubble.length > 30 ? p.bubble.slice(0, 29) + "…" : p.bubble, w = ctx.measureText(txt).width + 16;
    ctx.fillStyle = "#fff"; ctx.fillRect(x - w / 2, y - 84, w, 24);
    ctx.fillStyle = "#222"; ctx.fillText(txt, x, y - 67);
  }
}
function frame(){
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.save(); ctx.translate(cam.x, cam.y); drawRoom();
  const me = players[SELF];
  if (me && Math.hypot(me.tx - me.x, me.ty - me.y) > 2){
    const i = Math.floor(me.tx / TILE), j = Math.floor(me.ty / TILE);
    poly([P(i * TILE, j * TILE), P((i + 1) * TILE, j * TILE), P((i + 1) * TILE, (j + 1) * TILE), P(i * TILE, (j + 1) * TILE)], "rgba(242,184,75,.35)", "#f2b84b");
  }
  Object.entries(players).forEach(([n, p]) => {
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
    if (d > 2){
      updatePlayerFacing(p, dx, dy);
      p.x += dx / d * Math.min(4, d); p.y += dy / d * Math.min(4, d);
    }
  });
  Object.entries(players).sort((a, b) => (a[1].x + a[1].y) - (b[1].x + b[1].y)).forEach(([n, p]) => drawPlayer(p, n));
  ctx.restore();
}
function loop(){ try { frame(); } catch (err) { console.error(err); } requestAnimationFrame(loop); }

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");

}
