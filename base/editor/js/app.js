/* SG Engine - editor (entrega 1: templates, fase, camera, transicoes, pack) */
"use strict";

const MD_W = 320, MD_H = 224;
const TEMPLATES = { beatemup: { name: "Beat'em up" } };
const MOVE_MODES = { "8dir": "8 direções", "4dir": "4 direções", side: "Lateral (2 direções)", plat: "Plataforma / Aventura" };
/* com profundidade = o personagem anda para o fundo da tela (eixo Y do chao) */
function hasDepth(p) { const m = (p || P).move; return m !== "side" && m !== "plat"; }
function isPlat(p) { return (p || P).move === "plat"; }
/* colisao do modo plataforma: 1 caractere por tile de 8x8 ("0" vazio, 1 solido, 2 plataforma, 3 escada, 4 perigo, 5 abismo) */
const COL_COLORS = { 6: "rgba(80,255,160,.6)", 1: "rgba(255,70,70,.42)", 2: "rgba(70,200,255,.55)", 3: "rgba(255,205,50,.5)", 4: "rgba(255,40,220,.5)", 5: "rgba(0,0,0,.6)" };
function colGrid(lay) {
  const tw = Math.ceil(lay.width / 8), th = Math.ceil(lay.height / 8);
  const c = lay.col;
  if (c && c.w === tw && c.h === th) return c;
  const d = new Array(tw * th).fill("0");
  if (c) for (let y = 0; y < Math.min(th, c.h); y++) for (let x = 0; x < Math.min(tw, c.w); x++) d[y * tw + x] = c.d[y * c.w + x];
  lay.col = { w: tw, h: th, d: d.join("") };
  return lay.col;
}
/* desenho padrao da colisao (modo plataforma): a engine desenha sozinha cada tipo de tile pintado.
 * Solidos = blocos de 16x16 (borda escura, X de canto a canto e quatro triangulos em cinzas). Quem quiser outro visual
 * desliga "Desenhar a colisao automaticamente" na fase e usa as proprias imagens de fundo. */
const COL_BLOCK = ["0000000000000000", "0011111111111100", "0201111111111020", "0220111111110220", "0222011111102220", "0222201111022220", "0222220110222220", "0222222002222220",
                   "0222222002222220", "0222220110222220", "0222201111022220", "0222011111102220", "0220111111110220", "0201111111111020", "0011111111111100", "0000000000000000"];
function drawColGraphics(g, lay) {
  const c = colGrid(lay), rgb = (r, gg, b) => `rgb(${MD.show(r)},${MD.show(gg)},${MD.show(b)})`;
  const BC = [rgb(1, 1, 1), rgb(2, 2, 2), rgb(3, 3, 3)], PLAT = rgb(5, 4, 2), LAD = rgb(6, 5, 1), SPIKE = rgb(6, 6, 6), PIT = rgb(0, 0, 0), LEDGE = rgb(2, 6, 3), WARN = rgb(7, 1, 1);
  const at = (x, y) => (x < 0 || y < 0 || x >= c.w || y >= c.h ? "0" : c.d[y * c.w + x]), solid = (x, y) => at(x, y) === "1" || at(x, y) === "6";
  // cada tile solido desenha o seu quarto do bloco 16x16 (alinhado na grade de 16): o desenho nunca passa da colisao pintada
  for (let ty = 0; ty < c.h; ty++) for (let tx = 0; tx < c.w; tx++) {
    if (!solid(tx, ty)) continue;
    const ox = (tx & 1) * 8, oy = (ty & 1) * 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = BC[+COL_BLOCK[oy + y][ox + x]]; g.fillRect(tx * 8 + x, ty * 8 + y, 1, 1); }
  }
  for (let ty = 0; ty < c.h; ty++) for (let tx = 0; tx < c.w; tx++) {
    const v = at(tx, ty), X = tx * 8, Y = ty * 8;
    if (v === "6") { g.fillStyle = LEDGE; g.fillRect(X, Y, 8, 3); }                       // borda de agarrar: faixa verde em cima
    else if (v === "2") { g.fillStyle = PLAT; g.fillRect(X, Y, 8, 8); }                    // plataforma atravessavel: uma cor so
    else if (v === "3") { g.fillStyle = LAD; if (at(tx - 1, ty) !== "3") g.fillRect(X + 1, Y, 2, 8); if (at(tx + 1, ty) !== "3") g.fillRect(X + 5, Y, 2, 8); g.fillRect(X, Y + 3, 8, 1); }
    else if (v === "4") { g.fillStyle = SPIKE; for (let i = 0; i < 8; i += 4) { g.fillRect(X + i + 1, Y + 4, 2, 4); g.fillRect(X + i + 1.5, Y + 1, 1, 3); } }
    else if (v === "5") { g.fillStyle = PIT; g.fillRect(X, Y, 8, 8); if (at(tx, ty - 1) !== "5") { g.fillStyle = WARN; g.fillRect(X, Y, 4, 2); } }   // abismo: preto com aviso vermelho em cima
  }
}
const colCache = new Map();
function colCanvas(lay) {
  const c = colGrid(lay), k = c.w + "x" + c.h + ":" + c.d, hit = colCache.get(lay.id);
  if (hit && hit.k === k) return hit.cv;
  const cv = document.createElement("canvas"); cv.width = c.w * 8; cv.height = c.h * 8;
  drawColGraphics(cv.getContext("2d"), lay); colCache.set(lay.id, { k, cv }); return cv;
}
/* desenho de exemplo (feito por codigo): marcado com ph; em projetos antigos reconhece pelo tamanho/ancora dos quadros de exemplo (56x56, pes em y 55) */
function isPlaceholderFrame(f) { return !!f && (f.ph === true || (f.w === 56 && f.h === 56 && f.ay === 55 && (f.ax === 20 || f.ax === 28))); }
function colPaint(x0, y0, x1, y1, v) {
  const c = colGrid(L), d = c.d.split("");
  for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(c.h - 1, Math.max(y0, y1)); y++) for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(c.w - 1, Math.max(x0, x1)); x++) d[y * c.w + x] = String(v);
  c.d = d.join("");
}
const CAM_MODES = { follow: "Segue o jogador", lerp: "Segue com atraso (lerp)", fixed: "Fixa" };
const TRANSITIONS = {
  cut: "Corte seco",
  fade_black: "Fade para preto",
  fade_white: "Fade para branco",
  mosaic: "Pixelar (mosaico)",
  iris: "Íris (fecha e abre)",
  blinds: "Persiana",
  scroll: "Rolagem contínua",
};
const AUTOSAVE = "sgengine.autosave";

/* ------------------------------------------------------------------ estado */
let P = null;            // projeto
let L = null;            // fase (layout) aberta
const images = {};       // id -> {img: HTMLCanvasElement (convertida)}
const SRC = {};          // id -> dataURL da imagem (imutavel: editar cria id novo)
const hist = { list: [], pos: -1, lock: false };
const ui = {
  tool: "select", zoom: 2, panX: 40, panY: 40,
  sel: null,             // {kind: 'zone'|'bg'|'trans'|'spawn'|'layout', id}
  layer: "camera",
  layers: { background: { vis: true, lock: false }, objects: { vis: true, lock: false }, camera: { vis: true, lock: false } },
  drag: null, transFrom: null, mouse: { x: 0, y: 0 },
};

const $ = (s) => document.querySelector(s);
const uid = (p) => p + Math.random().toString(36).slice(2, 8);
const snap = (v, s = 8) => Math.round(v / s) * s;

function newProject(name, template, move) {
  const lay = {
    id: uid("lay_"), name: "Fase 1", width: 1280, height: MD_H, bgColor: "#202040",
    backgrounds: [], zones: [], transitions: [], spawn: { x: 48, y: move === "side" || move === "plat" ? 200 : 190 },
  };
  lay.zones.push({ id: uid("cam_"), name: "Área 1", x: 0, y: 0, w: 640, h: MD_H, mode: "follow", lerp: 0.15, delay: 0, lockY: true, lockScroll: false });
  lay.groups = []; lay.instances = []; lay.objs = [];
  return { format: "sgengine-pack", version: 1, name, template, move, layouts: [lay], images: {}, actors: {} };
}

/* ------------------------------------------------------------------ tela inicial */
$("#btn-create").addEventListener("click", () => {
  const move = document.querySelector("input[name=move]:checked").value;
  P = newProject($("#np-name").value.trim() || "Meu jogo", "beatemup", move);
  Placeholders.create();
  openEditor();
});
$("#btn-open-start").onclick = () => $("#file-zip").click();
if (localStorage.getItem(AUTOSAVE)) {
  $("#btn-continue").classList.remove("hidden");
  $("#btn-continue").onclick = async () => {
    const d = JSON.parse(localStorage.getItem(AUTOSAVE));
    if (d.P) await loadProjectJSON(d.P, d.SRC); else await loadProjectJSON(d);   // formato antigo
    openEditor();
  };
}

function openEditor() {
  setTimeout(() => typeof MemMeter !== "undefined" && MemMeter.run(), 300);
  $("#start").classList.add("hidden");
  $("#app").classList.remove("hidden");
  L = P.layouts[0];
  migrateTemplate();
  $("#tpl-badge").textContent = isPlat() ? MOVE_MODES[P.move] : TEMPLATES[P.template].name + " · " + MOVE_MODES[P.move];
  document.querySelectorAll(".plat-only").forEach((el) => el.classList.toggle("hidden", !isPlat()));
  if (typeof colPalSync === "function") colPalSync();
  ui.sel = { kind: "layout", id: L.id };
  P.actors = P.actors || {};
  L.instances = L.instances || [];
  P.layouts.forEach((l) => { l.groups = l.groups || []; l.instances = l.instances || []; l.objs = l.objs || []; });
  migrateDrops();
  hist.list = [JSON.stringify(P)]; hist.pos = 0;
  resize();
  fit();
  refresh();
}

