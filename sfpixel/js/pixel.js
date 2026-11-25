/* SF Pixel - editor de pixel art e animacao com as regras do Super Nintendo (motor de luta SF Engine).
 * O desenho e indexado: cada pixel guarda o slot da paleta (0 = transparente, 1..15 = cores), entao o sprite nunca passa de 15 cores.
 * Cada cor e uma das 32768 do SNES (5 bits por canal). A chave da cor e o proprio valor da CGRAM: 0BBBBBGGGGGRRRRR.
 * Camadas especiais (hitbox, hitbox 2, hurtbox, ancora) guardam so 0/1: o retangulo e a caixa que cobre o que foi marcado. */
"use strict";

/* ================================================================== cores do Super Nintendo */
const show = (l) => Math.round(l * 255 / 31);
const lvl = (v) => Math.min(31, Math.round(v * 31 / 255));
const rgbK = (k) => [show(k & 31), show((k >> 5) & 31), show((k >> 10) & 31)];
const keyOf = (r, g, b) => lvl(r) | (lvl(g) << 5) | (lvl(b) << 10);
const css = (k) => `rgb(${rgbK(k)})`;
const hexW = (k) => "$" + k.toString(16).toUpperCase().padStart(4, "0");
const hex9 = hexW;
function hsv(k) {
  const [r, g, b] = rgbK(k).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx, l: 0.299 * r + 0.587 * g + 0.114 * b };
}
/* rampas: cada tom (r,g,b em proporcao) do mais escuro ao mais claro, passando pelo branco */
function ramps() {
  const out = [];
  const bases = [[1, 0, 0], [1, .5, 0], [1, 1, 0], [.5, 1, 0], [0, 1, 0], [0, 1, .5], [0, 1, 1], [0, .5, 1], [0, 0, 1], [.5, 0, 1], [1, 0, 1], [1, 0, .5], [1, .5, .5], [.5, 1, .5], [.5, .5, 1], [1, 1, .5], [1, .75, .5], [.75, .5, .25]];
  const names = ["Vermelho", "Laranja", "Amarelo", "Limão", "Verde", "Esmeralda", "Ciano", "Céu", "Azul", "Violeta", "Magenta", "Rosa", "Salmão", "Menta", "Lavanda", "Creme", "Pele", "Marrom"];
  out.push(["Cinza", Array.from({ length: 16 }, (_, v) => { const g = Math.round(v * 31 / 15); return g | (g << 5) | (g << 10); })]);
  bases.forEach((b, i) => {
    const row = [];
    for (let st = 1; st <= 16; st++) {
      const t = st / 8, c = b.map((x) => Math.min(31, Math.round((t <= 1 ? x * t : x + (1 - x) * (t - 1)) * 31)));
      const k = c[0] | (c[1] << 5) | (c[2] << 10);
      if (!row.includes(k)) row.push(k);
    }
    out.push([names[i], row]);
  });
  return out;
}
const SNES_RAMPS = ramps();
{
  const hx = (h) => { const n = parseInt(h.slice(1), 16); return keyOf(n >> 16, (n >> 8) & 255, n & 255); };
  SNES_RAMPS.unshift(["Nintendo", ["#0D0C0C", "#A5A2A2", "#E5E5E5", "#FFFFFF", "#DD2020"].map(hx)], ["Lavanda", ["#E6DFF2", "#C7B7E0", "#A78FC6", "#7A5C9B", "#50365F"].map(hx)]);
}
const LIGHT = () => document.documentElement.getAttribute("data-theme") === "claro";
function applyTheme(t) { try { if (t) localStorage.setItem("sfpixel-theme", t); else t = localStorage.getItem("sfpixel-theme"); } catch (e) { /* sem armazenamento */ } document.documentElement.setAttribute("data-theme", t === "claro" ? "claro" : "escuro"); }
applyTheme();

/* ================================================================== documento */
let doc = null;
const cur = { layer: 0, frame: 0 };
let tabs = [], tabIx = 0, range = null;   // abas abertas; range = quadros marcados na timeline
let fg = 1, bg = 0, tool = "pencil", brush = 1, zoom = 8, panX = 0, panY = 0;
let sel = null, float = null, onion = true, showGrid = false, showTiles = false, showSplit = true, playing = null, pixelPerfect = false;
let palSlotEdit = -1, contiguous = true, recolorAll = true, tlFocus = false;

function defaultPal() { return [0, 0, 73, 146, 219, 511, 448, 504, 56, 7, 63, 288, 164, 101, 455, 365].map((k) => { const r = Math.round(((k >> 6) & 7) * 31 / 7), g = Math.round(((k >> 3) & 7) * 31 / 7), b = Math.round((k & 7) * 31 / 7); return r | (g << 5) | (b << 10); }); }
function newDoc(w, h, name) {
  return { name: name || "sprite", w, h, pal: defaultPal(), loop: "loop", tags: [], layers: [{ name: "Camada 1", vis: true, lock: false }], frames: [{ d: 100 }], cels: [[new Uint8Array(w * h)]] };
}
function cel(l = cur.layer, f = cur.frame) { return doc.cels[l][f]; }

/* ================================================================== desfazer */
let undo = [], redo = [];
const cpSel = (x) => x && { ...x, m: x.m && x.m.slice() };
function snap() { if (doc.kind === "map") return MAP.snap(); return { w: doc.w, h: doc.h, pal: doc.pal.slice(), loop: doc.loop, tags: doc.tags.map((t) => ({ ...t })), layers: doc.layers.map((l) => ({ ...l })), frames: doc.frames.map((f) => ({ ...f })), cels: doc.cels.map((r) => r.map((a) => a.slice())), cur: { ...cur }, sel: cpSel(sel) }; }
function restore(s) { if (s.kind === "map") { MAP.restore(s); Object.assign(cur, s.cur); return; } Object.assign(doc, { w: s.w, h: s.h, pal: s.pal, loop: s.loop, tags: s.tags, layers: s.layers, frames: s.frames, cels: s.cels }); Object.assign(cur, s.cur); clampCur(); sel = s.sel && s.sel.m && s.sel.m.length !== doc.w * doc.h ? null : cpSel(s.sel); }
function push() { undo.push(snap()); if (undo.length > 200) undo.shift(); redo = []; dirty(); }
function doUndo() { dropFloat(true); if (!undo.length) return; redo.push(snap()); restore(undo.pop()); renderAll(); }
function doRedo() { if (!redo.length) return; undo.push(snap()); restore(redo.pop()); renderAll(); }
function clampCur() { cur.layer = Math.max(0, Math.min(cur.layer, doc.layers.length - 1)); cur.frame = Math.max(0, Math.min(cur.frame, doc.frames.length - 1)); }
let saveT = 0;
function dirty() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { tabs[tabIx] = tabState(); localStorage.setItem("sfpixel-tabs", JSON.stringify({ ix: tabIx, docs: tabs.map((t) => serialize(t.doc)) })); } catch (e) { /* cheio */ } }, 800);
  renderTabs();
}

/* ================================================================== composicao */
function composite(f, out) {
  out = out || new Uint8Array(doc.w * doc.h);
  out.fill(0);
  doc.layers.forEach((L, li) => {
    if (!L.vis || L.kind) return;   // camadas de caixa nao fazem parte da arte
    const c = doc.cels[li][f];
    for (let i = 0; i < c.length; i++) if (c[i]) out[i] = c[i];
    if (float && li === cur.layer && f === cur.frame) stampFloat(out);
  });
  return out;
}
function stampFloat(out) {
  const F = float;
  for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
    const v = F.data[y * F.w + x], X = F.x + x, Y = F.y + y;
    if (v && X >= 0 && Y >= 0 && X < doc.w && Y < doc.h) out[Y * doc.w + X] = v;
  }
}
function toImageData(idx, tint, alpha) {
  const d = new ImageData(doc.w, doc.h), P = doc.pal.map(rgbK);
  for (let i = 0; i < idx.length; i++) {
    const v = idx[i]; if (!v) continue;
    if (!P[v]) continue;   /* slot que nao existe nesta paleta: nao desenha (em vez de travar) */
    let [r, g, b] = P[v];
    if (tint) { r = (r + tint[0]) >> 1; g = (g + tint[1]) >> 1; b = (b + tint[2]) >> 1; }
    d.data[i * 4] = r; d.data[i * 4 + 1] = g; d.data[i * 4 + 2] = b; d.data[i * 4 + 3] = alpha || 255;
  }
  return d;
}

/* ================================================================== divisao em sprites do hardware
 * O Mega Drive desenha sprites de 1x1 ate 4x4 tiles (8 a 32 px). Um quadro maior vira varios sprites.
 * Corta o quadro em blocos de 32x32 a partir do primeiro tile usado e encolhe cada bloco
 * ate os tiles que tem pixel (tiles vazios nao gastam VRAM). */
/* Corte em pedacos 16x16 igual ao tools/mkfight.py da engine: faixas de 16 px a partir do topo da arte, andando em x e cobrindo o que tem pixel.
 * Testa de 0 a 15 linhas vazias acima e fica com o que gasta menos pedacos. Devolve {x,y,w,h} em unidades de 8 px (pode ser fracionario). */
