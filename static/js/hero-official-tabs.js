// /static/js/hero-official-tabs.js
// Conecta a camada OFICIAL (hero-official.js) ao sistema de abas do hero-hub.js.
//
// Estratégia:
//  1) Registra uma aba nova "Oficial" (order 5) que mostra TUDO em um só lugar.
//  2) Pluga o conteúdo oficial DENTRO das abas existentes via Hub.hooks.<id>Tab,
//     que o hero-tabs.js chama antes do conteúdo da comunidade.
//
// Depende de: hero-hub.js (window.HeroHub), hero-tabs.js (fornece os hooks),
//             hero-official.js (window.HeroOfficial).
(function () {
  'use strict';

  if (!window.HeroHub || !window.HeroOfficial) {
    console.warn('[hero-official-tabs] HeroHub ou HeroOfficial ausentes.');
    return;
  }

  var Hub = window.HeroHub;
  var HO  = window.HeroOfficial;
  var U   = Hub.ui;
  var cur = function () { return Hub.current(); };

  // ─── Helpers de "wrapper de seção oficial" ───
  // Envolve qualquer Node num bloco com título "OFICIAL · <nome>",
  // pra distinguir visualmente do conteúdo da comunidade.
  function officialBlock(titulo, node) {
    if (!node) return null;
    var wrap = U.el('div', null, 'ho-official-block');
    var head = U.el('div', null, 'ho-official-head');
    head.appendChild(U.el('span', 'OFICIAL', 'ho-badge'));
    head.appendChild(U.el('small', titulo, 'ho-source'));
    wrap.appendChild(head);
    wrap.appendChild(node);
    return wrap;
  }

  // ─── Carrega dados do herói atual e rerenderiza ───
  var loading = {};   // name → promise
  function ensureLoaded(name) {
    if (!name) return;
    if (HO.getHeroSync(name)) return;      // já tem
    if (loading[name]) return;             // já está carregando
    loading[name] = HO.loadHeroByName(name).then(function (d) {
      loading[name] = null;
      // notifica o hero-hub pra rerenderizar
      if (cur().name === name) Hub.rerender();
      return d;
    }).catch(function (err) {
      loading[name] = null;
      console.warn('[hero-official-tabs] falha ao carregar', name, err);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // HOOKS — plugados dentro das abas existentes do hero-tabs.js
  // ═══════════════════════════════════════════════════════════════
  // hero-tabs.js chama, em cada render de aba, os hooks "tab_<id>".
  // Cada hook é uma função(name) que devolve um Node (ou null).
  // ═══════════════════════════════════════════════════════════════

  Hub.hooks.tab_skills = Hub.hooks.tab_skills || [];
  Hub.hooks.tab_skills.push(function (name) {
    ensureLoaded(name);
    var d = HO.getHeroSync(name);
    if (!d) return null;
    return officialBlock('Skills direto do servidor oficial',
      HO.renderSkills(d));
  });

  Hub.hooks.tab_matchups = Hub.hooks.tab_matchups || [];
  Hub.hooks.tab_matchups.push(function (name) {
    ensureLoaded(name);
    var d = HO.getHeroSync(name);
    if (!d) return null;
    return officialBlock('Matchups por rank alto',
      HO.renderCounters(d));
  });

  Hub.hooks.tab_skins = Hub.hooks.tab_skins || [];
  Hub.hooks.tab_skins.push(function (name) {
    ensureLoaded(name);
    var d = HO.getHeroSync(name);
    if (!d) return null;
    return officialBlock('Skins oficiais · catálogo Moonton',
      HO.renderSkins(d));
  });

  Hub.hooks.tab_lore = Hub.hooks.tab_lore || [];
  Hub.hooks.tab_lore.push(function (name) {
    ensureLoaded(name);
    var d = HO.getHeroSync(name);
    if (!d) return null;
    return officialBlock('Lore oficial',
      HO.renderLore(d));
  });

  Hub.hooks.tab_stats = Hub.hooks.tab_stats || [];
  Hub.hooks.tab_stats.push(function (name) {
    ensureLoaded(name);
    var d = HO.getHeroSync(name);
    if (!d) return null;
    return officialBlock('Stats · win/pick/ban + duos',
      HO.renderStats(d));
  });

  // ═══════════════════════════════════════════════════════════════
  // ABA "Oficial" — visão consolidada
  // ═══════════════════════════════════════════════════════════════
  function renderOficialTab(panel) {
    var name = cur().name;
    if (!name) {
      panel.appendChild(U.el('p', 'Selecione um herói.', 'hc-muted'));
      return;
    }
    ensureLoaded(name);
    var d = HO.getHeroSync(name);
    if (!d) {
      panel.appendChild(U.el('p', 'Carregando dados oficiais…', 'hc-muted'));
      return;
    }
    panel.appendChild(HO.renderSections(d));
  }

  // Registra a aba com order baixo pra ficar perto do início.
  Hub.register({
    id: 'oficial',
    order: 5,
    label: 'Oficial',
    render: renderOficialTab
  });

  // ═══════════════════════════════════════════════════════════════
  // Pré-carrega quando o usuário abre a página do herói
  // ═══════════════════════════════════════════════════════════════
  window.addEventListener('society:tab', function (ev) {
    if (ev.detail === 'hero') ensureLoaded(cur().name);
  });

  // Se o HeroHub expõe o nome atual de forma reativa, também escutamos.
  var last = '';
  setInterval(function () {
    var n = cur().name;
    if (n && n !== last) { last = n; ensureLoaded(n); }
  }, 500);
})();