// /static/js/hero-catalog.js
// Catálogo de heróis (global). Carregue ANTES de app.js, hero-hub.js e meta-picker.js.
// Expõe: window.HERO_CATALOG  [{id, name, file, roles[]}]
//        window.HeroCatalog   helpers (find, imageUrl, roleLabel, norm)
//        window.MLBB_HERO_BASE (pasta das imagens)
//        evento "hero-catalog-ready" ao terminar de carregar
(function () {
  'use strict';
  var HERO_JSON_URL = 'https://raw.githubusercontent.com/Ceplin03/database-mlbb.Mobile-Legends-Bang-Bang/master/hero.json';

  window.HERO_CATALOG = window.HERO_CATALOG || [];
  window.MLBB_HERO_BASE = window.MLBB_HERO_BASE || '/static/img/icons/herois/';

  var ROLE_LABELS = {
    fighter: 'Lutador', mage: 'Mago', marksman: 'Atirador',
    assassin: 'Assassino', tank: 'Tanque', support: 'Suporte'
  };

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  window.HeroCatalog = {
    ROLES: Object.keys(ROLE_LABELS),
    norm: norm,
    all: function () { return window.HERO_CATALOG; },
    roleLabel: function (role) { return ROLE_LABELS[role] || role; },
    find: function (name) {
      var n = norm(name);
      if (!n) return null;
      var list = window.HERO_CATALOG;
      for (var i = 0; i < list.length; i++) if (norm(list[i].name) === n) return list[i];
      return null;
    },
    imageUrl: function (hero) {
      if (!hero || !hero.file) return '';
      return /^(https?:)?\/\//i.test(hero.file) || hero.file.charAt(0) === '/'
        ? hero.file : window.MLBB_HERO_BASE + hero.file;
    }
  };

  function load() {
    return fetch(HERO_JSON_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        window.HERO_CATALOG = data
          .map(function (hero) {
            return {
              id: hero.id_hero || 0,
              name: hero.name_hero || hero['name-hero'] || '',
              file: hero['images-hero'] || hero.images_hero || '',
              roles: Array.isArray(hero.role) ? hero.role.map(String) : []
            };
          })
          .filter(function (hero) { return hero.name && hero.file; });
        console.log('Catálogo de heróis carregado:', window.HERO_CATALOG.length);
      })
      .catch(function (error) {
        console.error('Falha ao carregar o catálogo de heróis:', error);
        window.HERO_CATALOG = [];
      })
      .then(function () {
        window.dispatchEvent(new CustomEvent('hero-catalog-ready'));
      });
  }

  window.HERO_CATALOG_READY = load();
})();