function cutPieces(idx, w, h, y0, y1, x0, x1, dy) {
  const at = (x, y) => (x >= x0 && x <= x1 && y >= y0 && y <= y1 ? idx[y * w + x] : 0), out = [];
  for (let y = y0 - dy; y <= y1; y += 16) {
    for (let x = x0; x <= x1;) {
      let any = false;
      for (let yy = y; yy < Math.min(y + 16, y1 + 1); yy++) if (yy >= y0 && at(x, yy)) { any = true; break; }
      if (any) { out.push({ px: x, py: y }); x += 16; } else x++;
    }
  }
  return out;
}
function hwSplit(idx) {
  let x0 = doc.w, y0 = doc.h, x1 = -1, y1 = -1;
  for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) if (idx[y * doc.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return [];
  let best = null, bd = 0;
  for (let dy = 0; dy < 16; dy++) { const p = cutPieces(idx, doc.w, doc.h, y0, y1, x0, x1, dy); if (!best || p.length < best.length) { best = p; bd = dy; } }
  return best.map((q) => ({ x: q.px / 8, y: q.py / 8, w: 2, h: 2, px: q.px, py: q.py, dy: bd }));
}
function boxOf(li, f) {   // retangulo que cobre o que foi marcado na camada de caixa
  const c = doc.cels[li][f]; let x0 = doc.w, y0 = doc.h, x1 = -1, y1 = -1;
  for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) if (c[y * doc.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
const KIND_INFO = { hitbox: ["Hitbox", "255,60,60"], hitbox2: ["Hitbox 2", "255,150,40"], hurtbox: ["Hurtbox", "60,220,90"], anchor: ["Âncora (pés)", "70,140,255"] };
function kindLayer(kind) { return doc.layers.findIndex((L) => L.kind === kind); }
const LIM_PIECES = 24, LIM_ROM_KB = 1024;
function frameStats(f) {
  const idx = composite(f), sp = hwSplit(idx);
  let maxLine = 0;
  for (let y = 0; y < doc.h; y++) maxLine = Math.max(maxLine, sp.filter((r) => y >= r.py && y < r.py + 16).length);
  const px = idx.reduce((n, v) => n + (v ? 1 : 0), 0);
  return { sp, pieces: sp.length, tiles: sp.length * 4, bytes: sp.length * 128, maxLine, px };
}

/* ================================================================== tela */
const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
const off = document.createElement("canvas"), og = off.getContext("2d");
let hover = null, preview = null;      // preview = pixels temporarios (linha, retangulo...)

function fitView() {
  const r = cv.getBoundingClientRect();
  zoom = Math.max(1, Math.min(32, Math.floor(Math.min((r.width - 40) / doc.w, (r.height - 40) / doc.h))));
  panX = Math.round((r.width - doc.w * zoom) / 2); panY = Math.round((r.height - doc.h * zoom) / 2);
}
function render() {
  if (doc.kind === "map") return MAP.render();
  const r = cv.getBoundingClientRect();
  if (cv.width !== Math.round(r.width) || cv.height !== Math.round(r.height)) { cv.width = Math.round(r.width); cv.height = Math.round(r.height); }
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--view").trim() || "#070606"; ctx.fillRect(0, 0, cv.width, cv.height);
  const W = doc.w * zoom, H = doc.h * zoom;
  // xadrez (transparente)
  const cs = 16 * zoom;   /* quadrados de 16x16 pixels do sprite, como no Aseprite */
  ctx.save(); ctx.beginPath(); ctx.rect(panX, panY, W, H); ctx.clip();
  for (let y = 0; y < H; y += cs) for (let x = 0; x < W; x += cs) { ctx.fillStyle = ((x + y) / cs) & 1 ? (LIGHT() ? "#e5e5e5" : "#3a3d45") : (LIGHT() ? "#d0cece" : "#2f3138"); ctx.fillRect(panX + x, panY + y, cs, cs); }
  off.width = doc.w; off.height = doc.h;
  // papel de cebola: quadro anterior avermelhado, proximo azulado
  if (onion && !playing) {
    [[cur.frame - 1, [255, 60, 60]], [cur.frame + 1, [60, 120, 255]]].forEach(([f, t]) => {
      if (f < 0 || f >= doc.frames.length) return;
      og.putImageData(toImageData(composite(f), t, 90), 0, 0); ctx.drawImage(off, panX, panY, W, H);
    });
  }
  const idx = composite(cur.frame);
  { const L = doc.layers[cur.layer]; if (L && L.kind && L.vis) { const c = doc.cels[cur.layer][cur.frame], col = KIND_INFO[L.kind][1]; ctx.fillStyle = `rgba(${col},.45)`; for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) if (c[y * doc.w + x]) ctx.fillRect(panX + x * zoom, panY + y * zoom, zoom, zoom); } }
  if (preview) for (const [x, y, v] of preview) if (x >= 0 && y >= 0 && x < doc.w && y < doc.h) idx[y * doc.w + x] = v;
  og.putImageData(toImageData(idx), 0, 0); ctx.drawImage(off, panX, panY, W, H);
  // caixas (hitbox, hurtbox...) por cima da arte
  doc.layers.forEach((L, li) => {
    if (!L.kind || !L.vis) return;
    const b = boxOf(li, cur.frame), col = KIND_INFO[L.kind][1];
    if (!b) return;
    if (L.kind === "anchor") { const ax = (b.x0 + b.x1 + 1) / 2, ay = b.y1 + 1; ctx.strokeStyle = `rgb(${col})`; ctx.beginPath(); ctx.moveTo(panX + ax * zoom - 8, panY + ay * zoom); ctx.lineTo(panX + ax * zoom + 8, panY + ay * zoom); ctx.moveTo(panX + ax * zoom, panY + ay * zoom - 8); ctx.lineTo(panX + ax * zoom, panY + ay * zoom + 8); ctx.stroke(); return; }
    ctx.fillStyle = `rgba(${col},.22)`; ctx.fillRect(panX + b.x0 * zoom, panY + b.y0 * zoom, (b.x1 - b.x0 + 1) * zoom, (b.y1 - b.y0 + 1) * zoom);
    ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 2; ctx.strokeRect(panX + b.x0 * zoom + 1, panY + b.y0 * zoom + 1, (b.x1 - b.x0 + 1) * zoom - 2, (b.y1 - b.y0 + 1) * zoom - 2); ctx.lineWidth = 1;
  });
  // grades
  if (showGrid && zoom >= 6) {
    ctx.strokeStyle = "rgba(0,0,0,.28)"; ctx.beginPath();
    for (let x = 0; x <= doc.w; x++) { ctx.moveTo(panX + x * zoom + .5, panY); ctx.lineTo(panX + x * zoom + .5, panY + H); }
    for (let y = 0; y <= doc.h; y++) { ctx.moveTo(panX, panY + y * zoom + .5); ctx.lineTo(panX + W, panY + y * zoom + .5); }
    ctx.stroke();
  }
  if (showTiles) {
    ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.beginPath();
    for (let x = 0; x <= doc.w; x += 8) { ctx.moveTo(panX + x * zoom + .5, panY); ctx.lineTo(panX + x * zoom + .5, panY + H); }
    for (let y = 0; y <= doc.h; y += 8) { ctx.moveTo(panX, panY + y * zoom + .5); ctx.lineTo(panX + W, panY + y * zoom + .5); }
    ctx.stroke();
  }
  if (showSplit) {
    ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    hwSplit(idx).forEach((s, i) => {
      ctx.strokeStyle = i & 1 ? "rgba(199,183,224,.95)" : "rgba(122,92,155,.95)";
      ctx.strokeRect(panX + s.x * 8 * zoom + 1, panY + s.y * 8 * zoom + 1, s.w * 8 * zoom - 2, s.h * 8 * zoom - 2);
    });
    ctx.setLineDash([]); ctx.lineWidth = 1;
  }
  ctx.restore();
  ctx.strokeStyle = "#a78fc6"; ctx.strokeRect(panX - .5, panY - .5, W + 1, H + 1);
  // selecao
  const s = float || sel;
  if (s) {
    ctx.strokeStyle = "#fff"; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -(Date.now() / 80 | 0) % 8;
    const lm = float ? float.m : sel.m && sel.m;
    if (!lm) ctx.strokeRect(panX + s.x * zoom + .5, panY + s.y * zoom + .5, s.w * zoom, s.h * zoom);
    else {   // selecao feita de varios retangulos: contorno so nas bordas da mascara
      const inM = float ? (x, y) => x >= 0 && y >= 0 && x < s.w && y < s.h && lm[y * s.w + x] : (x, y) => x >= 0 && y >= 0 && x < doc.w && y < doc.h && lm[y * doc.w + x];
      const ox = float ? s.x : 0, oy = float ? s.y : 0, x0 = float ? 0 : s.x, y0 = float ? 0 : s.y;
      ctx.beginPath();
      for (let y = y0; y < y0 + s.h; y++) for (let x = x0; x < x0 + s.w; x++) {
        if (!inM(x, y)) continue;
        const X = panX + (ox + x) * zoom + .5, Y = panY + (oy + y) * zoom + .5;
        if (!inM(x, y - 1)) { ctx.moveTo(X, Y); ctx.lineTo(X + zoom, Y); }
        if (!inM(x, y + 1)) { ctx.moveTo(X, Y + zoom); ctx.lineTo(X + zoom, Y + zoom); }
        if (!inM(x - 1, y)) { ctx.moveTo(X, Y); ctx.lineTo(X, Y + zoom); }
        if (!inM(x + 1, y)) { ctx.moveTo(X + zoom, Y); ctx.lineTo(X + zoom, Y + zoom); }
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (float && float.tf) {   // alcas do Transformar (Ctrl+T)
      ctx.strokeStyle = "#a78fc6"; ctx.strokeRect(panX + s.x * zoom + .5, panY + s.y * zoom + .5, s.w * zoom, s.h * zoom);
      tfHandles().forEach(([hx, hy]) => { ctx.fillStyle = "#fff"; ctx.fillRect(hx - 4, hy - 4, 8, 8); ctx.strokeStyle = "#000"; ctx.strokeRect(hx - 3.5, hy - 3.5, 7, 7); });
    }
  }
  // cursor do pincel
  if (hover && ["pencil", "eraser"].includes(tool)) {
    const o = Math.floor((brush - 1) / 2);
    ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.strokeRect(panX + (hover.x - o) * zoom + .5, panY + (hover.y - o) * zoom + .5, brush * zoom, brush * zoom);
  }
  document.getElementById("st-zoom").textContent = `${zoom * 100}% · ${doc.w}×${doc.h}`;
}
setInterval(() => { if (doc && doc.kind !== "map" && (sel || float)) render(); }, 160);   // formigas da selecao

/* ================================================================== ferramentas */
const TOOLS = [
  ["select", "M", "Seleção retangular"], ["selellipse", "M", "Seleção elíptica"], ["wand", "W", "Varinha mágica"], ["move", "V", "Mover"], ["sep"],
  ["pencil", "B", "Lápis"], ["eraser", "E", "Borracha"], ["picker", "I", "Conta-gotas (ou Alt)"], ["fill", "G", "Balde de tinta"], ["recolor", "Shift+G", "Balde de troca (troca a cor em todos os quadros)"], ["dither", "D", "Dithering (degradê)"], ["sep"],
  ["line", "L", "Linha"], ["rect", "U", "Retângulo"], ["rectfill", "U", "Retângulo cheio"], ["ellipse", "Shift+U", "Elipse"], ["ellipsefill", "Shift+U", "Elipse cheia"], ["sep"],
  ["hand", "H", "Mão (ou Espaço)"], ["zoom", "Z", "Zoom"],
];
/* grupos: segure o clique (ou botao direito) no icone para ver as outras ferramentas do grupo */
const TGROUPS = [["select", "selellipse", "wand"], ["rect", "rectfill"], ["ellipse", "ellipsefill"]];
const groupOf = (t) => TGROUPS.find((g) => g.includes(t));
const groupPick = {};
const IC = {
  select: '<rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/>',
  move: '<path d="M12 2l3 3h-2v6h6V9l3 3-3 3v-2h-6v6h2l-3 3-3-3h2v-6H5v2l-3-3 3-3v2h6V5H9z" fill="currentColor"/>',
  pencil: '<path d="M4 20l1-5L16 4l4 4L9 19z M14 6l4 4" fill="none" stroke="currentColor" stroke-width="2"/>',
  eraser: '<path d="M3 17l9-9 6 6-5 5H7z M8 20h13" fill="none" stroke="currentColor" stroke-width="2"/>',
  picker: '<path d="M19 3l2 2-4 4 1 1-2 2-1-1-8 8H4v-3l8-8-1-1 2-2 1 1z" fill="none" stroke="currentColor" stroke-width="2"/>',
  recolor: '<path d="M4 12l6-6 6 6-6 6z M4 12h12" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="5" r="2" fill="currentColor"/><circle cx="20" cy="12" r="2" fill="currentColor"/><circle cx="20" cy="19" r="2" fill="currentColor"/>',
  fill: '<path d="M5 11l7-7 7 7-7 7z M19 15s2 3 2 4a2 2 0 01-4 0c0-1 2-4 2-4z" fill="none" stroke="currentColor" stroke-width="2"/>',
  line: '<path d="M4 20L20 4" stroke="currentColor" stroke-width="2.5"/>',
  selellipse: '<ellipse cx="12" cy="12" rx="8" ry="7" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/>',
  wand: '<path d="M4 20L15 9" stroke="currentColor" stroke-width="2.5"/><path d="M17 2v4M15 4h4M20 8v3M18.5 9.5h3M11 3v2M10 4h2" stroke="currentColor" stroke-width="1.6"/>',
  dither: '<path fill="currentColor" d="M3 3h3v3H3zM9 3h3v3H9zM15 3h3v3h-3zM6 6h3v3H6zM12 6h3v3h-3zM18 6h3v3h-3zM3 9h3v3H3zM9 9h3v3H9zM15 9h3v3h-3zM12 12h3v3h-3zM18 12h3v3h-3zM3 15h3v3H3zM15 15h3v3h-3zM18 18h3v3h-3zM9 18h3v3H9z"/>',
  rect: '<rect x="4" y="6" width="16" height="12" fill="none" stroke="currentColor" stroke-width="2"/>',
  rectfill: '<rect x="4" y="6" width="16" height="12" fill="currentColor"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6" fill="none" stroke="currentColor" stroke-width="2"/>',
  ellipsefill: '<ellipse cx="12" cy="12" rx="8" ry="6" fill="currentColor"/>',
  hand: '<path d="M8 12V5a1.5 1.5 0 013 0v6V4a1.5 1.5 0 013 0v7V5a1.5 1.5 0 013 0v9c0 4-3 7-6 7s-5-2-7-5l-2-3a1.5 1.5 0 012.5-1.5L8 14z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  zoom: '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 15l6 6M7 10h6M10 7v6" stroke="currentColor" stroke-width="2"/>',
};
function renderToolbar() {
  if (doc.kind === "map") return MAP.toolbar();
  const tb = document.getElementById("toolbar"); tb.innerHTML = "";
  const act = quickT || tool;
  TOOLS.forEach(([t, k, n]) => {
    if (t === "sep") { const s = document.createElement("span"); s.className = "sep"; tb.appendChild(s); return; }
    const g = groupOf(t);
    if (g) { const show = g.includes(act) ? act : groupPick[g[0]] || g[0]; if (t !== show) return; }
    const b = document.createElement("button"); b.title = `${n} (${k})` + (g ? " · segure para ver as outras" : ""); b.className = (t === act ? "on" : "") + (g ? " grp" : "");
    b.innerHTML = `<svg viewBox="0 0 24 24">${IC[t]}</svg>`;
    if (!g) b.onclick = () => setTool(t);
    else {
      let timer = null, opened = false;
      b.onmousedown = (e) => { opened = false; if (e.button === 2) return; timer = setTimeout(() => { opened = true; toolFly(b, g); }, 350); };
      b.onmouseup = (e) => { clearTimeout(timer); if (!opened && e.button === 0) setTool(t); };
      b.onmouseleave = () => clearTimeout(timer);
      b.oncontextmenu = (e) => { e.preventDefault(); toolFly(b, g); };
    }
    tb.appendChild(b);
  });
}
function toolFly(b, g) {
  document.querySelectorAll(".toolfly").forEach((x) => x.remove());
  const r = b.getBoundingClientRect(), f = document.createElement("div"); f.className = "toolfly";
  g.forEach((t) => {
    const [, k, n] = TOOLS.find((x) => x[0] === t), o = document.createElement("button");
    o.className = t === tool ? "on" : ""; o.innerHTML = `<svg viewBox="0 0 24 24">${IC[t]}</svg><span>${n}</span><kbd>${k}</kbd>`;
    o.onmouseup = o.onclick = (e) => { e.stopPropagation(); f.remove(); setTool(t); };
    f.appendChild(o);
  });
  document.body.appendChild(f);
  f.style.top = r.top + "px"; f.style.left = (r.left - f.offsetWidth - 4) + "px";
  setTimeout(() => window.addEventListener("mousedown", function off(e) { if (!f.contains(e.target)) { f.remove(); window.removeEventListener("mousedown", off); } }), 0);
}
function setTool(t) { if (doc.kind === "map") return MAP.setTool(t); if (t !== "move") dropFloat(); tool = t; const g = groupOf(t); if (g) groupPick[g[0]] = t; cv.style.cursor = cursorFor(t); renderToolbar(); renderToolOpts(); render(); }
function renderToolOpts() {
  if (doc.kind === "map") return MAP.toolopts();
  const o = document.getElementById("toolopts"); const name = (TOOLS.find((x) => x[0] === tool) || [])[2];
  let h = `<b>${name}</b>`;
  if (["pencil", "eraser", "line", "rect", "ellipse"].includes(tool)) h += `<label>Pincel <input id="o-brush" type="number" min="1" max="16" value="${brush}"></label>`;
  if (tool === "pencil") h += `<label><input id="o-pp" type="checkbox" ${pixelPerfect ? "checked" : ""}> Pixel perfeito</label>`;
  if (tool === "wand") h += `<label title="Marcado: só a área ligada. Desmarcado: todos os pixels daquela cor na camada."><input id="o-cont" type="checkbox" ${contiguous ? "checked" : ""}> Contínuo</label><span class="hint">Shift soma · Alt tira</span>`;
  if (tool === "selellipse") h += `<span class="hint">Arraste para selecionar · Shift soma · Alt tira · Ctrl+T transforma</span>`;
  if (tool === "dither") h += `<label>Matriz <select id="o-dn">${[2, 4, 8].map((n) => `<option ${n === ditherN ? "selected" : ""} value="${n}">${n}×${n}</option>`).join("")}</select></label><label title="Desmarcado: onde cairia a cor de fundo fica como está (útil quando o fundo é o slot 0)"><input id="o-dbg" type="checkbox" ${ditherBg ? "checked" : ""}> Pintar a cor de fundo</label><span class="hint">Arraste na direção do degradê: começa na cor de frente e vai para a de fundo · Shift trava em 45° · pinta dentro da seleção ou, sem seleção, só na área da cor onde você começou a arrastar</span>`;
  if (tool === "recolor") h += `<label title="Desmarcado: troca só nos quadros da animação (tag) do quadro atual"><input id="o-rall" type="checkbox" ${recolorAll ? "checked" : ""}> Todas as animações</label><span class="hint">Clique num pixel: aquela cor vira a cor de frente em todos os quadros e camadas</span>`;
  if (tool === "fill") h += `<label title="Marcado: pinta só a área ligada. Desmarcado: pinta todos os pixels daquela cor na camada."><input id="o-cont" type="checkbox" ${contiguous ? "checked" : ""}> Contínuo</label>`;
  if (tool === "select") h += `<span class="hint">Arraste para selecionar · Shift soma outro retângulo · Alt tira · Ctrl+T transforma · Ctrl+A tudo · Ctrl+D tira a seleção · Delete apaga</span>`;
  if (tool === "move") h += `<span class="hint">Arraste para mover a seleção (ou a camada inteira) · setas movem 1 px · Enter solta</span>`;
  h += `<span style="margin-left:auto" class="hint">Botão direito pinta com a cor de fundo</span>`;
  o.innerHTML = h;
  const bi = document.getElementById("o-brush"); if (bi) bi.onchange = () => { brush = Math.max(1, Math.min(16, +bi.value || 1)); };
  const ct = document.getElementById("o-cont"); if (ct) ct.onchange = () => { contiguous = ct.checked; };
  const ra = document.getElementById("o-rall"); if (ra) ra.onchange = () => { recolorAll = ra.checked; };
  const dn = document.getElementById("o-dn"); if (dn) dn.onchange = () => { ditherN = +dn.value; };
  const dbg = document.getElementById("o-dbg"); if (dbg) dbg.onchange = () => { ditherBg = dbg.checked; };
  const pp = document.getElementById("o-pp"); if (pp) pp.onchange = () => { pixelPerfect = pp.checked; };
}

function inSel(x, y) { return !sel || (x >= sel.x && y >= sel.y && x < sel.x + sel.w && y < sel.y + sel.h && (!sel.m || sel.m[y * doc.w + x] === 1)); }
/* selecao com mascara (varios retangulos com Shift, tirar com Alt) */
function selMask(s) { const m = new Uint8Array(doc.w * doc.h); if (s) for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) if (!s.m || s.m[y * doc.w + x]) m[y * doc.w + x] = 1; return m; }
function selFromMask(m) {
  let x0 = doc.w, y0 = doc.h, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) if (m[y * doc.w + x]) { n++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  return n === w * h ? { x: x0, y: y0, w, h } : { x: x0, y: y0, w, h, m };
}
function put(c, x, y, v) { if (v && doc.layers[cur.layer] && doc.layers[cur.layer].kind) v = 1; if (x >= 0 && y >= 0 && x < doc.w && y < doc.h && inSel(x, y)) c[y * doc.w + x] = v; }
function dab(c, x, y, v) { const o = Math.floor((brush - 1) / 2); for (let j = 0; j < brush; j++) for (let i = 0; i < brush; i++) put(c, x - o + i, y - o + j, v); }
function linePts(x0, y0, x1, y1) {
  const pts = [], dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
  for (;;) { pts.push([x0, y0]); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  return pts;
}
function shapePts(t, a, b) {
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), pts = [];
  if (t === "line") return linePts(a.x, a.y, b.x, b.y);
  if (t === "rect" || t === "rectfill") {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (t === "rectfill" || x === x0 || x === x1 || y === y0 || y === y1) pts.push([x, y]);
    return pts;
  }
  // elipse: pixel dentro se (dx/rx)^2+(dy/ry)^2 <= 1; contorno = dentro com vizinho fora
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 + .5, ry = (y1 - y0) / 2 + .5;
  const inside = (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inside(x, y)) continue;
    if (t === "ellipsefill" || !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) pts.push([x, y]);
  }
  return pts;
}
/* varinha magica: pixels da mesma cor (ligados, ou todos se "Contínuo" desmarcado) na camada atual */
function wandMask(p) {
  if (p.x < 0 || p.y < 0 || p.x >= doc.w || p.y >= doc.h) return null;
  const c = cel(), W = doc.w, t = c[p.y * W + p.x], m = new Uint8Array(W * doc.h);
  if (!contiguous) { for (let i = 0; i < c.length; i++) if (c[i] === t) m[i] = 1; return m; }
  const st = [p.y * W + p.x];
  while (st.length) {
    const i = st.pop(); if (m[i] || c[i] !== t) continue; m[i] = 1; const x = i % W;
    if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (i >= W) st.push(i - W); if (i + W < c.length) st.push(i + W);
  }
  return m;
}
/* Dithering (D): degrade da cor de frente para a de fundo na direcao arrastada, com matriz de Bayer 2x2/4x4/8x8 */
let ditherN = 4, ditherBg = true;
function bayer(n) { let m = [[0]]; for (let s = 1; s < n; s *= 2) { const k = []; for (let y = 0; y < s * 2; y++) { k.push([]); for (let x = 0; x < s * 2; x++) { const v = m[y % s][x % s] * 4; k[y].push(v + [[0, 2], [3, 1]][(y / s) | 0][(x / s) | 0]); } } m = k; } return m; }
function ditherPts(a, b, snap, region) {   // region: sem selecao, so a area da cor onde comecou o arraste
  if (snap) {   // Shift: angulo de 45 em 45 graus
    const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(b.x - a.x, b.y - a.y);
    b = { x: a.x + Math.round(Math.cos(ang) * len), y: a.y + Math.round(Math.sin(ang) * len) };
  }
  const M = bayer(ditherN), N = ditherN, dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, out = [], c = cel();
  const r = sel || { x: 0, y: 0, w: doc.w, h: doc.h };
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    if (!inSel(x, y) || (region && !region[y * doc.w + x])) continue;
    const t = L2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2)) : 0;
    const v = t * (N * N) > M[y % N][x % N] + .5 ? bg : fg;   // comeca na cor de frente e vai para a de fundo
    if (v === 0 && !ditherBg) continue;
    out.push([x, y, v]);
  }
  return out;
}
/* Ctrl+clique num slot: seleciona na arte onde aquela cor esta */
function selectSlot(i) {
  dropFloat(); push();
  const c = cel(), m = new Uint8Array(doc.w * doc.h); let n = 0;
  for (let k = 0; k < c.length; k++) if (c[k] === i) { m[k] = 1; n++; }
  const frames = []; doc.frames.forEach((f, fi) => { if (doc.cels.some((row) => row[fi] && row[fi].includes(i))) frames.push(fi + 1); });
  sel = selFromMask(m); if (tool !== "move") { tool = "select"; renderToolbar(); renderToolOpts(); }
  render(); renderReport();
  msg(n ? `Slot ${i}: ${n} pixel(s) neste quadro/camada (selecionados).` + (frames.length ? ` Usado nos quadros: ${frames.slice(0, 20).join(", ")}${frames.length > 20 ? "…" : ""}.` : "")
    : frames.length ? `Slot ${i} não está nesta camada/quadro. Aparece nos quadros: ${frames.slice(0, 20).join(", ")}${frames.length > 20 ? "…" : ""}.` : `Slot ${i} não é usado em nenhum quadro.`);
}
function flood(c, x, y, v) {
  if (x < 0 || y < 0 || x >= doc.w || y >= doc.h || !inSel(x, y)) return;
  const t = c[y * doc.w + x]; if (t === v) return;
  const st = [y * doc.w + x];
  while (st.length) {
    const i = st.pop(), px = i % doc.w, py = (i / doc.w) | 0;
    if (c[i] !== t || !inSel(px, py)) continue;
    c[i] = v;
    if (px > 0) st.push(i - 1); if (px < doc.w - 1) st.push(i + 1); if (py > 0) st.push(i - doc.w); if (py < doc.h - 1) st.push(i + doc.w);
  }
}

/* ---------------------------------------------------- selecao flutuante (mover / colar) */
function liftFloat() {
  if (float) return;
  const r = sel || { x: 0, y: 0, w: doc.w, h: doc.h }, c = cel(), data = new Uint8Array(r.w * r.h);
  push();
  const lm = r.m ? new Uint8Array(r.w * r.h) : null;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const i = (r.y + y) * doc.w + r.x + x; if (r.m && !r.m[i]) continue; if (lm) lm[y * r.w + x] = 1; data[y * r.w + x] = c[i]; c[i] = 0; }
  float = { x: r.x, y: r.y, w: r.w, h: r.h, m: lm, data, layer: cur.layer, frame: cur.frame };
}
function dropFloat(discard) {
  if (!float) return;
  const F = float; float = null;
  if (!discard) {
    const c = doc.cels[F.layer] && doc.cels[F.layer][F.frame];
    if (c) for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
      const v = F.data[y * F.w + x], X = F.x + x, Y = F.y + y;
      if (v && X >= 0 && Y >= 0 && X < doc.w && Y < doc.h) c[Y * doc.w + X] = v;
    }
    if (sel) {
      if (!F.m) sel = { x: F.x, y: F.y, w: F.w, h: F.h };
      else { const m = new Uint8Array(doc.w * doc.h); for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) { const X = F.x + x, Y = F.y + y; if (F.m[y * F.w + x] && X >= 0 && Y >= 0 && X < doc.w && Y < doc.h) m[Y * doc.w + X] = 1; } sel = selFromMask(m); }
    }
    dirty();
  }
  render(); renderTimeline(); renderReport();
}
/* ---------------------------------------------------- Transformar (Ctrl+T): alcas para aumentar/reduzir a selecao */
function startTransform() {
  if (doc.kind === "map") return;
  if (!sel && !float) { msg("Marque uma área com a seleção (M) e aperte Ctrl+T."); return; }
  liftFloat();
  float.tf = { S: { data: float.data.slice(), m: float.m && float.m.slice(), w: float.w, h: float.h }, L: float.x, T: float.y, W: float.w, H: float.h, ang: 0 };
  tool = "move"; cv.style.cursor = "move"; renderToolbar(); renderToolOpts();
  render(); msg("Transformar: alças = tamanho (Shift mantém proporção) · fora dos cantos = girar (Shift de 15 em 15°) · dentro ou setas = mover · Enter aplica · Esc cancela.");
}
function tfHandles() {
  const F = float, L = panX + F.x * zoom, T = panY + F.y * zoom, R = L + F.w * zoom, B = T + F.h * zoom, mx = (L + R) / 2, my = (T + B) / 2;
  return [[L, T, "nw"], [mx, T, "n"], [R, T, "ne"], [R, my, "e"], [R, B, "se"], [mx, B, "s"], [L, B, "sw"], [L, my, "w"]];
}
function tfHit(e) {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  for (const [hx, hy, n] of tfHandles()) if (Math.abs(x - hx) <= 6 && Math.abs(y - hy) <= 6) return n;
  const F = float, L = panX + F.x * zoom, T = panY + F.y * zoom, R = L + F.w * zoom, B = T + F.h * zoom;
  if (x >= L && y >= T && x < R && y < B) return "move";
  if (x >= L - 24 && y >= T - 24 && x < R + 24 && y < B + 24) return "rot";   // perto dos cantos, por fora: girar
  return null;
}
function tfCursor(h) { return !h ? "default" : h === "move" ? "move" : h === "rot" ? "alias" : { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize" }[h]; }
function tfScaled(S, W, H) {   // vizinho mais proximo: nao cria cores novas
  const data = new Uint8Array(W * H), m = S.m ? new Uint8Array(W * H) : null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const j = Math.min(S.h - 1, Math.floor((y + .5) * S.h / H)) * S.w + Math.min(S.w - 1, Math.floor((x + .5) * S.w / W));
    data[y * W + x] = S.data[j]; if (m) m[y * W + x] = S.m[j];
  }
  return { data, m, w: W, h: H };
}
function tfBuild() {
  const t = float.tf; let A = tfScaled(t.S, t.W, t.H);
  if (!t.ang) { Object.assign(float, { data: A.data, m: A.m, w: A.w, h: A.h, x: t.L, y: t.T }); return; }
  const c = Math.cos(t.ang), s = Math.sin(t.ang), nw = Math.ceil(Math.abs(A.w * c) + Math.abs(A.h * s)), nh = Math.ceil(Math.abs(A.w * s) + Math.abs(A.h * c));
  const data = new Uint8Array(nw * nh), m = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const dx = x + .5 - nw / 2, dy = y + .5 - nh / 2, sx = Math.floor(dx * c + dy * s + A.w / 2), sy = Math.floor(-dx * s + dy * c + A.h / 2);
    if (sx < 0 || sy < 0 || sx >= A.w || sy >= A.h) continue;
    const j = sy * A.w + sx; if (A.m && !A.m[j]) continue; data[y * nw + x] = A.data[j]; m[y * nw + x] = 1;
  }
  Object.assign(float, { data, m, w: nw, h: nh, x: Math.round(t.L + t.W / 2 - nw / 2), y: Math.round(t.T + t.H / 2 - nh / 2) });
}
function tfDrag(p, keep, e) {
  const d = drag, r = d.r, t = float.tf, dx = p.x - d.a.x, dy = p.y - d.a.y, h = d.h;
  if (h === "move") { t.L = r.L + dx; t.T = r.T + dy; tfBuild(); return; }
  if (h === "rot") {
    const b = cv.getBoundingClientRect(), cx = panX + (t.L + t.W / 2) * zoom, cy = panY + (t.T + t.H / 2) * zoom;
    let a = r.ang + Math.atan2(e.clientY - b.top - cy, e.clientX - b.left - cx) - d.a0;
    if (keep) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
    t.ang = a; tfBuild(); return;
  }
  let L = r.L, T = r.T, R = r.L + r.W, B = r.T + r.H;
  if (h.includes("w")) L = Math.min(R - 1, L + dx); if (h.includes("e")) R = Math.max(L + 1, R + dx);
  if (h.includes("n")) T = Math.min(B - 1, T + dy); if (h.includes("s")) B = Math.max(T + 1, B + dy);
  if (keep) {   // Shift: mantem a proporcao original
    const a = t.S.w / t.S.h; let w = R - L, hh = B - T;
    if (h === "n" || h === "s") w = Math.max(1, Math.round(hh * a)); else if (h === "e" || h === "w") hh = Math.max(1, Math.round(w / a));
    else if (w / hh > a) hh = Math.max(1, Math.round(w / a)); else w = Math.max(1, Math.round(hh * a));
    if (h.includes("w")) L = R - w; else R = L + w;
    if (h.includes("n")) T = B - hh; else B = T + hh;
  }
  Object.assign(t, { L, T, W: R - L, H: B - T }); tfBuild();
}
let clipboard = null;
function copySel(cut) {
  const r = sel || { x: 0, y: 0, w: doc.w, h: doc.h }, c = cel(), data = new Uint8Array(r.w * r.h);
  if (float) { clipboard = { w: float.w, h: float.h, data: float.data.slice(), x: float.x, y: float.y, pal: doc.pal.slice() }; msg("Copiado."); return; }
  if (cut) push();
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const i = (r.y + y) * doc.w + r.x + x; if (r.m && !r.m[i]) continue; data[y * r.w + x] = c[i]; if (cut) c[i] = 0; }
  clipboard = { w: r.w, h: r.h, data, x: r.x, y: r.y, pal: doc.pal.slice() };   /* guarda as cores, nao so os slots */
  if (cut) renderAll();
  msg(cut ? "Recortado." : "Copiado.");
}
function paste() {
  if (!clipboard) return;
  if (doc.kind === "map") { msg("Colar arte de sprite num cenário ainda não dá."); return; }
  dropFloat(); push();
  // colando em outra aba: cada cor vai para o slot dessa paleta que tem a mesma cor (ou para um slot livre/novo)
  const used = usedSlots(), map = new Map([[0, 0]]), added = [];
  const data = clipboard.data.map((v) => {
    if (map.has(v)) return map.get(v);
    const k = clipboard.pal ? clipboard.pal[v] : doc.pal[v];
    let s = doc.pal.indexOf(k, 1);
    if (s < 1) { for (let i = 1; i < doc.pal.length; i++) if (!used.has(i) && !added.includes(i)) { s = i; break; } if (s < 1 && doc.pal.length < 256) { s = doc.pal.length; doc.pal.push(k); } if (s > 0) { doc.pal[s] = k; added.push(s); } }
    if (s < 1) s = 1;
    map.set(v, s); return s;
  });
  const x = Math.max(0, Math.min(clipboard.x, doc.w - clipboard.w)), y = Math.max(0, Math.min(clipboard.y, doc.h - clipboard.h));
  float = { x, y, w: clipboard.w, h: clipboard.h, data, layer: cur.layer, frame: cur.frame };
  sel = { x, y, w: clipboard.w, h: clipboard.h };
  tool = "move"; renderToolbar(); renderToolOpts(); render();
  if (added.length) renderPalettes();
  msg(`Colado${added.length ? ` (${added.length} cor(es) nova(s) na paleta)` : ""}: arraste para posicionar e aperte Enter.` + (clipboard.w > doc.w || clipboard.h > doc.h ? " A arte é maior que o quadro: o que passar fica de fora." : ""));
}