/* ------------------------------------------------------------------ desfazer / refazer */
function histPush() {
  if (hist.lock) return;
  const s = JSON.stringify(P);
  if (s === hist.list[hist.pos]) return;
  hist.list = hist.list.slice(0, hist.pos + 1);
  hist.list.push(s);
  if (hist.list.length > 200) hist.list.shift();
  hist.pos = hist.list.length - 1;
}
function histGo(d) {
  const n = hist.pos + d;
  if (n < 0 || n >= hist.list.length) { status(d < 0 ? "Nada para desfazer." : "Nada para refazer."); return; }
  hist.pos = n;
  const lid = L && L.id;
  P = JSON.parse(hist.list[n]);
  L = P.layouts.find((l) => l.id === lid) || P.layouts[0];
  L.instances = L.instances || [];
  // a selecao pode apontar para algo que nao existe mais
  if (ui.sel && ui.sel.id && !findSel()) ui.sel = { kind: "layout", id: L.id };
  hist.lock = true; autosave(); refresh(); hist.lock = false;
  if (window.AnimEditor && AnimEditor.isOpen()) AnimEditor.reload();
  status(d < 0 ? "Desfeito." : "Refeito.");
}
function findSel() {
  const s = ui.sel;
  if (s.kind === "zone") return zoneById(s.id);
  if (s.kind === "trans") return L.transitions.find((t) => t.id === s.id);
  if (s.kind === "bg") return L.backgrounds.find((b) => b.id === s.id);
  if (s.kind === "inst") return L.instances.find((i) => i.id === s.id);
  if (s.kind === "group") return groupById(s.id);
  if (s.kind === "sobj") return sobjById(s.id);
  if (s.kind === "actor") return P.actors[s.id];
  return true;
}

/* ------------------------------------------------------------------ menus */
document.querySelectorAll("[data-menu]").forEach((b) => b.addEventListener("click", (e) => {
  e.stopPropagation();
  $("#menu-" + b.dataset.menu).classList.toggle("open");
}));
document.addEventListener("click", () => document.querySelectorAll(".dropdown").forEach((d) => d.classList.remove("open")));
document.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => action(b.dataset.act)));

function action(a) {
  if (a === "new") { if (confirm("Começar um projeto novo? O atual fica salvo só se você exportou o pack.")) location.reload(); }
  if (a === "open") $("#file-zip").click();
  if (a === "save") savePack();
  if (a === "import-bg") $("#file-img").click();
  if (a === "rom") exportROM();
  if (a === "undo") histGo(-1);
  if (a === "redo") histGo(1);
}

document.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
function setTool(t) {
  ui.tool = t;
  if (typeof colPalSync === "function") setTimeout(colPalSync, 0);
  ui.transFrom = null;
  document.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === t));
  if (t === "camera" || t === "transition") ui.layer = "camera";
  if (t === "spawn") ui.layer = "objects";
  if (t === "col") { ui.layer = "collision"; (ui.layers.collision = ui.layers.collision || { vis: true, lock: false }).vis = true; }
  status({
    select: "Clique para selecionar, arraste para mover. Arraste os cantos de uma área para redimensionar.",
    camera: "Arraste no canvas para desenhar uma área de câmera.",
    transition: "Clique na área de origem e depois na área de destino.",
    spawn: "Clique onde o jogador começa.",
    pan: "Arraste para mover a vista. Roda do mouse = zoom.",
    col: "Pinte a colisão: clique/arraste pinta o tipo escolhido · botão direito apaga · Shift+arrastar pinta um retângulo · teclas 1-5 trocam o tipo.",
  }[t]);
  refresh();
}
function status(t) { $("#status").textContent = t || ""; }

/* ------------------------------------------------------------------ canvas */
const cv = $("#cv"), g = cv.getContext("2d");
function resize() {
  const r = $("#viewport").getBoundingClientRect();
  cv.width = Math.max(1, r.width); cv.height = Math.max(1, r.height);
  draw();
}
window.addEventListener("resize", resize);
function fit() {
  const r = $("#viewport").getBoundingClientRect();
  ui.zoom = Math.max(0.25, Math.min(4, Math.floor(Math.min((r.width - 40) / L.width, (r.height - 40) / L.height) * 4) / 4));
  ui.panX = Math.round((r.width - L.width * ui.zoom) / 2);
  ui.panY = Math.round((r.height - L.height * ui.zoom) / 2);
  draw();
}
function setZoom(z, cx, cy) {
  z = Math.max(0.25, Math.min(8, z));
  const r = $("#viewport").getBoundingClientRect();
  cx = cx ?? r.width / 2; cy = cy ?? r.height / 2;
  const wx = (cx - ui.panX) / ui.zoom, wy = (cy - ui.panY) / ui.zoom;
  ui.zoom = z;
  ui.panX = cx - wx * z; ui.panY = cy - wy * z;
  $("#zoom-v").textContent = Math.round(z * 100) + "%";
  draw();
}
$("#zoom-in").onclick = () => setZoom(ui.zoom * 1.25);
$("#zoom-out").onclick = () => setZoom(ui.zoom / 1.25);
$("#zoom-fit").onclick = fit;
const toWorld = (sx, sy) => ({ x: (sx - ui.panX) / ui.zoom, y: (sy - ui.panY) / ui.zoom });

