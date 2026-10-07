// static/js/lobby/lobby.js
(function (global) {
  'use strict';

  const WW = 1000, WH = 720, TILE = 80;
  const WALL_H = 220;
  const VIEW_W = 1000, VIEW_H = 700;
  const STEP_MS = 220;
  const WALK_FRAME_MS = 120;
  const NAME_FONT = "600 12px system-ui, -apple-system, Segoe UI, sans-serif";

  const ACTIONS = {
    idle:      { name: "Parado",    icon: "🧍", loop: true,  duration: 0,    movementLocked: false, pose: "idle" },
    walk:      { name: "Andando",   icon: "🚶", loop: true,  duration: 0,    movementLocked: false, pose: "walk" },
    sit:       { name: "Sentar",    icon: "🪑", loop: false, duration: 0,    movementLocked: true,  pose: "sit" },
    dance:     { name: "Dançar",    icon: "💃", loop: true,  duration: 0,    movementLocked: true,  pose: "dance" },
    wave:      { name: "Acenar",    icon: "👋", loop: false, duration: 1400, movementLocked: false, pose: "wave",      returnsToPrevious: true },
    lay:       { name: "Deitar",    icon: "😴", loop: false, duration: 0,    movementLocked: true,  pose: "lay" },
    celebrate: { name: "Comemorar", icon: "🎉", loop: false, duration: 1800, movementLocked: false, pose: "celebrate", returnsToPrevious: true },
  };
  const MENU_ACTIONS = ["wave", "dance", "sit", "lay", "celebrate"];

  // ═══ PALETA DE CORES DO PERSONAGEM ═══
  const PALETTE_DEFAULT = {
    skin:  "#f5c99a",
    hair:  "#2a1a10",
    shirt: "#f2f2f2",
    pants: "#7d8590",
    shoes: "#1a1a1a",
  };
  const PALETTE_PRESETS = {
    default: { ...PALETTE_DEFAULT },
    azul:    { skin: "#f5c99a", hair: "#3a2010", shirt: "#3d7bd6", pants: "#2c3a52", shoes: "#181818" },
    vermelho:{ skin: "#eebd8e", hair: "#6b1e0f", shirt: "#d64545", pants: "#3d2a2a", shoes: "#181818" },
    verde:   { skin: "#f5c99a", hair: "#1f2e1a", shirt: "#5bb85b", pants: "#37432f", shoes: "#181818" },
    roxo:    { skin: "#e0b088", hair: "#2a1040", shirt: "#9a5bd6", pants: "#3a2a52", shoes: "#181818" },
    preto:   { skin: "#f5c99a", hair: "#101010", shirt: "#2a2a2a", pants: "#1a1a1a", shoes: "#0a0a0a" },
    loira:   { skin: "#f5c99a", hair: "#e8c56a", shirt: "#f2f2f2", pants: "#7d8590", shoes: "#1a1a1a" },
    ruiva:   { skin: "#f0bf93", hair: "#c7562a", shirt: "#f2f2f2", pants: "#7d8590", shoes: "#1a1a1a" },
  };

  // ═══════════════════════════════════════════════════════════
  //  MÓVEIS PROCEDURAIS — funções de desenho
  //  Origin = centro-base do footprint: P(x + w/2, y + h)
  // ═══════════════════════════════════════════════════════════

  const P     = (x, y) => ({ x: (x - y) * 0.5, y: (x + y) * 0.25 });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp  = (a, b, t) => a + (b - a) * t;
  const finite = v => isFinite(v) ? v : 0;

  function shade(hex, amount) {
    if (!hex || hex.charAt(0) !== "#") return hex;
    const c = hex.slice(1);
    let r = parseInt(c.substring(0, 2), 16);
    let g = parseInt(c.substring(2, 4), 16);
    let b = parseInt(c.substring(4, 6), 16);
    if (amount > 0) {
      r = r + (255 - r) * amount; g = g + (255 - g) * amount; b = b + (255 - b) * amount;
    } else {
      r = r * (1 + amount); g = g * (1 + amount); b = b * (1 + amount);
    }
    return "rgb(" + Math.round(r) + "," + Math.round(g) + "," + Math.round(b) + ")";
  }

  function polyWith(g, pts, fill, stroke) {
    g.beginPath();
    pts.forEach((pt, i) => i ? g.lineTo(pt.x, pt.y) : g.moveTo(pt.x, pt.y));
    g.closePath();
    if (fill)   { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.stroke(); }
  }

  function furnitureOrigin(f, def) {
    return P(f.x + def.w / 2, f.y + def.h);
  }

  // ─── CADEIRA ───
  function drawChair(g, f, def) {
    const o = furnitureOrigin(f, def);
    const rot = (((f.rot || 0) % 4) + 4) % 4;
    g.save();
    g.translate(o.x, o.y);

    // sombra
    g.fillStyle = "rgba(0,0,0,.30)";
    g.beginPath(); g.ellipse(0, -2, 24, 10, 0, 0, Math.PI * 2); g.fill();

    // pernas
    g.fillStyle = "#3a2510";
    g.fillRect(-15, -28, 4, 28);
    g.fillRect(11, -28, 4, 28);

    // encosto (atrás)
    if (rot === 0 || rot === 3) {
      g.fillStyle = "#6b4520";
      g.fillRect(-18, -64, 36, 38);
      g.fillStyle = "#7a4f25";
      g.fillRect(-15, -61, 30, 32);
      g.fillStyle = "#8b5a2b";
      g.fillRect(-15, -61, 30, 4);
    } else {
      g.fillStyle = "#6b4520";
      g.fillRect(-18, -28, 36, 28);
      g.fillStyle = "#7a4f25";
      g.fillRect(-15, -25, 30, 22);
    }

    // assento
    g.fillStyle = "#8b5a2b";
    g.fillRect(-20, -30, 40, 10);
    g.fillStyle = "#a06a34";
    g.fillRect(-20, -30, 40, 4);

    g.restore();
  }

  // ─── MESA ───
  function drawTable(g, f, def) {
    const o = furnitureOrigin(f, def);
    g.save();
    g.translate(o.x, o.y);

    g.fillStyle = "rgba(0,0,0,.30)";
    g.beginPath(); g.ellipse(0, -2, 48, 17, 0, 0, Math.PI * 2); g.fill();

    // pernas
    g.fillStyle = "#3a2510";
    g.fillRect(-34, -42, 6, 42);
    g.fillRect(28, -42, 6, 42);
    g.fillStyle = "#4a2d15";
    g.fillRect(-32, -42, 2, 42);
    g.fillRect(30, -42, 2, 42);

    // tampo (iso)
    const tw = 44, th = 22;
    polyWith(g, [
      { x: -tw, y: -th - 8 }, { x: 0, y: -th * 2 - 8 },
      { x: tw,  y: -th - 8 }, { x: 0, y: -8 },
    ], "#8b5a2b", "#3a2510");
    polyWith(g, [
      { x: -tw, y: -th - 10 }, { x: 0, y: -th * 2 - 10 },
      { x: 0,   y: -th * 2 - 6 }, { x: -tw, y: -th - 6 },
    ], "#a06a34", null);
    polyWith(g, [
      { x: 0, y: -th * 2 - 10 }, { x: tw, y: -th - 10 },
      { x: tw, y: -th - 6 },     { x: 0, y: -th * 2 - 6 },
    ], "#7a4f25", null);

    g.restore();
  }

  // ─── SOFÁ ───
  function drawSofa(g, f, def) {
    const o = furnitureOrigin(f, def);
    const rot = (((f.rot || 0) % 4) + 4) % 4;
    g.save();
    g.translate(o.x, o.y);

    g.fillStyle = "rgba(0,0,0,.30)";
    g.beginPath(); g.ellipse(0, -2, 60, 18, 0, 0, Math.PI * 2); g.fill();

    if (rot === 1 || rot === 3) g.scale(-1, 1);

    // base
    g.fillStyle = "#4a2d15";
    g.fillRect(-56, -36, 112, 36);
    g.fillStyle = "#5a3a1a";
    g.fillRect(-56, -36, 112, 4);

    // assentos
    g.fillStyle = "#7a4f25";
    g.fillRect(-50, -42, 46, 8);
    g.fillRect(4, -42, 46, 8);
    g.fillStyle = "#8b5a2b";
    g.fillRect(-50, -42, 46, 3);
    g.fillRect(4, -42, 46, 3);

    // encosto
    g.fillStyle = "#5a3a1a";
    g.fillRect(-56, -84, 112, 48);
    g.fillStyle = "#6b4520";
    g.fillRect(-52, -80, 104, 40);
    g.fillStyle = "#4a2d15";
    g.fillRect(-2, -80, 4, 40);

    // braços
    g.fillStyle = "#5a3a1a";
    g.fillRect(-64, -50, 14, 50);
    g.fillRect(50, -50, 14, 50);
    g.fillStyle = "#6b4520";
    g.fillRect(-62, -48, 10, 44);
    g.fillRect(52, -48, 10, 44);

    g.restore();
  }

  // ─── ÁRVORE ───
  function drawTree(g, f, def) {
    const o = furnitureOrigin(f, def);
    g.save();
    g.translate(o.x, o.y);

    g.fillStyle = "rgba(0,0,0,.35)";
    g.beginPath(); g.ellipse(0, -2, 32, 12, 0, 0, Math.PI * 2); g.fill();

    // tronco
    g.fillStyle = "#5a3a1a";
    g.fillRect(-7, -55, 14, 55);
    g.fillStyle = "#3a2510";
    g.fillRect(-7, -55, 4, 55);
    g.fillStyle = "#7a5020";
    g.fillRect(2, -55, 4, 55);

    // copa (3 camadas)
    g.fillStyle = "#2d5a2d";
    g.beginPath(); g.arc(-20, -72, 24, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(20, -72, 24, 0, Math.PI * 2); g.fill();

    g.fillStyle = "#3a7a3a";
    g.beginPath(); g.arc(0, -85, 28, 0, Math.PI * 2); g.fill();

    g.fillStyle = "#4a9a4a";
    g.beginPath(); g.arc(-8, -98, 15, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(15, -85, 11, 0, Math.PI * 2); g.fill();

    g.restore();
  }

  // ─── TAPETE ───
  function drawRug(g, f, def) {
    const x = f.x, y = f.y, w = def.w, h = def.h;
    polyWith(g, [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)],
             "#7a2020", "rgba(0,0,0,.35)");
    const p1 = 8;
    polyWith(g, [P(x + p1, y + p1), P(x + w - p1, y + p1),
                 P(x + w - p1, y + h - p1), P(x + p1, y + h - p1)],
             "#a03030", null);
    const p2 = 24;
    polyWith(g, [P(x + p2, y + p2), P(x + w - p2, y + p2),
                 P(x + w - p2, y + h - p2), P(x + p2, y + h - p2)],
             "#d4a0a0", null);
    const p3 = 44;
    polyWith(g, [P(x + p3, y + p3), P(x + w - p3, y + p3),
                 P(x + w - p3, y + h - p3), P(x + p3, y + h - p3)],
             "#a03030", null);
  }

  // ─── JANELA ───
  function drawWindow(g, f, def) {
    const wx = f.x;
    const w  = def.w;
    const a = P(wx, 0), b = P(wx + w, 0);
    const winTop = a.y - WALL_H + 75;
    const winBot = a.y - 55;

    // moldura
    polyWith(g, [
      { x: a.x, y: winTop }, { x: b.x, y: winTop },
      { x: b.x, y: winBot }, { x: a.x, y: winBot },
    ], "#5a3a1a", "#2a1a0a");

    // vidro com céu
    const pad = 5;
    const glassGrad = g.createLinearGradient(a.x, winTop, b.x, winBot);
    glassGrad.addColorStop(0, "#8ecae6");
    glassGrad.addColorStop(0.5, "#a8d8f0");
    glassGrad.addColorStop(1, "#6a9fc0");
    polyWith(g, [
      { x: a.x + pad, y: winTop + pad },
      { x: b.x - pad, y: winTop + pad },
      { x: b.x - pad, y: winBot - pad },
      { x: a.x + pad, y: winBot - pad },
    ], glassGrad, null);

    // brilho diagonal
    g.save();
    g.globalAlpha = 0.35;
    polyWith(g, [
      { x: a.x + pad + 4, y: winBot - pad - 4 },
      { x: b.x - pad - 30, y: winTop + pad + 4 },
      { x: b.x - pad - 20, y: winTop + pad + 4 },
      { x: a.x + pad + 14, y: winBot - pad - 4 },
    ], "#ffffff", null);
    g.restore();

    // cruzamento
    g.strokeStyle = "#3a2510";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo((a.x + b.x) / 2, winTop);
    g.lineTo((a.x + b.x) / 2, winBot);
    g.stroke();
    g.beginPath();
    g.moveTo(a.x, (winTop + winBot) / 2);
    g.lineTo(b.x, (winTop + winBot) / 2);
    g.stroke();

    // peitoril
    polyWith(g, [
      { x: a.x - 4, y: winBot },
      { x: b.x + 4, y: winBot },
      { x: b.x + 4, y: winBot + 5 },
      { x: a.x - 4, y: winBot + 5 },
    ], "#4a2d15", "#2a1a0a");
  }

  // ─── PLANTA ───
  function drawPlant(g, f, def) {
    const o = furnitureOrigin(f, def);
    g.save();
    g.translate(o.x, o.y);

    g.fillStyle = "rgba(0,0,0,.35)";
    g.beginPath(); g.ellipse(0, -2, 20, 8, 0, 0, Math.PI * 2); g.fill();

    // vaso
    g.fillStyle = "#a0562a";
    polyWith(g, [{ x: -16, y: -28 }, { x: 16, y: -28 }, { x: 12, y: 0 }, { x: -12, y: 0 }], "#a0562a", "#5a2a10");
    g.fillStyle = "#7a3a1a";
    g.fillRect(-12, -2, 24, 3);
    // borda
    g.fillStyle = "#c0662a";
    g.fillRect(-18, -32, 36, 6);
    g.fillStyle = "#3a2510";
    g.fillRect(-15, -30, 30, 3);

    // folhagem
    g.fillStyle = "#2d5a2d";
    g.beginPath(); g.arc(-10, -50, 14, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(12, -48, 12, 0, Math.PI * 2); g.fill();

    g.fillStyle = "#3a7a3a";
    g.beginPath(); g.arc(0, -60, 16, 0, Math.PI * 2); g.fill();

    g.fillStyle = "#4a9a4a";
    g.beginPath(); g.arc(-4, -68, 8, 0, Math.PI * 2); g.fill();

    g.restore();
  }

  // ─── LÂMPADA ───
  function drawLamp(g, f, def) {
    const o = furnitureOrigin(f, def);
    g.save();
    g.translate(o.x, o.y);

    g.fillStyle = "rgba(0,0,0,.30)";
    g.beginPath(); g.ellipse(0, -2, 16, 7, 0, 0, Math.PI * 2); g.fill();

    // base
    g.fillStyle = "#2a2a2a";
    g.fillRect(-12, -4, 24, 4);
    g.fillRect(-8, -8, 16, 5);

    // haste
    g.fillStyle = "#3a3a3a";
    g.fillRect(-2, -90, 4, 82);
    g.fillStyle = "#1a1a1a";
    g.fillRect(-2, -90, 1, 82);

    // cúpula
    g.fillStyle = "#c9a86a";
    polyWith(g, [{ x: -22, y: -90 }, { x: 22, y: -90 }, { x: 16, y: -110 }, { x: -16, y: -110 }], "#c9a86a", "#6a5020");
    g.fillStyle = "#e0c080";
    polyWith(g, [{ x: -22, y: -90 }, { x: 22, y: -90 }, { x: 18, y: -96 }, { x: -18, y: -96 }], "#e0c080", null);

    // glow
    g.save();
    g.globalAlpha = 0.22;
    const grad = g.createRadialGradient(0, -95, 5, 0, -95, 80);
    grad.addColorStop(0, "rgba(255,230,150,.9)");
    grad.addColorStop(1, "rgba(255,230,150,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, -95, 80, 0, Math.PI * 2);
    g.fill();
    g.restore();

    g.restore();
  }

  // ─── BANCO COMPRIDO ───
  function drawBench(g, f, def) {
    const o = furnitureOrigin(f, def);
    g.save();
    g.translate(o.x, o.y);

    g.fillStyle = "rgba(0,0,0,.30)";
    g.beginPath(); g.ellipse(0, -2, 55, 14, 0, 0, Math.PI * 2); g.fill();

    // pernas
    g.fillStyle = "#3a2510";
    g.fillRect(-46, -28, 5, 28);
    g.fillRect(41, -28, 5, 28);

    // assento
    g.fillStyle = "#8b5a2b";
    g.fillRect(-50, -34, 100, 8);
    g.fillStyle = "#a06a34";
    g.fillRect(-50, -34, 100, 3);

    // encosto
    g.fillStyle = "#6b4520";
    g.fillRect(-50, -62, 100, 32);
    g.fillStyle = "#7a4f25";
    g.fillRect(-46, -58, 92, 26);
    g.fillStyle = "#8b5a2b";
    g.fillRect(-46, -58, 92, 3);

    g.restore();
  }

  // ─── CAMA ───
  function drawBed(g, f, def) {
    const o = furnitureOrigin(f, def);
    g.save();
    g.translate(o.x, o.y);

    g.fillStyle = "rgba(0,0,0,.30)";
    g.beginPath(); g.ellipse(0, -2, 60, 20, 0, 0, Math.PI * 2); g.fill();

    // estrutura
    g.fillStyle = "#4a2d15";
    g.fillRect(-50, -70, 100, 70);
    g.fillStyle = "#5a3a1a";
    g.fillRect(-50, -70, 100, 4);

    // colchão
    g.fillStyle = "#e8e0c8";
    g.fillRect(-46, -66, 92, 62);
    g.fillStyle = "#f5eed8";
    g.fillRect(-46, -66, 92, 6);

    // cabeceira travesseiro
    g.fillStyle = "#ffffff";
    g.fillRect(-42, -62, 34, 22);
    g.fillStyle = "#d8d0b8";
    g.fillRect(-42, -46, 34, 4);

    // cobertor
    g.fillStyle = "#7a3a5a";
    g.fillRect(-8, -60, 52, 56);
    g.fillStyle = "#9a4a6a";
    g.fillRect(-8, -60, 52, 4);

    // travesseiro 2
    g.fillStyle = "#ffffff";
    g.fillRect(-42, -40, 34, 16);

    g.restore();
  }

  // ═══ CATÁLOGO ═══
  const MOBI_CATALOG = {
    chair_basic:  { w:  80, h:  80, flat: false, blocking: true, actions: ["sit"], sitOffset: { x: 0, y: 1 }, draw: drawChair },
    table_basic:  { w: 160, h: 160, flat: false, blocking: true, actions: [], draw: drawTable },
    sofa_basic:   { w: 160, h:  80, flat: false, blocking: true, actions: ["sit"], sitOffset: { x: 0, y: 1 }, draw: drawSofa },
    tree_basic:   { w:  80, h:  80, flat: false, blocking: true, actions: [], draw: drawTree },
    rug_basic:    { w: 240, h: 160, flat: true,  blocking: false, actions: [], draw: drawRug },
    window_basic: { w: 100, h:   0, flat: true,  blocking: false, actions: [], draw: drawWindow },
    plant_basic:  { w:  80, h:  80, flat: false, blocking: true, actions: [], draw: drawPlant },
    lamp_basic:   { w:  80, h:  80, flat: false, blocking: true, actions: [], draw: drawLamp },
    bench_basic:  { w: 160, h:  80, flat: false, blocking: true, actions: ["sit"], sitOffset: { x: 0, y: 1 }, draw: drawBench },
    bed_basic:    { w: 160, h: 240, flat: false, blocking: true, actions: ["lay"], draw: drawBed },
  };

  // ═══ SALAS ═══
  const ROOMS = {
    lobby: {
      name: "Salão Principal",
      floor: "#6a5238", floorAlt: "#5c4630",
      wall: "#4a3826", wallTop: "#5c4832", wallBase: "#2a1d10",
      furniture: [
        // tapete central
        { defId: "rug_basic",    x: 320, y: 320, rot: 0 },
        // mesa + cadeiras ao redor
        { defId: "table_basic",  x: 400, y: 360, rot: 0 },
        { defId: "chair_basic",  x: 320, y: 400, rot: 0 },
        { defId: "chair_basic",  x: 560, y: 400, rot: 3 },
        { defId: "chair_basic",  x: 440, y: 560, rot: 2 },
        // sofás nos cantos
        { defId: "sofa_basic",   x: 120, y: 240, rot: 0 },
        { defId: "sofa_basic",   x: 640, y: 240, rot: 2 },
        // árvores decorativas
        { defId: "tree_basic",   x: 160, y: 560, rot: 0 },
        { defId: "tree_basic",   x: 800, y: 560, rot: 0 },
        // plantas
        { defId: "plant_basic",  x: 200, y: 400, rot: 0 },
        { defId: "plant_basic",  x: 720, y: 400, rot: 0 },
        // lâmpadas
        { defId: "lamp_basic",   x: 100, y: 160, rot: 0 },
        { defId: "lamp_basic",   x: 860, y: 160, rot: 0 },
        // janelas na parede de trás
        { defId: "window_basic", x: 200, y: 0,   rot: 0 },
        { defId: "window_basic", x: 500, y: 0,   rot: 0 },
        { defId: "window_basic", x: 800, y: 0,   rot: 0 },
      ],
    },
    praca: {
      name: "Praça",
      floor: "#4a7a4a", floorAlt: "#406a40",
      wall: "#2e522e", wallTop: "#3d6a3d", wallBase: "#1a2e1a",
      furniture: [
        { defId: "rug_basic",    x: 320, y: 240, rot: 0 },
        { defId: "bench_basic",  x: 160, y: 400, rot: 0 },
        { defId: "bench_basic",  x: 640, y: 400, rot: 0 },
        { defId: "tree_basic",   x: 200, y: 200, rot: 0 },
        { defId: "tree_basic",   x: 720, y: 200, rot: 0 },
        { defId: "tree_basic",   x: 440, y: 560, rot: 0 },
        { defId: "plant_basic",  x: 400, y: 400, rot: 0 },
        { defId: "lamp_basic",   x: 400, y: 120, rot: 0 },
      ],
    },
    arena: {
      name: "Arena",
      floor: "#5a2536", floorAlt: "#4d1f2c",
      wall: "#31161f", wallTop: "#43202c", wallBase: "#1d0d14",
      furniture: [
        { defId: "rug_basic",    x: 320, y: 240, rot: 0 },
        { defId: "chair_basic",  x: 240, y: 560, rot: 0 },
        { defId: "chair_basic",  x: 320, y: 560, rot: 0 },
        { defId: "chair_basic",  x: 640, y: 560, rot: 0 },
        { defId: "chair_basic",  x: 720, y: 560, rot: 0 },
        { defId: "lamp_basic",   x: 160, y: 160, rot: 0 },
        { defId: "lamp_basic",   x: 800, y: 160, rot: 0 },
        { defId: "tree_basic",   x: 400, y: 100, rot: 0 },
      ],
    },
  };

  const ISO_BOUNDS = (() => {
    const corners = [P(0, 0), P(WW, 0), P(0, WH), P(WW, WH)];
    const xs = corners.map(c => c.x);
    const ys = corners.map(c => c.y);
    const b = {
      minX: Math.min.apply(null, xs),
      maxX: Math.max.apply(null, xs),
      minY: Math.min.apply(null, ys) - WALL_H,
      maxY: Math.max.apply(null, ys),
    };
    b.width  = b.maxX - b.minX;
    b.height = b.maxY - b.minY;
    return b;
  })();

  // ─── Desenho do personagem ───
  const CH = {
    headW: 16, headH: 15,
    neckW: 4,  neckH: 2,
    bodyW: 20, bodyH: 22,
    armW:  5,  armH:  20,
    legW:  7,  legH:  20,
    shoeW: 8,  shoeH:  4,
    shoeY: -4,
    legY: -22,
    bodyY: -44,
    neckY: -46,
    headY: -60,
    hairY: -64,
  };

  function rect(g, x, y, w, h, fill, stroke) {
    g.fillStyle = fill;
    g.fillRect(x, y, w, h);
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = 0.6;
      g.strokeRect(x + 0.3, y + 0.3, w - 0.6, h - 0.6);
    }
  }

  function drawCharacterStanding(g, pal, facing, isBack, isSide, legPhase, armLiftL, armLiftR) {
    const skin      = pal.skin  || "#f5c99a";
    const skinDark  = shade(skin, -0.18);
    const hair      = pal.hair  || "#2a1a10";
    const shirt     = pal.shirt || "#f2f2f2";
    const shirtDark = shade(shirt, -0.18);
    const pants     = pal.pants || "#7d8590";
    const shoes     = pal.shoes || "#1a1a1a";
    const outline   = "rgba(0,0,0,0.55)";
    const face      = "#1a1a1a";

    const lw = CH.legW, lh = CH.legH;
    const sw = CH.shoeW, sh = CH.shoeH;
    const bw = CH.bodyW, bh = CH.bodyH;
    const aw = CH.armW, ah = CH.armH;
    const hw = CH.headW, hh = CH.headH;

    let lY = CH.legY, rY = CH.legY;
    if (legPhase === 1)  { lY = CH.legY - 2; rY = CH.legY + 2; }
    if (legPhase === -1) { lY = CH.legY + 2; rY = CH.legY - 2; }
    if (legPhase === 2)  { lY = CH.legY + 6; rY = CH.legY + 6; }

    rect(g, -lw - 1, lY, lw, lh, pants, outline);
    rect(g, 1, rY, lw, lh, pants, outline);

    const lShY = lY + lh - sh + 1;
    const rShY = rY + lh - sh + 1;
    rect(g, -sw - 1, lShY, sw, sh, shoes, outline);
    rect(g, 1, rShY, sw, sh, shoes, outline);

    const bodyX = -bw / 2;
    rect(g, bodyX, CH.bodyY, bw, bh, shirt, outline);
    rect(g, bodyX, CH.bodyY, bw, 3, shade(shirt, 0.15), null);
    rect(g, bodyX, CH.bodyY + bh - 3, bw, 3, shirtDark, null);

    const armLX = bodyX - aw + 1;
    const armLY = CH.bodyY + 2 + armLiftL;
    rect(g, armLX, armLY, aw, ah, shirt, outline);
    rect(g, armLX, armLY + ah - 4, aw, 4, skin, outline);

    const armRX = bodyX + bw - 1;
    const armRY = CH.bodyY + 2 + armLiftR;
    rect(g, armRX, armRY, aw, ah, shirt, outline);
    rect(g, armRX, armRY + ah - 4, aw, 4, skin, outline);

    rect(g, -CH.neckW / 2, CH.neckY, CH.neckW, CH.neckH, skinDark, null);

    const headX = -hw / 2;
    rect(g, headX, CH.headY, hw, hh, skin, outline);
    rect(g, headX, CH.headY, hw, 2, shade(skin, 0.08), null);

    rect(g, headX - 1, CH.hairY, hw + 2, 4, hair, outline);
    rect(g, headX, CH.hairY + 4, hw, 3, hair, null);
    if (isBack) {
      rect(g, headX, CH.headY, hw, hh - 6, hair, outline);
    } else if (isSide) {
      rect(g, headX, CH.headY, 4, hh - 2, hair, outline);
      rect(g, headX + hw - 3, CH.headY, 3, hh - 2, hair, null);
    } else {
      rect(g, headX, CH.headY, 3, hh - 3, hair, outline);
      rect(g, headX + hw - 3, CH.headY, 3, hh - 3, hair, outline);
    }

    if (!isBack) {
      const eyeY = CH.headY + 8;
      if (isSide) {
        rect(g, 2, eyeY, 2, 3, face, null);
      } else {
        rect(g, -6, eyeY, 2, 3, face, null);
        rect(g,  4, eyeY, 2, 3, face, null);
        rect(g, -2, eyeY + 6, 4, 1.5, "#9a4a4a", null);
      }
    }
  }

  function drawCharacter(g, pal, facing, pose, frame) {
    const isLeft = facing.slice(-4) === "left";
    const isBack = facing.slice(0, 4) === "back";
    const isSide = facing.slice(0, 4) === "side";

    let bobY = 0;
    let legPhase = 0;
    let armLiftL = 0;
    let armLiftR = 0;
    let lowerBody = 0;

    if (pose === "walk") {
      const p = frame % 4;
      if (p === 1) { legPhase =  1; bobY = -1; }
      else if (p === 3) { legPhase = -1; bobY = -1; }
    } else if (pose === "dance") {
      const p = frame % 4;
      bobY = (p === 1 || p === 3) ? -2 : 0;
      armLiftL = (p === 1) ? -10 : (p === 3 ? 4 : 0);
      armLiftR = (p === 3) ? -10 : (p === 1 ? 4 : 0);
    } else if (pose === "wave") {
      const p = frame % 4;
      armLiftR = [-16, -18, -16, -14][p];
    } else if (pose === "celebrate") {
      const p = frame % 4;
      bobY = (p === 1 || p === 3) ? -3 : 0;
      armLiftL = -14;
      armLiftR = -14;
    } else if (pose === "sit") {
      lowerBody = 8;
      legPhase = 2;
    } else if (pose === "lay") {
      g.save();
      g.translate(0, -8);
      g.rotate(-Math.PI / 2);
      g.translate(-6, 8);
      drawCharacterStanding(g, pal, facing, false, false, 0, 0, 0);
      g.restore();
      return;
    }

    g.save();
    if (isLeft) g.scale(-1, 1);
    g.translate(0, bobY);
    g.translate(0, lowerBody);
    drawCharacterStanding(g, pal, facing, isBack, isSide, legPhase, armLiftL, armLiftR);
    g.restore();
  }

  // ─── Constantes do player ───
  const PLAYER_SPRITE_W = 120;
  const PLAYER_SPRITE_H = 160;
  const PLAYER_ANCHOR_X = 60;
  const PLAYER_ANCHOR_Y = 140;
  const PLAYER_SCALE    = 1.6;
  const PLAYER_SPRITE_MAX = 400;

  let $, send, onLog, onPlayerClick;
  let self = null;
  let shop = {};
  let players = {};
  let currentRoom = "lobby";
  const cam = { x: 0, y: 0 };
  let drag = null;
  let cfg = { names: true, bubbles: true };
  let cv, ctx, wrapEl;
  let running = false;
  let rafId = null;
  let lastFrameAt = 0;
  let DPR = 1;

  let staticLayer = null;
  let staticLayerDirty = true;

  const playerSpriteCache = new Map();
  const gridW = Math.ceil(WW / TILE);
  const gridH = Math.ceil(WH / TILE);
  let walkMap = new Uint8Array(gridW * gridH);
  let walkMapDirty = true;
  let debugGrid = false;
  let actionMenuEl = null;

  function mobiBBox(f) {
    const def = MOBI_CATALOG[f.defId];
    if (!def) return null;
    return { x: f.x, y: f.y, w: def.w, h: def.h, def };
  }

  function fit() {
    if (!cv || !wrapEl || !ctx) return;
    const wrapW = wrapEl.clientWidth || 800;
    const newDpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    if (newDpr !== DPR) { DPR = newDpr; staticLayerDirty = true; playerSpriteCache.clear(); }
    const scale = wrapW / VIEW_W;
    cv.width  = Math.round(VIEW_W * DPR);
    cv.height = Math.round(VIEW_H * DPR);
    cv.style.width  = wrapW + "px";
    cv.style.height = Math.round(VIEW_H * scale) + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
    clampCamera();
  }
  function clampCamera() {
    if (!isFinite(cam.x) || !isFinite(cam.y)) { cam.x = 0; cam.y = 0; }
    if (VIEW_W >= ISO_BOUNDS.width) cam.x = VIEW_W / 2 - (ISO_BOUNDS.minX + ISO_BOUNDS.maxX) / 2;
    else cam.x = clamp(cam.x, VIEW_W - ISO_BOUNDS.maxX, -ISO_BOUNDS.minX);
    if (VIEW_H >= ISO_BOUNDS.height) cam.y = VIEW_H / 2 - (ISO_BOUNDS.minY + ISO_BOUNDS.maxY) / 2;
    else cam.y = clamp(cam.y, VIEW_H - ISO_BOUNDS.maxY, -ISO_BOUNDS.minY);
  }
  function center() {
    const me = players[self];
    if (me && (ISO_BOUNDS.width > VIEW_W || ISO_BOUNDS.height > VIEW_H)) {
      const f = P(me.x, me.y);
      cam.x = VIEW_W / 2 - f.x; cam.y = VIEW_H / 2 - f.y;
    } else {
      cam.x = VIEW_W / 2 - (ISO_BOUNDS.minX + ISO_BOUNDS.maxX) / 2;
      cam.y = VIEW_H / 2 - (ISO_BOUNDS.minY + ISO_BOUNDS.maxY) / 2;
    }
    clampCamera();
  }

  function buildWalkMap() {
    walkMap.fill(0);
    const R = ROOMS[currentRoom];
    if (!R) return;
    (R.furniture || []).forEach(f => {
      const def = MOBI_CATALOG[f.defId];
      if (!def || def.flat || !def.blocking) return;
      const x0 = Math.floor(f.x / TILE), y0 = Math.floor(f.y / TILE);
      const x1 = Math.floor((f.x + def.w - 1) / TILE);
      const y1 = Math.floor((f.y + def.h - 1) / TILE);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || ty < 0 || tx >= gridW || ty >= gridH) continue;
        walkMap[ty * gridW + tx] = 1;
      }
    });
    walkMapDirty = false;
  }
  function isWalkable(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= gridW || ty >= gridH) return false;
    if (walkMapDirty) buildWalkMap();
    return walkMap[ty * gridW + tx] === 0;
  }
  function tileOfWorld(x, y) { return { x: Math.floor(x / TILE), y: Math.floor(y / TILE) }; }
  function worldOfTile(tx, ty) { return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 }; }

  const DIRS = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],
                [1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
  function octile(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  }
  function findPath(start, goal) {
    if (walkMapDirty) buildWalkMap();
    if (!isWalkable(goal.x, goal.y)) return null;
    const startIdx = start.y * gridW + start.x, goalIdx = goal.y * gridW + goal.x;
    if (startIdx === goalIdx) return [{ x: start.x, y: start.y }];
    const size = gridW * gridH;
    const gScore = new Float32Array(size).fill(Infinity);
    const cameFrom = new Int32Array(size).fill(-1);
    const closed = new Uint8Array(size);
    gScore[startIdx] = 0;
    const open = [{ idx: startIdx, f: octile(start.x, start.y, goal.x, goal.y) }];
    while (open.length) {
      open.sort((a, b) => a.f - b.f);
      const cur = open.shift(), curIdx = cur.idx;
      if (curIdx === goalIdx) {
        const path = []; let i = curIdx;
        while (i !== -1) { path.push({ x: i % gridW, y: Math.floor(i / gridW) }); i = cameFrom[i]; }
        path.reverse(); return path;
      }
      if (closed[curIdx]) continue;
      closed[curIdx] = 1;
      const cx = curIdx % gridW, cy = Math.floor(curIdx / gridW);
      for (let d = 0; d < DIRS.length; d++) {
        const dx = DIRS[d][0], dy = DIRS[d][1], cost = DIRS[d][2];
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
        if (!isWalkable(nx, ny)) continue;
        if (dx !== 0 && dy !== 0) {
          if (!isWalkable(cx + dx, cy) || !isWalkable(cx, cy + dy)) continue;
        }
        const ni = ny * gridW + nx;
        if (closed[ni]) continue;
        const tentative = gScore[curIdx] + cost;
        if (tentative < gScore[ni]) {
          cameFrom[ni] = curIdx; gScore[ni] = tentative;
          open.push({ idx: ni, f: tentative + octile(nx, ny, goal.x, goal.y) });
        }
      }
    }
    return null;
  }

  function setPlayerPath(nick, path) {
    const p = players[nick];
    if (!p) return;
    if (!path || path.length < 2) { p.path = null; return; }
    p.path = path.slice(1).map(t => ({ x: t.x, y: t.y }));
    p.pathIndex = 0;
    const t = p.path[0];
    const w = worldOfTile(t.x, t.y);
    p.fromX = p.x; p.fromY = p.y;
    p.toX = w.x; p.toY = w.y;
    p.tx = w.x; p.ty = w.y;
    p.stepAt = null;
    p.action = "walk";
  }

  function advancePlayer(p, now) {
    if (!p.path) return false;
    const next = p.path[p.pathIndex];
    if (!next) { p.path = null; p.action = "idle"; return false; }
    if (p.stepAt == null) {
      p.stepAt = now;
      updatePlayerFacing(p, p.toX - p.fromX, p.toY - p.fromY);
    }
    const t = clamp((now - p.stepAt) / STEP_MS, 0, 1);
    p.x = lerp(p.fromX, p.toX, t);
    p.y = lerp(p.fromY, p.toY, t);
    if (t >= 1) {
      p.x = p.toX; p.y = p.toY;
      p.pathIndex++;
      p.stepAt = null;
      if (p.pathIndex >= p.path.length) {
        p.path = null; p.pathIndex = 0;
        p.tx = p.x; p.ty = p.y;
        p.action = "idle";
        onPlayerArrived(p);
        return false;
      }
      const nn = p.path[p.pathIndex];
      const nw = worldOfTile(nn.x, nn.y);
      p.fromX = p.x; p.fromY = p.y;
      p.toX = nw.x;  p.toY = nw.y;
      p.tx = nw.x;   p.ty = nw.y;
    }
    return true;
  }
  function onPlayerArrived(p) {
    if (p.pendingAction) {
      const pa = p.pendingAction; p.pendingAction = null;
      applyActionState(p, pa.action, pa.opts);
    }
  }

  function poly(pts, fill, stroke) { polyWith(ctx, pts, fill, stroke); }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawContactShadow(g, cx, cy, rx, ry, alpha) {
    const a = alpha == null ? 0.55 : alpha;
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
    grd.addColorStop(0.0, "rgba(0,0,0," + (a * 0.85) + ")");
    grd.addColorStop(0.45, "rgba(0,0,0," + (a * 0.45) + ")");
    grd.addColorStop(1.0, "rgba(0,0,0,0)");
    g.save();
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function drawWall(g, ax, ay, bx, by, R) {
    const a = P(ax, ay), b = P(bx, by);
    const topA = { x: a.x, y: a.y - WALL_H };
    const topB = { x: b.x, y: b.y - WALL_H };
    const grad = g.createLinearGradient(0, a.y - WALL_H, 0, a.y);
    grad.addColorStop(0.0, shade(R.wall, -0.2));
    grad.addColorStop(0.7, shade(R.wall, 0.0));
    grad.addColorStop(1.0, shade(R.wall, 0.08));
    polyWith(g, [a, b, topB, topA], grad, "rgba(0,0,0,.5)");
    g.save();
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const count = Math.max(2, Math.round(len / 110));
    for (let i = 1; i < count; i++) {
      const t = i / count;
      const px = a.x + dx * t, py = a.y + dy * t;
      g.strokeStyle = "rgba(0,0,0,.15)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(px, py - 26); g.lineTo(px, py - WALL_H + 22); g.stroke();
      g.strokeStyle = "rgba(255,255,255,.05)";
      g.beginPath(); g.moveTo(px + 1, py - 26); g.lineTo(px + 1, py - WALL_H + 22); g.stroke();
    }
    g.restore();
    const railY = Math.round(WALL_H * 0.6);
    polyWith(g, [
      { x: a.x, y: a.y - railY }, { x: b.x, y: b.y - railY },
      { x: b.x, y: b.y - railY - 3 }, { x: a.x, y: a.y - railY - 3 },
    ], shade(R.wall, -0.28), null);
    const baseH = 26;
    polyWith(g, [a, b, { x: b.x, y: b.y - baseH }, { x: a.x, y: a.y - baseH }],
             R.wallBase, "rgba(0,0,0,.55)");
    const crownH = 14;
    polyWith(g, [topA, topB, { x: topB.x, y: topB.y + crownH }, { x: topA.x, y: topA.y + crownH }],
             R.wallTop, "rgba(0,0,0,.55)");
  }
  function drawWallAO(g) {
    const a = P(0, 0), b = P(WW, 0);
    const depth = 60;
    g.save();
    const grd = g.createLinearGradient(0, a.y, 0, a.y + depth);
    grd.addColorStop(0, "rgba(0,0,0,.32)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(a.x, a.y, b.x - a.x, depth);
    g.restore();
    const la = P(0, 0), lb = P(0, WH);
    g.save();
    const grd2 = g.createLinearGradient(la.x, 0, la.x + depth, 0);
    grd2.addColorStop(0, "rgba(0,0,0,.30)");
    grd2.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd2;
    g.fillRect(la.x, la.y, depth, lb.y - la.y);
    g.restore();
  }
  function drawFloor(g, R) {
    for (let i = 0; i < gridW; i++) {
      for (let j = 0; j < gridH; j++) {
        const x = i * TILE, y = j * TILE;
        const isAlt = (i + j) % 2 === 0;
        const base = isAlt ? R.floor : R.floorAlt;
        const n = ((i * 73856093) ^ (j * 19349663)) >>> 0;
        const noise = ((n % 100) - 50) / 50;
        const fill = shade(base, noise * 0.04);
        polyWith(g, [P(x, y), P(x + TILE, y), P(x + TILE, y + TILE), P(x, y + TILE)],
                 fill, "rgba(0,0,0,.08)");
      }
    }
    polyWith(g, [P(0, 0), P(WW, 0), P(WW, WH), P(0, WH)], null, "rgba(0,0,0,.55)");
    drawWallAO(g);
  }
  function drawRoom(g) {
    const R = ROOMS[currentRoom];
    if (!R) return;
    drawFloor(g, R);
    drawWall(g, 0, 0, WW, 0, R);
    drawWall(g, 0, 0, 0, WH, R);
    if (debugGrid) {
      for (let ty = 0; ty < gridH; ty++) {
        for (let tx = 0; tx < gridW; tx++) {
          if (!isWalkable(tx, ty)) {
            const x = tx * TILE, y = ty * TILE;
            polyWith(g, [P(x, y), P(x + TILE, y), P(x + TILE, y + TILE), P(x, y + TILE)],
                     "rgba(220,60,60,.35)", "rgba(220,60,60,.9)");
          }
        }
      }
    }
  }
  function buildStaticLayer() {
    const R = ROOMS[currentRoom];
    if (!R) return;
    const w = Math.ceil(ISO_BOUNDS.width), h = Math.ceil(ISO_BOUNDS.height);
    if (w <= 0 || h <= 0) return;
    if (!staticLayer) staticLayer = document.createElement("canvas");
    staticLayer.width  = Math.max(1, Math.ceil(w * DPR));
    staticLayer.height = Math.max(1, Math.ceil(h * DPR));
    const g = staticLayer.getContext("2d");
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, w, h);
    g.translate(-ISO_BOUNDS.minX, -ISO_BOUNDS.minY);
    drawRoom(g);
    staticLayerDirty = false;
  }

  function drawFurniture(f) {
    const def = MOBI_CATALOG[f.defId];
    if (!def || !def.draw) return;
    def.draw(ctx, f, def);
  }

  function assembleRenderState(p, now) {
    const actionId = p.action || "idle";
    if (actionId === "walk" || (actionId === "idle" && p.path)) {
      const phase = Math.floor(now / WALK_FRAME_MS) % 4;
      return { variant: "walk", phase, key: "walk|" + phase };
    }
    if (actionId === "dance") {
      const phase = Math.floor((now - (p.actionStartedAt || now)) / 240) % 4;
      return { variant: "dance", phase, key: "dance|" + phase };
    }
    if (actionId === "wave") {
      const phase = Math.floor((now - (p.actionStartedAt || now)) / 200) % 4;
      return { variant: "wave", phase, key: "wave|" + phase };
    }
    if (actionId === "celebrate") {
      const phase = Math.floor((now - (p.actionStartedAt || now)) / 260) % 4;
      return { variant: "celebrate", phase, key: "celebrate|" + phase };
    }
    if (actionId === "sit") return { variant: "sit", phase: 0, key: "sit" };
    if (actionId === "lay") return { variant: "lay", phase: 0, key: "lay" };
    return { variant: "idle", phase: 0, key: "idle" };
  }

  function buildPlayerSprite(pal, facing, renderState) {
    const sprite = document.createElement("canvas");
    sprite.width  = Math.ceil(PLAYER_SPRITE_W * DPR);
    sprite.height = Math.ceil(PLAYER_SPRITE_H * DPR);
    const g = sprite.getContext("2d");
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.imageSmoothingEnabled = false;
    g.translate(PLAYER_ANCHOR_X, PLAYER_ANCHOR_Y);
    g.scale(PLAYER_SCALE, PLAYER_SCALE);
    drawCharacter(g, pal, facing, renderState.variant, renderState.phase);
    return sprite;
  }

  function getPlayerSprite(pal, facing, renderState) {
    const key = [pal.skin, pal.hair, pal.shirt, pal.pants, pal.shoes,
                 facing, renderState.key].join("|");
    let sprite = playerSpriteCache.get(key);
    if (sprite) {
      playerSpriteCache.delete(key);
      playerSpriteCache.set(key, sprite);
      return sprite;
    }
    sprite = buildPlayerSprite(pal, facing, renderState);
    if (playerSpriteCache.size >= PLAYER_SPRITE_MAX) {
      const first = playerSpriteCache.keys().next().value;
      if (first !== undefined) playerSpriteCache.delete(first);
    }
    playerSpriteCache.set(key, sprite);
    return sprite;
  }

  function resolvePalette(p) {
    return (p && p.avatar && p.avatar.skin) ? p.avatar : PALETTE_DEFAULT;
  }

  function drawPlayer(p, nick) {
    if (!p) return;
    try {
      const f = P(p.x, p.y);
      if (!isFinite(f.x) || !isFinite(f.y)) return;
      const x = Math.round(f.x), y = Math.round(f.y);
      const now = Date.now();
      const renderState = assembleRenderState(p, now);
      const facing = p.facing || "front-right";
      const pal = resolvePalette(p);
      const sprite = getPlayerSprite(pal, facing, renderState);

      const sitting = renderState.variant === "sit" || renderState.variant === "lay";
      const rx = sitting ? 22 : 14;
      const ry = sitting ?  7 :  5;
      drawContactShadow(ctx, x, y + 1, rx, ry, 0.6);

      let arc = 0;
      if (p.action === "walk" && p.stepAt != null) {
        const hopT = (now - p.stepAt) / STEP_MS;
        arc = -Math.sin(hopT * Math.PI) * 2;
      }

      if (nick === self) {
        ctx.save();
        ctx.strokeStyle = "rgba(242,184,75,.85)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(x, y + 1, 14, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.drawImage(sprite,
        x - PLAYER_ANCHOR_X,
        y - PLAYER_ANCHOR_Y + arc,
        PLAYER_SPRITE_W,
        PLAYER_SPRITE_H);

      if (cfg.names) {
        ctx.font = NAME_FONT;
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(0,0,0,.8)";
        ctx.fillText(p.name, x + 1, y + 18);
        ctx.fillStyle = "#fff";
        ctx.fillText(p.name, x, y + 17);
      }

      if (cfg.bubbles && p.bubble && now < p.until) {
        drawSpeechBubble(x, y, p.bubble);
      }
    } catch (err) {
      console.error("[lobby] drawPlayer failed for", nick, err);
    }
  }

  function drawSpeechBubble(x, y, text) {
    ctx.font = "14px system-ui, sans-serif";
    const txt = text.length > 40 ? text.slice(0, 39) + "…" : text;
    const tw = ctx.measureText(txt).width;
    const w = tw + 32, h = 38;
    const bx = x - w / 2, by = y - 90;
    ctx.fillStyle = "rgba(0,0,0,.4)";
    roundRect(ctx, bx + 2, by + 2, w, h, 10); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx, by, w, h, 10); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 7, by + h); ctx.lineTo(x, by + h + 12); ctx.lineTo(x + 7, by + h);
    ctx.closePath();
    ctx.fillStyle = "#fff"; ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 7, by + h - 1); ctx.lineTo(x + 7, by + h - 1);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = "#1a1a1a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(txt, x, by + h / 2 + 1);
    ctx.textBaseline = "alphabetic";
  }

  function updatePlayerFacing(player, dx, dy) {
    if (Math.abs(dx) + Math.abs(dy) < 0.001) return;
    const sx = (dx - dy) * 0.5;
    const sy = (dx + dy) * 0.25;
    const magX = Math.abs(sx), magY = Math.abs(sy);
    if (magX < 0.0001 && magY < 0.0001) return;

    let side;
    if (magX < magY * 0.35) {
      side = (player.facing && player.facing.slice(-4) === "left") ? "left" : "right";
    } else {
      side = sx < 0 ? "left" : "right";
    }

    let row;
    if (magY < magX * 0.35) row = "side";
    else                    row = sy > 0 ? "front" : "back";

    player.facing = row + "-" + side;
  }

  function startAction(nick, actionId, opts, broadcast) {
    const p = players[nick];
    if (!p) return;
    const def = ACTIONS[actionId];
    if (!def) return;
    p.path = null; p.pathIndex = 0; p.stepAt = null;
    if (def.returnsToPrevious) {
      if (!p.actionPrev || p.actionPrev === "idle") p.actionPrev = p.action || "idle";
    } else p.actionPrev = null;
    applyActionState(p, actionId, opts || {});
    if (broadcast && nick === self) {
      send({ t: "action", action: actionId, furniture_id: opts && opts.furnitureId || null, ts: Date.now() });
    }
  }
  function stopAction(nick, broadcast) {
    const p = players[nick]; if (!p) return;
    applyActionState(p, "idle", {});
    if (broadcast && nick === self) send({ t: "action", action: "idle", ts: Date.now() });
  }
  function applyActionState(p, actionId, opts) {
    const def = ACTIONS[actionId] || ACTIONS.idle;
    p.action = actionId; p.actionStartedAt = Date.now();
    p.actionDuration = def.duration || 0; p.actionLoop = !!def.loop;
    p.movementLocked = !!def.movementLocked;
    p.targetFurnitureId = opts && opts.furnitureId || null;
  }
  function tickActions(now) {
    Object.keys(players).forEach(nick => {
      const p = players[nick];
      if (!p.action) p.action = "idle";
      const def = ACTIONS[p.action];
      if (!def || def.loop || !def.duration) return;
      if (now - (p.actionStartedAt || 0) < def.duration) return;
      if (def.returnsToPrevious) { applyActionState(p, p.actionPrev || "idle", {}); p.actionPrev = null; }
      else applyActionState(p, "idle", {});
    });
  }

  function getFurnitureId(f, idx) { return currentRoom + ":" + idx; }
  function getFurnitureById(id) {
    if (!id) return null;
    const parts = id.split(":");
    if (parts.length !== 2) return null;
    const [roomId, idxStr] = parts;
    if (roomId !== currentRoom) return null;
    const idx = Number(idxStr);
    const R = ROOMS[currentRoom];
    if (!R || !R.furniture || !R.furniture[idx]) return null;
    return R.furniture[idx];
  }
  function getFurnitureAllowedActions(f) {
    if (!f) return [];
    const def = MOBI_CATALOG[f.defId];
    return (def && def.actions) || [];
  }
  function findInteractionTile(f) {
    const def = MOBI_CATALOG[f.defId];
    if (!def) return null;
    const w = def.w, h = def.h;
    const offsets = [];
    if (def.sitOffset) offsets.push(def.sitOffset);
    offsets.push({ x: 0, y: 1 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: -1 });
    const anchorTx = Math.floor(f.x / TILE), anchorTy = Math.floor(f.y / TILE);
    const wTiles = Math.max(1, Math.ceil(w / TILE)), hTiles = Math.max(1, Math.ceil(h / TILE));
    for (let k = 0; k < offsets.length; k++) {
      const off = offsets[k];
      let tx, ty;
      if (off.x > 0) { tx = anchorTx + wTiles; ty = anchorTy; }
      else if (off.x < 0) { tx = anchorTx - 1; ty = anchorTy; }
      else if (off.y > 0) { tx = anchorTx; ty = anchorTy + hTiles; }
      else { tx = anchorTx; ty = anchorTy - 1; }
      if (off.y !== 0) tx = anchorTx + Math.floor(wTiles / 2);
      if (off.x !== 0) ty = anchorTy + Math.floor(hTiles / 2);
      if (isWalkable(tx, ty)) return { x: tx, y: ty };
    }
    return null;
  }
  function hitFurniture(u, v) {
    const R = ROOMS[currentRoom];
    if (!R || !R.furniture) return null;
    let best = null;
    R.furniture.forEach((f, idx) => {
      const bbox = mobiBBox(f);
      if (!bbox || bbox.def.flat) return;
      const inX = u >= bbox.x && u <= bbox.x + bbox.w;
      const inY = v >= bbox.y - 40 && v <= bbox.y + bbox.h + 12;
      if (inX && inY) {
        if (!best || (bbox.x + bbox.y + bbox.w + bbox.h) > best.sort) {
          best = { furniture: f, idx, sort: bbox.x + bbox.y + bbox.w + bbox.h };
        }
      }
    });
    return best ? { furniture: best.furniture, id: getFurnitureId(best.furniture, best.idx) } : null;
  }
  function interactWithFurniture(nick, furnitureId, preferredAction) {
    const p = players[nick], f = getFurnitureById(furnitureId);
    if (!p || !f) return false;
    const allowed = getFurnitureAllowedActions(f);
    const actionId = preferredAction && allowed.indexOf(preferredAction) >= 0 ? preferredAction : (allowed[0] || null);
    if (!actionId) return false;
    const tile = findInteractionTile(f);
    if (!tile) return false;
    const fromTile = tileOfWorld(p.x, p.y);
    const path = findPath(fromTile, tile);
    if (!path || path.length < 2) {
      if (fromTile.x === tile.x && fromTile.y === tile.y) {
        startAction(nick, actionId, { furnitureId }, true); return true;
      }
      return false;
    }
    setPlayerPath(nick, path);
    p.pendingAction = { action: actionId, opts: { furnitureId } };
    return true;
  }

  const ACTION_MENU_CSS = `
    .actm-backdrop{position:absolute;inset:0;z-index:22;background:transparent}
    .actm{position:absolute;z-index:23;display:grid;grid-template-columns:repeat(3,minmax(70px,1fr));gap:6px;
      padding:10px;border:1px solid rgba(120,80,220,.5);border-radius:12px;
      background:linear-gradient(180deg,rgba(26,20,46,.96),rgba(16,12,32,.96));
      box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 16px 40px rgba(0,0,0,.7),0 0 0 1px rgba(120,80,220,.25)}
    .actm button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 6px;
      border:1px solid rgba(255,255,255,.08);border-radius:8px;
      background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));
      color:#e7e3ff;font-size:.7rem;font-weight:600;letter-spacing:.02em;cursor:pointer}
    .actm button:hover{background:linear-gradient(180deg,rgba(150,110,255,.25),rgba(120,80,220,.12));border-color:rgba(160,120,255,.5)}
    .actm button[aria-pressed="true"]{border-color:#a07bff;box-shadow:0 0 0 1px #a07bff,0 0 12px rgba(160,120,255,.35)}
    .actm-ico{font-size:1.15rem;line-height:1}
    .actm-lbl{font-size:.66rem;opacity:.9;letter-spacing:.03em}
    .actm-title{grid-column:1/-1;padding:0 2px 4px;color:#b9aefc;font-size:.64rem;font-weight:700;
      letter-spacing:.08em;text-transform:uppercase}
  `;
  let actmStylesInjected = false;
  function injectActionMenuStyles() {
    if (actmStylesInjected) return;
    if (!document.getElementById("lobby-actm-styles")) {
      const s = document.createElement("style"); s.id = "lobby-actm-styles"; s.textContent = ACTION_MENU_CSS;
      document.head.appendChild(s);
    }
    actmStylesInjected = true;
  }
  function openActionMenu() {
    if (actionMenuEl || !wrapEl) return;
    injectActionMenuStyles();
    const backdrop = mkEl("div", null, "actm-backdrop");
    backdrop.addEventListener("click", closeActionMenu);
    const menu = mkEl("div", null, "actm");
    menu.append(mkEl("div", "Ações", "actm-title"));
    const myAction = (players[self] && players[self].action) || "idle";
    MENU_ACTIONS.forEach(id => {
      const def = ACTIONS[id]; if (!def) return;
      const b = mkEl("button"); b.type = "button";
      b.setAttribute("aria-pressed", String(myAction === id));
      b.append(mkEl("span", def.icon, "actm-ico"), mkEl("span", def.name, "actm-lbl"));
      b.addEventListener("click", () => {
        closeActionMenu();
        if (self) {
          const p = players[self];
          if (p && p.action === id) stopAction(self, true);
          else startAction(self, id, {}, true);
        }
      });
      menu.append(b);
    });
    wrapEl.appendChild(backdrop); wrapEl.appendChild(menu);
    const wrapW = wrapEl.clientWidth || VIEW_W;
    menu.style.left = Math.max(8, (wrapW - 260) / 2) + "px";
    menu.style.bottom = "80px"; menu.style.width = "260px";
    actionMenuEl = { backdrop, menu };
  }
  function closeActionMenu() {
    if (!actionMenuEl) return;
    actionMenuEl.backdrop.remove(); actionMenuEl.menu.remove();
    actionMenuEl = null;
  }

  function frame() {
    if (!ctx || !cv) return;
    if (staticLayerDirty || !staticLayer) buildStaticLayer();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    const now = Date.now();
    const dt  = lastFrameAt ? (now - lastFrameAt) / 1000 : 0;
    lastFrameAt = now;

    tickActions(now);
    ctx.save();
    try {
      ctx.translate(cam.x, cam.y);
      if (staticLayer) ctx.drawImage(staticLayer, ISO_BOUNDS.minX, ISO_BOUNDS.minY, ISO_BOUNDS.width, ISO_BOUNDS.height);

      Object.keys(players).forEach(nick => {
        const p = players[nick];
        if (p.path) { advancePlayer(p, now); return; }
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        if (d > 1 && !p.movementLocked) {
          const step = Math.min(d, 180 * dt);
          p.x += dx / d * step; p.y += dy / d * step;
          p.action = "walk";
          updatePlayerFacing(p, dx, dy);
        } else if (d > 0 && !p.movementLocked) {
          p.x = p.tx; p.y = p.ty;
        }
      });

      const me = players[self];
      const drawList = [];
      if (me && me.path && me.path.length) {
        const last = me.path[me.path.length - 1];
        drawList.push({ kind: "marker", sort: -9e5, data: { x: last.x * TILE, y: last.y * TILE } });
      }
      (ROOMS[currentRoom].furniture || []).forEach(f => {
        const bbox = mobiBBox(f);
        if (!bbox) { drawList.push({ kind: "furniture", sort: 0, data: f }); return; }
        // Janela (h=0) sempre na parede, atrás de tudo
        const isWall = bbox.def.h === 0;
        const sort = bbox.def.flat ? -1e6 : (isWall ? -5e5 : (f.x + bbox.def.w + f.y + bbox.def.h));
        drawList.push({ kind: "furniture", sort, data: f });
      });
      Object.keys(players).forEach(nick => {
        const p = players[nick];
        const zOffset = (p.action === "sit" || p.action === "lay") ? 24 : 0;
        drawList.push({ kind: "player", sort: p.x + p.y + zOffset, data: { nick, p } });
      });
      drawList.sort((a, b) => a.sort - b.sort);
      drawList.forEach(item => {
        try {
          if (item.kind === "furniture") drawFurniture(item.data);
          else if (item.kind === "player") drawPlayer(item.data.p, item.data.nick);
          else if (item.kind === "marker") {
            const i = item.data.x / TILE, j = item.data.y / TILE;
            poly([P(i * TILE, j * TILE), P((i + 1) * TILE, j * TILE),
                  P((i + 1) * TILE, (j + 1) * TILE), P(i * TILE, (j + 1) * TILE)],
                 "rgba(242,184,75,.25)", "#f2b84b");
          }
        } catch (e) { console.error("[lobby] item draw failed:", item.kind, e); }
      });

      if (me && !drag) {
        if (ISO_BOUNDS.width > VIEW_W || ISO_BOUNDS.height > VIEW_H) {
          const f = P(me.x, me.y);
          cam.x += (VIEW_W / 2 - f.x - cam.x) * 0.15;
          cam.y += (VIEW_H / 2 - f.y - cam.y) * 0.15;
          clampCamera();
        }
      }
    } finally { ctx.restore(); }
  }
  function loop() {
    if (!running) return;
    try { frame(); } catch (e) { console.error("[lobby]", e); }
    rafId = requestAnimationFrame(loop);
  }

  function setRoom(id, list) {
    if (!ROOMS[id]) return;
    currentRoom = id; players = {};
    staticLayerDirty = true; walkMapDirty = true;
    playerSpriteCache.clear();
    (list || []).forEach(addPlayer);
    const nameBar = $("roomNameBar");
    if (nameBar) nameBar.textContent = ROOMS[id].name;
    updateOnline(); center();
    if (onLog) onLog("Você entrou em " + ROOMS[id].name);
  }
  function addPlayer(p) {
    if (!p || !p.nick) return;
    const x = finite(Number(p.x) || 0), y = finite(Number(p.y) || 0);
    players[p.nick] = {
      x, y, tx: x, ty: y,
      fromX: x, fromY: y, toX: x, toY: y,
      name: p.name || p.nick, equip: p.equip || {}, figure: p.figure || "",
      bubble: "", until: 0, facing: "front-right",
      path: null, pathIndex: 0, stepAt: null,
      action: "idle", actionStartedAt: 0, actionDuration: 0, actionLoop: true,
      actionPrev: null, movementLocked: false, targetFurnitureId: null, pendingAction: null,
      avatar: (p.palette && p.palette.skin) ? { ...PALETTE_DEFAULT, ...p.palette } : null,
    };
    updateOnline();
  }
  function removePlayer(nick) { if (!players[nick]) return; delete players[nick]; updateOnline(); }

  function movePlayer(nick, x, y) {
    const p = players[nick]; if (!p) return;
    x = finite(Number(x) || 0); y = finite(Number(y) || 0);
    if (p.movementLocked && p.action !== "walk") { applyActionState(p, "idle", {}); p.actionPrev = null; }
    const fromTile = tileOfWorld(p.x, p.y);
    const toTile   = tileOfWorld(x, y);
    if (fromTile.x === toTile.x && fromTile.y === toTile.y) { p.tx = x; p.ty = y; return; }
    const path = findPath(fromTile, toTile);
    if (path && path.length > 1) setPlayerPath(nick, path);
  }

  function setLook(nick, equip) { const p = players[nick]; if (p) p.equip = equip || {}; }
  function setFigure(nick, figure) { const p = players[nick]; if (p) p.figure = figure || ""; }

  function setPalette(nick, palette) {
    const p = players[nick]; if (!p) return;
    p.avatar = { ...PALETTE_DEFAULT, ...(palette || {}) };
    playerSpriteCache.clear();
  }
  function setPalettePreset(nick, presetName) {
    const preset = PALETTE_PRESETS[presetName] || PALETTE_DEFAULT;
    setPalette(nick, preset);
  }

  function setChat(nick, text) { const p = players[nick]; if (p) { p.bubble = text; p.until = Date.now() + 6000; } }
  function setPlayerName(nick, name) { const p = players[nick]; if (p) p.name = name; }
  function setAction(nick, action, opts) {
    const p = players[nick]; if (!p) return;
    const def = ACTIONS[action]; if (!def) return;
    applyActionState(p, action, opts || {});
    if (def.returnsToPrevious && !p.actionPrev) p.actionPrev = "idle";
    p.actionStartedAt = (opts && opts.ts) || Date.now();
  }
  function updateOnline() {
    const el = $("roomOnlineBar"); if (!el) return;
    el.textContent = Object.keys(players).length + " online";
  }

  function hitPlayer(u, v) {
    let best = null;
    Object.keys(players).forEach(n => {
      const p = players[n], f = P(p.x, p.y);
      if (Math.abs(u - f.x) < 26 && v > f.y - 75 && v < f.y + 12) {
        if (!best || p.x + p.y > players[best].x + players[best].y) best = n;
      }
    });
    return best;
  }

  function mkEl(tag, text, cls) {
    const e = document.createElement(tag);
    if (text != null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  function onCanvasPointerDown(e) {
    closeActionMenu();
    cv.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  }
  function onCanvasPointerMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if (drag.moved) { cam.x = drag.cx + dx; cam.y = drag.cy + dy; clampCamera(); }
  }
  function onCanvasPointerUp(e) {
    if (!drag) return;
    const wasDrag = drag.moved; drag = null;
    if (wasDrag) return;
    const r = cv.getBoundingClientRect();
    const sx = (e.clientX - r.left) * (VIEW_W / r.width);
    const sy = (e.clientY - r.top)  * (VIEW_H / r.height);
    const u = sx - cam.x, v = sy - cam.y;

    const hitP = hitPlayer(u, v);
    if (hitP) { if (onPlayerClick) onPlayerClick(hitP); return; }

    const hitF = hitFurniture(u, v);
    if (hitF) {
      const allowed = getFurnitureAllowedActions(hitF.furniture);
      if (allowed.length && self) {
        const ok = interactWithFurniture(self, hitF.id, allowed[0]);
        if (!ok && onLog) onLog("Não consegui chegar até aí.");
      }
      return;
    }

    const wx = u + 2 * v, wy = 2 * v - u;
    if (wx < 0 || wx > WW || wy < 0 || wy > WH) return;
    const tileX = Math.floor(wx / TILE), tileY = Math.floor(wy / TILE);
    if (!isWalkable(tileX, tileY)) return;
    const me = players[self]; if (!me) return;
    if (me.movementLocked) {
      applyActionState(me, "idle", {}); me.actionPrev = null;
      if (self) send({ t: "action", action: "idle", ts: Date.now() });
    }
    const fromTile = tileOfWorld(me.x, me.y);
    const path = findPath(fromTile, { x: tileX, y: tileY });
    if (!path || path.length < 2) return;
    setPlayerPath(self, path);
    const end = path[path.length - 1];
    send({ t: "move", x: end.x * TILE + TILE / 2, y: end.y * TILE + TILE / 2 });
  }
  function onCanvasPointerCancel() { drag = null; }

  global.Lobby = {
    start(opts) {
      if (running) return this;
      $ = opts.$; send = opts.send; self = opts.self;
      shop = opts.shop || {}; onLog = opts.onLog || null; onPlayerClick = opts.onPlayerClick || null;
      cv = $("c"); if (!cv) return this;
      if (cv.dataset.lobbyStarted === "1") return this;
      cv.dataset.lobbyStarted = "1";
      wrapEl = $("wrap"); ctx = cv.getContext("2d");
      DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      running = true; fit();
      setTimeout(() => { fit(); center(); }, 60);
      window.addEventListener("resize", () => fit());
      cv.addEventListener("pointerdown", onCanvasPointerDown);
      cv.addEventListener("pointermove", onCanvasPointerMove);
      cv.addEventListener("pointerup", onCanvasPointerUp);
      cv.addEventListener("pointercancel", onCanvasPointerCancel);
      const centerBtn = $("centerBtn"); if (centerBtn) centerBtn.addEventListener("click", center);
      rafId = requestAnimationFrame(loop);
      return this;
    },
    stop() {
      running = false;
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
      if (cv) delete cv.dataset.lobbyStarted;
      closeActionMenu();
    },
    setSelf(n) { self = n; },
    setShop(s) { shop = s || {}; playerSpriteCache.clear(); },
    setConfig(c) { cfg = Object.assign({}, cfg, c); },
    setRoom, addPlayer, removePlayer, movePlayer,
    setLook, setFigure, setChat, setPlayerName, setAction,
    setAvatar: setPalette,
    setPalette,
    setPalettePreset,
    getPalettePresets() { return JSON.parse(JSON.stringify(PALETTE_PRESETS)); },
    getPaletteDefault() { return JSON.parse(JSON.stringify(PALETTE_DEFAULT)); },
    center, fit, focus() { fit(); center(); },
    startAction(nick, a, o) { startAction(nick || self, a, o || {}, true); },
    stopAction(nick) { stopAction(nick || self, true); },
    openActionMenu, closeActionMenu,
    getRoom() { return currentRoom; }, getRooms() { return ROOMS; },
    getPlayers() { return players; }, getSelf() { return self; },
    getActions() { return ACTIONS; },
    getMenuActions() { return MENU_ACTIONS.slice(); },
    getMobiCatalog() { return MOBI_CATALOG; },
    _stats() { return { running, DPR, self, playersCount: Object.keys(players).length,
      selfPlayer: players[self] || null, playerSprites: playerSpriteCache.size,
      staticLayerReady: !!staticLayer && !staticLayerDirty }; },
    _grid() { if (walkMapDirty) buildWalkMap();
      const rows = []; for (let y = 0; y < gridH; y++) {
        let row = ""; for (let x = 0; x < gridW; x++) row += walkMap[y * gridW + x] ? "#" : "."; rows.push(row);
      } return rows.join("\n"); },
    _debug(on) { debugGrid = on !== false; staticLayerDirty = true; },
    _findPath(tx0, ty0, tx1, ty1) { return findPath({ x: tx0, y: ty0 }, { x: tx1, y: ty1 }); },
    _interactFurniture(id, action) { return interactWithFurniture(self, id, action); },
  };
})(window);