/* ---------------------------------------------------- colar imagem de fora (Aseprite, navegador, print...)
 * Ctrl+V com uma imagem na area de transferencia: vira arte colada (flutuando) com as cores do SNES. Cores novas vao para slots
 * livres da paleta; se nao couber (15 cores), as que sobram viram a cor mais parecida. Sem transparencia na imagem (alguns
 * programas copiam com fundo), a cor dos cantos vira transparente. Copia feita dentro do SF Pixel continua colando com os slots exatos. */
async function pasteImageBlob(blob) {
  if (doc.kind === "map") { msg("Colar imagem num cenário ainda não dá."); return; }
  const bm = await createImageBitmap(blob), c = document.createElement("canvas");
  c.width = bm.width; c.height = bm.height;
  const g = c.getContext("2d"); g.drawImage(bm, 0, 0);
  const D = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height, keys = new Int32Array(W * H);
  let opaque = true;
  for (let i = 0; i < W * H; i++) { if (D[i * 4 + 3] < 128) { keys[i] = -1; opaque = false; } else keys[i] = keyOf(D[i * 4], D[i * 4 + 1], D[i * 4 + 2]); }
  let fundo = false;
  if (opaque && W > 1 && H > 1) {   // sem alfa: a cor que mais aparece nos 4 cantos e o fundo
    const cnt = {}; [0, W - 1, (H - 1) * W, H * W - 1].forEach((i) => (cnt[keys[i]] = (cnt[keys[i]] || 0) + 1));
    const bgk = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    if (cnt[bgk] >= 2) { for (let i = 0; i < W * H; i++) if (keys[i] === bgk) keys[i] = -1; fundo = true; }
  }
  // mesma imagem que foi copiada aqui dentro: cola a copia interna (slots exatos)
  if (clipboard && clipboard.w === W && clipboard.h === H && clipboard.pal) {
    let same = true;
    for (let i = 0; i < W * H && same; i++) { const v = clipboard.data[i]; same = v ? keys[i] === clipboard.pal[v] : keys[i] === -1; }
    if (same) { paste(); return; }
  }
  // cores: as da paleta atual ficam; novas ocupam slots livres; o resto vira a mais parecida
  const count = {}; keys.forEach((k) => { if (k >= 0) count[k] = (count[k] || 0) + 1; });
  const used = usedSlots(); let free = 0;
  for (let i = 1; i < 16; i++) if (!used.has(i)) free++;
  const inPal = new Set(doc.pal.slice(1, 16));
  const novos = Object.keys(count).map(Number).filter((k) => !inPal.has(k)).sort((a, b) => count[b] - count[a]);
  const ok = new Set([...inPal].filter((k) => used.has(doc.pal.indexOf(k, 1))).concat(novos.slice(0, free)));
  const okList = [...ok], near = {};
  const dist = (a, b) => { const [r, g2, bb] = rgbK(a), [R2, G, B] = rgbK(b); return (r - R2) ** 2 * 3 + (g2 - G) ** 2 * 4 + (bb - B) ** 2 * 2; };
  let trocadas = 0;
  Object.keys(count).map(Number).forEach((k) => { if (ok.has(k) || inPal.has(k)) near[k] = k; else { trocadas++; near[k] = okList.reduce((b, x) => (dist(k, x) < dist(k, b) ? x : b), okList[0]); } });
  const tpal = [0], ix = {}, data = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { if (keys[i] < 0) continue; const k = near[keys[i]]; if (ix[k] === undefined) { ix[k] = tpal.length; tpal.push(k); } data[i] = ix[k]; }
  const bx = sel ? sel.x : Math.max(0, (doc.w - W) >> 1), by = sel ? sel.y : Math.max(0, doc.h - H);
  clipboard = { w: W, h: H, data, x: bx, y: by, pal: tpal };
  paste();
  msg(`Imagem colada (${W}×${H})${fundo ? ", fundo virou transparente" : ""}${trocadas ? `, ${trocadas} cor(es) trocada(s) pela mais parecida (limite de 15)` : ""}: arraste para posicionar e aperte Enter.`);
}
window.addEventListener("paste", (e) => {
  if (!$("#modal").classList.contains("hidden")) return;
  const t = e.target.tagName; if (t === "INPUT" || t === "TEXTAREA") return;
  e.preventDefault();
  const it = [...(e.clipboardData ? e.clipboardData.items : [])].find((x) => x.type.startsWith("image/"));
  if (it) pasteImageBlob(it.getAsFile()).catch(() => msg("Não consegui ler a imagem colada."));
  else paste();
});
async function pasteMenu() {   // Editar -> Colar (pelo menu): tenta a imagem da area de transferencia do sistema
  try {
    for (const item of await navigator.clipboard.read()) { const ty = item.types.find((x) => x.startsWith("image/")); if (ty) { await pasteImageBlob(await item.getType(ty)); return; } }
  } catch (err) { /* sem permissao: usa a copia interna */ }
  paste();
}

/* ---------------------------------------------------- mouse no quadro */
let drag = null, spaceDown = false;
function toPx(e) { const r = cv.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left - panX) / zoom), y: Math.floor((e.clientY - r.top - panY) / zoom) }; }
function pick(p) {
  if (p.x < 0 || p.y < 0 || p.x >= doc.w || p.y >= doc.h) return;
  const v = composite(cur.frame)[p.y * doc.w + p.x];
  fg = v; renderPalettes();
}
cv.addEventListener("contextmenu", (e) => e.preventDefault());
cv.addEventListener("mousedown", (e) => {
  tlFocus = false;
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  if (doc.kind === "map") return MAP.down(e);
  const p = toPx(e), right = e.button === 2;
  let t = tool;
  if (e.button === 1 || spaceDown || t === "hand") { drag = { t: "pan", sx: e.clientX - panX, sy: e.clientY - panY }; return; }
  if (float && float.tf) {
    const h = tfHit(e);
    if (h) { const b = cv.getBoundingClientRect(), t = float.tf; drag = { t: "tf", h, a: p, r: { ...t }, a0: Math.atan2(e.clientY - b.top - panY - (t.T + t.H / 2) * zoom, e.clientX - b.left - panX - (t.L + t.W / 2) * zoom) }; return; }
    dropFloat(); return;
  }
  const isSel = ["select", "selellipse", "wand"].includes(t);
  if (e.altKey && !isSel) t = "picker";
  else if ((e.ctrlKey || e.metaKey) && !isSel) t = "move";   /* Ctrl segurado = mover */
  if (t === "zoom") { zoomAt(e, right || e.altKey ? -1 : 1); return; }
  if (!doc.layers[cur.layer].vis && !["select", "selellipse", "wand", "picker"].includes(t)) { msg("A camada está escondida."); return; }
  if (doc.layers[cur.layer].lock && !["select", "selellipse", "wand", "picker"].includes(t)) { msg("A camada está travada (cadeado)."); return; }
  const v = t === "eraser" ? 0 : right ? bg : fg;
  if (t === "picker") { pick(p); drag = { t: "pick" }; return; }
  if (t === "recolor") {   /* balde de troca: a cor clicada vira a cor de frente em todos os quadros (ou so na animacao atual) */
    if (p.x < 0 || p.y < 0 || p.x >= doc.w || p.y >= doc.h) return;
    const old = cel()[p.y * doc.w + p.x];
    if (old === 0) { msg("Clique numa cor (o transparente não é trocado)."); return; }
    if (old === v) return;
    let frames = doc.frames.map((_, i) => i);
    if (!recolorAll) { const tg = doc.tags.filter((tt) => cur.frame >= tt.from && cur.frame <= tt.to).sort((a, b) => (a.to - a.from) - (b.to - b.from))[0]; if (tg) frames = frames.filter((i) => i >= tg.from && i <= tg.to); }
    push(); let n = 0;
    doc.cels.forEach((row, li) => { if (doc.layers[li].lock) return; frames.forEach((fi) => { const c = row[fi]; if (!c) return; let hit = false; for (let i = 0; i < c.length; i++) if (c[i] === old) { c[i] = v; hit = true; } if (hit) n++; }); });
    afterDraw(); msg(`Cor ${old} trocada pela ${v} em ${n} célula(s)${recolorAll ? "" : " desta animação"}.`); return;
  }
  if (t === "fill") {
    push();
    if (contiguous) flood(cel(), p.x, p.y, v);
    else if (p.x >= 0 && p.y >= 0 && p.x < doc.w && p.y < doc.h) { const c = cel(), old = c[p.y * doc.w + p.x]; for (let i = 0; i < c.length; i++) if (c[i] === old && inSel(i % doc.w, (i / doc.w) | 0)) c[i] = v; }
    afterDraw(); return;
  }
  if (t === "select" || t === "selellipse" || t === "wand") {
    dropFloat(); push();   // cada selecao e um passo do Ctrl+Z
    const mode = e.shiftKey && sel ? "add" : e.altKey && sel ? "sub" : null;   // Shift soma, Alt tira
    const base = mode ? selMask(sel) : new Uint8Array(doc.w * doc.h);
    if (t === "wand") { const w = wandMask(p); if (w) for (let i = 0; i < base.length; i++) if (w[i]) base[i] = mode === "sub" ? 0 : 1; sel = selFromMask(base); renderReport(); render(); return; }
    drag = { t: "select", shape: t, a: p, mode, base }; if (!mode) sel = null; return;
  }
  if (t === "dither") { const region = sel ? null : wandMask(p); if (!sel && !region) return; drag = { t: "dither", a: p, region }; preview = ditherPts(p, p, false, region); render(); return; }
  if (t === "move") {
    if (sel && !float && !inSel(p.x, p.y)) { sel = null; }
    liftFloat(); drag = { t: "move", a: p, ox: float.x, oy: float.y }; return;
  }
  if (t === "pencil" || t === "eraser") {
    push(); const orig = new Map([[p.y * doc.w + p.x, cel()[p.y * doc.w + p.x]]]); dab(cel(), p.x, p.y, v);
    drag = { t: "paint", last: p, v, path: [p], orig }; render(); return;
  }
  drag = { t: "shape", tool: t, a: p, b: p, v }; preview = shapeStroke(t, p, p, v); render();
});
function shapeStroke(t, a, b, v) {
  const out = [], o = Math.floor((brush - 1) / 2), wide = !t.endsWith("fill") ? brush : 1;
  shapePts(t, a, b).forEach(([x, y]) => { for (let j = 0; j < wide; j++) for (let i = 0; i < wide; i++) if (inSel(x - o + i, y - o + j)) out.push([x - o + i, y - o + j, v]); });
  return out;
}
window.addEventListener("mousemove", (e) => {
  if (doc.kind === "map") return MAP.move(e);
  const p = toPx(e);
  if (e.target === cv || drag) {
    hover = p.x >= 0 && p.y >= 0 && p.x < doc.w && p.y < doc.h ? p : null;
    const v = hover ? composite(cur.frame)[p.y * doc.w + p.x] : null;
    document.getElementById("st-pos").textContent = hover ? `x ${p.x}  y ${p.y}  · tile ${p.x >> 3},${p.y >> 3}  · índice ${v}` : "";
  }
  if (!drag) { if (e.target === cv) { if (float && float.tf) cv.style.cursor = tfCursor(tfHit(e)); render(); } return; }
  if (drag.t === "pan") { panX = e.clientX - drag.sx; panY = e.clientY - drag.sy; render(); return; }
  if (drag.t === "pick") { pick(p); return; }
  if (drag.t === "paint") {
    const c = cel();
    linePts(drag.last.x, drag.last.y, p.x, p.y).forEach(([x, y], i) => {
      if (!i) return;
      const j = y * doc.w + x; if (x >= 0 && y >= 0 && x < doc.w && y < doc.h && !drag.orig.has(j)) drag.orig.set(j, c[j]);
      dab(c, x, y, drag.v);
    });
    // pixel perfeito: tira o canto de "L" que o traco a mao deixa
    if (pixelPerfect && brush === 1 && (p.x !== drag.last.x || p.y !== drag.last.y)) {
      const P = drag.path; P.push(p);
      if (P.length >= 3) {
        const [a, b, d] = P.slice(-3);
        if (Math.abs(a.x - d.x) === 1 && Math.abs(a.y - d.y) === 1 && (b.x === a.x || b.y === a.y)) { put(c, b.x, b.y, drag.orig.get(b.y * doc.w + b.x) || 0); P.splice(P.length - 2, 1); }
      }
    }
    drag.last = p; render(); return;
  }
  if (drag.t === "select") {
    const a = drag.a, x0 = Math.max(0, Math.min(a.x, p.x)), y0 = Math.max(0, Math.min(a.y, p.y)), x1 = Math.min(doc.w - 1, Math.max(a.x, p.x)), y1 = Math.min(doc.h - 1, Math.max(a.y, p.y));
    const r = x1 >= x0 && y1 >= y0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
    if (!drag.mode && drag.shape === "select") sel = r;
    else {
      const m = drag.base.slice(), v = drag.mode === "sub" ? 0 : 1;
      if (r && drag.shape === "select") for (let y = r.y; y < r.y + r.h; y++) m.fill(v, y * doc.w + r.x, y * doc.w + r.x + r.w);
      else if (r) shapePts("ellipsefill", { x: r.x, y: r.y }, { x: r.x + r.w - 1, y: r.y + r.h - 1 }).forEach(([x, y]) => { m[y * doc.w + x] = v; });
      sel = selFromMask(m);
    }
    render(); return;
  }
  if (drag.t === "dither") { drag.b = p; preview = ditherPts(drag.a, p, e.shiftKey, drag.region); render(); return; }
  if (drag.t === "tf") { tfDrag(p, e.shiftKey, e); render(); return; }
  if (drag.t === "move") { float.x = drag.ox + p.x - drag.a.x; float.y = drag.oy + p.y - drag.a.y; render(); return; }
  if (drag.t === "shape") {
    let b = p;
    if (e.shiftKey) {   // Shift: quadrado / circulo / linha em 45 graus
      const dx = p.x - drag.a.x, dy = p.y - drag.a.y, m = Math.max(Math.abs(dx), Math.abs(dy));
      if (drag.tool === "line") { if (Math.abs(dx) > 2 * Math.abs(dy)) b = { x: p.x, y: drag.a.y }; else if (Math.abs(dy) > 2 * Math.abs(dx)) b = { x: drag.a.x, y: p.y }; else b = { x: drag.a.x + Math.sign(dx) * m, y: drag.a.y + Math.sign(dy) * m }; }
      else b = { x: drag.a.x + Math.sign(dx || 1) * m, y: drag.a.y + Math.sign(dy || 1) * m };
    }
    drag.b = b; preview = shapeStroke(drag.tool, drag.a, b, drag.v); render();
  }
});
window.addEventListener("mouseup", () => {
  if (doc.kind === "map") return MAP.up();
  if (!drag) return;
  const d = drag; drag = null;
  if (d.t === "paint") afterDraw();
  if (d.t === "shape") { push(); const c = cel(); preview.forEach(([x, y, v]) => put(c, x, y, v)); preview = null; afterDraw(); }
  if (d.t === "select") { renderReport(); render(); }
  if (d.t === "dither") { push(); const c = cel(); preview.forEach(([x, y, v]) => put(c, x, y, v)); preview = null; afterDraw(); }
});
function afterDraw() { dirty(); render(); renderTimeline(); renderReport(); renderPalettes(); if (pvOpen()) drawPreviewFrame(); }
document.getElementById("viewport").addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(e, e.deltaY < 0 ? 1 : -1); }, { passive: false });
const ZOOMS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32];
function zoomKey(dir) { const r = cv.getBoundingClientRect(); zoomAt({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }, dir); }
function zoomAt(e, dir) {
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const i = ZOOMS.indexOf(zoom), nz = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 6 : i) + dir))];
  panX = Math.round(mx - (mx - panX) * nz / zoom); panY = Math.round(my - (my - panY) * nz / zoom); zoom = nz; render();
}

/* ================================================================== paletas */
function renderPalettes() {
  const sp = document.getElementById("spal"); sp.innerHTML = "";
  const usedSlots = doc.kind === "map" ? MAP.slotsInUse() : window.usedSlots();
  MAP.palRow();
  doc.pal.forEach((k, i) => {
    const d = document.createElement("div");
    d.className = (i === fg ? "fg " : "") + (i === bg ? "bg " : "") + (i === 0 ? "checker" : "") + (i > 15 ? " over" : "");
    if (i) d.style.background = css(k);
    d.innerHTML = `<span>${i}</span>`;
    d.title = i ? `Slot ${i} · ${hex9(k)} · ${usedSlots.has(i) ? "em uso" : "livre"}` : "Slot 0: transparente";
    d.onclick = (e) => { if ((e.ctrlKey || e.metaKey) && doc.kind !== "map") { selectSlot(i); return; } fg = i; renderPalettes(); };
    d.oncontextmenu = (e) => { e.preventDefault(); bg = i; renderPalettes(); };
    d.ondblclick = () => { if (!i) return; palSlotEdit = i; renderPalettes(); msg(`Escolha nas cores do Super Nintendo a nova cor do slot ${i}.`); };
    if (i === palSlotEdit) d.style.outline = "2px dashed #d9a441";
    sp.appendChild(d);
  });
  if (doc.pal.length < 256 && doc.kind !== "map") {
    const a = document.createElement("div"); a.className = "add"; a.textContent = "+"; a.title = "Novo slot (cópia da cor de frente)";
    a.onclick = () => { push(); doc.pal.push(doc.pal[fg] || 0); fg = doc.pal.length - 1; renderAll(); }; sp.appendChild(a);
  }
  const fgEl = document.getElementById("sw-fg"), bgEl = document.getElementById("sw-bg");
  fgEl.className = "swbig" + (fg ? "" : " checker"); fgEl.style.background = fg ? css(doc.pal[fg]) : "";
  bgEl.className = "swbig" + (bg ? "" : " checker"); bgEl.style.background = bg ? css(doc.pal[bg]) : "";
  // 512 cores
  const box = document.getElementById("mdpal"); box.innerHTML = "";
  const rows = SNES_RAMPS;
  const inPal = new Set(doc.pal.slice(1));
  rows.forEach(([n, ks]) => {
    const r = document.createElement("div"); r.className = "mdrow"; r.innerHTML = `<label>${n}</label>`;
    const s = document.createElement("div"); s.className = "sws";
    ks.forEach((k) => {
      const d = document.createElement("div"); d.style.background = css(k); d.title = `${hexW(k)}  (R${k & 31} G${(k >> 5) & 31} B${k >> 10})`;
      if (inPal.has(k)) d.className = "used";
      d.onclick = () => setSlotColor(k);
      s.appendChild(d);
    });
    r.appendChild(s); box.appendChild(r);
  });
  const info = document.getElementById("mdinfo");
  info.textContent = palSlotEdit > 0 ? `Trocando o slot ${palSlotEdit}: clique numa cor ou use os controles R G B.` : `Clique numa cor para colocar no slot ${fg || 1} (ou dê duplo clique num slot antes). Cores com contorno já estão na paleta.`;
  const rg = document.getElementById("snes-rgb");
  if (rg) {
    const slot = palSlotEdit > 0 ? palSlotEdit : fg, k = slot ? doc.pal[slot] || 0 : 0;
    rg.innerHTML = slot ? ["R", "G", "B"].map((n, i) => `<label>${n}<input type="range" min="0" max="31" value="${(k >> (5 * i)) & 31}" data-ch="${i}"><b>${(k >> (5 * i)) & 31}</b></label>`).join("") + `<div class="hint">Slot ${slot} · ${hexW(k)} (valor da CGRAM do SNES)</div>` : `<div class="hint">Escolha um slot (1-15) para ajustar R G B (0-31).</div>`;
    rg.querySelectorAll("input").forEach((inp) => {
      inp.oninput = () => { const v = [0, 1, 2].map((i) => +rg.querySelector(`[data-ch="${i}"]`).value); doc.pal[slot] = v[0] | (v[1] << 5) | (v[2] << 10); render(); drawPreviewFrame(); renderPalettesLight(); };
      inp.onchange = () => { push(); renderPalettes(); renderReport(); };
    });
  }
}
/* clicar numa cor do Mega Drive so escolhe a cor de frente: a arte nao muda.
 * Se a cor ja esta na paleta, usa aquele slot; senao ocupa um slot que nao esta no desenho (ou cria um).
 * Trocar a cor de um slot (e de tudo que usa ele) so pelo duplo clique no slot. */