function draw() {
  if (!L) return;
  const Z = ui.zoom;
  g.imageSmoothingEnabled = false;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = "#121316"; g.fillRect(0, 0, cv.width, cv.height);
  g.setTransform(Z, 0, 0, Z, ui.panX, ui.panY);
  // fundo da fase
  g.fillStyle = L.bgColor; g.fillRect(0, 0, L.width, L.height);
  ui.layers.front = ui.layers.front || { vis: true, lock: false };
  [["B", "background"], ["A", "front"]].forEach(([pl, k]) => {
    if (ui.layers[k].vis) L.backgrounds.filter((b) => (b.plane || "B") === pl).forEach((b) => { const im = images[b.image]; if (im) g.drawImage(im.img, b.x, b.y); });
  });
  // grade de tiles (8px) e de telas (320x224)
  g.lineWidth = 1 / Z;
  if (Z >= 2) {
    g.strokeStyle = "rgba(255,255,255,.05)";
    g.beginPath();
    for (let x = 0; x <= L.width; x += 8) { g.moveTo(x, 0); g.lineTo(x, L.height); }
    for (let y = 0; y <= L.height; y += 8) { g.moveTo(0, y); g.lineTo(L.width, y); }
    g.stroke();
  }
  g.strokeStyle = "rgba(255,255,255,.18)"; g.setLineDash([4 / Z, 4 / Z]);
  g.beginPath();
  for (let x = MD_W; x < L.width; x += MD_W) { g.moveTo(x, 0); g.lineTo(x, L.height); }
  for (let y = MD_H; y < L.height; y += MD_H) { g.moveTo(0, y); g.lineTo(L.width, y); }
  g.stroke(); g.setLineDash([]);
  g.strokeStyle = "#888"; g.strokeRect(0, 0, L.width, L.height);

  // desenho padrao da colisao (o mesmo que vai para a ROM)
  if (isPlat() && L.autoCol !== false) g.drawImage(colCanvas(L), 0, 0);
  // colisao do modo plataforma: com o desenho automatico ligado, as cores por cima so aparecem na ferramenta Colisao
  if (isPlat() && (ui.layers.collision || { vis: true }).vis && (L.autoCol === false || ui.tool === "col")) {
    const c = colGrid(L);
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
      const v = c.d[y * c.w + x]; if (v === "0") continue;
      g.fillStyle = COL_COLORS[v];
      if (v === "2") g.fillRect(x * 8, y * 8, 8, 3);
      else if (v === "3") { g.fillRect(x * 8 + 1, y * 8, 1.5, 8); g.fillRect(x * 8 + 5.5, y * 8, 1.5, 8); g.fillRect(x * 8 + 1, y * 8 + 3, 6, 1.5); }
      else if (v === "6") { g.fillStyle = COL_COLORS[1]; g.fillRect(x * 8, y * 8, 8, 8); g.fillStyle = COL_COLORS[6]; g.fillRect(x * 8, y * 8, 8, 3); g.fillRect(x * 8 + 2.5, y * 8, 3, 8); }
      else g.fillRect(x * 8, y * 8, 8, 8);
    }
    const d = ui.drag;
    if (d && d.type === "colrect") { g.strokeStyle = "#fff"; g.lineWidth = 1 / Z; const m = ui.mouse; g.strokeRect(Math.min(d.tx, m.x >> 3) * 8, Math.min(d.ty, m.y >> 3) * 8, (Math.abs((m.x >> 3) - d.tx) + 1) * 8, (Math.abs((m.y >> 3) - d.ty) + 1) * 8); }
  }
  // faixa de chao (template com profundidade)
  // limites do chao: linhas vermelhas (so no editor; arraste para ajustar)
  L.floor = L.floor || (hasDepth() ? { top: 150, bottom: 212 } : { top: 200, bottom: 200 });
  if (hasDepth()) { g.fillStyle = "rgba(209,32,43,.06)"; g.fillRect(0, L.floor.top, L.width, L.floor.bottom - L.floor.top); }
  floorLines().forEach(([k, y, txt]) => {
    const hot = ui.drag && ui.drag.type === "floor" && ui.drag.key === k;
    g.strokeStyle = "#ff3b44"; g.lineWidth = (hot ? 2.5 : 1.5) / Z; g.setLineDash([6 / Z, 4 / Z]);
    g.beginPath(); g.moveTo(0, y + .5); g.lineTo(L.width, y + .5); g.stroke(); g.setLineDash([]);
    label(`${txt} (y ${y})`, Math.max(4, -ui.panX / Z + 4), y - 3, "#ff6b72");   /* rotulo sempre visivel na esquerda da vista */
  });

  // objetos
  if (ui.layers.objects.vis) {
    const s = L.spawn, pa = screenTypeOf(L) ? null : playerActor(), pf = pa && actorThumbFrame(pa);   // tela: sem jogador
    if (pf && images[pf.img]) { g.globalAlpha = .9; g.drawImage(images[pf.img].img, s.x - pf.ax, s.y - pf.ay); g.globalAlpha = 1; }
    if (pf && ui.showBoxes) drawBoxes(pf, s.x, s.y, false);
    g.fillStyle = "#ffb84a"; g.strokeStyle = "#000";
    g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - 6, s.y - 14); g.lineTo(s.x + 6, s.y - 14); g.closePath(); g.fill(); g.stroke();
    g.fillRect(s.x - 1, s.y - 34, 2, 20);
    g.fillRect(s.x + 1, s.y - 34, 12, 8);

    if (isSel("spawn")) selBox(s.x - 8, s.y - 36, 22, 37);
  }

  // instancias de atores
  if (ui.layers.objects.vis) {
    [...L.instances].sort((a, b) => a.y - b.y).forEach((it) => {
      const a = P.actors[it.actor]; if (!a) return;
      const fr = actorThumbFrame(a), im = fr && images[fr.img];
      if (im) {
        g.save(); g.translate(it.x, it.y); g.scale(it.flip ? -1 : 1, it.vflip ? -1 : 1); if (it.visible === false) g.globalAlpha = .3;
        g.drawImage(im.img, -fr.ax, -fr.ay); g.restore();
      } else { g.fillStyle = "#c06"; g.fillRect(it.x - 8, it.y - 16, 16, 16); }
      if (ui.showBoxes) drawBoxes(fr, it.x, it.y, it.flip);
      if (isSel("inst", it.id)) { const b = instBox(it); selBox(b.x, b.y, b.w, b.h); }

    });
  }

  if (ui.layers.objects.vis) { drawGroups(); drawSobjs(); }
  // camera
  if (ui.layers.camera.vis) {
    L.zones.forEach((z, i) => {
      const sel = isSel("zone", z.id);
      g.fillStyle = sel ? "rgba(57,217,138,.12)" : "rgba(57,217,138,.05)";
      g.fillRect(z.x, z.y, z.w, z.h);
      g.strokeStyle = "#39d98a"; g.lineWidth = (sel ? 2 : 1) / Z;
      g.strokeRect(z.x, z.y, z.w, z.h);
      // tela inicial da camera dentro da area
      g.setLineDash([3 / Z, 3 / Z]); g.strokeStyle = "rgba(57,217,138,.6)";
      g.strokeRect(z.x, z.y, Math.min(MD_W, z.w), Math.min(MD_H, z.h));
      g.setLineDash([]);
      if (sel) label(`${z.name} · ${CAM_MODES[z.mode]}`, z.x + 3, z.y + 10, "#39d98a");
      if (sel) handles(z);
    });
    L.transitions.forEach((t) => {
      const a = zoneById(t.from), b = zoneById(t.to);
      if (!a || !b) return;
      const p = transPoint(t);
      g.strokeStyle = isSel("trans", t.id) ? "#fff" : "#4a9eff"; g.lineWidth = 2 / Z;
      g.beginPath(); g.moveTo(a.x + a.w / 2, a.y + a.h / 2); g.lineTo(p.x, p.y); g.lineTo(b.x + b.w / 2, b.y + b.h / 2); g.stroke();
      g.fillStyle = "#4a9eff"; g.beginPath(); g.arc(p.x, p.y, 7, 0, 7); g.fill();
      label(TRANSITIONS[t.type], p.x + 9, p.y + 3, "#4a9eff");
    });
    if (ui.transFrom) {
      const a = zoneById(ui.transFrom);
      g.strokeStyle = "#4a9eff"; g.setLineDash([4 / Z, 4 / Z]);
      g.beginPath(); g.moveTo(a.x + a.w / 2, a.y + a.h / 2); g.lineTo(ui.mouse.x, ui.mouse.y); g.stroke(); g.setLineDash([]);
    }
  }
  // fundo selecionado
  if (ui.sel && ui.sel.kind === "bg") {
    const b = L.backgrounds.find((x) => x.id === ui.sel.id), im = b && images[b.image];
    if (im) selBox(b.x, b.y, im.img.width, im.img.height);
  }
  // retangulo sendo desenhado
  if (ui.drag && ui.drag.type === "newzone") {
    const r = normRect(ui.drag.x0, ui.drag.y0, ui.mouse.x, ui.mouse.y);
    g.strokeStyle = "#39d98a"; g.setLineDash([4 / Z, 4 / Z]); g.strokeRect(r.x, r.y, r.w, r.h); g.setLineDash([]);
  }
}
function label(t, x, y, c) {
  const Z = ui.zoom;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.font = "12px system-ui"; g.fillStyle = "rgba(0,0,0,.6)";
  const sx = x * Z + ui.panX, sy = y * Z + ui.panY, w = g.measureText(t).width;
  g.fillRect(sx - 2, sy - 11, w + 4, 15); g.fillStyle = c; g.fillText(t, sx, sy);
  g.restore();
}
function selBox(x, y, w, h) { g.strokeStyle = "#fff"; g.lineWidth = 1 / ui.zoom; g.setLineDash([3 / ui.zoom, 3 / ui.zoom]); g.strokeRect(x - 1, y - 1, w + 2, h + 2); g.setLineDash([]); }
function handlePts(z) { return [[z.x, z.y], [z.x + z.w, z.y], [z.x, z.y + z.h], [z.x + z.w, z.y + z.h]]; }
function handles(z) { const s = 6 / ui.zoom; g.fillStyle = "#fff"; handlePts(z).forEach(([x, y]) => g.fillRect(x - s / 2, y - s / 2, s, s)); }
const isSel = (k, id) => ui.sel && ui.sel.kind === k && (id === undefined || ui.sel.id === id);
const zoneById = (id) => L.zones.find((z) => z.id === id);
function normRect(x0, y0, x1, y1) { const x = Math.min(x0, x1), y = Math.min(y0, y1); return { x, y, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }; }
function transPoint(t) {
  const a = zoneById(t.from), b = zoneById(t.to);
  return { x: (a.x + a.w / 2 + b.x + b.w / 2) / 2, y: (a.y + a.h / 2 + b.y + b.h / 2) / 2 };
}

/* ------------------------------------------------------------------ mouse */
/* caixas do frame (corpo em azul, golpe em vermelho) desenhadas na fase; so no editor */
ui.showBoxes = true;
function drawBoxes(f, x, y, flip) {
  if (!f) return;
  [["hurt", "rgba(74,168,255,.9)", "rgba(74,168,255,.12)"], ["hit", "rgba(255,74,74,.95)", "rgba(255,74,74,.18)"]].forEach(([k, line, fill]) => {
    const b = f[k]; if (!b || !b.w) return;
    const bx = flip ? x + f.ax - b.x - b.w : x - f.ax + b.x, by = y - f.ay + b.y;
    g.fillStyle = fill; g.fillRect(bx, by, b.w, b.h);
    g.strokeStyle = line; g.lineWidth = 1 / ui.zoom; g.strokeRect(bx, by, b.w, b.h);
  });
}
/* linhas do chao: [chave, y, rotulo] */
function floorLines() {
  if (!L || !L.floor || isPlat()) return [];
  return hasDepth() ? [["top", L.floor.top, "Topo do chão"], ["bottom", L.floor.bottom, "Base do chão"]] : [["top", L.floor.top, "Linha do chão"]];
}
function hit(w) {
  const tol = 6 / ui.zoom;
  if (ui.layers.camera.vis && !ui.layers.camera.lock) {
    for (const t of L.transitions) { const p = transPoint(t); if (Math.hypot(p.x - w.x, p.y - w.y) < 9) return { kind: "trans", id: t.id }; }
    const s = ui.sel && ui.sel.kind === "zone" && zoneById(ui.sel.id);
    if (s) { const i = handlePts(s).findIndex(([x, y]) => Math.abs(x - w.x) < tol && Math.abs(y - w.y) < tol); if (i >= 0) return { kind: "zone", id: s.id, handle: i }; }
  }
  if (ui.layers.objects.vis && !ui.layers.objects.lock) {
    const sg = ui.sel && ui.sel.kind === "group" && groupById(ui.sel.id);
    const so = ui.sel && ui.sel.kind === "sobj" && sobjById(ui.sel.id);
    if (so && SOBJ[so.type].shape === "rect") { const i = handlePts(so).findIndex(([x, y]) => Math.abs(x - w.x) < tol && Math.abs(y - w.y) < tol); if (i >= 0) return { kind: "sobj", id: so.id, handle: i }; }
    if (sg) { const i = handlePts(sg).findIndex(([x, y]) => Math.abs(x - w.x) < tol && Math.abs(y - w.y) < tol); if (i >= 0) return { kind: "group", id: sg.id, handle: i }; }
    for (let i = L.instances.length - 1; i >= 0; i--) {
      const it = L.instances[i], b = instBox(it);
      if (w.x >= b.x && w.x < b.x + b.w && w.y >= b.y && w.y < b.y + b.h) return { kind: "inst", id: it.id };
    }
    const s = L.spawn; if (w.x > s.x - 8 && w.x < s.x + 14 && w.y > s.y - 36 && w.y < s.y + 1) return { kind: "spawn" };
    const sh = hitSobj(w); if (sh) return { kind: "sobj", id: sh.id };
    const gh = hitGroup(w); if (gh) return { kind: "group", id: gh.id };
  }
  if (ui.layers.camera.vis && !ui.layers.camera.lock) {
    // a menor area primeiro (areas podem se sobrepor)
    const zs = L.zones.filter((z) => w.x >= z.x && w.x <= z.x + z.w && w.y >= z.y && w.y <= z.y + z.h).sort((a, b) => a.w * a.h - b.w * b.h);
    if (zs.length && (ui.layer === "camera" || !hitBg(w))) return { kind: "zone", id: zs[0].id };
  }
  const b = hitBg(w); if (b) return { kind: "bg", id: b.id };
  return null;
}
function hitBg(w) {
  for (let i = L.backgrounds.length - 1; i >= 0; i--) {
    const b = L.backgrounds[i], im = images[b.image], st = ui.layers[(b.plane || "B") === "A" ? "front" : "background"] || { vis: true };
    if (!st.vis || st.lock) continue;
    if (im && w.x >= b.x && w.x < b.x + im.img.width && w.y >= b.y && w.y < b.y + im.img.height) return b;
  }
  return null;
}
let spaceDown = false;
cv.addEventListener("contextmenu", (e) => { if (ui.tool === "col") e.preventDefault(); });
$("#col-type").onchange = () => { setTool("col"); colPalSync(); };
/* paleta de edicao da fase (modo plataforma): sempre visivel no canto do canvas */
const COL_TYPES = [["1", "Sólido"], ["2", "Plataforma"], ["3", "Escada"], ["4", "Perigo"], ["5", "Abismo"], ["6", "Borda"], ["0", "Apagar"]];
function colSwatch(v) {
  const c = document.createElement("canvas"); c.width = 16; c.height = 16; const g2 = c.getContext("2d");
  if (v === "0") { g2.fillStyle = "#2a2a30"; g2.fillRect(0, 0, 16, 16); g2.strokeStyle = "#ff6b72"; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(3, 3); g2.lineTo(13, 13); g2.moveTo(13, 3); g2.lineTo(3, 13); g2.stroke(); return c; }
  g2.fillStyle = "#24246d"; g2.fillRect(0, 0, 16, 16);
  drawColGraphics(g2, { width: 16, height: 16, col: { w: 2, h: 2, d: v.repeat(4) } }); return c;
}
function colPalBuild() {
  const box = $("#col-pal"); if (!box) return;
  box.innerHTML = `<div class="cp-t">Editar a fase <small>(K)</small></div><div class="cp-row">${COL_TYPES.map(([v, n]) => `<button data-v="${v}" title="${n} (tecla ${v})"><span></span>${n}</button>`).join("")}</div>
    <div class="cp-t">Pincel</div><div class="cp-row"><button data-b="1" title="Pinta um tile de 8×8">8×8</button><button data-b="2" title="Pinta um bloco de 16×16 (alinhado na grade)">16×16</button></div>
    <div class="cp-h">Clique/arraste pinta · botão direito apaga · Shift+arrastar = retângulo</div>`;
  box.querySelectorAll("[data-v]").forEach((b) => { b.firstChild.appendChild(colSwatch(b.dataset.v)); b.onclick = () => { $("#col-type").value = b.dataset.v; setTool("col"); colPalSync(); }; });
  box.querySelectorAll("[data-b]").forEach((b) => b.onclick = () => { ui.colBrush = +b.dataset.b; setTool("col"); colPalSync(); });
}
function colPalSync() {
  const box = $("#col-pal"); if (!box) return;
  box.classList.toggle("hidden", !isPlat() || !!screenTypeOf(L));   // telas (titulo etc.) nao tem colisao
  const v = $("#col-type").value, br = ui.colBrush || 1;
  box.querySelectorAll("[data-v]").forEach((b) => b.classList.toggle("on", ui.tool === "col" && b.dataset.v === v));
  box.querySelectorAll("[data-b]").forEach((b) => b.classList.toggle("on", +b.dataset.b === br));
}
colPalBuild();
cv.addEventListener("mousedown", (e) => {
  const w = toWorld(e.offsetX, e.offsetY);
  if (ui.tool === "pan" || spaceDown || e.button === 1) { ui.drag = { type: "pan", sx: e.clientX, sy: e.clientY, px: ui.panX, py: ui.panY }; return; }
  if (ui.tool === "camera") { ui.drag = { type: "newzone", x0: snap(w.x), y0: snap(w.y) }; return; }
  if (ui.tool === "col") {
    const br = ui.colBrush || 1, sn = (t) => (br === 2 ? t & ~1 : t);
    const tx = sn(Math.floor(w.x / 8)), ty = sn(Math.floor(w.y / 8)), v = e.button === 2 ? 0 : +$("#col-type").value;
    if (e.shiftKey) { ui.drag = { type: "colrect", tx: Math.floor(w.x / 8), ty: Math.floor(w.y / 8), v }; draw(); return; }
    colPaint(tx, ty, tx + br - 1, ty + br - 1, v); ui.drag = { type: "colpaint", v }; draw(); return;
  }
  if (ui.tool === "spawn") { L.spawn.x = Math.round(w.x); L.spawn.y = Math.round(w.y); ui.sel = { kind: "spawn" }; changed(); return; }
  if (ui.tool === "transition") {
    const h = hit(w);
    if (!h || h.kind !== "zone") { status("Clique dentro de uma área de câmera."); return; }
    if (!ui.transFrom) { ui.transFrom = h.id; status("Agora clique na área de destino."); }
    else if (h.id !== ui.transFrom) {
      const t = { id: uid("tr_"), from: ui.transFrom, to: h.id, type: "fade_black", duration: 30, trigger: "edge" };
      L.transitions.push(t); ui.transFrom = null; ui.sel = { kind: "trans", id: t.id }; setTool("select"); changed();
    }
    draw(); return;
  }
  const h = hit(w);
  if (!h || h.kind === "zone" || h.kind === "bg") {
    const fl = floorLines().find(([, y]) => Math.abs(w.y - y) <= 5 / ui.zoom + 1);
    if (fl && w.x >= 0 && w.x <= L.width) { ui.sel = { kind: "layout", id: L.id }; ui.drag = { type: "floor", key: fl[0] }; refresh(); return; }
  }
  ui.sel = h ? { kind: h.kind, id: h.id } : { kind: "layout", id: L.id };
  if (h && (h.kind === "zone" || h.kind === "group" || h.kind === "sobj") && h.handle !== undefined) ui.drag = { type: "resize", kind: h.kind, id: h.id, handle: h.handle };
  else if (h && (h.kind === "zone" || h.kind === "bg" || h.kind === "spawn" || h.kind === "inst" || h.kind === "group" || h.kind === "sobj")) {
    const o = h.kind === "zone" ? zoneById(h.id) : h.kind === "group" ? groupById(h.id) : h.kind === "sobj" ? sobjById(h.id) : h.kind === "bg" ? L.backgrounds.find((b) => b.id === h.id) : h.kind === "inst" ? L.instances.find((i) => i.id === h.id) : L.spawn;
    ui.drag = { type: "move", obj: o, ox: o.x, oy: o.y, x0: w.x, y0: w.y, kind: h.kind };
  }
  refresh();
});
window.addEventListener("mousemove", (e) => {
  const r = cv.getBoundingClientRect();
  ui.mouse = toWorld(e.clientX - r.left, e.clientY - r.top);
  $("#coords").textContent = `x ${Math.round(ui.mouse.x)}  y ${Math.round(ui.mouse.y)}`;
  const d = ui.drag;
  if (!d) {
    const near = ui.tool === "select" && floorLines().some(([, y]) => Math.abs(ui.mouse.y - y) <= 5 / ui.zoom + 1);
    cv.style.cursor = near ? "ns-resize" : "";
    if (ui.transFrom) draw();
    return;
  }
  if (d.type === "pan") { ui.panX = d.px + e.clientX - d.sx; ui.panY = d.py + e.clientY - d.sy; }
  if (d.type === "colpaint") { const br = ui.colBrush || 1, tx = Math.floor(ui.mouse.x / 8) & (br === 2 ? ~1 : ~0), ty = Math.floor(ui.mouse.y / 8) & (br === 2 ? ~1 : ~0); colPaint(tx, ty, tx + br - 1, ty + br - 1, d.v); draw(); return; }
  if (d.type === "colrect") { draw(); return; }
  if (d.type === "floor") {
    let y = Math.max(0, Math.min(L.height, Math.round(ui.mouse.y)));
    if (hasDepth()) { if (d.key === "top") y = Math.min(y, L.floor.bottom - 8); else y = Math.max(y, L.floor.top + 8); }
    else L.floor.bottom = y;
    L.floor[d.key] = y;
    $("#coords").textContent = `chão y ${y}`;
  }
  if (d.type === "move") {
    const s = (d.kind === "spawn" || d.kind === "inst" || (d.kind === "sobj" && SOBJ[d.obj.type].shape === "point")) ? 1 : 8;
    d.obj.x = snap(d.ox + ui.mouse.x - d.x0, s); d.obj.y = snap(d.oy + ui.mouse.y - d.y0, s);
  }
  if (d.type === "resize") {
    const z = d.kind === "group" ? groupById(d.id) : d.kind === "sobj" ? sobjById(d.id) : zoneById(d.id), mx = snap(ui.mouse.x), my = snap(ui.mouse.y);
    const MW = d.kind === "zone" ? MD_W : 8, MH = d.kind === "zone" ? MD_H : 8;   // area de camera nunca menor que a tela
    const x2 = z.x + z.w, y2 = z.y + z.h;
    if (d.handle === 0 || d.handle === 2) { z.x = Math.min(mx, x2 - MW); z.w = x2 - z.x; }
    if (d.handle === 1 || d.handle === 3) z.w = Math.max(MW, mx - z.x);
    if (d.handle === 0 || d.handle === 1) { z.y = Math.min(my, y2 - MH); z.h = y2 - z.y; }
    if (d.handle === 2 || d.handle === 3) z.h = Math.max(MH, my - z.y);
  }
  draw();
});
window.addEventListener("mouseup", () => {
  const d = ui.drag; ui.drag = null;
  if (!d) return;
  if (d.type === "colpaint") { changed(); return; }
  if (d.type === "colrect") {
    let x0 = Math.min(d.tx, Math.floor(ui.mouse.x / 8)), x1 = Math.max(d.tx, Math.floor(ui.mouse.x / 8)), y0 = Math.min(d.ty, Math.floor(ui.mouse.y / 8)), y1 = Math.max(d.ty, Math.floor(ui.mouse.y / 8));
    if (ui.colBrush === 2) { x0 &= ~1; y0 &= ~1; x1 |= 1; y1 |= 1; }   // pincel 16x16: o retangulo acompanha a grade de blocos
    colPaint(x0, y0, x1, y1, d.v); changed(); return;
  }
  if (d.type === "newzone") {
    const r = normRect(d.x0, d.y0, snap(ui.mouse.x), snap(ui.mouse.y));
    if (r.w < 16 || r.h < 16) { draw(); return; }
    // a area nunca e menor que a tela do Mega Drive
    r.w = Math.max(MD_W, r.w); r.h = Math.max(MD_H, r.h);
    const z = { id: uid("cam_"), name: "Área " + (L.zones.length + 1), ...r, mode: "follow", lerp: 0.15, delay: 0, lockY: true, lockScroll: false };
    L.zones.push(z); ui.sel = { kind: "zone", id: z.id }; setTool("select");
  }
  if (d.type !== "pan") changed(); else draw();
});
cv.addEventListener("dblclick", (e) => {
  const w = toWorld(e.offsetX, e.offsetY), h = hit(w);
  if (!h || h.kind === "zone" || h.kind === "bg" || h.kind === "group" || h.kind === "sobj") { if (h && (h.kind === "group" || h.kind === "sobj")) return; Insert.open({ x: Math.round(w.x), y: Math.round(w.y) }); return; }
  if (h.kind === "inst") { const it = L.instances.find((i) => i.id === h.id); AnimEditor.open(it.actor); }
  if (h.kind === "spawn") {
    let pa = playerActor();
    if (!pa) { pa = newActor("player"); changed(); }
    AnimEditor.open(pa.id);
  }
});
/* arrastar um ator da arvore para a fase */
cv.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("text/sg-actor")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
cv.addEventListener("drop", (e) => {
  const id = e.dataTransfer.getData("text/sg-actor"); if (!id || !P.actors[id]) return;
  e.preventDefault();
  const w = toWorld(e.offsetX, e.offsetY);
  if (P.actors[id].kind === "player") { L.spawn.x = Math.round(w.x); L.spawn.y = Math.round(w.y); ui.sel = { kind: "spawn" }; changed(); status("O jogador começa aqui (ponto ⚑ Início)."); return; }
  const it = { id: uid("in_"), actor: id, x: Math.round(w.x), y: Math.round(w.y), flip: false };
  L.instances.push(it); ui.sel = { kind: "inst", id: it.id }; changed();
});
function playerActor() { return Object.values(P.actors).find((a) => a.kind === "player"); }
cv.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(ui.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.offsetX, e.offsetY); }, { passive: false });
window.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); histGo(e.shiftKey ? 1 : -1); return; }
  if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); histGo(1); return; }
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (window.AnimEditor && AnimEditor.isOpen()) return;
  if (window.Insert && Insert.isOpen()) return;
  if (e.code === "Space") { spaceDown = true; e.preventDefault(); }
  if (e.key === "Delete" || e.key === "Backspace") deleteSel();
  if (isPlat() && /^[0-6]$/.test(e.key) && !mod) { $("#col-type").value = e.key; if (ui.tool !== "col") setTool("col"); colPalSync(); return; }
  const k = { v: "select", c: "camera", t: "transition", p: "spawn", k: isPlat() ? "col" : null }[e.key.toLowerCase()];
  if (k && !e.ctrlKey && !e.metaKey) setTool(k);
  if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); savePack(); }
});
window.addEventListener("keyup", (e) => { if (e.code === "Space") spaceDown = false; });