function renderPalettesLight() { document.querySelectorAll("#spal > div").forEach((d, i) => { if (i && doc.pal[i] !== undefined) d.style.background = css(doc.pal[i]); const f = document.getElementById("sw-fg"); if (fg) f.style.background = css(doc.pal[fg]); }); }
function setSlotColor(k) {
  if (palSlotEdit <= 0) {
    let s = doc.pal.indexOf(k, 1);
    if (s < 1) {
      const used = doc.kind === "map" ? MAP.slotsInUse() : usedSlots();
      for (let i = 1; i < doc.pal.length; i++) if (!used.has(i) && i !== bg) { s = i; break; }
      if (s < 1 && doc.kind !== "map" && doc.pal.length < 256) s = doc.pal.length;
      if (s < 1) { msg("Todos os slots desta paleta estão em uso: dê duplo clique num slot para trocar a cor dele."); return; }
      push(); doc.pal[s] = k;
      if (doc.kind === "map") { MAP.touch(); MAP.renderPanel(); }
    }
    fg = s; renderPalettes(); renderReport(); return;
  }
  const slot = palSlotEdit;
  push(); doc.pal[slot] = k; palSlotEdit = -1; fg = slot;
  if (doc.kind === "map") { MAP.touch(); MAP.renderPanel(); }
  renderPalettes(); render(); drawPreviewFrame();
}
document.getElementById("sw-fg").onclick = () => { if (fg) { palSlotEdit = fg; renderPalettes(); } };

/* ================================================================== linha do tempo */
function renderTimeline() {
  document.getElementById("timeline").classList.toggle("hidden", doc.kind === "map");
  document.getElementById("preview").style.display = doc.kind === "map" ? "none" : "";
  if (doc.kind === "map") return;
  const g = document.getElementById("tl-grid"), n = doc.frames.length, sc = g.scrollLeft;
  const rs = range ? [Math.min(range.a, range.b), Math.max(range.a, range.b)] : null;
  // espaco visual entre animacoes (so na tela: nenhum quadro e criado)
  const gap = new Set(doc.tags.map((t) => t.from).filter((f) => f > 0));
  const G = (f) => (gap.has(f) ? `<td class="tl-gap"></td>` : "");
  const gapsIn = (a, b) => { let k = 0; for (let f = a + 1; f <= b; f++) if (gap.has(f)) k++; return k; };
  // faixas de tags: alternam em duas fileiras para os nomes nao se encavalarem (e abrem outra se sobrepor)
  const lanes = [[], []];
  [...doc.tags].map((t, i) => ({ ...t, i })).sort((x, y) => x.from - y.from).forEach((t, k) => {
    let l = lanes[k % 2];
    if (!l.every((o) => t.from > o.to || t.to < o.from)) { l = lanes.find((ln) => ln.every((o) => t.from > o.to || t.to < o.from)); if (!l) lanes.push(l = []); }
    l.push(t);
  });
  let h = "";
  lanes.filter((ln) => ln.length).forEach((ln) => {
    h += `<tr class="tl-tags"><td class="tl-layer"></td>`;
    let f = 0;
    ln.sort((x, y) => x.from - y.from).forEach((t) => {
      for (; f < t.from; f++) h += G(f) + "<td></td>";
      h += G(t.from) + `<td colspan="${t.to - t.from + 1 + gapsIn(t.from, t.to)}"><div class="tag" data-tag="${t.i}" title="${esc(t.name)} · quadros ${t.from + 1}-${t.to + 1} · duplo clique: editar"><b>${esc(t.name)}${t.loop === "pingpong" ? " ⇄" : t.loop === "once" ? " →" : ""}</b></div></td>`;
      f = t.to + 1;
    });
    for (; f < n; f++) h += G(f) + "<td></td>";
    h += "</tr>";
  });
  h += `<tr><th class="tl-layer"><div class="tl-hicons"><span title="Visível">👁</span><span title="Travada">🔒</span><span style="flex:1"></span></div></th>`;
 doc.frames.forEach((f, i) => { h += (gap.has(i) ? `<th class="tl-gap"></th>` : "") + `<th data-f="${i}" class="${i === cur.frame ? "cur" : ""} ${rs && i >= rs[0] && i <= rs[1] ? "rng" : ""}" title="${f.d} ms · ${frameStats(i).pieces} pedaços 16×16 · Shift+clique marca vários · duplo clique: duração">${i + 1}<small class="pc ${frameStats(i).pieces > LIM_PIECES ? "bad" : frameStats(i).pieces > 20 ? "warn" : "ok"}">${frameStats(i).pieces}</small></th>`; });
  h += "</tr>";
  for (let li = doc.layers.length - 1; li >= 0; li--) {
    const L = doc.layers[li];
    h += `<tr><td class="tl-layer ${li === cur.layer ? "cur" : ""}"><div data-l="${li}"><button data-vis="${li}" title="Mostrar/esconder" class="${L.vis ? "" : "off"}">👁</button><button data-lock="${li}" title="Travar" class="${L.lock ? "" : "off"}">🔒</button><span title="Duplo clique: renomear"${L.kind ? ` style="color:rgb(${KIND_INFO[L.kind][1]})"` : ""}>${esc(L.name)}</span></div></td>`;
    doc.frames.forEach((f, fi) => {
      const has = doc.cels[li][fi].some((v) => v);
      const c = li === cur.layer && fi === cur.frame ? "cur" : fi === cur.frame || li === cur.layer ? "curcol" : "";
      h += G(fi) + `<td data-c="${li},${fi}" class="cel ${c} ${rs && fi >= rs[0] && fi <= rs[1] ? "rng" : ""}"><i class="${has ? "has" : ""}"></i></td>`;
    });
    h += "</tr>";
  }
  const t = document.createElement("table"); t.className = "tl-table" + (tlFocus && range ? " focus" : ""); t.innerHTML = h; g.innerHTML = ""; g.appendChild(t); g.scrollLeft = sc;
  t.querySelectorAll("[data-f]").forEach((e) => {
    e.onclick = (ev) => { if (tlDragged) { tlDragged = false; return; } const f = +e.dataset.f; if (ev.shiftKey) range = { a: range ? range.a : cur.frame, b: f }; else range = { a: f, b: f }; tlFocus = true; goFrame(f); renderTimeline(); msg("Quadro marcado: as setas movem todas as camadas dele 1 px · Shift+clique marca vários · Delete apaga."); };
    e.ondblclick = () => frameProps(+e.dataset.f);
  });
  t.querySelectorAll("[data-tag]").forEach((e) => { const i = +e.dataset.tag; e.onclick = () => { const tg = doc.tags[i]; range = { a: tg.from, b: tg.to }; goFrame(tg.from); }; e.ondblclick = () => tagProps(i); });
  t.querySelectorAll("[data-f]").forEach((e) => tlDrag(e, "frame"));
  t.querySelectorAll("[data-l]").forEach((e) => tlDrag(e, "layer"));
  t.querySelectorAll("[data-l]").forEach((e) => { e.onclick = () => { if (tlDragged) { tlDragged = false; return; } dropFloat(); cur.layer = +e.dataset.l; renderTimeline(); }; e.querySelector("span").ondblclick = () => renameLayer(+e.dataset.l); });
  t.querySelectorAll("[data-vis]").forEach((e) => e.onclick = (ev) => { ev.stopPropagation(); const L = doc.layers[+e.dataset.vis]; L.vis = !L.vis; renderTimeline(); render(); drawPreviewFrame(); });
  t.querySelectorAll("[data-lock]").forEach((e) => e.onclick = (ev) => { ev.stopPropagation(); const L = doc.layers[+e.dataset.lock]; L.lock = !L.lock; renderTimeline(); });
  t.querySelectorAll("[data-c]").forEach((e) => e.onclick = (ev) => { const [l, f] = e.dataset.c.split(",").map(Number); dropFloat(); tlFocus = false; cur.layer = l; if (ev.shiftKey) range = { a: range ? range.a : cur.frame, b: f }; else range = null; goFrame(f); });
  const tg = tagAt(cur.frame);
  document.getElementById("tl-info").textContent = `Quadro ${cur.frame + 1}/${n}${tg ? " · tag " + tg.name : ""} · ${doc.layers[cur.layer].name} · ${doc.frames[cur.frame].d} ms`;
  document.querySelector('[data-cmd="onion"]').classList.toggle("on", onion);
  document.querySelector('[data-cmd="play"]').textContent = playing ? "■" : "▶";
  document.getElementById("loopmode").value = doc.loop;
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function goFrame(f) { dropFloat(); cur.frame = (f + doc.frames.length) % doc.frames.length; render(); renderTimeline(); renderReport(); }
function tagsInsert(at, n = 1) { doc.tags.forEach((t) => { if (t.from >= at) { t.from += n; t.to += n; } else if (t.to >= at - 1) t.to += n; }); }
function tagsDelete(f) { doc.tags.forEach((t) => { if (t.from > f) { t.from--; t.to--; } else if (t.to >= f) t.to--; }); doc.tags = doc.tags.filter((t) => t.to >= t.from); }
function tagAt(f) { return doc.tags.find((t) => f >= t.from && f <= t.to); }
function playSpan() { const t = tagAt(cur.frame); return t ? [t.from, t.to, t.loop] : [0, doc.frames.length - 1, doc.loop]; }
function newTag() {
  const a = range ? Math.min(range.a, range.b) : cur.frame, b = range ? Math.max(range.a, range.b) : cur.frame;
  ask(`Nova tag (quadros ${a + 1} a ${b + 1})`, [["Nome", "name", "anim" + (doc.tags.length + 1)], ["Repetição", "loop", "loop", ["loop", "pingpong", "once"]]], (v) => {
    push(); doc.tags.push({ name: v.name.trim() || "anim", from: a, to: b, loop: v.loop }); doc.tags.sort((x, y) => x.from - y.from); range = null; renderTimeline(); renderReport();
  });
}
function tagProps(i) {
  const t = doc.tags[i];
  ask(`Tag "${t.name}"`, [["Nome", "name", t.name], ["Do quadro", "from", t.from + 1, "number"], ["Até o quadro", "to", t.to + 1, "number"], ["Repetição", "loop", t.loop, ["loop", "pingpong", "once"]], ["Apagar a tag?", "del", "não", ["não", "sim"]]], (v) => {
    push();
    if (v.del === "sim") doc.tags.splice(i, 1);
    else { const n = doc.frames.length; Object.assign(t, { name: v.name.trim() || t.name, loop: v.loop, from: Math.max(0, Math.min(n - 1, v.from - 1)), to: Math.max(0, Math.min(n - 1, v.to - 1)) }); if (t.to < t.from) [t.from, t.to] = [t.to, t.from]; }
    renderTimeline(); renderReport();
  });
}
function newFrame(empty) {
  dropFloat(); push();
  const at = cur.frame + 1;
  doc.frames.splice(at, 0, { d: doc.frames[cur.frame].d }); tagsInsert(at);
  doc.cels.forEach((r) => r.splice(at, 0, empty ? new Uint8Array(doc.w * doc.h) : r[cur.frame].slice()));
  cur.frame = at; renderAll();
}
/* apaga os quadros marcados na timeline (clique no numero, Shift+clique para varios) */
function delFrames() {
  const a = Math.min(range.a, range.b), b = Math.max(range.a, range.b), n = b - a + 1;
  if (n >= doc.frames.length) { msg("O sprite precisa de pelo menos um quadro."); return; }
  dropFloat(true); push();
  for (let f = b; f >= a; f--) { doc.frames.splice(f, 1); tagsDelete(f); doc.cels.forEach((r) => r.splice(f, 1)); }
  cur.frame = Math.min(a, doc.frames.length - 1); range = null; tlFocus = false; renderAll();
  msg(n > 1 ? `${n} quadros apagados (Ctrl+Z desfaz).` : "Quadro apagado (Ctrl+Z desfaz).");
}
function delFrame() {
  if (doc.frames.length < 2) { msg("O sprite precisa de pelo menos um quadro."); return; }
  dropFloat(true); push();
  doc.frames.splice(cur.frame, 1); tagsDelete(cur.frame); doc.cels.forEach((r) => r.splice(cur.frame, 1)); clampCur(); renderAll();
}
function moveFrame(d) {
  const a = cur.frame, b = a + d; if (b < 0 || b >= doc.frames.length) return;
  dropFloat(); push();
  [doc.frames[a], doc.frames[b]] = [doc.frames[b], doc.frames[a]];
  doc.cels.forEach((r) => { [r[a], r[b]] = [r[b], r[a]]; }); cur.frame = b; renderAll();
}
function newLayer() {
  dropFloat(); push();
  doc.layers.splice(cur.layer + 1, 0, { name: "Camada " + (doc.layers.length + 1), vis: true, lock: false });
  doc.cels.splice(cur.layer + 1, 0, doc.frames.map(() => new Uint8Array(doc.w * doc.h)));
  cur.layer++; renderAll();
}
function newBoxLayer() {
  ask("Nova camada de caixa", [["Tipo", "kind", "hurtbox", ["hitbox", "hitbox2", "hurtbox", "anchor"]]], (v) => {
    if (kindLayer(v.kind) >= 0) { msg("Já existe uma camada " + KIND_INFO[v.kind][0] + "."); return; }
    dropFloat(); push();
    doc.layers.splice(cur.layer + 1, 0, { name: KIND_INFO[v.kind][0], kind: v.kind, vis: true, lock: false });
    doc.cels.splice(cur.layer + 1, 0, doc.frames.map(() => new Uint8Array(doc.w * doc.h)));
    cur.layer++; renderAll();
  });
}
function delLayer() {
  if (doc.layers.length < 2) { msg("O sprite precisa de pelo menos uma camada."); return; }
  dropFloat(true); push(); doc.layers.splice(cur.layer, 1); doc.cels.splice(cur.layer, 1); clampCur(); renderAll();
}
function moveLayer(d) {
  const a = cur.layer, b = a + d; if (b < 0 || b >= doc.layers.length) return;
  dropFloat(); push();
  [doc.layers[a], doc.layers[b]] = [doc.layers[b], doc.layers[a]]; [doc.cels[a], doc.cels[b]] = [doc.cels[b], doc.cels[a]]; cur.layer = b; renderAll();
}
function mergeDown() {
  if (cur.layer < 1) return;
  dropFloat(); push();
  const top = doc.cels[cur.layer], low = doc.cels[cur.layer - 1];
  top.forEach((c, f) => { for (let i = 0; i < c.length; i++) if (c[i]) low[f][i] = c[i]; });
  doc.layers.splice(cur.layer, 1); doc.cels.splice(cur.layer, 1); cur.layer--; renderAll();
}
function renameLayer(li) {
  ask("Renomear camada", [["Nome", "name", doc.layers[li].name]], (v) => { push(); doc.layers[li].name = v.name || doc.layers[li].name; renderTimeline(); });
}
function frameProps(f) {
  ask(`Quadro ${f + 1}`, [["Duração (ms)", "d", doc.frames[f].d, "number"], ["Aplicar em", "all", "este", ["este", "todos"]]], (v) => {
    push(); const d = Math.max(10, Math.min(5000, +v.d || 100));
    if (v.all === "todos") doc.frames.forEach((x) => x.d = d); else doc.frames[f].d = d; renderTimeline(); renderReport();
  });
}
function togglePlay() {
  if (playing) { clearTimeout(playing); playing = null; render(); renderTimeline(); return; }
  dropFloat();
  let dir = 1;
  const step = () => {
    const [a, b, lp] = playSpan(); let f = cur.frame + dir;
    if (lp === "pingpong") { if (f > b || f < a) { dir = -dir; f = cur.frame + dir; } f = Math.max(a, Math.min(b, f)); }
    else if (f > b) { if (lp === "once") { togglePlay(); return; } f = a; }
    cur.frame = f; render(); renderTimeline();
    playing = setTimeout(step, doc.frames[cur.frame].d);
  };
  playing = setTimeout(step, doc.frames[cur.frame].d); renderTimeline();
}
document.querySelectorAll("[data-cmd]").forEach((b) => b.onclick = () => CMD[b.dataset.cmd]());
document.getElementById("loopmode").onchange = (e) => { push(); doc.loop = e.target.value; };

/* ================================================================== janela de previa */
const pv = document.getElementById("pv"), pvg = pv.getContext("2d"), pvBox = document.getElementById("preview");
let pvFrame = 0, pvDir = 1, pvT = 0, pvZoom = 0;   // 0 = encaixa na janela
function pvOpen() { return !pvBox.classList.contains("hidden"); }
function drawPreviewFrame(f) {
  if (doc.kind === "map") return;
  const body = document.getElementById("pv-body"), W = body.clientWidth, H = body.clientHeight;
  if (!W || !H) return;
  if (pv.width !== W || pv.height !== H) { pv.width = W; pv.height = H; }
  const fit = Math.max(1, Math.floor(Math.min((W - 8) / doc.w, (H - 8) / doc.h)));
  const z = pvZoom || fit, w = doc.w * z, h = doc.h * z, x = Math.round((W - w) / 2), y = Math.round((H - h) / 2);
  pvg.imageSmoothingEnabled = false; pvg.fillStyle = "#1b1c20"; pvg.fillRect(0, 0, W, H);
  pvg.fillStyle = LIGHT() ? "#d0cece" : "#2f3138"; pvg.fillRect(x, y, w, h);
  off.width = doc.w; off.height = doc.h; og.putImageData(toImageData(composite(Math.min(f ?? pvFrame, doc.frames.length - 1))), 0, 0);
  pvg.drawImage(off, x, y, w, h);
  document.getElementById("pv-z").textContent = `${z}x${pvZoom ? "" : " (encaixado)"} · roda = zoom`;
}
function pvTick() {
  clearTimeout(pvT);
  if (!pvOpen()) return;
  if (doc.kind === "map") { pvT = setTimeout(pvTick, 300); return; }
  const [a, b, lp] = playSpan();
  if (pvFrame < a || pvFrame > b) { pvFrame = a; pvDir = 1; }
  drawPreviewFrame(pvFrame);
  const d = doc.frames[pvFrame].d;
  if (lp === "pingpong" && b > a) { if (pvFrame + pvDir > b || pvFrame + pvDir < a) pvDir = -pvDir; pvFrame += pvDir; }
  else pvFrame = pvFrame + 1 > b ? (lp === "once" ? b : a) : pvFrame + 1;
  pvT = setTimeout(pvTick, d);
}
function togglePreview(on) { pvBox.classList.toggle("hidden", on === undefined ? pvOpen() : !on); pvTick(); }
document.getElementById("pv-close").onclick = () => togglePreview(false);
document.getElementById("pv-body").addEventListener("wheel", (e) => {
  e.preventDefault();
  const b = document.getElementById("pv-body"), fit = Math.max(1, Math.floor(Math.min((b.clientWidth - 8) / doc.w, (b.clientHeight - 8) / doc.h)));
  pvZoom = Math.max(1, Math.min(32, (pvZoom || fit) + (e.deltaY < 0 ? 1 : -1)));
  drawPreviewFrame();
}, { passive: false });
document.getElementById("pv-body").addEventListener("dblclick", () => { pvZoom = 0; drawPreviewFrame(); });
new ResizeObserver(() => drawPreviewFrame()).observe(document.getElementById("preview"));
(function draggable(box) {
  const head = box.querySelector(".float-head"); let d = null;
  head.addEventListener("mousedown", (e) => { if (e.target.tagName !== "DIV") return; const r = box.getBoundingClientRect(); d = { x: e.clientX - r.left, y: e.clientY - r.top }; });
  window.addEventListener("mousemove", (e) => { if (!d) return; box.style.left = e.clientX - d.x + "px"; box.style.top = e.clientY - d.y + "px"; box.style.right = "auto"; });
  window.addEventListener("mouseup", () => { d = null; });
})(pvBox);

/* ================================================================== relatorio do Mega Drive */
function renderReport() {
  if (doc.kind === "map") return MAP.renderPanel();
  const r = document.getElementById("mdreport");
  const st = frameStats(cur.frame), all = doc.frames.map((_, f) => frameStats(f));
  const maxP = Math.max(...all.map((x) => x.pieces)), sumB = all.reduce((n, x) => n + x.bytes, 0);
  const colors = usedSlots(), snesColors = new Set([...colors].map((v) => doc.pal[v]));
  const cls = (ok, warn) => (ok ? "ok" : warn ? "warn" : "bad");
  const bx = (kind, f) => { const li = kindLayer(kind); return li < 0 ? null : boxOf(li, f); };
  const boxTxt = (b) => (b ? `${b.x1 - b.x0 + 1}×${b.y1 - b.y0 + 1} em (${b.x0},${b.y0})` : "—");
  const ctr = FIGHTER_ANIMS.map(([n, cnt]) => { const t = doc.tags.find((x) => x.name === n); return [n, cnt, t ? t.to - t.from + 1 : 0]; });
  const falta = ctr.filter((x) => !x[2]), difere = ctr.filter((x) => x[2] && x[2] !== x[1]);
  r.innerHTML = `
    <div><span class="k">Quadro:</span> ${doc.w}×${doc.h} px</div>
    <div><span class="k">Cores usadas:</span> <span class="${cls(colors.size <= 15)}"><b>${colors.size}</b>/15</span> + transparente</div>
    ${colors.size > 15 ? `<div class="bad">Passou de 15 cores por paleta de sprite do SNES (4 bits por pixel). Sprite → Reduzir para 15 cores.</div>` : ""}
    ${snesColors.size < colors.size ? `<div class="warn">${colors.size - snesColors.size} slot(s) repetem a mesma cor.</div>` : ""}
    <div class="ptitle" style="margin:6px -8px 2px">Este quadro (${cur.frame + 1}) — custo</div>
    <div><span class="k">Pedaços 16×16:</span> <span class="${cls(st.pieces <= 20, st.pieces <= LIM_PIECES)}"><b>${st.pieces}</b>/${LIM_PIECES}</span> <span class="k">(limite do bloco do lutador)</span></div>
    ${st.pieces > LIM_PIECES ? `<div class="bad">Passa de ${LIM_PIECES} pedaços: a engine corta o mais vazio. Encolha a arte ou junte partes.</div>` : ""}
    <div><span class="k">Tiles 8×8 na VRAM:</span> ${st.tiles} (${st.bytes} bytes)</div>
    <div><span class="k">Pedaços na mesma linha:</span> <span class="${cls(st.maxLine <= 6, st.maxLine <= 8)}">${st.maxLine}</span> <span class="k">(o SNES mostra 32 sprites por linha, os dois lutadores somam)</span></div>
    <div><span class="k">Pixels pintados:</span> ${st.px}</div>
    <div class="ptitle" style="margin:6px -8px 2px">Caixas deste quadro</div>
    <div><span class="k" style="color:rgb(${KIND_INFO.hitbox[1]})">Hitbox:</span> ${boxTxt(bx("hitbox", cur.frame))}</div>
    <div><span class="k" style="color:rgb(${KIND_INFO.hitbox2[1]})">Hitbox 2:</span> ${boxTxt(bx("hitbox2", cur.frame))}</div>
    <div><span class="k" style="color:rgb(${KIND_INFO.hurtbox[1]})">Hurtbox:</span> ${boxTxt(bx("hurtbox", cur.frame))}${bx("hurtbox", cur.frame) ? "" : ' <span class="warn">(sem hurtbox: usa o corpo)</span>'}</div>
    <div><span class="k" style="color:rgb(${KIND_INFO.anchor[1]})">Âncora:</span> ${bx("anchor", cur.frame) ? "marcada" : "—"}</div>
    <div class="hint" style="padding:2px 0">Selecione a camada da caixa e desenhe um retângulo (U): a caixa é o menor retângulo que cobre o que você marcou.</div>
    <div class="ptitle" style="margin:6px -8px 2px">Animação (${doc.frames.length} quadros)</div>
    <div><span class="k">Maior quadro:</span> <span class="${cls(maxP <= 20, maxP <= LIM_PIECES)}">${maxP} pedaços</span></div>
    <div><span class="k">Gráficos na ROM:</span> ${(sumB / 1024).toFixed(1)} KB de ${LIM_ROM_KB} KB do pack</div>
    <div class="ptitle" style="margin:6px -8px 2px">Contrato com a engine (tags)</div>
    ${doc.tags.length ? "" : `<div class="warn">Sem tags: use Arquivo → Novo lutador (cria todas) ou marque quadros e Nova tag.</div>`}
    ${falta.length ? `<div class="warn">Faltam: ${falta.map((x) => x[0]).join(", ")}</div>` : `<div class="ok">Todas as animações existem.</div>`}
    ${difere.length ? `<div class="k">Com outra contagem de quadros: ${difere.map((x) => `${x[0]} ${x[2]}/${x[1]}`).join(", ")}</div>` : ""}
    <label><input type="checkbox" id="r-split" ${showSplit ? "checked" : ""}> Mostrar os pedaços 16×16 no quadro</label>
    <label><input type="checkbox" id="r-tiles" ${showTiles ? "checked" : ""}> Grade de tiles 8×8</label>
    <div class="ptitle" style="margin:6px -8px 2px">Exportar</div>
    <button id="r-export" style="width:100%;margin:4px 0" class="on">Exportar para a SF Engine (.json)</button>`;
  document.getElementById("r-export").onclick = exportSF;
  document.getElementById("r-split").onchange = (e) => { showSplit = e.target.checked; render(); };
  document.getElementById("r-tiles").onchange = (e) => { showTiles = e.target.checked; render(); };
}

/* ================================================================== arquivos */
function b64(u8) { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
function serialize(d = doc) { if (d.kind === "map") return MAP.serialize(d); return { format: "sfpixel", version: 3, name: d.name, w: d.w, h: d.h, pal: d.pal, loop: d.loop, tags: d.tags, layers: d.layers, frames: d.frames, cels: d.cels.map((r) => r.map(b64)), sgengine: d.sgengine || null }; }
function deserialize(o) {
  if (o.format !== "sfpixel" && o.format !== "sgpixel") throw new Error("Arquivo não é do SF Pixel");
  if (o.kind === "map") return MAP.deserialize(o);
  return { name: o.name, w: o.w, h: o.h, pal: o.pal, loop: o.loop || "loop", tags: o.tags || [], layers: o.layers.map((l) => ({ lock: false, ...l })), frames: o.frames, cels: o.cels.map((r) => r.map(unb64)), sgengine: o.sgengine || null };
}
/* ---------------------------------------------------- lutador para a SG Engine
 * Cria o documento ja com uma tag por animacao que a engine usa (nome igual), na quantidade de quadros sugerida.
 * Na SG Engine: Importar do SG Pixel coloca cada tag na animacao de mesmo nome do personagem. */
/* contrato com a engine: nomes e quantidade de quadros das animacoes (engine/src/fight.c, enum A_*; sprites/lista_animacoes.md do jogo) */
const FIGHTER_ANIMS = [["idle", 4, "loop"], ["walk", 5, "loop"], ["walkb", 5, "loop"], ["crouch_in", 1, "once"], ["crouch", 1, "loop"], ["jump", 2, "once"], ["fjump", 6, "once"], ["block", 1, "loop"], ["block_c", 1, "loop"],
  ["mp", 3, "once"], ["hp", 5, "once"], ["mk", 5, "once"], ["hk", 5, "once"], ["hpc", 5, "once"], ["hkc", 3, "once"], ["mkc", 5, "once"], ["mpc", 3, "once"], ["cmp", 3, "once"], ["chp", 4, "once"], ["cmk", 3, "once"], ["chk", 5, "once"],
  ["jp", 3, "once"], ["jk", 3, "once"], ["jdk", 3, "once"], ["jhk", 3, "once"], ["hadouken", 4, "once"], ["shoryu", 6, "once"], ["tatsu", 6, "loop"], ["throw", 5, "once"], ["thrown", 4, "once"], ["rise", 2, "once"],
  ["hit_head", 3, "once"], ["hit_body", 4, "once"], ["hit_crouch", 2, "once"], ["fall", 3, "once"], ["ko", 1, "once"], ["victory", 4, "loop"], ["fireball", 1, "loop"], ["fireball_hit", 1, "once"], ["fireball_fx", 4, "loop"], ["spark", 3, "once"], ["shadow", 2, "loop"], ["retrato", 1, "once"]];
const SGE_SIZES = [[64, 96, "médio (Ryu, Sagat, DonLee)"], [48, 80, "pequeno / ágil"], [96, 112, "grande (precisa de mais pedaços: ainda não cabe na engine)"]];
function boxLayers() { return [{ name: "Corpo", vis: true, lock: false }, { name: "Hitbox", kind: "hitbox", vis: true, lock: false }, { name: "Hitbox 2", kind: "hitbox2", vis: true, lock: false }, { name: "Hurtbox", kind: "hurtbox", vis: true, lock: false }, { name: "Âncora", kind: "anchor", vis: true, lock: false }]; }
function newFighterDialog() {
  modal(`<h3>Novo lutador para a SF Engine</h3>
    <div class="row"><label>Nome</label><input id="nf-name" value="lutador"></div>
    <div class="row"><label>Largura (px)</label><input id="nf-w" type="number" step="8" min="8" max="248" value="64"></div>
    <div class="row"><label>Altura (px)</label><input id="nf-h" type="number" step="8" min="8" max="248" value="96"></div>
    <div class="presets" id="nf-sizes">${SGE_SIZES.map(([w, h, n]) => `<button data-s="${w},${h}">${w}×${h} <small>${n}</small></button>`).join("")}</div>
    <div class="row"><label>Quadros por tag</label><select id="nf-n"><option value="sug">Como a engine espera</option><option value="1">1 em todas</option></select></div>
    <div class="hint" style="padding:0">Cria uma tag para cada animação da engine (idle, walk, hp, shoryu…) e as camadas <b>Hitbox, Hitbox 2, Hurtbox e Âncora</b>. Desenhe o corpo na camada Corpo e marque as caixas nas camadas delas.</div>
    <div class="btns"><button id="nf-c">Cancelar</button><button id="nf-ok" class="primary">Criar</button></div>`);
  document.querySelectorAll("#nf-sizes [data-s]").forEach((b) => b.onclick = () => { const [w, h] = b.dataset.s.split(","); $("#nf-w").value = w; $("#nf-h").value = h; });
  $("#nf-c").onclick = closeModal;
  $("#nf-ok").onclick = () => {
    const w = snap8(+$("#nf-w").value), h = snap8(+$("#nf-h").value), one = $("#nf-n").value === "1";
    const d = newDoc(w, h, $("#nf-name").value.trim() || "lutador");
    d.frames = []; d.tags = []; d.layers = boxLayers(); d.cels = d.layers.map(() => []); d.sfengine = { fighter: true };
    FIGHTER_ANIMS.forEach(([name, n, loop]) => { const c = one ? 1 : n, from = d.frames.length;
      for (let i = 0; i < c; i++) { d.frames.push({ d: 100 }); d.cels.forEach((r) => r.push(new Uint8Array(w * h))); }
      d.tags.push({ name, from, to: from + c - 1, loop }); });
    closeModal(); loadDoc(d);
    msg(`${d.tags.length} tags criadas. Desenhe cada animação na sua tag e marque as caixas nas camadas de hitbox.`);
  };
}
/* exporta o lutador para a engine: por tag, por quadro: pedacos 16x16 (indices 0-15), caixas e ancora, relativos ao canto de cima da arte */
async function exportSF() {
  dropFloat();
  const n = usedSlots().size;
  if (n > 15) { alert(`O lutador usa ${n} cores: o limite é 15 + transparente.`); return; }
  const out = { format: "sf-fighter", version: 1, name: doc.name, pal: Array.from({ length: 16 }, (_, i) => (i ? doc.pal[i] || 0 : 0)), tags: [] };
  doc.tags.forEach((t) => {
    const frames = [];
    for (let f = t.from; f <= t.to; f++) {
      const idx = composite(f), sp = hwSplit(idx);
      let x0 = doc.w, y0 = doc.h;
      for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) if (idx[y * doc.w + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); }
      const rel = (b) => (b ? [b.x0 - x0, b.y0 - y0, b.x1 - x0 + 1, b.y1 - y0 + 1] : null), bx = (k) => { const li = kindLayer(k); return li < 0 ? null : boxOf(li, f); };
      const an = bx("anchor");
      let x1b = 0, y1b = 0; for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) if (idx[y * doc.w + x]) { x1b = Math.max(x1b, x); y1b = Math.max(y1b, y); }
      frames.push({ ms: doc.frames[f].d, w: x1b - x0 + 1, h: y1b - y0 + 1, dy: sp.length ? sp[0].dy : 0, pieces: sp.map((q) => { const px = new Uint8Array(256); for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) { const X = q.px + xx, Y = q.py + yy; px[yy * 16 + xx] = X >= 0 && Y >= 0 && X < doc.w && Y < doc.h ? idx[Y * doc.w + X] : 0; } return { x: q.px - x0, y: q.py - y0, px: b64(px) }; }),
        hitbox: rel(bx("hitbox")), hitbox2: rel(bx("hitbox2")), hurtbox: rel(bx("hurtbox")), anchor: an ? [(an.x0 + an.x1 + 1) / 2 - x0, an.y1 + 1 - y0] : null });
    }
    out.tags.push({ name: t.name, loop: t.loop, frames });
  });
  // retrato (tela de selecao, VS, continue): tag "retrato", 1 quadro, ate 56x80, encostado embaixo e centralizado
  const rt = doc.tags.find((t) => t.name === "retrato");
  if (rt) {
    const idx = composite(rt.from); let x0 = doc.w, y0 = doc.h, x1 = -1, y1 = -1;
    for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) if (idx[y * doc.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 >= 0) {
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (w > 56 || h > 80) { alert(`O retrato tem ${w}×${h} px: o máximo é 56×80. Exportei sem o retrato.`); }
      else {
        const px = new Uint8Array(56 * 80), ox = (56 - w) >> 1, oy = 80 - h;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[(oy + y) * 56 + ox + x] = idx[(y0 + y) * doc.w + x0 + x];
        out.portrait = { w: 56, h: 80, px: b64(px) };
      }
    }
  }
  download(new Blob([JSON.stringify(out)], { type: "application/json" }), fileBase() + ".sffighter.json");
  msg(`Exportado: ${out.tags.length} animações (${fileBase()}.sffighter.json).`);
}