function deleteSel() {
  const s = ui.sel; if (!s) return;
  if (s.kind === "zone") {
    if (L.zones.length <= 1) { status("A fase precisa de pelo menos uma área de câmera."); return; }
    L.zones = L.zones.filter((z) => z.id !== s.id);
    L.transitions = L.transitions.filter((t) => t.from !== s.id && t.to !== s.id);
  }
  if (s.kind === "trans") L.transitions = L.transitions.filter((t) => t.id !== s.id);
  if (s.kind === "bg") L.backgrounds = L.backgrounds.filter((b) => b.id !== s.id);
  if (s.kind === "inst") L.instances = L.instances.filter((i) => i.id !== s.id);
  if (s.kind === "group") L.groups = L.groups.filter((g) => g.id !== s.id);
  if (s.kind === "sobj") L.objs = L.objs.filter((o) => o.id !== s.id);
  ui.sel = { kind: "layout", id: L.id };
  changed();
}

/* ------------------------------------------------------------------ paineis */
function refresh() { tree(); props(); layers(); tabs(); draw(); if (typeof colPalSync === "function") colPalSync(); if (window.EventSheet && EventSheet.isOn()) EventSheet.render(); if (window.FlowEditor && FlowEditor.isOn()) FlowEditor.render(); }
function tabs() { const t = $("#tab-layout"); if (t) t.textContent = L.name; const e = $("#tab-events"); if (e) e.textContent = "Eventos — " + L.name; }
function changed() { histPush(); autosave(); refresh(); if (typeof MemMeter !== "undefined") MemMeter.schedule(); }

/* icone da arvore: a arte do proprio objeto reduzida (se o usuario ja desenhou) */
const thumbCache = new Map();
function actorThumb(a) {
  const f = actorThumbFrame(a); if (!f || !images[f.img] || isPlaceholderFrame(f)) return null;
  if (thumbCache.has(f.img)) return thumbCache.get(f.img);
  const src = images[f.img].img, s = Math.min(16 / src.width, 16 / src.height, 1), c = document.createElement("canvas"); c.width = 16; c.height = 16;
  const g = c.getContext("2d"); g.imageSmoothingEnabled = false; const w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s));
  g.drawImage(src, (16 - w) >> 1, 16 - h, w, h);
  const u = c.toDataURL(); thumbCache.set(f.img, u); return u;
}
/* arvore do projeto no estilo Construct: pastas fixas + pastas criadas pelo usuario em "Tipos de objeto" */
ui.collapsed = ui.collapsed || {};
ui.treeQuery = "";
function tree() {
  const t = $("#tree"); t.innerHTML = "";
  const q = ui.treeQuery.toLowerCase();
  const sb = document.createElement("input"); sb.className = "tree-search"; sb.placeholder = "Buscar"; sb.value = ui.treeQuery;
  sb.oninput = () => { ui.treeQuery = sb.value; tree(); const n = $("#tree .tree-search"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  t.appendChild(sb);
  const match = (name) => !q || name.toLowerCase().includes(q);
  P.folders = P.folders || [];

  function folder(key, name, depth, actions) {
    const open = !ui.collapsed[key] || q;
    const d = document.createElement("div"); d.className = "tnode folder"; d.style.paddingLeft = 6 + depth * 14 + "px";
    d.innerHTML = `<span class="caret">${open ? "▾" : "▸"}</span>${ICON("folder")}<span class="tname">${esc(name)}</span>`;
    d.onclick = () => { ui.collapsed[key] = !ui.collapsed[key]; tree(); };
    (actions || []).forEach(([ic, title, fn]) => {
      const b = document.createElement("button"); b.className = "tact"; b.title = title; b.innerHTML = ICON(ic, 12);
      b.onclick = (e) => { e.stopPropagation(); fn(b); }; d.appendChild(b);
    });
    t.appendChild(d);
    return { open, el: d };
  }
  function item(html, depth, sel, fn, cls) {
    const d = document.createElement("div"); d.className = "tnode item" + (sel ? " sel" : "") + (cls ? " " + cls : "");
    d.style.paddingLeft = 20 + depth * 14 + "px"; d.innerHTML = html; d.onclick = fn; t.appendChild(d); return d;
  }

  const root = folder("root", P.name || "Projeto", 0);
  if (!root.open) return;
  if (match("Controles")) item(ICON("player") + `<span class="tname">Controles</span>`, 0, isSel("controls"), () => { ui.sel = { kind: "controls" }; refresh(); });
  if (match("HUD")) item(ICON("grid") + `<span class="tname">HUD</span>`, 0, isSel("hud"), () => { ui.sel = { kind: "hud" }; refresh(); });
  // Fases
  const fz = folder("layouts", "Fases", 1, [["plus", "Nova fase", () => {
    const n = newProject("", P.template, P.move).layouts[0]; n.name = "Fase " + (P.layouts.length + 1);
    P.layouts.push(n); L = n; ui.sel = { kind: "layout", id: n.id }; fit(); changed();
  }]]);
  if (fz.open) P.layouts.filter((l) => match(l.name)).forEach((l) =>
    item(ICON("map") + `<span class="tname">${esc(l.name)}</span>`, 1, l === L && isSel("layout"), () => { L = l; ui.sel = { kind: "layout", id: l.id }; fit(); refresh(); }, "green"));
  // Folhas de eventos
  const ev = folder("events", "Folhas de eventos", 1);
  if (ev.open) P.layouts.filter((l) => match("Eventos " + l.name)).forEach((l) =>
    item(ICON("grid") + `<span class="tname">Eventos — ${esc(l.name)}</span>`, 1, false, () => { L = l; refresh(); EventSheet.show(true); }, "green"));
  // Tipos de objeto (atores) com pastas do usuario
  const ob = folder("objects", "Tipos de objeto", 1, [
    ["plus", "Novo tipo de objeto", (b) => newActorMenu(b)],
    ["folder", "Nova pasta", () => { const n = prompt("Nome da pasta:", "Nova pasta"); if (!n) return; P.folders.push({ id: uid("fd_"), name: n }); changed(); }],
  ]);
  const actorNode = (a, depth) => {
    if (!match(a.name)) return;
    const th = actorThumb(a);
    const n = item((th ? `<img class="tthumb" src="${th}">` : ICON(KIND_ICON[a.kind])) + `<span class="tname">${esc(a.name)}</span>`, depth, isSel("actor", a.id), () => { ui.sel = { kind: "actor", id: a.id }; refresh(); }, "blue");
    n.draggable = true; n.title = "Arraste para a fase ou para uma pasta · duplo clique abre os sprites";
    n.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/sg-actor", a.id); e.dataTransfer.effectAllowed = "copyMove"; });
    n.addEventListener("dblclick", () => AnimEditor.open(a.id));
  };
  const dropInto = (el, folderId) => {
    el.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("text/sg-actor")) { e.preventDefault(); el.classList.add("drop"); } });
    el.addEventListener("dragleave", () => el.classList.remove("drop"));
    el.addEventListener("drop", (e) => { e.preventDefault(); el.classList.remove("drop"); const a = P.actors[e.dataTransfer.getData("text/sg-actor")]; if (a) { a.folder = folderId; changed(); } });
  };
  dropInto(ob.el, null);
  if (ob.open) {
    P.folders.forEach((fd) => {
      const f = folder("fd_" + fd.id, fd.name, 2, [
        ["edit", "Renomear pasta", () => { const n = prompt("Nome da pasta:", fd.name); if (n) { fd.name = n; changed(); } }],
        ["trash", "Apagar pasta (os objetos voltam para Tipos de objeto)", () => { Object.values(P.actors).forEach((a) => { if (a.folder === fd.id) a.folder = null; }); P.folders = P.folders.filter((x) => x !== fd); changed(); }],
      ]);
      dropInto(f.el, fd.id);
      if (f.open) Object.values(P.actors).filter((a) => a.folder === fd.id).forEach((a) => actorNode(a, 2));
    });
    Object.values(P.actors).filter((a) => !a.folder || !P.folders.find((f) => f.id === a.folder)).forEach((a) => actorNode(a, 1));
  }
  // Imagens de fundo
  const im = folder("images", "Imagens de fundo", 1, [["plus", "Importar imagem de fundo", () => $("#file-img").click()]]);
  if (im.open) L.backgrounds.filter((b) => match(P.images[b.image].name)).forEach((b) =>
    item(ICON("image") + `<span class="tname">${esc(P.images[b.image].name)}</span>`, 1, isSel("bg", b.id), () => { ui.sel = { kind: "bg", id: b.id }; refresh(); }));
}

/* camadas = o que o Mega Drive tem: plano B (fundo), plano A (frente), sprites; camera e so do editor */
const LAYER_DEFS = [["collision", "Colisão", "Plataforma: chão, escadas, perigo"], ["camera", "Câmera", "Só no editor"], ["objects", "Sprites", "Atores e objetos · máx. 80"], ["front", "Plano A", "Cenário da frente / HUD"], ["background", "Plano B", "Cenário do fundo"]];
function layers() {
  const box = $("#layers"); box.innerHTML = "";
  LAYER_DEFS.forEach(([k, n, sub]) => {
    if (k === "collision" && !isPlat()) return;
    const st = ui.layers[k] = ui.layers[k] || { vis: true, lock: false }, d = document.createElement("div");
    d.className = "layer" + (ui.layer === k ? " sel" : "");
    d.innerHTML = `<button class="eye" title="Mostrar/esconder">${ICON(st.vis ? "eye" : "eyeoff")}</button><button class="lock" title="Travar">${ICON(st.lock ? "lock" : "unlock")}</button><span class="name">${n}<small>${sub}</small></span>`;
    d.querySelector(".eye").onclick = (e) => { e.stopPropagation(); st.vis = !st.vis; refresh(); };
    d.querySelector(".lock").onclick = (e) => { e.stopPropagation(); st.lock = !st.lock; refresh(); };
    d.onclick = () => { ui.layer = k; refresh(); };
    box.appendChild(d);
  });
  const bx = document.createElement("label"); bx.className = "layer"; bx.style.cursor = "pointer";
  bx.innerHTML = `<input type="checkbox" ${ui.showBoxes ? "checked" : ""} style="width:auto"> <span class="name">Caixas de colisão<small>Azul = corpo, vermelho = golpe (só no editor)</small></span>`;
  bx.querySelector("input").onchange = (e) => { ui.showBoxes = e.target.checked; draw(); };
  box.appendChild(bx);
  const h = document.createElement("div"); h.className = "hint"; h.style.padding = "4px 8px";
  h.textContent = "O Mega Drive tem 2 planos de cenário (A e B) e uma camada de sprites. Não dá para criar mais.";
  box.appendChild(h);
}

/* gerador de formulario: campos [rotulo, obj, chave, tipo, extra]; "Titulo" abre uma secao recolhivel; "!texto" e uma dica */
ui.closedSec = ui.closedSec || {};
function section(box, title) {
  const sec = document.createElement("div"); sec.className = "sec" + (ui.closedSec[title] ? " closed" : "");
  const h = document.createElement("div"); h.className = "sec-h"; h.innerHTML = `<span class="caret">${ui.closedSec[title] ? "▸" : "▾"}</span>${esc(title)}`;
  h.onclick = () => { ui.closedSec[title] = !ui.closedSec[title]; props(); };
  const body = document.createElement("div"); body.className = "sec-b";
  sec.append(h, body); box.appendChild(sec);
  return body;
}
function form(fields, keep) {
  const box = $("#props"); if (!keep) box.innerHTML = "";
  let cur = box;
  fields.forEach((f) => {
    if (typeof f === "string") {
      if (f.startsWith("!")) {   // dica: so aparece passando o mouse (icone i na ultima linha, ou no titulo da secao)
        const tip = f.slice(1), last = cur.lastElementChild, lab = last && last.classList.contains("row") ? last.querySelector("label") : null;
        const target = lab || (cur.parentNode && cur.parentNode.querySelector(".sec-h"));
        if (target) { const i = document.createElement("span"); i.className = "tip"; i.textContent = "ⓘ"; i.title = tip; target.appendChild(i); target.title = tip; }
        else { const h = document.createElement("div"); h.className = "hint"; h.textContent = tip; cur.appendChild(h); }
      }
      else cur = section(box, f);
      return;
    }
    if (f instanceof HTMLElement) { cur.appendChild(f); return; }
    cur.appendChild(fieldRow(...f));
  });
  return cur;
}
/* linha "X, Y" num campo so (como o Position do Construct) */
function pairRow(lab, obj, kx, ky, step) {
  const row = document.createElement("div"); row.className = "row";
  row.innerHTML = `<label>${lab}</label>`;
  const w = document.createElement("div"); w.className = "pair";
  [kx, ky].forEach((k) => {
    const inp = document.createElement("input"); inp.type = "number"; inp.value = obj[k]; inp.step = step || 1;
    inp.onchange = () => { obj[k] = Number(inp.value) || 0; changed(); };
    w.appendChild(inp);
  });
  row.appendChild(w); return row;
}
function textRow(lab, text) { const row = document.createElement("div"); row.className = "row"; row.innerHTML = `<label>${lab}</label><span class="ro">${esc(text)}</span>`; return row; }