/* ---------------------------------------------------- abrir um lutador do jogo (Ryu, Sagat, DonLee) direto da ROM-motor
 * Le engine/base.sfc + engine/base.json (mesmo servidor) e monta o documento com quadros, paleta, tags e caixas (= tools/para_sfpixel.py). */
let GAMEROM = null;
async function gameRom() {
  if (GAMEROM) return GAMEROM;
  const rom = new Uint8Array(await (await fetch("../engine/base.sfc")).arrayBuffer()), base = await (await fetch("../engine/base.json")).json();
  return (GAMEROM = { rom, base });
}
function fighterFromRom(G, fi) {
  const R = G.rom, B = G.base, rd = (o) => R[o] | (R[o + 1] << 8), PO = 16 * 0x8000, FAST = 0x90, H = PO;
  const off = (a, b) => PO + (b - FAST) * 0x8000 + (a - 0x8000), h = (i) => rd(H + 2 * i), s8 = (v) => (v > 127 ? v - 256 : v);
  const nf = h(6), np = h(7), A = {};
  B.arrays.forEach(([n, sz], k) => { const o = off(rd(H + h(10) + 4 * k), rd(H + h(10) + 4 * k + 2)), c = n.startsWith("pp_") ? np : nf, v = []; for (let i = 0; i < c; i++) v.push(sz === 1 ? R[o + i] : rd(o + 2 * i)); A[n] = v; });
  const chunkAt = (k) => off(rd(H + h(9) + 4 * k), R[H + h(9) + 4 * k + 2]);
  const palName = ["ryu.pal", "sagat.pal", "boxer.pal"][fi], ai = B.assets.indexOf(palName), ae = H + h(11) + 8 * ai, po = off(rd(ae), rd(ae + 2));
  const pal = []; for (let i = 0; i < 16; i++) pal.push(i ? rd(po + 2 * i) : 0);
  const FX = new Set(["fireball", "fireball_hit", "fireball_fx", "spark", "shadow"]), lay = B.layout.filter((l) => !FX.has(l[0])), base = B.fighter_bases[fi];
  const idx = []; lay.forEach(([, f0, c]) => { for (let i = 0; i < c; i++) idx.push(base + f0 + i); });
  const L = Math.max(...idx.map((k) => A.pf_ax[k])), Rr = Math.max(...idx.map((k) => A.pf_w[k] - A.pf_ax[k])), T = Math.max(...idx.map((k) => A.pf_h[k]));
  const W = Math.ceil((Math.max(L, Rr) * 2 + 8) / 8) * 8, HH = Math.ceil((T + 8) / 8) * 8, AX = W >> 1, GY = HH - 4;
  const d = newDoc(W, HH, ["Ryu", "Sagat", "DonLee"][fi]);
  d.pal = pal; d.frames = []; d.tags = []; d.layers = boxLayers(); d.cels = d.layers.map(() => []);
  const piece = (o, k, n) => { const r = k >> 3, c = k & 7, nr = Math.min(8, n - r * 8), row0 = o + r * 2 * 8 * 64, px = new Uint8Array(256);
    for (let half = 0; half < 2; half++) for (let side = 0; side < 2; side++) { const q = row0 + half * nr * 64 + c * 64 + side * 32;
      for (let y = 0; y < 8; y++) { const p0 = R[q + 2 * y], p1 = R[q + 2 * y + 1], p2 = R[q + 16 + 2 * y], p3 = R[q + 17 + 2 * y];
        for (let x = 0; x < 8; x++) { const b = 0x80 >> x; px[(half * 8 + y) * 16 + side * 8 + x] = (p0 & b ? 1 : 0) | (p1 & b ? 2 : 0) | (p2 & b ? 4 : 0) | (p3 & b ? 8 : 0); } } }
    return px; };
  lay.forEach(([anim, f0, cnt]) => {
    const ks = []; for (let i = 0; i < cnt; i++) ks.push(base + f0 + i);
    while (ks.length > 1 && ["pf_chunk", "pf_off", "pf_count"].every((n) => A[n][ks[ks.length - 1]] === A[n][ks[ks.length - 2]])) ks.pop();
    const t0 = d.frames.length;
    ks.forEach((k) => {
      const body = new Uint8Array(W * HH), ax = A.pf_ax[k], hh = A.pf_h[k], n = A.pf_count[k], oy = GY - hh, go = chunkAt(A.pf_chunk[k]) + A.pf_off[k];
      for (let j = 0; j < n; j++) { const dx = s8(A.pp_dx[A.pf_first[k] + j]), dy = A.pp_dy[A.pf_first[k] + j], px = piece(go, j, n);
        for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) { const v = px[yy * 16 + xx], X = AX + dx - 64 + xx, Y = oy + dy + yy; if (v && X >= 0 && Y >= 0 && X < W && Y < HH) body[Y * W + X] = v; } }
      const bx = (pre) => { const c = new Uint8Array(W * HH); if (A[pre][k]) { const x0 = s8(A[pre + "x0"][k]), x1 = s8(A[pre + "x1"][k]), y0 = A[pre + "y0"][k], y1 = A[pre + "y1"][k];
        for (let Y = GY - y1; Y < GY - y0; Y++) for (let X = AX + x0; X <= AX + x1; X++) if (X >= 0 && Y >= 0 && X < W && Y < HH) c[Y * W + X] = 1; } return c; };
      const an = new Uint8Array(W * HH); an[(GY - 1) * W + AX - 1] = an[(GY - 1) * W + AX] = 1;
      [body, bx("pf_hb"), bx("pf_hb2"), bx("pf_hu"), an].forEach((c, li) => d.cels[li].push(c));
      d.frames.push({ d: 100 });
    });
    d.tags.push({ name: anim, from: t0, to: d.frames.length - 1, loop: ["idle", "walk", "walkb", "victory", "tatsu"].includes(anim) ? "loop" : "once" });
  });
  return d;
}
function openGameFighterDialog() {
  modal(`<h3>Abrir lutador do jogo</h3>
    <div class="hint" style="padding:0">Abre o lutador com todos os quadros, a paleta, as tags e as caixas, pronto para editar e exportar de volta. (Precisa abrir o SF Pixel pelo servidor, junto com a pasta engine/.)</div>
    <div class="btns"><button data-gf="0">Ryu</button><button data-gf="1">Sagat</button><button data-gf="2">DonLee</button><button id="gf-c">Cancelar</button></div>`);
  $("#gf-c").onclick = closeModal;
  document.querySelectorAll("[data-gf]").forEach((b) => b.onclick = async () => {
    try { const G = await gameRom(); const d = fighterFromRom(G, +b.dataset.gf); closeModal(); loadDoc(d); msg(`${d.name}: ${d.frames.length} quadros em ${d.tags.length} animações.`); }
    catch (e) { closeModal(); msg("Não consegui ler engine/base.sfc (abra o SF Pixel pelo servidor da SF Engine)."); }
  });
}
function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
function fileBase() { return (doc.name || "sprite").replace(/[^a-z0-9_-]/gi, "_"); }
function saveSgpx() { dropFloat(); download(new Blob([JSON.stringify(serialize())], { type: "application/json" }), fileBase() + ".sgpx"); msg("Salvo: " + fileBase() + ".sgpx"); }
/* arquivo em bytes no formato pela extensao: .aseprite (camadas, quadros, tempos e tags) ou .sgpx */
async function docBytes(ext) {
  if (ext === "aseprite") return new Uint8Array(await (await ASEW.write({ w: doc.w, h: doc.h, pal: doc.pal.map(rgbK), layers: doc.layers, frames: doc.frames, cels: doc.cels, tags: doc.tags })).arrayBuffer());
  return new TextEncoder().encode(JSON.stringify(serialize()));
}
const extOf = (f) => (f.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
async function writeTo(file) {
  let ext = extOf(file);
  if (ext !== "sgpx" && (doc.kind === "map" || doc.pal.length > 256 || doc.layers.some((L) => L.kind))) { file = file.replace(/\.[^.\\/]*$/, "") + ".sgpx"; ext = "sgpx"; msg("Este documento só cabe em .sgpx."); }
  if (ext !== "sgpx") ext = "aseprite";
  const data = await docBytes(ext);
  if (window.sgfs) { await window.sgfs.write(file, data); doc.filePath = file; addRecent(file); }
  else download(new Blob([data]), file.split(/[\\/]/).pop());
  doc.name = file.split(/[\\/]/).pop().replace(/\.[^.]+$/, ""); renderTabs(); document.getElementById("docname").textContent = doc.name;
  msg("Salvo: " + file);
}
/* Salvar como: escolhe pasta, nome e formato (Aseprite ou projeto SG Pixel) */
async function saveAs() {
  dropFloat();
  const def = fileBase() + (doc.kind === "map" || doc.layers.some((L) => L.kind) ? ".sgpx" : ".aseprite");
  let file;
  if (window.sgfs) file = await window.sgfs.pickSave(doc.filePath || def, doc.kind === "map");
  else file = prompt("Salvar como (termine com .aseprite ou .sgpx):", def);
  if (!file) return;
  if (!extOf(file)) file += doc.kind === "map" || doc.layers.some((L) => L.kind) ? ".sgpx" : ".aseprite";
  await writeTo(file);
}
/* Salvar: grava no mesmo arquivo; na primeira vez funciona como Salvar como */
async function saveDoc() {
  dropFloat();
  if (doc.filePath && window.sgfs) return writeTo(doc.filePath);
  return saveAs();
}
function loadDoc(d) { openTab(d); }
/* ---------------------------------------------------- abas */
function tabState() { return { doc, cur: { ...cur }, undo, redo, sel, zoom, panX, panY, fg, bg }; }
function useTab(t) { doc = t.doc; Object.assign(cur, t.cur); undo = t.undo; redo = t.redo; sel = t.sel; zoom = t.zoom; panX = t.panX; panY = t.panY; fg = t.fg; bg = t.bg; float = null; range = null; }
function switchTab(i) {
  if (i === tabIx || !tabs[i]) return;
  dropFloat(); if (playing) togglePlay();
  tabs[tabIx] = tabState(); tabIx = i; useTab(tabs[i]); renderAll(); render(); dirty();
}
function openTab(d) {
  if (doc) { dropFloat(); if (playing) togglePlay(); tabs[tabIx] = tabState(); }
  // um documento vazio e intocado da lugar ao novo
  const blank = doc && doc.kind !== "map" && tabs.length && !undo.length && doc.cels.every((r) => r.every((c) => !c.some((v) => v)));
  if (!blank) { tabs.push(null); tabIx = tabs.length - 1; }
  doc = d; cur.layer = 0; cur.frame = 0; sel = null; float = null; undo = []; redo = []; fg = 1; bg = 0; range = null;
  renderAll(); fitView(); render(); tabs[tabIx] = tabState(); dirty();
}
function closeTab(i) {
  if (tabs.length < 2) { tabs = []; doc = null; openTab(newDoc(48, 64, "sprite")); return; }
  if (!confirm(`Fechar "${tabs[i].doc.name}"? (Salve antes com Ctrl+S se quiser guardar.)`)) return;
  dropFloat(); tabs[tabIx] = tabState();
  tabs.splice(i, 1); tabIx = Math.min(i < tabIx ? tabIx - 1 : tabIx, tabs.length - 1);
  useTab(tabs[tabIx]); renderAll(); fitView(); render(); dirty();
}
function renderTabs() {
  const box = document.getElementById("tabs"); if (!box) return;
  box.innerHTML = "";
  tabs.forEach((t, i) => {
    const d = document.createElement("div"); d.className = "tab" + (i === tabIx ? " on" : "");
    const name = (i === tabIx ? doc : t.doc).name;
    d.innerHTML = `<span>${esc(name)}.${(i === tabIx ? doc : t.doc).kind === "map" || (i === tabIx ? doc : t.doc).layers.some((L) => L.kind) ? "sgpx" : "aseprite"}</span><b title="Fechar">×</b>`;
    d.onmousedown = (e) => { if (e.button === 1) { e.preventDefault(); closeTab(i); } };
    d.onclick = (e) => { if (e.target.tagName === "B") closeTab(i); else switchTab(i); };
    box.appendChild(d);
  });
  const n = document.createElement("div"); n.className = "tab add"; n.textContent = "+"; n.title = "Novo sprite (Ctrl+N)"; n.onclick = newDialog; box.appendChild(n);
}
async function openBuffer(name, buf, fp) {
  if (/\.(aseprite|ase)$/i.test(name)) loadDoc(await fromAseprite(buf, name.replace(/\.[^.]+$/, "")));
  else loadDoc(deserialize(JSON.parse(new TextDecoder().decode(buf))));
  if (fp && /\.(aseprite|sgpx)$/i.test(fp)) { doc.filePath = fp; addRecent(fp); }   /* Salvar grava de volta no mesmo arquivo */
  msg("Aberto: " + name);
}
document.getElementById("file-open").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try { await openBuffer(f.name, await f.arrayBuffer(), window.sgfs && window.sgfs.pathOf ? window.sgfs.pathOf(f) : ""); }
  catch (err) { alert("Não consegui abrir: " + err.message); }
};
/* Abrir recente (so no programa instalado, que sabe o caminho dos arquivos) */
function recents() { try { return JSON.parse(localStorage.getItem("sfpixel-recent") || "[]"); } catch (e) { return []; } }
function addRecent(fp) { try { localStorage.setItem("sfpixel-recent", JSON.stringify([fp, ...recents().filter((x) => x !== fp)].slice(0, 10))); } catch (e) { /* sem armazenamento */ } }
async function openRecent(i) {
  const fp = recents()[i]; if (!fp) return;
  if (!window.sgfs || !window.sgfs.read) { msg("Abrir recente só funciona no programa instalado (SG Pixel.exe)."); return; }
  const ix = tabs.findIndex((t) => t.doc.filePath === fp); if (ix >= 0) { switchTab(ix); return; }
  try { const buf = await window.sgfs.read(fp); await openBuffer(fp.split(/[\\/]/).pop(), buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf, fp); }
  catch (err) { alert("Não consegui abrir " + fp + "\n(o arquivo foi movido ou apagado?)"); try { localStorage.setItem("sfpixel-recent", JSON.stringify(recents().filter((x) => x !== fp))); } catch (e) { /* */ } }
}
/* .aseprite -> documento: cores convertidas para as 512 do Mega Drive, sem reduzir a quantidade.
 * O quadro cresce para multiplo de 8 (centralizado na largura, com o pe no chao). */
async function fromAseprite(buf, name) {
  const a = await ASE.parse(buf);
  const w = snapUp8(a.w), h = snapUp8(a.h), dx = (w - a.w) >> 1, dy = h - a.h;
  const pal = [0], slot = new Map();
  const layers = [], cels = [];
  a.layers.forEach((L, li) => {
    if (L.type !== 0) return;     // grupos e tilemaps ficam de fora
    layers.push({ name: L.name, vis: L.vis, lock: false });
    cels.push(a.frames.map((_, f) => {
      const out = new Uint8Array(w * h), src = a.cels[li][f];
      if (!src) return out;
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
        const i = (y * a.w + x) * 4; if (src[i + 3] < 128) continue;
        const k = keyOf(src[i], src[i + 1], src[i + 2]);
        let s = slot.get(k); if (s === undefined) { if (pal.length >= 256) s = 1; else { s = pal.length; pal.push(k); slot.set(k, s); } }
        out[(y + dy) * w + x + dx] = s;
      }
      return out;
    }));
  });
  if (!layers.length) throw new Error("o arquivo não tem camadas de imagem");
  while (pal.length < 16) pal.push(0);
  const d = { name, w, h, pal, loop: "loop", tags: a.tags.map((t) => ({ ...t })), layers, frames: a.frames, cels };
  setTimeout(() => msg(`${name}: ${a.frames.length} quadros, ${a.tags.length} tags, ${slot.size} cores${slot.size > 15 ? " (passou de 15: veja o painel)" : ""}${w !== a.w || h !== a.h ? `, quadro ajustado de ${a.w}×${a.h} para ${w}×${h}` : ""}.`), 50);
  return d;
}
const snapUp8 = (v) => Math.max(8, Math.min(248, Math.ceil(v / 8) * 8));
const safe = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_]/gi, "_").toLowerCase();
/* exportacao para o Mega Drive: pasta com um PNG indexado por tag + .res + paleta + leia-me, num .zip */
async function exportMD() {
  if (doc.kind === "map") return MAP.exportMD();
  dropFloat();
  const n = usedSlots().size;
  if (n > 15 || doc.pal.length > 16 && [...usedSlots()].some((v) => v > 15)) { alert(`O sprite usa ${n} cores${n <= 15 ? " mas alguma está num slot acima do 15" : ""}. O Mega Drive aceita 15 + transparente por paleta.\nDiminua as cores ou use Sprite → Reduzir para 15 cores.`); return; }
  if (doc.w > 248 || doc.h > 248) { alert("O SGDK aceita quadros de até 248×248."); return; }
  const base = safe(doc.name) || "sprite", tw = doc.w >> 3, th = doc.h >> 3, pal16 = Array.from({ length: 16 }, (_, i) => rgbK(doc.pal[i] || 0));
  const groups = doc.tags.length ? doc.tags : [{ name: base, from: 0, to: doc.frames.length - 1, loop: doc.loop }];
  const files = [], res = [`// ${doc.name}: gerado pelo SG Pixel`, `// quadro ${doc.w}x${doc.h} px = ${tw}x${th} tiles · todas as animações usam a mesma paleta (${base}_pal.h)`, ""];
  const readme = [`${doc.name} - exportado pelo SG Pixel`, ""];
  for (const t of groups) {
    const nm = safe(t.name), cnt = t.to - t.from + 1, W = doc.w * cnt, idx = new Uint8Array(W * doc.h);
    for (let f = t.from; f <= t.to; f++) { const c = composite(f); for (let y = 0; y < doc.h; y++) idx.set(c.subarray(y * doc.w, y * doc.w + doc.w), y * W + (f - t.from) * doc.w); }
    files.push({ name: `${base}/${nm}.png`, data: new Uint8Array(await (await PNG.indexed(W, doc.h, idx, pal16)).arrayBuffer()) });
    const timer = Math.max(1, Math.round(doc.frames[t.from].d * 60 / 1000));
    res.push(`SPRITE spr_${base}_${nm} "${base}/${nm}.png" ${tw} ${th} FAST ${timer}${t.loop === "pingpong" ? "   // ping-pong: o SGDK não faz sozinho" : t.loop === "once" ? "   // tocar uma vez" : ""}`);
    const st = []; for (let f = t.from; f <= t.to; f++) st.push(frameStats(f));
    readme.push(`${nm}.png  ${cnt} quadro(s) · repetição ${t.loop} · até ${Math.max(...st.map((s) => s.sp.length))} sprites do hardware e ${Math.max(...st.map((s) => s.tiles))} tiles por quadro`);
  }
  readme.push("", "Cada PNG é indexado (16 cores, índice 0 transparente), um quadro do lado do outro.", "Copie a pasta para res/ do projeto SGDK e cole as linhas de " + base + ".res no seu arquivo .res.");
  files.push({ name: `${base}/${base}.res`, data: new TextEncoder().encode(res.join("\n") + "\n") });
  files.push({ name: `${base}/${base}_pal.h`, data: new TextEncoder().encode(palH()) });
  files.push({ name: `${base}/LEIA-ME.txt`, data: new TextEncoder().encode(readme.join("\r\n") + "\r\n") });
  download(ZIP.store(files), base + "_megadrive.zip");
  msg(`Exportado: ${groups.length} animação(ões) na pasta ${base}/ (${base}_megadrive.zip).`);
}
async function exportSheet() {
  dropFloat();
  const n = doc.frames.length, W = doc.w * n, idx = new Uint8Array(W * doc.h);
  for (let f = 0; f < n; f++) { const c = composite(f); for (let y = 0; y < doc.h; y++) idx.set(c.subarray(y * doc.w, y * doc.w + doc.w), y * W + f * doc.w); }
  download(await PNG.indexed(W, doc.h, idx, doc.pal.map(rgbK)), fileBase() + ".png");
  msg(`Folha exportada: ${n} quadros de ${doc.w}×${doc.h}, PNG indexado de 16 cores.`);
}
/* todos os quadros, um PNG indexado cada (inclusive os vazios), numa pasta dentro do .zip */
async function exportAllFrames() {
  dropFloat();
  const base = safe(doc.name) || "sprite", pal16 = doc.pal.map(rgbK), n = doc.frames.length, dig = Math.max(3, String(n).length), files = [];
  for (let f = 0; f < n; f++) files.push({ name: `${base}_quadros/${base}_${String(f + 1).padStart(dig, "0")}.png`, data: new Uint8Array(await (await PNG.indexed(doc.w, doc.h, composite(f), pal16)).arrayBuffer()) });
  download(ZIP.store(files), base + "_quadros.zip");
  msg(`${n} quadros exportados, um PNG cada (${base}_quadros.zip).`);
}
async function exportFrame() {
  dropFloat(); download(await PNG.indexed(doc.w, doc.h, composite(cur.frame), doc.pal.map(rgbK)), `${fileBase()}_${cur.frame + 1}.png`);
}
function palH() { return `// paleta de ${doc.name} (formato da CGRAM do SNES: 0BBBBBGGGGGRRRRR)\nconst u16 pal_${fileBase()}[16] = {\n  ${Array.from({ length: 16 }, (_, i) => hex9(i ? doc.pal[i] || 0 : 0)).join(", ")}\n};\n`; }
window.usedSlots = usedSlots;
function usedSlots() { const u = new Set(); doc.cels.forEach((r, li) => doc.layers[li] && !doc.layers[li].kind && r.forEach((c) => { for (const v of c) if (v) u.add(v); })); return u; }
/* junta as cores mais parecidas ate sobrar 15 e reorganiza a paleta (so quando a pessoa pede) */
function reduceTo15() {
  let used = [...usedSlots()];
  if (used.length <= 15 && doc.pal.length <= 16) { msg("Já está dentro de 15 cores."); return; }
  push();
  const cnt = new Map(); doc.cels.forEach((r) => r.forEach((c) => { for (const v of c) if (v) cnt.set(v, (cnt.get(v) || 0) + 1); }));
  const dist = (a, b) => { const [r, g, bb] = rgbK(doc.pal[a]), [R, G, B] = rgbK(doc.pal[b]); return (r - R) ** 2 * 3 + (g - G) ** 2 * 4 + (bb - B) ** 2 * 2; };
  const remap = new Map(used.map((v) => [v, v]));
  while (used.length > 15) {
    let best = null;
    for (let i = 0; i < used.length; i++) for (let j = i + 1; j < used.length; j++) { const d = dist(used[i], used[j]); if (!best || d < best[0]) best = [d, used[i], used[j]]; }
    const [, a, b] = best, keep = cnt.get(a) >= cnt.get(b) ? a : b, drop = keep === a ? b : a;
    remap.forEach((v, k) => { if (v === drop) remap.set(k, keep); }); cnt.set(keep, cnt.get(keep) + cnt.get(drop)); used = used.filter((v) => v !== drop);
  }
  const np = [doc.pal[0], ...used.map((v) => doc.pal[v])], slot = new Map(used.map((v, i) => [v, i + 1]));
  doc.cels.forEach((r) => r.forEach((c) => { for (let i = 0; i < c.length; i++) if (c[i]) c[i] = slot.get(remap.get(c[i])); }));
  while (np.length < 16) np.push(0);
  doc.pal = np; fg = 1; bg = 0; renderAll(); msg("Paleta reduzida para 15 cores.");
}
/* Excluir slot (Delete com o mouse na paleta): os pixels dele viram a cor mais parecida que sobra; os slots de cima descem 1 */
function deleteSlot(i) {
  if (doc.kind === "map") { msg("No cenário a paleta é por linha: use as opções do cenário."); return; }
  if (!i || i >= doc.pal.length) { msg("O slot 0 (transparente) não pode ser excluído."); return; }
  let n = 0; doc.cels.forEach((r) => r.forEach((c) => { for (const v of c) if (v === i) n++; }));
  const dist = (a, b) => { const [r, g, bb] = rgbK(doc.pal[a]), [R2, G, B] = rgbK(doc.pal[b]); return (r - R2) ** 2 * 3 + (g - G) ** 2 * 4 + (bb - B) ** 2 * 2; };
  let to = 0;
  if (n) {
    for (let k = 1; k < doc.pal.length; k++) if (k !== i && (!to || dist(i, k) < dist(i, to))) to = k;
    if (!to) { msg("Não há outra cor para pôr no lugar."); return; }
    if (!confirm(`O slot ${i} aparece em ${n} pixel(s). Eles vão virar o slot ${to} (a cor mais parecida). Continuar?`)) return;
  }
  dropFloat(); push();
  const nt = to > i ? to - 1 : to;
  doc.cels.forEach((r) => r.forEach((c) => { for (let k = 0; k < c.length; k++) { const v = c[k]; if (v === i) c[k] = nt; else if (v > i) c[k] = v - 1; } }));
  doc.pal.splice(i, 1);
  if (doc.pal.length < 16) doc.pal.push(0);
  if (fg >= doc.pal.length || fg === i) fg = Math.max(1, Math.min(i, doc.pal.length - 1)); else if (fg > i) fg--;
  if (bg === i) bg = 0; else if (bg > i) bg--;
  renderAll(); msg(n ? `Slot ${i} excluído: ${n} pixel(s) passaram para a cor do slot ${to}.` : `Slot ${i} excluído (não era usado).`);
}
/* Remover da paleta todas as cores que nenhum pixel usa (acima do slot 15) e juntar as de cima */
function dropUnused() {
  if (doc.kind === "map") return;
  const u = usedSlots(); let k = 0;
  for (let i = doc.pal.length - 1; i >= 1; i--) if (!u.has(i) && doc.pal.length > 16) { deleteSlot(i); k++; }
  const used = [...u].sort((a, b) => a - b), extra = used.filter((v) => v > 15);
  msg(k ? `${k} slot(s) sem uso removidos.` + (extra.length ? ` Ainda há cor usada acima do 15: Ctrl+clique nela para achar.` : "") : "Nenhum slot sem uso para remover.");
}
function exportPal() {
    download(new Blob([palH()], { type: "text/plain" }), fileBase() + "_pal.h");
}