function props() {
  const s = ui.sel || { kind: "layout" };
  if (s.kind === "layout" && screenTypeOf(L)) {   // tela (titulo, opcoes, creditos...): propriedades proprias
    const n = screenNodeOf(L);
    if (L.autoSec === undefined) L.autoSec = 0; if (L.menuRow === undefined) L.menuRow = 16;
    const typeSel = Object.fromEntries(Object.entries(SCREEN_TYPES).filter(([k]) => !isGameScreen(k)).map(([k, [nm]]) => [k, nm]));
    const tp = { get v() { return n.type; }, set v(x) { n.type = x; } };
    const nm = { get v() { return L.name; }, set v(x) { L.name = x; n.name = x; } };
    const t = n.type, cursorOpts = { arrow: "Seta >", blink: "Texto piscando", both: "Seta + texto piscando", sprite: "Sprite (ator animado)" };
    const actorsSel = { "": "(escolha um ator)", ...Object.fromEntries(Object.values(P.actors).filter((a) => a.kind !== "player").map((a) => [a.id, a.name])) };
    if (!L.cursor) L.cursor = "arrow";
    const menuTxt = { get v() { return (n.menu || []).join("\n"); }, set v(x) { const l = String(x).split("\n").map((q) => q.trim()).filter(Boolean); n.menu = l.length ? l : undefined; } };
    const f = ["Tela", ["Nome", nm, "v"], ["Tipo", tp, "v", "select", typeSel], ["Cor de fundo", L, "bgColor", "color"],
      `!Tela do Mega Drive: ${MD_W}×${MD_H}. Coloque Textos (duplo clique no canvas), imagens de fundo e sprites de enfeite.`];
    if (t === "title" || t === "options" || t === "gameover" || t === "ending") {
      f.push("Menu", ["Opções (uma por linha)", menuTxt, "v", "textarea"], "!Cada opção leva para a tela ligada a ela na aba Telas (ligação \"Opção do menu\"). Vazio = sem menu.");
      if (n.menu) f.push(["Linha na tela (0–27)", L, "menuRow", "number", { min: 0, max: 27 }], ["Cursor", L, "cursor", "select", cursorOpts],
        ...(L.cursor === "sprite" ? [["Sprite do cursor", L, "cursorActor", "select", actorsSel], "!O cursor usa a animação idle do ator escolhido (pode ser uma arte importada), ao lado da opção selecionada."] : []));
    }
    if (t === "cutscene") { if (L.story === undefined) L.story = "ERA UMA VEZ...\n\nUMA CIDADE TOMADA PELO CRIME."; f.push("Cena", ["Texto (linha em branco = próxima página)", L, "story", "textarea"], "!No jogo: B, C ou START avançam a página, A ou ← voltam. Depois da última página, segue a ligação da tela."); }
    if (t === "credits" || t === "finalcredits") { if (L.story === undefined) L.story = "MEU JOGO\n\nPROGRAMACAO\nVOCE\n\nOBRIGADO POR JOGAR!"; if (L.rollSpeed === undefined) L.rollSpeed = 2;
      f.push("Créditos", ["Texto (cole aqui)", L, "story", "textarea"], ["Velocidade de subida", L, "rollSpeed", "select", { 1: "Lenta", 2: "Normal", 3: "Rápida" }], "!O texto sobe do pé da tela. START acelera. No fim, segue a ligação da tela."); }
    if (t === "map") { if (!L.cursor || L.cursor === "blink" || L.cursor === "both") L.cursor = "arrow";
      f.push("Mapa", ["Cursor", L, "cursor", "select", { arrow: "Seta >", sprite: "Sprite (ator animado)" }], ...(L.cursor === "sprite" ? [["Sprite do cursor", L, "cursorActor", "select", actorsSel]] : []),
        "!Coloque \"Ponto do mapa\" (duplo clique no canvas) para cada fase, na ordem do caminho. Setas movem o cursor, START entra. Uma fase fica bloqueada até a anterior ser concluída (a não ser que o ponto seja marcado como liberado). Na aba Telas, ligue \"Fase concluída\" das fases de volta para este mapa."); }
    f.push("Comportamento", ["Avança sozinho depois de (s, 0 = só com START)", L, "autoSec", "number", { min: 0, max: 60 }]);
    form(f);
  } else if (s.kind === "layout") {
    const f = [
      "Fase",
      ["Nome", L, "name"],
      ["Largura (px)", L, "width", "number", { min: MD_W, step: 8 }],
      ["Altura (px)", L, "height", "number", { min: MD_H, step: 8 }],
      ["Cor de fundo", L, "bgColor", "color"],
      `!Tela do Mega Drive: ${MD_W}×${MD_H}. Linhas tracejadas marcam cada tela.`,
    ];
    if (hasDepth()) {
      L.floor = L.floor || { top: 150, bottom: 212 };
      f.push("Chão (profundidade)", ["Topo do chão (y)", L.floor, "top", "number", { min: 0 }], ["Base do chão (y)", L.floor, "bottom", "number", { min: 0 }],
        "!Faixa onde os personagens podem andar para cima e para baixo.");
    } else if (isPlat()) {
      if (L.camSmooth === undefined) L.camSmooth = 6;
      if (L.autoCol === undefined) L.autoCol = true;
      f.push("Desenho", ["Desenhar a colisão automaticamente (padrão da engine)", L, "autoCol", "check"],
        "!Cada tile pintado na Colisão ganha o desenho padrão: sólidos em blocos de 16×16 com X, plataformas e escadas em cores simples. Desligue para usar só as suas imagens de fundo.");
      f.push("Chão", "!Plataforma: o chão, as paredes, plataformas e escadas são pintados com a ferramenta Colisão (K). A fase pode crescer na altura também (câmera sobe e desce).",
        "Câmera", ["Suavidade (0 = gruda no jogador, 15 = bem devagar)", L, "camSmooth", "number", { min: 0, max: 15 }], "!A câmera anda uma fração do que falta a cada quadro, nos dois eixos (lerp).");
    } else {
      L.floor = L.floor || { top: 200, bottom: 200 };
      f.push("Chão", ["Linha do chão (y)", L.floor, "top", "number", { min: 0 }], "!Template lateral: todos pisam nessa linha; só sai dela pulando.");
    }
    L.onClear = L.onClear || "none";
    f.push("Fim da fase", ["Ao derrotar todos", L, "onClear", "select", { none: "Nada (a fase termina por evento ou saída)", next: "Fase completa → próxima fase", end: "Fase completa → fim de jogo" }],
      "!Vale quando não sobra inimigo vivo, nenhum grupo pendente e nenhum gerador ativo.");
    if (P.hitDepth === undefined) P.hitDepth = 6;
    f.push("Projeto", ["Nome do jogo", P, "name"], `!Movimento: ${MOVE_MODES[P.move]}. Para trocar, crie um projeto novo.`);
    if (P.maxAttackers === undefined) P.maxAttackers = 2;
    if (P.shadows === undefined) P.shadows = true;
    f.push(["Inimigos atacando ao mesmo tempo", P, "maxAttackers", "number", { min: 1, max: 8 }],
      "!Diretor de multidão: só essa quantidade de inimigos ataca de cada vez; os outros rodeiam fora do alcance e esperam a vez (chefes não esperam).",
      ["Sombra nos personagens", P, "shadows", "check"]);
    if (P.move !== "side") f.push(["Profundidade do golpe (px)", P, "hitDepth", "number", { min: 1, max: 24 }],
      "!Quantos pixels acima ou abaixo (na profundidade) um golpe ainda acerta. Menor = precisa estar mais alinhado. Vale para jogador, inimigos e projéteis.");
    form(f);
  }
  if (s.kind === "zone") {
    const z = zoneById(s.id);
    form([
      "Área de câmera",
      ["Nome", z, "name"],
      ["X", z, "x", "number", { step: 8 }], ["Y", z, "y", "number", { step: 8 }],
      ["Largura", z, "w", "number", { min: MD_W, step: 8 }], ["Altura", z, "h", "number", { min: MD_H, step: 8 }],
      "!A câmera só se move dentro deste retângulo. Para sair dele é preciso uma transição.",
      "Comportamento",
      ["Modo", z, "mode", "select", CAM_MODES],
      ["Suavidade (lerp)", z, "lerp", "number", { min: 0.01, max: 1, step: 0.01 }],
      ["Atraso (frames)", z, "delay", "number", { min: 0, max: 60 }],
      ["Travar eixo Y", z, "lockY", "check"],
      ["Só avança (não volta)", z, "lockScroll", "check"],
      "!Lerp: 1 = gruda no jogador, 0,1 = segue devagar. Só vale no modo 'com atraso'.",
    ]);
  }
  if (s.kind === "trans") {
    const t = L.transitions.find((x) => x.id === s.id);
    form([
      "Transição",
      `!${zoneById(t.from).name} → ${zoneById(t.to).name}`,
      ["Efeito", t, "type", "select", TRANSITIONS],
      ["Duração (frames)", t, "duration", "number", { min: 0, max: 240 }],
      ["Disparo", t, "trigger", "select", { edge: "Jogador chega na borda", clear: "Inimigos derrotados + borda", door: "Ponto de saída (porta)" }],
      "!60 frames = 1 segundo.",
    ]);
  }
  if (s.kind === "bg") {
    const b = L.backgrounds.find((x) => x.id === s.id), im = P.images[b.image];
    form([
      "Imagem de fundo",
      ["Nome", im, "name"],
      ["X", b, "x", "number", { step: 8 }], ["Y", b, "y", "number", { step: 8 }],
      ["Plano", b, "plane", "select", { B: "Plano B (fundo)", A: "Plano A (frente)" }],
      `!${im.w}×${im.h} px · ${im.colorsIn} cores na original → ${im.pal.length} cores do Mega Drive.`,
      im.w % 8 || im.h % 8 ? "!⚠ Largura e altura precisam ser múltiplas de 8 (tiles)." : "!Tamanho alinhado em tiles de 8×8. ✓",
    ]);
    const sw = document.createElement("div"); sw.style.cssText = "display:flex;flex-wrap:wrap;gap:2px";
    im.pal.forEach((k) => { const c = document.createElement("span"); c.className = "swatch"; c.style.background = `rgb(${MD.rgbOfKey(k)})`; sw.appendChild(c); });
    $("#props").appendChild(sw);
  }
  if (s.kind === "actor") actorProps(P.actors[s.id]);
  if (s.kind === "group") groupProps(groupById(s.id));
  if (s.kind === "controls") controlsProps();
  if (s.kind === "hud") hudProps();
  if (s.kind === "sobj") sobjProps(sobjById(s.id));
  if (s.kind === "inst") {
    const it = L.instances.find((i) => i.id === s.id), a = P.actors[it.actor], fr = actorThumbFrame(a);
    it.vflip = !!it.vflip; it.prio = it.prio || "low"; it.pal = it.pal ?? 3; it.visible = it.visible ?? true;
    const box = form([
      "Propriedades do tipo de objeto",
      ["Nome", a, "name"],
      textRow("Tipo", KIND_NAME[a.kind]),
      "Comum",
      pairRow("Posição", it, "x", "y"),
      textRow("Tamanho", fr ? `${fr.w} × ${fr.h}` : "sem sprite"),
      ["Espelhar horizontal", it, "flip", "check"],
      ["Espelhar vertical", it, "vflip", "check"],
      ["Visível", it, "visible", "check"],
      ["Camada", it, "prio", "select", { low: "Sprites (atrás do Plano A)", high: "Sprites (na frente de tudo)" }],
      ["Paleta", it, "pal", "select", { 0: "Paleta 0", 1: "Paleta 1", 2: "Paleta 2", 3: "Paleta 3" }],
      "!O Mega Drive não gira nem deixa sprites transparentes: em vez de ângulo e opacidade, use espelhar, prioridade e paleta.",
      "Comportamentos",
      textRow("Do tipo", KIND_NAME[a.kind]),
    ]);
    const b = document.createElement("button"); b.textContent = "Editar comportamento do tipo"; b.onclick = () => { ui.sel = { kind: "actor", id: a.id }; refresh(); }; box.appendChild(b);
    const sp = document.createElement("button"); sp.innerHTML = ICON("edit") + " Animações e sprites"; sp.onclick = () => AnimEditor.open(a.id); box.appendChild(sp);
    form(["Variáveis de instância", "!Em breve (usadas pela folha de eventos)."], true);
  }
  if (s.kind === "spawn") {
    const pa = playerActor();
    form(["Propriedades do tipo de objeto", textRow("Nome", pa ? pa.name : "—"), textRow("Tipo", "Início do jogador"), "Comum", pairRow("Posição", L.spawn, "x", "y")]);
  }
}