/* importar imagem: converte para as cores do Mega Drive e encaixa na paleta do sprite */
let importMode = "frame";
function importImage(mode) { importMode = mode; document.getElementById("file-img").click(); }
document.getElementById("file-img").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  if (importMode === "scene" || importMode === "sceneplane") { try { await MAP.importScene(f, importMode === "sceneplane"); } catch (err) { alert("Não consegui importar: " + err.message); } return; }
  if (doc.kind === "map") { msg("Isto é um cenário: use Cenário → Importar imagem."); return; }
  const img = new Image(); img.src = URL.createObjectURL(f); await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  // fundo: canto superior esquerdo opaco = cor de fundo (folhas ripadas)
  const bgKey = d[3] > 127 ? keyOf(d[0], d[1], d[2]) : -1;
  const count = new Map();
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const k = keyOf(d[i], d[i + 1], d[i + 2]); if (k !== bgKey) count.set(k, (count.get(k) || 0) + 1); }
  push();
  const used = new Set(); doc.cels.forEach((r) => r.forEach((cc) => { for (const v of cc) if (v) used.add(v); }));
  const map = new Map();
  [...count.entries()].sort((a, b) => b[1] - a[1]).forEach(([k]) => {
    let s = doc.pal.indexOf(k, 1);
    if (s < 1) { for (let i = 1; i < doc.pal.length; i++) if (!used.has(i)) { s = i; break; } if (s < 1 && doc.pal.length < 256) { s = doc.pal.length; doc.pal.push(k); } if (s > 0) { doc.pal[s] = k; used.add(s); } }
    if (s > 0) map.set(k, s);
  });
  const near = (k) => {
    if (map.has(k)) return map.get(k);
    const [r, g2, b] = rgbK(k); let best = 1, bd = 1e9;
    for (let i = 1; i < doc.pal.length; i++) { const [R, G, B] = rgbK(doc.pal[i]); const dd = (r - R) ** 2 * 3 + (g2 - G) ** 2 * 4 + (b - B) ** 2 * 2; if (dd < bd) { bd = dd; best = i; } }
    map.set(k, best); return best;
  };
  const toIdx = (x, y) => { const i = (y * c.width + x) * 4; if (d[i + 3] < 128) return 0; const k = keyOf(d[i], d[i + 1], d[i + 2]); return k === bgKey ? 0 : near(k); };
  const grab = (ox, oy) => { const out = new Uint8Array(doc.w * doc.h); for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) if (ox + x < c.width && oy + y < c.height) out[y * doc.w + x] = toIdx(ox + x, oy + y); return out; };
  if (importMode === "sheet") {
    const cols = Math.floor(c.width / doc.w), rows = Math.floor(c.height / doc.h);
    const at = cur.frame + 1; let k = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const data = grab(x * doc.w, y * doc.h); if (!data.some((v) => v)) continue;
      doc.frames.splice(at + k, 0, { d: doc.frames[cur.frame].d }); tagsInsert(at + k);
      doc.cels.forEach((r, li) => r.splice(at + k, 0, li === cur.layer ? data : new Uint8Array(doc.w * doc.h))); k++;
    }
    msg(`${k} quadros importados da folha (cortada em ${doc.w}×${doc.h}).`);
  } else {
    const data = grab(0, 0), cc = cel(); for (let i = 0; i < data.length; i++) if (data[i]) cc[i] = data[i];
    msg(`Imagem importada no quadro ${cur.frame + 1}${c.width > doc.w || c.height > doc.h ? " (cortada no tamanho do quadro)" : ""}.`);
  }
  if (usedSlots().size > 15) msg(`Agora o sprite usa ${usedSlots().size} cores: passou de 15. Veja o painel Mega Drive.`);
  renderAll();
};

/* ================================================================== sprite: tamanho, virar */
const SIZES = [[8, 8], [16, 16], [16, 24], [24, 24], [24, 32], [32, 32], [32, 48], [40, 56], [48, 48], [48, 64], [56, 72], [64, 64], [64, 80], [80, 96], [96, 112], [128, 128]];
function newDialog() {
  modal(`<h3>Novo sprite</h3>
    <div class="row"><label>Nome</label><input id="n-name" value="sprite"></div>
    <div class="row"><label>Largura (px)</label><input id="n-w" type="number" step="8" min="8" max="248" value="48"></div>
    <div class="row"><label>Altura (px)</label><input id="n-h" type="number" step="8" min="8" max="248" value="64"></div>
    <div class="presets">${SIZES.map(([w, h]) => `<button data-s="${w},${h}">${w}×${h}</button>`).join("")}</div>
    <div class="hint" style="padding:0">O tamanho vai em múltiplos de 8 (um tile). Até 32×32 é um sprite só do hardware; maior que isso vira vários sprites (máximo 248×248 no SGDK).</div>
    <div class="btns"><button id="n-cancel">Cancelar</button><button id="n-ok" class="primary">Criar</button></div>`);
  const W = $("#n-w"), H = $("#n-h");
  document.querySelectorAll("[data-s]").forEach((b) => b.onclick = () => { const [w, h] = b.dataset.s.split(","); W.value = w; H.value = h; });
  $("#n-cancel").onclick = closeModal;
  $("#n-ok").onclick = () => { const w = snap8(+W.value), h = snap8(+H.value); closeModal(); loadDoc(newDoc(w, h, $("#n-name").value.trim() || "sprite")); };
}
const snap8 = (v) => Math.max(8, Math.min(248, Math.round((v || 8) / 8) * 8));
function resizeDialog() {
  ask("Tamanho do quadro", [["Largura (px)", "w", doc.w, "number"], ["Altura (px)", "h", doc.h, "number"], ["Ancorar em", "a", "baixo-centro", ["baixo-centro", "centro", "topo-esquerda"]]], (v) => {
    const w = snap8(+v.w), h = snap8(+v.h);
    const dx = v.a === "topo-esquerda" ? 0 : Math.round((w - doc.w) / 2 / 1), dy = v.a === "topo-esquerda" ? 0 : v.a === "centro" ? Math.round((h - doc.h) / 2) : h - doc.h;
    dropFloat(); push();
    doc.cels = doc.cels.map((r) => r.map((c) => { const n = new Uint8Array(w * h); for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) n[Y * w + X] = c[y * doc.w + x]; } return n; }));
    doc.w = w; doc.h = h; sel = null; renderAll(); fitView(); render();
    msg(`Quadro agora tem ${w}×${h} (múltiplo de 8).`);
  });
}
/* ---------------------------------------------------- canvas: aparar, recortar, girar, escalar
 * remap: monta todas as cels num tamanho novo; src(x, y) devolve o indice do pixel de origem (ou -1) */
function remap(w, h, src, note) {
  dropFloat(); push();
  const ow = doc.w;
  doc.cels = doc.cels.map((r) => r.map((c) => { const n = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = src(x, y); if (i >= 0) n[y * w + x] = c[i]; } return n; }));
  doc.w = w; doc.h = h; sel = null; renderAll(); fitView(); render(); msg(note || `Canvas agora tem ${w}×${h}.`);
  void ow;
}
/* caixa de tudo que esta desenhado (todas as camadas e quadros) */
function artBox() {
  let x0 = doc.w, y0 = doc.h, x1 = -1, y1 = -1;
  doc.cels.forEach((r) => r.forEach((c) => { for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) if (c[y * doc.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }));
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/* Aparar: o canvas encolhe ate a arte (somando todos os quadros), em multiplo de 8; o pe continua embaixo */
function trimCanvas() {
  const b = artBox(); if (!b) { msg("Não há nada desenhado para aparar."); return; }
  const w = snapUp8(b.w), h = snapUp8(b.h), ox = b.x - Math.floor((w - b.w) / 2), oy = b.y + b.h - h, OW = doc.w, OH = doc.h;
  remap(w, h, (x, y) => { const X = x + ox, Y = y + oy; return X >= 0 && Y >= 0 && X < OW && Y < OH ? Y * OW + X : -1; }, `Aparado: ${OW}×${OH} → ${w}×${h} (múltiplo de 8, pé embaixo).`);
}
/* Recortar: o canvas vira a area selecionada (arredondada para multiplo de 8) */
function cropToSel() {
  if (!sel) { msg("Marque uma área com a seleção (M) para recortar."); return; }
  const r = sel, w = snapUp8(r.w), h = snapUp8(r.h), ox = r.x - Math.floor((w - r.w) / 2), oy = r.y + r.h - h, OW = doc.w, OH = doc.h;
  remap(w, h, (x, y) => { const X = x + ox, Y = y + oy; return X >= 0 && Y >= 0 && X < OW && Y < OH ? Y * OW + X : -1; }, `Recortado na seleção: ${w}×${h}.`);
}
function rotateCanvas(deg) {
  const OW = doc.w, OH = doc.h;
  if (deg === 180) return remap(OW, OH, (x, y) => (OH - 1 - y) * OW + (OW - 1 - x), "Canvas girado 180°.");
  if (deg === 90) return remap(OH, OW, (x, y) => (OH - 1 - x) * OW + y, "Canvas girado 90° no sentido horário.");
  return remap(OH, OW, (x, y) => x * OW + (OW - 1 - y), "Canvas girado 90° no sentido anti-horário.");
}
/* Tamanho do sprite: escala a arte (pixel duro, sem borrar) */
function spriteSizeDialog() {
  ask("Tamanho do sprite (escala)", [["Escala (%)", "p", 200, "number"]], (v) => {
    const f = Math.max(10, Math.min(800, +v.p || 100)) / 100, OW = doc.w, OH = doc.h, w = snapUp8(Math.round(OW * f)), h = snapUp8(Math.round(OH * f));
    remap(w, h, (x, y) => { const X = Math.floor(x / f), Y = Math.floor(y / f); return X < OW && Y < OH ? Y * OW + X : -1; }, `Arte escalada ${Math.round(f * 100)}%: ${w}×${h}.`);
  });
}
function duplicateSprite() { dropFloat(); const d = deserialize(serialize()); d.name += "_copia"; d.filePath = null; openTab(d); msg("Sprite duplicado numa aba nova."); }
function spriteFromSel() {
  if (!sel) { msg("Marque uma área com a seleção (M)."); return; }
  dropFloat();
  const r = sel, w = snapUp8(r.w), h = snapUp8(r.h), c = cel(), d = newDoc(w, h, doc.name + "_recorte");
  d.pal = doc.pal.slice();
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) d.cels[0][0][(h - r.h + y) * w + x + ((w - r.w) >> 1)] = c[(r.y + y) * doc.w + r.x + x];
  openTab(d); msg("Sprite novo com a seleção.");
}
/* Preencher (F) e Contornar (S) a selecao com a cor de frente */
function fillSel(stroke) {
  if (!sel) { msg("Marque uma área com a seleção (M)."); return; }
  dropFloat(); push(); const c = cel(), r = sel;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (inSel(x, y) && (!stroke || !inSel(x - 1, y) || !inSel(x + 1, y) || !inSel(x, y - 1) || !inSel(x, y + 1) || x === 0 || y === 0 || x === doc.w - 1 || y === doc.h - 1)) c[y * doc.w + x] = fg;
  afterDraw();
}
/* Trocar cor (Shift+R): troca um slot por outro nos pixels (sem mudar a paleta) */
function replaceColorDialog() {
  ask("Trocar cor", [["Trocar o slot", "a", fg || 1, "number"], ["Pelo slot", "b", bg || 0, "number"], ["Onde", "w", "este quadro", ["este quadro", "esta camada (todos os quadros)", "tudo"]]], (v) => {
    const a = +v.a, b = +v.b; if (!(a >= 0 && b >= 0 && a < doc.pal.length && b < doc.pal.length)) return;
    dropFloat(); push();
    const cels = v.w === "tudo" ? doc.cels.flat() : v.w.startsWith("esta camada") ? doc.cels[cur.layer] : [cel()];
    let n = 0; cels.forEach((c) => { for (let i = 0; i < c.length; i++) if (c[i] === a && (!sel || inSel(i % doc.w, (i / doc.w) | 0))) { c[i] = b; n++; } });
    afterDraw(); msg(`${n} pixels trocados do slot ${a} para o ${b}.`);
  });
}
/* Deslocar a camada 1 px (com volta, como o Shift do Aseprite) */
function shiftCel(dx, dy) {
  dropFloat(); push(); const c = cel(), t = c.slice(), W = doc.w, H = doc.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c[((y + dy + H) % H) * W + ((x + dx + W) % W)] = t[y * W + x];
  afterDraw();
}
/* arrastar o nome de uma camada (ou o numero de um quadro / quadros marcados) para reordenar;
 * uma linha mostra onde vai ficar ao soltar */
let tlDragged = false;
function tlDrag(el, kind) {
  el.addEventListener("mousedown", (ev) => {
    if (ev.button !== 0 || ev.target.closest("button")) return;
    const sx = ev.clientX, sy = ev.clientY, grid = document.getElementById("tl-grid");
    let moving = false, slot = -1, line = null;
    const items = kind === "layer" ? [...grid.querySelectorAll("[data-l]")].map((d) => d.closest("td")) : [...grid.querySelectorAll("th[data-f]")];
    const idx = kind === "layer" ? +el.dataset.l : +el.dataset.f;
    let a = idx, b = idx;
    if (kind === "frame" && range) { const ra = Math.min(range.a, range.b), rb = Math.max(range.a, range.b); if (idx >= ra && idx <= rb) { a = ra; b = rb; } }
    const mv = (e) => {
      if (!moving && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) < 5) return;
      if (!moving) { moving = true; line = document.createElement("div"); line.className = "tl-dropline " + kind; grid.appendChild(line); document.body.style.cursor = "grabbing"; }
      const g = grid.getBoundingClientRect();
      // posicao de soltura: antes/depois do item mais proximo
      let best = 0, bd = 1e9, pos = 0;
      items.forEach((it, i) => {
        const r = it.getBoundingClientRect();
        [[kind === "layer" ? r.top : r.left, i], [kind === "layer" ? r.bottom : r.right, i + 1]].forEach(([p, sl]) => {
          const d = Math.abs((kind === "layer" ? e.clientY : e.clientX) - p); if (d < bd) { bd = d; best = sl; pos = p; }
        });
      });
      slot = best;
      if (kind === "layer") Object.assign(line.style, { top: pos - g.top + grid.scrollTop - 1 + "px", left: grid.scrollLeft + "px", width: g.width + "px", height: "3px" });
      else Object.assign(line.style, { left: pos - g.left + grid.scrollLeft - 1 + "px", top: grid.scrollTop + "px", height: grid.scrollHeight + "px", width: "3px" });
    };
    const up = () => {
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      if (!moving) return;
      tlDragged = true; setTimeout(() => { tlDragged = false; }, 0);
      line.remove();
      if (kind === "layer") reorderLayer(idx, slot); else reorderFrames(a, b, slot);
    };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  });
}
/* camadas aparecem de cima (ultima) para baixo (0); slot = posicao na lista da tela */
function reorderLayer(li, slot) {
  const n = doc.layers.length, vis = [];
  for (let i = n - 1; i >= 0; i--) vis.push(i);
  const from = vis.indexOf(li);
  if (slot === from || slot === from + 1) return;
  dropFloat(); push();
  vis.splice(from, 1); vis.splice(slot > from ? slot - 1 : slot, 0, li);
  const order = vis.slice().reverse();   // indice novo -> indice antigo
  doc.layers = order.map((i) => doc.layers[i]); doc.cels = order.map((i) => doc.cels[i]);
  cur.layer = order.indexOf(li);
  renderAll(); msg("Camada movida.");
}
/* move os quadros a..b para antes do quadro slot (as tags ficam onde estao) */
function reorderFrames(a, b, slot) {
  if (slot >= a && slot <= b + 1) return;
  dropFloat(); push();
  const cnt = b - a + 1, ins = slot > b ? slot - cnt : slot;
  const mv = (arr) => { const blk = arr.splice(a, cnt); arr.splice(ins, 0, ...blk); };
  mv(doc.frames); doc.cels.forEach(mv);
  cur.frame = ins + (cur.frame - a >= 0 && cur.frame <= b ? cur.frame - a : 0);
  range = cnt > 1 ? { a: ins, b: ins + cnt - 1 } : null; tlFocus = cnt > 1;
  renderAll(); msg(cnt > 1 ? `${cnt} quadros movidos.` : "Quadro movido.");
}
/* move 1 px todas as camadas (menos as travadas) dos quadros a..b; o que sai de um lado volta pelo outro, sem perder nada */
function moveFrames(a, b, dx, dy) {
  push(); const W = doc.w, H = doc.h;
  for (let f = a; f <= b; f++) doc.cels.forEach((row, li) => {
    if (doc.layers[li].lock) return;
    const c = row[f], t = c.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c[((y + dy + H) % H) * W + ((x + dx + W) % W)] = t[y * W + x];
  });
  afterDraw(); msg(a === b ? `Quadro ${a + 1}: todas as camadas moveram 1 px.` : `Quadros ${a + 1}-${b + 1}: todas as camadas moveram 1 px.`);
}
/* ferramentas e linha do tempo ao mesmo tempo: se a barra de ferramentas nao cabe na altura, ela quebra em mais colunas em vez de cortar */
function fitToolbar() {
  const tb = document.getElementById("toolbar"), main = document.getElementById("main"); if (!tb || !main) return;
  main.style.setProperty("--tbw", "46px"); tb.style.flexWrap = "nowrap";
  const need = tb.scrollHeight, avail = tb.clientHeight;
  tb.style.flexWrap = "wrap";
  if (!avail) return;
  const cols = Math.max(1, Math.ceil(need / avail));
  main.style.setProperty("--tbw", (cols * 40 + 6) + "px");
  if (cols > 1) { const again = Math.ceil(tb.scrollHeight / tb.clientHeight); if (tb.scrollWidth > tb.clientWidth + 2 || again > cols) main.style.setProperty("--tbw", ((cols + 1) * 40 + 6) + "px"); }
}
window.addEventListener("resize", () => setTimeout(fitToolbar, 0));
window.addEventListener("load", () => { setTimeout(fitToolbar, 300); if (window.ResizeObserver) new ResizeObserver(() => fitToolbar()).observe(document.getElementById("stage")); });
function toggleTimeline() { const t = document.getElementById("timeline"); t.classList.toggle("hidden"); fitToolbar(); render(); }
function fullScreen() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
function flip(horiz, allFrames) {
  dropFloat(); push();
  const r = sel || { x: 0, y: 0, w: doc.w, h: doc.h };
  const doIt = (c) => { const t = c.slice(); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const sx = horiz ? r.w - 1 - x : x, sy = horiz ? y : r.h - 1 - y; c[(r.y + y) * doc.w + r.x + x] = t[(r.y + sy) * doc.w + r.x + sx]; } };
  if (allFrames) doc.cels.forEach((row) => row.forEach(doIt)); else doIt(cel());
  renderAll();
}
function swapSlots(a, b) {
  push(); [doc.pal[a], doc.pal[b]] = [doc.pal[b], doc.pal[a]];
  doc.cels.forEach((r) => r.forEach((c) => { for (let i = 0; i < c.length; i++) c[i] = c[i] === a ? b : c[i] === b ? a : c[i]; }));
  renderAll();
}

/* ================================================================== menus, modais, atalhos */
const $ = (q) => document.querySelector(q);
function msg(t) { $("#st-msg").textContent = t; }
function modal(h) { $("#modal-box").innerHTML = h; $("#modal").classList.remove("hidden"); }
function closeModal() { $("#modal").classList.add("hidden"); }
function ask(title, fields, ok) {
  modal(`<h3>${esc(title)}</h3>${fields.map(([l, k, v, t]) => `<div class="row"><label>${l}</label>${Array.isArray(t)
    ? `<select data-k="${k}">${t.map((o) => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select>`
    : `<input data-k="${k}" type="${t || "text"}" value="${esc(v)}">`}</div>`).join("")}
    <div class="btns"><button id="a-cancel">Cancelar</button><button id="a-ok" class="primary">OK</button></div>`);
  const done = () => { const v = {}; document.querySelectorAll("#modal-box [data-k]").forEach((e) => v[e.dataset.k] = e.value); closeModal(); ok(v); };
  $("#a-cancel").onclick = closeModal; $("#a-ok").onclick = done;
  const first = $("#modal-box [data-k]"); if (first) { first.focus(); first.select && first.select(); }
  $("#modal-box").onkeydown = (e) => { if (e.key === "Enter") done(); if (e.key === "Escape") closeModal(); };
}

const CMD = {
  newdoc: newDialog, trim: trimCanvas, crop: cropToSel, rot180: () => rotateCanvas(180), rot90: () => rotateCanvas(90), rot270: () => rotateCanvas(270),
  spritesize: spriteSizeDialog, dup: duplicateSprite, fromsel: spriteFromSel, fillsel: () => fillSel(false), strokesel: () => fillSel(true), replace: replaceColorDialog,
  shl: () => shiftCel(-1, 0), shr: () => shiftCel(1, 0), shu: () => shiftCel(0, -1), shd: () => shiftCel(0, 1), timeline: toggleTimeline, fullscreen: fullScreen, theme: () => { applyTheme(document.documentElement.getAttribute("data-theme") === "claro" ? "escuro" : "claro"); render(); },
  newfighter: newFighterDialog, gamefighter: openGameFighterDialog, newbox: newBoxLayer, allframes: exportAllFrames, delframes: delFrames, newmap: () => MAP.newDialog(), importscene: () => importImage("scene"),
  importplane: () => (doc.kind === "map" ? importImage("sceneplane") : msg("Abra ou crie um cenário primeiro.")),
  optimize: () => (doc.kind === "map" ? MAP.optimize() : msg("Só para cenários.")), mapresize: () => (doc.kind === "map" ? MAP.resizeDialog() : msg("Só para cenários.")), md: exportSF, closetab: () => closeTab(tabIx), newtag: newTag, transform: startTransform, reduce: reduceTo15, delslot: () => deleteSlot(fg), dropunused: dropUnused,
  nexttab: () => switchTab((tabIx + 1) % tabs.length), prevtab: () => switchTab((tabIx + tabs.length - 1) % tabs.length), open: () => $("#file-open").click(), save: saveDoc, saveas: saveAs, savesgpx: saveSgpx, sheet: exportSheet, framepng: exportFrame, pal: exportPal,
  importframe: () => importImage("frame"), importsheet: () => importImage("sheet"),
  undo: doUndo, redo: doRedo, copy: () => copySel(false), cut: () => copySel(true), paste: pasteMenu,
  selall: () => { dropFloat(); tlFocus = false; push(); sel = { x: 0, y: 0, w: doc.w, h: doc.h }; if (tool !== "move") { tool = "select"; renderToolbar(); renderToolOpts(); } render(); msg("Quadro inteiro selecionado: Ctrl+C copia, vá em outro quadro e Ctrl+V cola."); }, desel: () => { dropFloat(); if (sel) push(); sel = null; render(); },
  clear: () => { if (float) { float = null; render(); return; } push(); const c = cel(); for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) if (inSel(x, y)) c[y * doc.w + x] = 0; afterDraw(); },
  fliph: () => flip(true, false), flipv: () => flip(false, false), fliphall: () => flip(true, true), resize: resizeDialog,
  swap: () => ask("Trocar dois slots da paleta", [["Slot A", "a", fg || 1, "number"], ["Slot B", "b", bg || 2, "number"]], (v) => { const a = +v.a, b = +v.b; if (a > 0 && b > 0 && a < doc.pal.length && b < doc.pal.length) swapSlots(a, b); }),
  defpal: () => { push(); doc.pal = defaultPal(); renderAll(); },
  play: togglePlay, first: () => goFrame(0), last: () => goFrame(doc.frames.length - 1), prev: () => goFrame(cur.frame - 1), next: () => goFrame(cur.frame + 1),
  onion: () => { onion = !onion; render(); renderTimeline(); },
  newframe: () => newFrame(false), newempty: () => newFrame(true), delframe: delFrame, frameleft: () => moveFrame(-1), frameright: () => moveFrame(1), frameprops: () => frameProps(cur.frame),
  newlayer: newLayer, dellayer: delLayer, layerup: () => moveLayer(1), layerdown: () => moveLayer(-1), merge: mergeDown, rename: () => renameLayer(cur.layer),
  preview: () => togglePreview(), grid: () => { showGrid = !showGrid; render(); }, tiles: () => { showTiles = !showTiles; render(); renderReport(); },
  split: () => { showSplit = !showSplit; render(); renderReport(); }, fit: () => { fitView(); render(); }, zoom100: () => { zoom = 1; render(); },
  keys: showKeys, about: () => modal(`<h3>SG Pixel</h3><p>Editor de pixel art e animação com as regras do Mega Drive: 512 cores, 15 por paleta + transparente, quadros em múltiplos de 8, divisão em sprites do hardware e exportação em PNG indexado para o SGDK.</p><div class="btns"><button class="primary" onclick="closeModal()">OK</button></div>`),
};
const SPRITE_ONLY = ["trim", "crop", "rot180", "rot90", "rot270", "spritesize", "dup", "fromsel", "transform", "fillsel", "strokesel", "replace", "shl", "shr", "shu", "shd", "allframes", "sheet", "framepng", "importframe", "importsheet", "copy", "cut", "paste", "selall", "desel", "clear", "fliph", "flipv", "fliphall", "resize", "reduce", "delslot", "dropunused", "swap",
  "play", "first", "last", "prev", "next", "onion", "newframe", "newempty", "delframe", "frameleft", "frameright", "frameprops", "newtag", "newlayer", "dellayer", "layerup", "layerdown", "merge", "rename"];
SPRITE_ONLY.forEach((k) => { const f = CMD[k]; CMD[k] = (...a) => (doc.kind === "map" ? msg("Esse comando é para sprites; isto é um cenário.") : f(...a)); });
const MENUS = {
  file: [["Novo sprite…", "newdoc", "Ctrl+N"], ["Novo lutador para a SF Engine…", "newfighter", ""], ["Abrir lutador do jogo (Ryu, Sagat, DonLee)…", "gamefighter", ""], ["Abrir… (.sgpx = com caixas, .aseprite)", "open", "Ctrl+O"], ["Salvar", "save", "Ctrl+S"], ["Salvar como… (.sgpx guarda as caixas)", "saveas", "Ctrl+Shift+S"], ["Fechar aba", "closetab", "Ctrl+W"], "-", ["Importar imagem no quadro…", "importframe", "Ctrl+I"], ["Importar folha de sprites…", "importsheet", ""], "-", ["Exportar para a SF Engine (.json)…", "md", "Ctrl+Shift+M"], ["Exportar folha PNG (tudo)", "sheet", "Ctrl+Shift+E"], ["Exportar quadro PNG", "framepng", ""], ["Exportar todos os quadros (PNGs separados)", "allframes", "Ctrl+Alt+E"], ["Exportar paleta (.h)", "pal", ""]],
  edit: [["Desfazer", "undo", "Ctrl+Z"], ["Refazer", "redo", "Ctrl+Y"], "-", ["Recortar", "cut", "Ctrl+X"], ["Copiar", "copy", "Ctrl+C"], ["Colar", "paste", "Ctrl+V"], ["Apagar", "clear", "Delete"], "-", ["Selecionar tudo", "selall", "Ctrl+A"], ["Tirar seleção", "desel", "Ctrl+D"], "-", ["Espelhar horizontal", "fliph", "Shift+H"], ["Espelhar vertical", "flipv", "Shift+V"], "-",
    ["Transformar (redimensionar) seleção", "transform", "Ctrl+T"], ["Preencher seleção", "fillsel", "F"], ["Contornar seleção", "strokesel", "S"], ["Trocar cor…", "replace", "Shift+R"], "-",
    ["Deslocar camada ←", "shl", "Ctrl+Alt+←"], ["Deslocar camada →", "shr", "Ctrl+Alt+→"], ["Deslocar camada ↑", "shu", "Ctrl+Alt+↑"], ["Deslocar camada ↓", "shd", "Ctrl+Alt+↓"], "-",
    ["Sprite novo com a seleção", "fromsel", "Ctrl+Alt+N"]],
  sprite: [["Duplicar sprite", "dup", ""], "-", ["Tamanho do sprite (escala)…", "spritesize", "Ctrl+Alt+I"], ["Tamanho do canvas…", "resize", "C"], ["Girar canvas 180°", "rot180", ""], ["Girar canvas 90° horário", "rot90", ""], ["Girar canvas 90° anti-horário", "rot270", ""], "-",
    ["Recortar na seleção", "crop", ""], ["Aparar (encolher até a arte)", "trim", "Ctrl+Shift+T"], "-", ["Espelhar todos os quadros", "fliphall", ""], "-", ["Trocar dois slots da paleta…", "swap", ""], ["Reduzir para 15 cores", "reduce", ""], ["Excluir o slot da cor de frente", "delslot", "Delete na paleta"], ["Remover cores sem uso", "dropunused", ""], ["Paleta padrão", "defpal", ""]],
  frame: [["Novo quadro", "newframe", "Alt+N"], ["Novo quadro vazio", "newempty", "Alt+B"], ["Apagar quadro", "delframe", "Alt+Delete"], "-", ["Mover para a esquerda", "frameleft", "Alt+,"], ["Mover para a direita", "frameright", "Alt+."], ["Propriedades do quadro…", "frameprops", "P"], ["Nova tag nos quadros marcados", "newtag", "Alt+T"], "-", ["Tocar animação", "play", "Enter"], ["Quadro anterior", "prev", ","], ["Próximo quadro", "next", "."], ["Primeiro quadro", "first", "Home"], ["Último quadro", "last", "End"]],
  layer: [["Nova camada", "newlayer", "Shift+N"], ["Nova camada de caixa (hitbox, hurtbox…)", "newbox", ""], ["Apagar camada", "dellayer", ""], ["Renomear…", "rename", "F2"], "-", ["Subir camada", "layerup", ""], ["Descer camada", "layerdown", ""], ["Juntar com a de baixo", "merge", "Ctrl+E"]],
  view: [["Trocar tema (escuro / claro)", "theme", ""], ["Janela de prévia", "preview", "F7"], ["Papel de cebola", "onion", "F3"], ["Linha do tempo", "timeline", "Tab"], ["Tela cheia", "fullscreen", "F11"], "-", ["Grade de tiles 8×8", "tiles", "Ctrl+'"], ["Grade de pixels", "grid", "Ctrl+Shift+'"], ["Pedaços 16×16 do SNES", "split", "F4"], "-", ["Caber na tela", "fit", "Ctrl+0"], ["Zoom 100%", "zoom100", "Ctrl+1"]],
  mapx: [["Novo cenário…", "newmap", "Ctrl+Shift+N"], ["Importar imagem como cenário (nova aba)…", "importscene", ""], ["Importar imagem no plano atual…", "importplane", ""], "-", ["Otimizar tiles (junta iguais e espelhados)", "optimize", ""], ["Tamanho do mapa…", "mapresize", ""], "-", ["Exportar cenário para Mega Drive", "md", "Ctrl+Shift+M"]],
  help: [["Atalhos do teclado", "keys", "F1"], ["Sobre", "about", ""]],
};
function showKeys() {
  const rows = [["B", "Lápis"], ["E", "Borracha"], ["G", "Balde"], ["I / Alt segurado", "Conta-gotas"], ["L", "Linha"], ["U", "Retângulo (de novo: cheio)"], ["Shift+U", "Elipse (de novo: cheia)"], ["M", "Seleção retangular"], ["V / Ctrl segurado", "Mover"], ["H / Espaço segurado", "Mão"], ["Z", "Zoom"], ["X", "Troca cor de frente e de fundo"], ["+ / -", "Tamanho do pincel"], ["Roda do mouse", "Zoom"], ["Shift (arrastando forma)", "Quadrado, círculo, linha reta"]];
  Object.values(MENUS).flat().forEach((m) => { if (m !== "-" && m[2]) rows.push([m[2], m[0]]); });
  modal(`<h3>Atalhos (os mesmos do Aseprite)</h3><table>${rows.map(([k, n]) => `<tr><td>${k}</td><td>${n}</td></tr>`).join("")}</table><div class="btns"><button class="primary" onclick="closeModal()">OK</button></div>`);
}
const dm = $("#dropmenu");
document.querySelectorAll("[data-menu]").forEach((m) => m.onmousedown = (e) => {
  e.stopPropagation();
  const open = m.classList.contains("open");
  closeMenus(); if (open) return;
  m.classList.add("open");
  let items = MENUS[m.dataset.menu];
  if (m.dataset.menu === "file") { const r = recents(); const at = items.findIndex((x) => x[1] === "open") + 1; items = [...items.slice(0, at), ...(r.length ? r.map((fp, i) => [`↳ ${fp.split(/[\\/]/).pop()}`, "recent:" + i, ""]) : [["↳ (nenhum arquivo recente)", "noop", ""]]), ...items.slice(at)]; }
  dm.innerHTML = items.map((x) => x === "-" ? "<hr>" : `<div data-run="${x[1]}"><span>${x[0]}</span><kbd>${x[2]}</kbd></div>`).join("");
  const r = m.getBoundingClientRect(); dm.style.left = r.left + "px"; dm.style.top = r.bottom + "px"; dm.classList.remove("hidden");
  dm.querySelectorAll("[data-run]").forEach((d) => d.onmousedown = (ev) => { ev.stopPropagation(); closeMenus(); const c = d.dataset.run; if (c.startsWith("recent:")) openRecent(+c.slice(7)); else if (CMD[c]) CMD[c](); });
  dm.querySelectorAll('[data-run^="recent:"]').forEach((d, i) => { d.title = recents()[i]; });
});
function closeMenus() { dm.classList.add("hidden"); document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open")); }
window.addEventListener("mousedown", closeMenus);

window.addEventListener("keydown", (e) => {
  if (!$("#modal").classList.contains("hidden")) { if (e.key === "Escape") closeModal(); return; }
  const typing = e.target.tagName === "TEXTAREA" || (e.target.tagName === "INPUT" && ["text", "search", ""].includes(e.target.type));
  if (typing) return;
  if ((e.target.tagName === "INPUT" || e.target.tagName === "SELECT") && !/^[a-z,.]$/i.test(e.key) && !e.ctrlKey && !e.altKey && e.key !== " ") return;   /* numero e setas ficam no campo */
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") e.target.blur();
  const k = e.key, K = k.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.shiftKey && K === "n") { e.preventDefault(); MAP.newDialog(); return; }
  if (doc.kind === "map" && MAP.key(e)) return;
  const run = (c) => { e.preventDefault(); CMD[c](); };
  if (k === " ") { spaceDown = true; e.preventDefault(); return; }
  if (ctrl) {
    if (K === "z") return run(e.shiftKey ? "redo" : "undo");
    if (k === "Tab") return run(e.shiftKey ? "prevtab" : "nexttab");
    const m = { m: e.shiftKey ? "md" : null, w: "closetab", t: "transform", y: "redo", c: "copy", x: "cut", v: null, a: "selall", d: "desel", s: e.shiftKey ? "saveas" : "save", o: "open", n: "newdoc", i: "importframe", e: e.shiftKey ? "sheet" : "merge", "0": "fit", "1": "zoom100", "'": e.shiftKey ? "grid" : "tiles", '"': "grid" }[K];
    if (e.altKey && K === "c") return run("resize");
    if (e.altKey && K === "i") return run("spritesize");
    if (e.altKey && K === "n") return run("fromsel");
    if (e.altKey && k.startsWith("Arrow")) return run({ ArrowLeft: "shl", ArrowRight: "shr", ArrowUp: "shu", ArrowDown: "shd" }[k]);
    if (e.shiftKey && K === "t") return run("trim");
    if (e.altKey && K === "e") return run("allframes");
    if (m) return run(m);
    return;   // Ctrl+V: o evento 'paste' (abaixo) cola a imagem de fora ou a copia interna
  }
  if (e.altKey) {
    const m = { t: "newtag", n: "newframe", b: "newempty", delete: "delframe", ",": "frameleft", ".": "frameright" }[K];
    if (m) return run(m);
    return;
  }
  if ((k === "Delete" || k === "Backspace") && document.getElementById("colorbar").matches(":hover")) return run("delslot");
  if (k === "Delete" || k === "Backspace") return run(tlFocus && range ? "delframes" : "clear");
  if (k === "Enter") { if (float) { if (float.tf) msg("Transformação aplicada."); e.preventDefault(); dropFloat(); return; } return run("play"); }
  if (k === "Escape") { if (float) doUndo(); else { if (sel) push(); sel = null; render(); } return; }
  if (k === ",") return run("prev"); if (k === ".") return run("next");
  if (k === "Home") return run("first"); if (k === "End") return run("last");
  if (k === "F11") return run("fullscreen");
  if (k === "Tab" && !e.shiftKey) return run("timeline");
  if (e.shiftKey && K === "r") return run("replace");
  if (!e.shiftKey && K === "c") return run("resize");
  if (!e.shiftKey && K === "f") return run("fillsel");
  if (!e.shiftKey && K === "s") return run("strokesel");
  if (k === "F1") return run("keys"); if (k === "F2") return run("rename"); if (k === "F3") return run("onion"); if (k === "F4") return run("split"); if (k === "F7") return run("preview");
  if (e.shiftKey && K === "n") return run("newlayer");
  if (e.shiftKey && K === "h") return run("fliph");
  if (e.shiftKey && K === "v") return run("flipv");
  if (K === "p") return run("frameprops");
  if (k.startsWith("Arrow") && tlFocus && range && !float) {   /* numero do quadro marcado: setas movem todas as camadas desses quadros */
    e.preventDefault();
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    moveFrames(Math.min(range.a, range.b), Math.max(range.a, range.b), d[0], d[1]); return;
  }
  if (k.startsWith("Arrow") && (tool === "move" || float)) {
    e.preventDefault(); if (!float) liftFloat();
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k]; if (float.tf) { float.tf.L += d[0]; float.tf.T += d[1]; } float.x += d[0]; float.y += d[1]; render(); return;
  }
  if (k === "+" || k === "=" || k === "-") { zoomKey(k === "-" ? -1 : 1); return; }   // + e - do teclado: zoom no centro
  if (k === "]") { brush = Math.min(16, brush + 1); renderToolOpts(); render(); return; }
  if (k === "[") { brush = Math.max(1, brush - 1); renderToolOpts(); render(); return; }
  if (K === "x") { [fg, bg] = [bg, fg]; renderPalettes(); return; }
  // como no Aseprite: U alterna retangulo / retangulo cheio; Shift+U alterna elipse / elipse cheia
  const cyc = (a, b) => (tool === a ? b : a);
  const t = { w: "wand", d: "dither", b: "pencil", e: "eraser", g: e.shiftKey ? "recolor" : "fill", i: "picker", l: "line", m: cyc("select", "selellipse"), v: "move", h: "hand", z: "zoom", u: e.shiftKey ? cyc("ellipse", "ellipsefill") : cyc("rect", "rectfill") }[K];
  if (t) setTool(t);
});
window.addEventListener("keyup", (e) => { if (e.key === " ") spaceDown = false; quick(e); });
/* cursor do mouse conforme a ferramenta (e as rapidas: Alt conta-gotas, Espaco mao, Ctrl mover) */
const PICK_CUR = "url(\"data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M19 3l2 2-4 4 1 1-2 2-1-1-8 8H4v-3l8-8-1-1 2-2 1 1z" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>') + "\") 3 21, crosshair";
function cursorFor(t) { return { selellipse: "crosshair", wand: "crosshair", picker: PICK_CUR, hand: "grab", move: "move", zoom: "zoom-in", select: "crosshair" }[t] || "crosshair"; }
let quickT = null;
function quick(e) {
  const q = e.altKey ? "picker" : spaceDown ? "hand" : (e.ctrlKey || e.metaKey) ? "move" : null;
  if (q === quickT) return; quickT = q;
  cv.style.cursor = cursorFor(q || (doc && doc.kind === "map" ? "" : tool));
  if (doc && doc.kind !== "map") renderToolbar();
}
window.addEventListener("keydown", (e) => { if (["Alt", "Control", "Meta", " "].includes(e.key)) { if (e.key === "Alt") e.preventDefault(); quick(e); } });
cv.addEventListener("mousemove", (e) => { if ((e.altKey ? "picker" : spaceDown ? "hand" : (e.ctrlKey || e.metaKey) ? "move" : null) !== quickT) quick(e); });
window.addEventListener("blur", () => { quickT = null; spaceDown = false; cv.style.cursor = cursorFor(tool); });
window.addEventListener("resize", render);
/* divisores: arrastar para mudar a largura dos paineis e a altura da linha do tempo (guarda o tamanho) */
(function gutters() {
  const root = document.documentElement.style, KEY = "sfpixel-layout";
  let L = {}; try { L = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { L = {}; }
  const apply = () => { if (L.cw) root.setProperty("--cw", L.cw + "px"); if (L.mw) root.setProperty("--mw", L.mw + "px"); if (L.th) root.setProperty("--th", L.th + "px"); };
  apply();
  const startDrag = (el, onMove) => el.addEventListener("mousedown", (e) => {
    e.preventDefault(); e.stopPropagation(); el.classList.add("drag");
    const mv = (ev) => { onMove(ev); apply(); render(); };
    const up = () => { el.classList.remove("drag"); window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (er) { /* */ } };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  });
  document.querySelectorAll(".gut").forEach((g) => startDrag(g, (ev) => {
    if (g.dataset.gut === "cw") L.cw = Math.max(150, Math.min(520, ev.clientX - document.getElementById("main").getBoundingClientRect().left));
    else L.mw = Math.max(140, Math.min(520, document.getElementById("main").getBoundingClientRect().right - ev.clientX));
  }));
  const gh = document.querySelector(".gut-h");
  if (gh) startDrag(gh, (ev) => { L.th = Math.max(70, Math.min(window.innerHeight - 200, document.getElementById("status").getBoundingClientRect().top - ev.clientY)); });
})();

/* ================================================================== inicio */
function renderAll() { renderTabs(); renderToolbar(); renderToolOpts(); renderPalettes(); renderTimeline(); renderReport(); render(); if (pvOpen()) drawPreviewFrame(); document.getElementById("docname").textContent = doc.name; }
(function boot() {
  let saved = null;
  try { const s = localStorage.getItem("sfpixel-tabs") || localStorage.getItem("sfpixel-auto"); if (s) { const o = JSON.parse(s); saved = o.docs ? o : { ix: 0, docs: [o] }; } } catch (e) { saved = null; }
  const docs = []; if (saved) saved.docs.forEach((o) => { try { docs.push(deserialize(o)); } catch (e) { /* ignora */ } });
  if (!docs.length) docs.push(newDoc(48, 64, "sprite"));
  docs.forEach((d) => { doc = d; cur.layer = 0; cur.frame = 0; undo = []; redo = []; sel = null; fitView(); tabs.push(tabState()); });
  tabIx = Math.min(saved ? saved.ix || 0 : 0, tabs.length - 1); useTab(tabs[tabIx]);
  renderAll(); render(); pvTick();
  msg(saved ? `${tabs.length} aba(s) reabertas. Ctrl+N começa outro sprite.` : "Bem-vindo! F1 mostra os atalhos. Arquivo → Abrir também lê .aseprite.");
})();