/* ------------------------------------------------------------------ imagens */
function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
async function registerImage(id, meta) {
  const img = await loadImage(SRC[id]);
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const cg = c.getContext("2d"); cg.drawImage(img, 0, 0);
  // fundo: 2 paletas de 15 cores (30) ficam para a engine; aqui mostramos com ate 30 cores
  const conv = MD.convert(cg.getImageData(0, 0, img.width, img.height), 30);
  images[id] = { img: MD.toCanvas(conv) };
  meta.w = img.width; meta.h = img.height; meta.pal = conv.pal; meta.colorsIn = conv.colors;
}
$("#file-img").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const src = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
  const id = uid("img_");
  SRC[id] = src;
  P.images[id] = { name: f.name.replace(/\.\w+$/, ""), file: "images/" + id + ".png" };
  status("Convertendo para as cores do Mega Drive…");
  await registerImage(id, P.images[id]);
  const b = { id: uid("bg_"), image: id, x: 0, y: 0 };
  L.backgrounds.push(b);
  if (P.images[id].w > L.width) L.width = Math.ceil(P.images[id].w / 8) * 8;
  ui.sel = { kind: "bg", id: b.id };
  status(`Imagem importada: ${P.images[id].colorsIn} cores → ${P.images[id].pal.length} cores do Mega Drive.`);
  changed();
};

/* ------------------------------------------------------------------ pack */
/* so as imagens usadas pelo projeto atual vao no pack */
function usedImages() {
  const u = new Set(Object.keys(P.images));
  Object.values(P.actors).forEach((a) => {
    a.anims.forEach((an) => an.frames.forEach((f) => u.add(f.img)));
    if (a.bar && a.bar.img) u.add(a.bar.img);
  });
  return [...u].filter((id) => SRC[id]);
}
function packJSON() { return JSON.parse(JSON.stringify(P)); }
async function savePack() {
  const z = new JSZip();
  z.file("project.json", JSON.stringify(packJSON(), null, 2));
  for (const id of usedImages()) z.file("images/" + id + ".png", SRC[id].split(",")[1], { base64: true });
  const blob = await z.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (P.name || "projeto").replace(/[^\w-]+/g, "_") + ".sgpack.zip";
  a.click();
  status("Pack salvo.");
}
async function loadProjectJSON(data, srcs) {
  P = data;
  P.actors = P.actors || {};
  if (srcs) Object.assign(SRC, srcs);
  for (const [id, im] of Object.entries(P.images)) await registerImage(id, im);
  for (const id of Object.keys(SRC)) if (!images[id]) await registerRawImage(id);
}
$("#file-zip").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const z = await JSZip.loadAsync(f);
    const data = JSON.parse(await z.file("project.json").async("string"));
    if (data.format !== "sgengine-pack") throw new Error("não é um pack do SG Engine");
    const srcs = {};
    for (const name of Object.keys(z.files)) {
      const m = name.match(/^images\/(.+)\.png$/);
      if (m) srcs[m[1]] = "data:image/png;base64," + await z.file(name).async("base64");
    }
    await loadProjectJSON(data, srcs);
    openEditor();
    autosave();
  } catch (err) { alert("Não consegui abrir o pack: " + err.message); }
};
function autosave() {
  try { localStorage.setItem(AUTOSAVE, JSON.stringify({ P, SRC: Object.fromEntries(usedImages().map((id) => [id, SRC[id]])) })); } catch (e) { status("Aviso: projeto grande demais para o salvamento automático; use Salvar pack."); }
}

async function registerRawImage(id) {
  const img = await loadImage(SRC[id]);
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  images[id] = { img: c };
}

/* patrulheiro de exemplo: tenta um combo de 2 socos normais e 1 golpe que derruba */
function patrolCombo(en) {
  const a = (name, anim, damage, knockdown) => ({ id: uid("atk_"), name, anim, damage, type: "hitbox", knockdown });
  en.attacks = [a("Soco 1", "attack1", 6, false), a("Soco 2", "attack2", 7, false), a("Gancho", "attack3", 10, true)];
  en.combo = [{ from: en.attacks[0].id, to: en.attacks[1].id, chance: 100, delay: 6 }, { from: en.attacks[1].id, to: en.attacks[2].id, chance: 100, delay: 6 }];
}
/* projetos antigos: templates "beatemup" e "beatemup_side" viraram um so, com modo de movimento */
function migrateTemplate() {
  if (!P.migPatrolCombo) {   // patrulheiro de exemplo que ainda tem os golpes padrão e nenhum combo: ganha o combo 2 socos + gancho
    P.migPatrolCombo = true;
    Object.values(P.actors || {}).forEach((x) => { if (x.name === "Patrulheiro (exemplo)" && !(x.combo || []).length && (x.attacks || []).length && x.attacks.every((k) => ["Soco", "Cotovelada", "Chute"].includes(k.name))) patrolCombo(x); });
  }
  if (P.move === "plat" && !P.migDefaultCol) {
    // fase de exemplo antiga: tira o cenario de prédios (agora a engine desenha a colisão) e os tipos de inimigo que não são patrulheiros
    P.migDefaultCol = true;
    const old = Object.entries(P.images || {}).filter(([, m]) => m.name === "Cenário plataforma (exemplo)").map(([id]) => id);
    (P.layouts || []).forEach((lay) => {
      if (old.length && (lay.backgrounds || []).some((b) => old.includes(b.image))) { lay.backgrounds = lay.backgrounds.filter((b) => !old.includes(b.image)); lay.bgColor = "#24246d"; }
      const drop = new Set(Object.values(P.actors || {}).filter((a) => ["Voador (exemplo)", "Torreta (exemplo)", "Atirador (exemplo)", "Perseguidor (exemplo)"].includes(a.name)).map((a) => a.id));
      lay.instances = (lay.instances || []).filter((i) => !drop.has(i.actor));
    });
    old.forEach((id) => { delete P.images[id]; delete images[id]; delete SRC[id]; });
  }
  // tronco do corpo dividido: pistol_* virou top_* (um tronco para todas as armas)
  const REN = { pistol_top: "top_gun", pistol_shoot: "top_shoot", pistol_up: "top_up", pistol_up_shoot: "top_up_shoot", pistol_diag: "top_diag", pistol_diag_shoot: "top_diag_shoot" };
  Object.values(P.actors || {}).forEach((a) => (a.anims || []).forEach((an) => { if (REN[an.name]) an.name = REN[an.name]; }));
  if (P.template === "beatemup_side") { P.template = "beatemup"; P.move = "side"; }
  if (!P.move) P.move = "8dir";
  // "fall" virou "knockback" (a queda do pulo agora e "jump_fall")
  Object.values(P.actors || {}).forEach((a) => {
    if (!(a.anims || []).some((x) => x.name === "knockback" || x.name === "knockdown" || x.name === "jump_fall")) (a.anims || []).forEach((an) => { if (an.name === "fall") an.name = "knockback"; });   // só em projetos muito antigos; "fall" não é queda
    (a.attacks || []).forEach((k) => { if (k.anim === "fall") k.anim = "knockback"; });
    // inimigos e chefes ganham as animacoes novas (vazias) para desenhar
    if (a.kind === "enemy" || a.kind === "boss" || a.kind === "player") DEFAULT_ANIMS[a.kind].forEach((n) => { if (!a.anims.some((x) => x.name === n)) a.anims.push({ id: uid("an_"), name: n, speed: 10, loop: false, frames: [] }); });
  });
}

document.getElementById("btn-play").addEventListener("click", () => { window.testStartLayout = -1; Player.open(); });
document.getElementById("btn-play-here").addEventListener("click", () => { window.testStartLayout = P.layouts.indexOf(L); Player.open(); });
window.addEventListener("keydown", (e) => { if (e.key === "F12") { e.preventDefault(); window.testStartLayout = e.shiftKey ? P.layouts.indexOf(L) : -1; Player.open(); } if (e.key === "Escape" && Player.isOpen()) Player.close(); });

document.getElementById("tab-layout").addEventListener("click", () => { FlowEditor.show(false); EventSheet.show(false); });
document.getElementById("tab-flow").addEventListener("click", () => FlowEditor.show(true));
document.getElementById("tab-events").addEventListener("click", () => EventSheet.show(true));
