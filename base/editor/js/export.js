/* SG Engine - exporta o projeto para o pack binario SGPK e monta a ROM (engine + pack).
 * Formato: engine/FORMAT.md. Tudo big-endian. */
"use strict";

const SLOTS = ["idle", "walk", "jump", "crouch", "crouch_attack", "attack1", "attack2", "attack3", "jump_attack", "grab",
  "hurt", "knockback", "down", "getup", "special", "broken",
  "jump_fall", "flying_kick", "attack4", "attack5", "throw", "shoot", "run", "run_attack", "grabbed", "block", "gun_idle", "gun_walk", "gun_shoot", "hurt_low", "jump_knee", "climb", "climb_top", "climb_shoot", "hang", "hang_up", "hang_end", "roll", "land",
  "legs_idle", "legs_walk", "legs_run", "legs_jump", "legs_crouch",
  "top_gun", "top_shoot", "top_up", "top_up_shoot", "top_diag", "top_diag_shoot", "rifle_top", "rifle_shoot", "rifle_up", "rifle_up_shoot", "rifle_diag", "rifle_diag_shoot",
  "top_down", "top_down_shoot", "top_ddiag", "top_ddiag_shoot", "double_jump", "dash", "attack_up", "attack_down", "pre_jump", "grab_attack", "grab_throw", "hang_down", "climb_start", "climb_end", "climb_down_start", "crouch_hurt"];
const SPECIAL_CODE = { flykick: 1 };
const KIND_CODE = { player: 0, enemy: 1, boss: 2, object: 3, item: 4, projectile: 6, weapon: 7 };
const WEAPON_CODE = { melee: 0, revolver: 1, machinegun: 2 };
const WPN_SUFFIX = ["idle", "walk", "attack"];
const weaponPrefix = (a) => (a.props.prefix || "arma").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
const ITEM_CODE = { heal_small: 0, heal_big: 0, score: 1, life: 2, energy: 3 };
const PACK_ADDR = 0x40000;   /* o motor ocupa ate 256 KB; o pack vem logo depois (antes ficava em 1 MB e sobrava 768 KB vazio) */

class Buf {
  constructor() { this.a = new Uint8Array(1 << 16); this.n = 0; }
  need(k) { if (this.n + k > this.a.length) { const b = new Uint8Array(Math.max(this.a.length * 2, this.n + k)); b.set(this.a); this.a = b; } }
  u8(v) { this.need(1); this.a[this.n++] = v & 255; }
  u16(v) { this.u8(v >> 8); this.u8(v); }
  s16(v) { this.u16(v & 0xffff); }
  u32(v) { this.u16((v >>> 16) & 0xffff); this.u16(v & 0xffff); }
  bytes(arr) { this.need(arr.length); this.a.set(arr, this.n); this.n += arr.length; }
  align(k = 2) { while (this.n % k) this.u8(0); }
  set16(at, v) { this.a[at] = (v >> 8) & 255; this.a[at + 1] = v & 255; }
  set32(at, v) { this.set16(at, (v >>> 16) & 0xffff); this.set16(at + 2, v & 0xffff); }
  out() { return this.a.slice(0, this.n); }
}

/* --------------------------------------------------------------- cores */
function palWords(keys) {
  const w = new Array(16).fill(0);
  keys.slice(0, 15).forEach((k, i) => { w[i + 1] = MD.vdpWord(k); });
  return w;
}
function hexToKey(hex) { const v = parseInt(hex.slice(1), 16); return MD.key((v >> 16) & 255, (v >> 8) & 255, v & 255); }

/* indice de cada pixel de uma imagem numa paleta (0 = transparente) */
function indexImage(canvas, pal) {
  const g = canvas.getContext("2d"), d = g.getImageData(0, 0, canvas.width, canvas.height).data;
  const out = new Uint8Array(canvas.width * canvas.height), cache = new Map();
  for (let i = 0; i < out.length; i++) {
    if (d[i * 4 + 3] < 128) continue;
    const k = MD.key(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    if (!cache.has(k)) cache.set(k, 1 + MD.nearest(pal, k));
    out[i] = cache.get(k);
  }
  return out;
}
/* quadro hang sem ponto da mao marcado: acha a mao sozinho = ponto mais alto do desenho (bracos levantados), uns 3 px para dentro */
function autoGrip(f) {
  const im = images[f.img]; if (!im) return null;
  const c = im.img, d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let y0 = -1; for (let y = 0; y < c.height && y0 < 0; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 127) { y0 = y; break; }
  if (y0 < 0) return null;
  let sx = 0, n = 0; for (let y = y0; y < Math.min(c.height, y0 + 4); y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 127) { sx += x; n++; }
  return { x: Math.round(sx / n), y: Math.min(c.height - 1, y0 + 3) };
}
/* 8x8 de indices -> 32 bytes 4bpp */
function tileBytes(idx, W, tx, ty) {
  const t = new Uint8Array(32);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x += 2) {
    const a = idx[(ty * 8 + y) * W + tx * 8 + x] || 0, b = idx[(ty * 8 + y) * W + tx * 8 + x + 1] || 0;
    t[y * 4 + x / 2] = (a << 4) | b;
  }
  return t;
}

/* --------------------------------------------------------------- cenario */
function buildBackground(lay) {
  const W = Math.ceil(lay.width / 8) * 8, H = isPlat() ? Math.max(224, Math.ceil(lay.height / 8) * 8) : 224;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = lay.bgColor; g.fillRect(0, 0, W, H);
  lay.backgrounds.filter((b) => (b.plane || "B") === "B").forEach((b) => { const im = images[b.image]; if (im) g.drawImage(im.img, b.x, b.y); });
  if (isPlat() && lay.autoCol !== false) drawColGraphics(g, lay);   // desenho padrao da colisao
  const conv = MD.convert(g.getImageData(0, 0, W, H), 15);
  const tiles = [], map = new Uint16Array((W / 8) * (H / 8)), seen = new Map();
  for (let ty = 0; ty < H / 8; ty++) for (let tx = 0; tx < W / 8; tx++) {
    const t = tileBytes(conv.idx, W, tx, ty), key = t.join(",");
    let i = seen.get(key);
    if (i === undefined) { i = tiles.length; tiles.push(t); seen.set(key, i); }
    map[ty * (W / 8) + tx] = i;               /* paleta 0, sem prioridade */
  }
  return { pal: conv.pal, tiles, map, w: W / 8, h: H / 8 };
}

/* --------------------------------------------------------------- sprites */
/* corta o frame em pedacos de ate 4x4 tiles, pulando tiles vazios; tiles de cada pedaco em coluna */
function framePieces(idx, W, H) {
  const TW = W / 8, TH = H / 8, empty = (tx, ty) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (idx[(ty * 8 + y) * W + tx * 8 + x]) return false; return true; };
  const pieces = [], tiles = [];
  for (let by = 0; by < TH; by += 4) for (let bx = 0; bx < TW; bx += 4) {
    let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
    for (let ty = by; ty < Math.min(by + 4, TH); ty++) for (let tx = bx; tx < Math.min(bx + 4, TW); tx++)
      if (!empty(tx, ty)) { x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx); y1 = Math.max(y1, ty); }
    if (x1 < 0) continue;
    const p = { px: x0 * 8, py: y0 * 8, w: x1 - x0 + 1, h: y1 - y0 + 1, first: tiles.length };
    for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) tiles.push(tileBytes(idx, W, tx, ty));
    pieces.push(p);
  }
  return { pieces, tiles };
}
/* linha mais baixa com pixel (base do desenho): a ancora Y vai para la, para o personagem deitado/agachado ficar no chao e nao flutuando */
function artBottom(src) {
  const d = src.getContext("2d").getImageData(0, 0, src.width, src.height).data;
  for (let y = src.height - 1; y >= 0; y--) for (let x = 0; x < src.width; x++) if (d[(y * src.width + x) * 4 + 3] > 127) return y + 1;
  return null;
}
const SNAP_DEFAULT = ["down", "getup", "wakeup", "crouch_hurt"];
function frameIndexed(f, pal) {
  const src = images[f.img].img;
  const W = Math.ceil(src.width / 8) * 8, H = Math.ceil(src.height / 8) * 8;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  c.getContext("2d").drawImage(src, 0, 0);
  return { idx: indexImage(c, pal), W, H };
}
/* paleta 3 e dividida por inimigos, objetos e itens: junta as cores de todos */
function sharedPalette(actors) {
  const map = new Map();
  actors.forEach((a) => a.anims.forEach((an) => an.frames.forEach((f) => {
    const c = images[f.img] && images[f.img].img; if (!c) return;
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) { const k = MD.key(d[i], d[i + 1], d[i + 2]); map.set(k, (map.get(k) || 0) + 1); }
  })));
  const counts = [...map].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
  return { pal: counts.length > 15 ? MD.reduce(counts, 15) : counts.map((c) => c.key), colors: counts.length };
}

/* --------------------------------------------------------------- pack */
/* objetos de fase que a ROM-motor entende: codigo e parametros (p0..p5) */
const SOBJ_CODE = { screentext: 20, mappoint: 21, trigger: 1, timer: 2, camlock: 3, checkpoint: 4, exit: 5, hazard: 6, wall: 7, text: 8, titlecard: 9,
  clock: 10, autoscroll: 11, spawner: 12, ambush: 13, itemspawn: 14, decor: 15, bossarena: 16, door: 19 };
const WHEN = { enter: 0, start: 1, trigger: 2 };
function sobjParams(o, ctx) {
  const A = (id) => (ctx.actorIndex.has(id) ? ctx.actorIndex.get(id) : 0xffff);
  const T = { cut: 0, fade_black: 1, fade_white: 2, mosaic: 1, iris: 1, blinds: 1, scroll: 0 };
  switch (o.type) {
    case "trigger": return { p: [{ player: 0, enemy: 1, any: 2 }[o.who] || 0, o.once ? 1 : 0] };
    case "timer": return { p: [o.frames || 60, o.repeat ? 1 : 0, o.start === "start" ? 1 : o.start === "trigger" ? 2 : 0] };
    case "camlock": return { p: [{ enemies: 0, time: 1, trigger: 2 }[o.until] || 0, o.time || 0] };
    case "checkpoint": return { p: [o.heal ? 1 : 0] };
    case "exit": return { p: [ctx.layoutIndex.has(o.to) ? ctx.layoutIndex.get(o.to) : 0, o.needClear ? 1 : 0, T[o.transition] || 0] };
    case "hazard": return { p: [{ pit: 0, fire: 1, electric: 2, car: 3, falling: 4 }[o.kind] || 0, o.damage || 0, o.knock ? 1 : 0, o.period || 0, o.enemies ? 1 : 0, o.warn ? 1 : 0] };
    case "wall": return { p: [{ all: 0, players: 1, enemies: 2 }[o.blocks] || 0] };
    case "text": return { s: o.text, p: [o.duration || 120, WHEN[o.when] || 0, o.pause ? 1 : 0] };
    case "mappoint": { const ns = (P.screens && P.screens.nodes) || [], i = ns.findIndex((x) => x.id === o.screen); return { s: String(o.label || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""), p: [i < 0 ? 0xffff : i, o.open ? 1 : 0] }; }
    case "screentext": return { s: String(o.text || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""), p: [(o.blink ? 1 : 0) | (o.center !== false ? 2 : 0)] };
    case "titlecard": return { s: o.title + (o.subtitle ? "\n" + o.subtitle : ""), p: [o.duration || 120] };
    case "clock": return { p: [o.seconds || 99, { life: 0, over: 1, nothing: 2 }[o.onZero] || 0, o.resetOnLife ? 1 : 0] };
    case "autoscroll": return { p: [Math.round((o.speed || 0.5) * 256), { right: 0, left: 1, up: 2, down: 3 }[o.dir] || 0, o.stopAtEnd ? 1 : 0] };
    case "spawner": return { p: [A(o.enemy), o.every || 120, o.total || 1, o.onScreen || 1, WHEN[o.start] || 0, { count: 0, trigger: 1, never: 2 }[o.stop] || 0] };
    case "ambush": return { p: [A(o.enemy), o.count || 1, o.hp || 100] };
    case "itemspawn": return { p: [A(o.item), o.when === "trigger" ? 2 : 1] };
    case "decor": return { p: [A(o.actor)] };
    case "bossarena": return { p: [A(o.boss), o.reinfAt || 0, A(o.reinfEnemy), o.reinfCount || 0, o.showName ? 1 : 0] };
    case "door": return { p: [ctx.zoneIndex.has(o.to) ? ctx.zoneIndex.get(o.to) : 0, T[o.transition] || 0, o.key && ctx.varIndex.has(o.key) ? ctx.varIndex.get(o.key) + 1 : 0] };
  }
  return null;
}

function buildPack() {
  const stats = { layouts: [], maxSlot: 0, actors: [], unused: [] };
  const warn = [];
  // so vai para a ROM o ator que o jogo usa: o jogador, quem esta numa fase/tela/HUD e quem esses citam (drops, projeteis, armas...)
  const used = new Set(), ids = Object.keys(P.actors);
  { const pl = Object.values(P.actors).find((a) => a.kind === "player"); if (pl) used.add(pl.id);
    const scan = (o) => { const s = JSON.stringify(o || {}); ids.forEach((id) => { if (!used.has(id) && s.includes('"' + id + '"')) used.add(id); }); };
    scan(P.layouts); scan(P.screens); scan(P.hud);
    for (let grew = true; grew;) { const n0 = used.size; [...used].forEach((id) => { const { id: _self, ...rest } = P.actors[id]; scan(rest); }); grew = used.size > n0; } }
  const actors = Object.values(P.actors).filter((a) => used.has(a.id));
  const unusedActors = Object.values(P.actors).filter((a) => !used.has(a.id)).map((a) => a.name);
  const actorIndex = new Map(actors.map((a, i) => [a.id, i]));
  const layoutIndex = new Map(P.layouts.map((l, i) => [l.id, i]));
  const vars = allVars(), varIndex = new Map(vars.map((v, i) => [v.name, i]));
  const player = actors.find((a) => a.kind === "player");
  const shared = sharedPalette(actors.filter((a) => a.kind !== "player"));
  if (shared.colors > 15) warn.push(`Inimigos, objetos e itens usam ${shared.colors} cores juntos; reduzi para 15 (eles dividem uma paleta).`);
  let playerPal = player ? player.pal.slice(0, 15) : [];
  if (player) {
    const all = new Set(), byAnim = [], usedN = new Map();
    const realArt = player.anims.some((an) => an.frames.some((f) => !isPlaceholderFrame(f)));   // com arte própria, os desenhos de exemplo que sobraram não roubam cores da paleta
    player.anims.forEach((an) => {
      const own = new Set();
      an.frames.forEach((f) => { const im = images[f.img]; if (!im || (realArt && isPlaceholderFrame(f))) return; const d = im.img.getContext("2d").getImageData(0, 0, im.img.width, im.img.height).data;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) { const k = MD.key(d[i], d[i + 1], d[i + 2]); all.add(k); own.add(k); usedN.set(k, (usedN.get(k) || 0) + (isPlaceholderFrame(f) ? 0.001 : 1)); } });
      if (own.size) byAnim.push([an.name, own]);
    });
    stats.playerColors = all.size;
    // a paleta do jogador sai das cores que as animacoes realmente usam (a lista guardada no personagem pode estar desatualizada
    // depois de varias importacoes e deixar uma cor de fora, que viraria a mais parecida). Cabendo em 15, fica exata.
    if (all.size) {
      const counts = [...usedN].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
      if (all.size <= 15) { const keep = playerPal.filter((k) => all.has(k)); counts.forEach((c) => { if (!keep.includes(c.key)) keep.push(c.key); }); playerPal = keep; }
      else playerPal = MD.reduce(counts, 15);
    }
    if (all.size > 15) {
      const outside = byAnim.filter(([, own]) => [...own].some((k) => !playerPal.includes(k))).map(([n]) => n);
      warn.push(`O jogador usa ${all.size} cores somando todas as animações (o Mega Drive dá 15 por paleta): as que sobram viram a cor mais parecida.` + (outside.length ? ` Animações com cores fora da paleta: ${outside.slice(0, 8).join(", ")}${outside.length > 8 ? "…" : ""}.` : ""));
    }
  }
  const hud = P.hud || defaultHud();

  const b = new Buf();
  [83, 71, 80, 75].forEach((c) => b.u8(c));
  b.u16(2); b.u16({ "8dir": 0, "4dir": 1, side: 2, plat: 3 }[P.move] || 0);
  while (b.n < 64) b.u8(0);
  b.set16(36, actors.length); b.set16(38, player ? actorIndex.get(player.id) : 0xffff);
  b.set16(42, P.layouts.length); b.set16(48, vars.length);
  b.set16(32, window.testStartLayout >= 0 ? window.testStartLayout + 1 : 0);   // "Testar esta tela": começa direto nela
  b.set16(60, Math.max(1, Math.min(24, Number(P.hitDepth ?? 6) || 6)));   // profundidade do golpe (px)
  b.set16(62, Math.max(1, Math.min(8, Number(P.maxAttackers ?? 2) || 2)) | (P.shadows === false ? 0x100 : 0));   // diretor de multidao + sombras

  b.align(2); b.set32(40, b.n); packControls(b);
  // paletas 1 (HUD), 2 (jogador), 3 (inimigos/objetos/itens); a 0 e de cada fase
  b.align(2); b.set32(8, b.n);
  const hudPal = new Array(16).fill(0);
  hudPal[1] = 0x0eee; hudPal[2] = MD.vdpWord(hexToKey(hud.barColor)); hudPal[3] = 0x0222; hudPal[4] = 0x000e; hudPal[5] = MD.vdpWord(hexToKey(hud.enemyColor));
  hudPal[13] = 0x0666; hudPal[14] = 0x0aaa; hudPal[15] = 0x0eee;
  [new Array(16).fill(0), hudPal, palWords(playerPal), palWords(shared.pal)].forEach((p) => p.forEach((w) => b.u16(w)));
  // HUD: cores, opcoes e 3 tiles da barra (cheio, vazio, inimigo)
  b.align(2); b.set32(44, b.n);
  b.u16(hud.barLen); b.u16((hud.score ? 1 : 0) | (hud.lives ? 2 : 0) | (hud.enemyBar ? 4 : 0) | (hud.names ? 8 : 0)); b.u16(3); b.u16(0);
  const barTile = (c) => { const t = new Uint8Array(32); for (let y = 1; y < 7; y++) for (let x = 0; x < 4; x++) t[y * 4 + x] = (c << 4) | c; return t; };
  [barTile(2), barTile(3), barTile(5)].forEach((t) => b.bytes(t));
  // variaveis (valor inicial)
  b.align(2); b.set32(56, b.n); vars.forEach((v) => b.s16(v.initial));
  // nomes dos atores (para o HUD)
  const nameOfs = actors.map((a) => { const o = b.n; (a.name.replace(/\s*\(exemplo\)/i, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 .!?-]/g, "").slice(0, 14) + "\0").split("").forEach((c) => b.u8(c.charCodeAt(0))); return o; });
  b.align(2); b.set32(52, b.n); nameOfs.forEach((o) => b.u32(o));
  // mapa de telas (aba Telas): +20 telas, +24 n, +26 n ligacoes, +28 ligacoes (ver main.c)
  const SC = P.screens && P.screens.nodes && P.screens.nodes.length ? P.screens : null;
  if (SC) {
    const types = { splash: 1, title: 2, tutorial: 3, stage: 4, bonus: 5, options: 6, cutscene: 7, gameover: 8, ending: 9, credits: 10, finalcredits: 11, map: 12 };
    const trans = { cut: 0, fadeblack: 1, fadewhite: 2, wipe: 3, iris: 4 }, when = { auto: 0, start: 1, clear: 2, menu: 3, gameover: 4 };
    const txt = (t) => { const o = b.n; String(t || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^ -~]/g, "?").slice(0, 38).split("").forEach((c) => b.u8(c.charCodeAt(0))); b.u8(0); return o; };
    const nodes = SC.nodes, idx = new Map(nodes.map((n, i) => [n.id, i]));
    // texto longo da tela (cena: paginas; creditos: linhas), quebrado em 36 colunas; linha vazia = separador. Formato: linhas seguidas (0 no fim de cada), linha "\x01" = nova pagina, "\x00" final
    const story = (lay) => { if (!lay || !lay.story) return 0; const o = b.n; const wrap = (ln) => { const out = []; let cur = ""; ln.split(/\s+/).forEach((w) => { if ((cur + " " + w).trim().length > 36) { out.push(cur.trim()); cur = w; } else cur += " " + w; }); if (cur.trim() || !out.length) out.push(cur.trim()); return out; };
      String(lay.story).replace(/\r/g, "").split("\n").forEach((ln) => { if (!ln.trim()) { b.u8(1); b.u8(0); return; } wrap(ln).forEach((w) => txt(w)); }); b.u8(0); b.u8(0); return o; };
    const strs = nodes.map((n) => { const lay = P.layouts.find((l) => l.id === n.layout); return { name: txt(n.name), menu: n.menu && n.menu.length ? (() => { const o = b.n; n.menu.slice(0, 6).forEach((m) => txt(m)); return o; })() : 0, story: story(lay) }; });
    b.align(2); b.set32(20, b.n); b.set16(24, nodes.length);
    nodes.forEach((n, i) => { const li = P.layouts.findIndex((l) => l.id === n.layout), lay = P.layouts[li]; b.u8(types[n.type] || 4); b.u8(n.menu && n.menu.length ? 1 : 0); b.u16(li < 0 ? 0xffff : li); b.u32(strs[i].name); b.u32(strs[i].menu); b.u16(n.menu ? Math.min(6, n.menu.length) : 0); b.u16(lay && lay.menuRow !== undefined ? lay.menuRow : 16); b.u16(lay && lay.autoSec ? Math.min(60, lay.autoSec) * 60 : 0);
      const cur = { arrow: 0, blink: 1, both: 2, sprite: 3 }[lay && lay.cursor] || 0, ca = lay && lay.cursorActor && actorIndex.has(lay.cursorActor) ? actorIndex.get(lay.cursorActor) : 0xffff;
      b.u8(cur === 3 && ca === 0xffff ? 0 : cur); b.u8(lay && lay.rollSpeed ? +lay.rollSpeed : 2); b.u16(ca); b.u16(0); b.u32(strs[i].story); b.u16(0); b.u16(0); });   // 32 bytes: +14 linha do menu, +16 avanca sozinho, +18 cursor, +19 velocidade, +20 ator do cursor, +24 texto longo
    const links = SC.links.filter((l) => idx.has(l.from) && idx.has(l.to));
    b.align(2); b.set32(28, b.n); b.set16(26, links.length);
    links.forEach((l) => { const a = nodes[idx.get(l.from)]; b.u16(idx.get(l.from)); b.u16(idx.get(l.to)); b.u8(trans[l.trans] ?? 1); b.u8(when[l.when] ?? 0); b.u16(Math.max(0, (a.menu || []).indexOf(l.option || (a.menu || [])[0]))); });
  }

  // atores
  const actorRec = [];
  actors.forEach((a) => {
    const pal = a.kind === "player" ? playerPal : shared.pal;
    let maxTiles = 1, animMax = 0;
    const animOfs = new Array(SLOTS.length).fill(0), animTiles = new Array(SLOTS.length).fill(0);
    const buildAnim = (an, pal) => {
      const frameOfs = an.frames.map((f) => {
        const fi = frameIndexed(f, pal), pc = framePieces(fi.idx, fi.W, fi.H);
        maxTiles = Math.max(maxTiles, pc.tiles.length); animMax = Math.max(animMax, pc.tiles.length);
        b.align(2);
        const tileOfs = b.n; pc.tiles.forEach((t) => b.bytes(t));
        const fo = b.n;
        const snap = an.snapGround !== undefined ? an.snapGround : SNAP_DEFAULT.includes(an.name), bot = !snap ? null : f.hurt && f.hurt.h ? f.hurt.y + f.hurt.h : artBottom(images[f.img].img);   // base da caixa de dano (colisão de corpo); sem caixa, a base do desenho
        b.u16(pc.tiles.length); b.u16(pc.pieces.length); b.s16(f.ax); b.s16(bot !== null ? bot : f.ay);
        const box = (r) => { if (r) { b.s16(r.x); b.s16(r.y); b.s16(r.w); b.s16(r.h); } else { b.s16(0); b.s16(0); b.s16(0); b.s16(0); } };
        const hand = f.hand || (an.name === "hang" && a.kind === "player" ? autoGrip(f) : null);
        box(f.hurt); box(f.hit); b.u16(f.hold || 0); b.u16(hand ? ((hand.x & 0xff) << 8) | (hand.y & 0xff) : 0xffff); b.u32(tileOfs);   // +26: ponto da mao / pega
        pc.pieces.forEach((p) => { b.s16(p.px); b.s16(p.py); b.u8(p.w); b.u8(p.h); b.u16(p.first); });
        return fo;
      });
      const ao = b.n;
      b.u16(frameOfs.length); b.u16(Math.max(1, Math.round(60 / (an.speed || 10)))); b.u16(an.pingpong ? (an.loop ? 2 : 3) : an.loop ? 1 : 0);
      // +6: loop a partir do quadro (bit15), inicio (0-7), fim + 1 (8-14; 0 = ultimo). Quadros depois do fim = saida (tocam ao voltar para a idle)
      const nf = frameOfs.length, lf = Math.max(0, Math.min(nf - 1, (an.loopFrom || 1) - 1)), lt = Math.max(lf, Math.min(nf - 1, (an.loopTo || nf) - 1));
      b.u16(an.loopOn && nf > 1 ? 0x8000 | (lf & 0xff) | ((lt + 1 === nf ? 0 : lt + 1) & 0x7f) << 8 : 0);
      frameOfs.forEach((o) => b.u32(o));
      return ao;
    };
    SLOTS.forEach((slot, si) => {
      const want = a.kind === "weapon" && slot === "broken" ? "ground" : slot;   // arma: "ground" = como fica no chao
      const an = a.anims.find((x) => (x.name === want || (slot === "knockback" && x.name === "knockdown") || (slot === "getup" && x.name === "wakeup")) && x.frames.length);
      if (an) { animMax = 0; animOfs[si] = buildAnim(an, pal); animTiles[si] = animMax; }
    });
    // corpo dividido: a vaga do jogador guarda pernas + tronco juntos
    const split = a.kind === "player" && isPlat() && a.props.splitBody === true;
    const legsMax = split ? Math.max(0, ...animTiles.slice(39, 44)) : 0, topMax = split ? Math.max(0, ...animTiles.slice(44, 60)) : 0;
    if (split) maxTiles = Math.max(maxTiles, legsMax + topMax);
    const wpnAnim = [0, 0, 0];   // reservado (a arma agora e desenhada por cima do jogador)
    if (!animOfs[0]) warn.push(`"${a.name}" não tem animação idle com frames: ele não aparece no jogo.`);
    const lim = a.kind === "player" ? 192 : 64;
    if (maxTiles > lim) warn.push(`"${a.name}" tem um quadro com ${maxTiles} tiles; o máximo é ${lim} (${a.kind === "player" ? "jogador" : "por personagem"}). Diminua o quadro ou corte as bordas vazias (Aparar).`);
    const isProj = (k) => k.type === "projectile";
    const atks = (a.attacks || []).map((k) => [Math.max(0, SLOTS.indexOf(k.anim)), k.damage || 0, isProj(k) ? 200 : atkReach(a, k) || 24, (k.knockdown ? 1 : 0) | (isProj(k) ? 2 : 0) | (k.height === "low" ? 4 : 0) | (k.hitStop === false ? 8 : 0)]);
    b.align(2); const atkOfs = b.n; atks.forEach((k) => k.forEach((v) => b.u16(v)));
    // por golpe: u16 ator do projetil, u16 velocidade 8.8, u16 arco, u16 0
    const atkProjOfs = b.n;
    (a.attacks || []).forEach((k) => {
      const pj = isProj(k) && P.actors[k.proj];
      if (isProj(k) && !pj) warn.push(`"${a.name}": o golpe "${k.name}" é de projétil mas não tem projétil escolhido.`);
      b.u16(pj && actorIndex.has(pj.id) ? actorIndex.get(pj.id) : 0xffff); b.u16(pj ? Math.round((Number(pj.props.speed) || 3) * 256) : 0); b.u16(pj && pj.props.arc ? 1 : 0); b.u16(k.chance ?? 30);
    });
    const drops = (a.drops || []).filter((d) => actorIndex.has(d.item));
    const dropOfs = b.n; drops.forEach((d) => { b.u16(actorIndex.get(d.item)); b.u16(d.chance); });
    // conectores de combo e especiais (inimigos e chefes)
    const atkIx = new Map((a.attacks || []).map((k, i) => [k.id, i]));
    // jogador: o terceiro campo e o comando (0 ataque, 1 frente + ataque, 2 tras + ataque); inimigo: a chance
    const links = (a.combo || []).filter((l) => atkIx.has(l.from) && atkIx.has(l.to)).map((l) => ({ from: atkIx.get(l.from), to: atkIx.get(l.to), chance: a.kind === "player" ? COND_CODE[l.cond || "atk"] : l.chance, wait: Math.max(0, Math.min(240, Number(l.delay) || 0)) }));
    b.align(2); const linkOfs = b.n; links.forEach((l) => { b.u16(l.from); b.u16(l.to); b.u16(l.chance); b.u16(l.wait); });   // de, para, chance/comando, espera (quadros)
    const specs = (a.specials || []).filter((s) => s.on && SPECIAL_CODE[s.type]);
    const specOfs = b.n;
    specs.forEach((s) => { const pj = P.actors[s.proj]; b.u16(SPECIAL_CODE[s.type]); b.u16(s.chance || 0); b.u16(s.damage || 0); b.u16(actorIndex.has(s.proj) ? actorIndex.get(s.proj) : 0xffff); b.u16(Math.round((Number(pj && pj.kind === "projectile" ? pj.props.speed : s.speed) || 0) * 256)); b.u16(0); });
    actorRec.push({ a, wpnAnim, legsMax, maxTiles: Math.min(maxTiles, a.kind === "player" ? 192 : 64), animOfs, atkOfs, nAtk: atks.length, dropOfs, nDrop: drops.length, linkOfs, nLinks: links.length, specOfs, nSpec: specs.length, atkProjOfs });
  });
  b.align(2);
  const tableOfs = b.n;
  actorRec.forEach(() => b.u32(0));
  actorRec.forEach((r, i) => {
    b.align(2); b.set32(tableOfs + i * 4, b.n);
    const p = r.a.props || {}, fx = (v) => Math.round((Number(v) || 0) * 256);
    b.u8(KIND_CODE[r.a.kind]); b.u8(r.a.kind === "player" ? 2 : 3);
    b.u16(r.a.kind === "weapon" ? (p.infiniteAmmo && p.wtype !== "melee" ? 0xffff : Math.max(0, Math.min(999, Number(p.uses) || 0))) : p.hp || 1); b.u16(fx(p.speed)); b.u16(fx(p.speedY)); b.u16(fx(p.jumpForce)); b.u16(fx(p.gravity));
    b.u16(r.maxTiles);
    b.u8({ patrol: 0, chase: 1, smart: 2 }[p.ai] || 0); b.u8(p.reaction || 0); b.u8(p.aggression || 0); b.u8(r.nAtk);
    b.u16(p.score || 0); b.u16(ITEM_CODE[p.itemType] || 0); b.u16(p.value || 0);
    b.u16(r.nDrop); b.u16(((r.a.kind === "player" ? p.canGrab !== false : p.canGrab) ? 1 : 0) | (p.special ? 2 : 0) | (p.canCrouch ? 4 : 0) | (p.flank ? 8 : 0) | (p.strafe ? 16 : 0)
      | (r.a.kind === "player" ? (p.pickMelee !== false ? 32 : 0) | (p.pickGun !== false ? 64 : 0) | (p.canRun !== false ? 128 : 0) | (p.weakKick === true ? 256 : 0) | (p.jumpDepth === true ? 512 : 0) | (isPlat() && p.canClimb !== false ? 1024 : 0) | (isPlat() && p.canHang !== false ? 2048 : 0) | (isPlat() && p.canRoll !== false ? 4096 : 0) | (isPlat() && p.splitBody === true ? 8192 : 0) | (isPlat() && p.aimUp === true ? 16384 : 0) | (isPlat() && p.invWeapons !== false ? 32768 : 0) : 0));
    b.u32(r.dropOfs); b.u32(r.atkOfs);
    r.animOfs.slice(0, 16).forEach((o) => b.u32(o));
    // extra v2: barra do chefe (segmentos, cor) e lives do jogador
    b.u16(r.a.bar ? r.a.bar.segments || 15 : 0); b.u16(r.a.bar ? MD.vdpWord(hexToKey(r.a.bar.color || "#e0e000")) : 0);
    b.u16(p.lives || 3); b.u16(r.a.kind === "player" ? Math.max(4, Math.min(60, Number(p.comboWindow) || 14)) : 0);   // +106: tempo para emendar o combo do jogador
    // extra v3 (+108): slots de animação 16-21, conectores de combo, especiais
    r.animOfs.slice(16, 22).forEach((o) => b.u32(o));
    b.u32(r.linkOfs); b.u16(r.nLinks); b.u16(r.nSpec); b.u32(r.specOfs);
    b.u32(r.atkProjOfs);   // +144
    // +148: arremesso do inimigo pelo jogador (8.8): knockdown distancia, altura; ao morrer distancia, altura
    const k8 = (v) => Math.round(Math.max(0, Math.min(12, Number(v) || 0)) * 256);
    if (r.a.kind === "player") { b.u16(k8(p.knockX ?? 2)); b.u16(k8(p.knockZ ?? 4)); b.u16(k8(p.deathX ?? 2)); b.u16(k8(p.deathZ ?? 4)); }
    else { b.u16(0); b.u16(0); b.u16(0); b.u16(0); }
    // +156: animacoes run, run_attack; +164: u8 0, u8 hit pause, u8 0, u8 custo do especial, u16 velocidade correndo (%), u16 dano da investida
    r.animOfs.slice(22, 24).forEach((o) => b.u32(o));
    const cl = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Math.round(Number(v ?? d)) || 0));
    b.u8(r.a.kind === "player" ? cl(p.weakKickDamage, 0, 99, 5) : 0); b.u8(cl(p.hitPause, 0, 20, 3)); b.u8((p.jumpAtkKnock ? 1 : 0) | (p.flyKickKnock !== false ? 2 : 0) | (p.jumpAtkOn === false ? 4 : 0) | (p.flyKickOn === false ? 8 : 0)); b.u8(cl(p.specialCost, 0, 99, 6));   // +166: golpes no pulo que derrubam   // +164: dano da voadora fraca
    b.u16(cl(p.runSpeed, 100, 400, 170)); b.u16(cl(p.runAttackDamage, 0, 99, 10));
    // +172: animacoes grabbed (jogador agarrado), block; +180: comportamento (arquetipo, flags, parametros)
    r.animOfs.slice(24, 26).forEach((o) => b.u32(o));
    const bh = (r.a.kind === "enemy" || r.a.kind === "boss") ? ensureBehavior(r.a) : null, bp = bh ? bh.params : {};
    const aix = (id) => { const i = (r.a.attacks || []).findIndex((k) => k.id === id); return i < 0 ? 255 : i; };
    const par = !bh ? [0, 0, 0, 0] : bh.arch === "flanker" ? [cl(bp.retreat, 10, 120, 40), 0, 0, 0] : bh.arch === "zoner" ? [cl((bp.dist || 100) / 2, 20, 125, 50), 0, 0, 0]
      : bh.arch === "tank" ? [{ hold: 0, punch: 1, suplex: 2 }[bp.action] || 0, cl(bp.escape, 1, 30, 8), cl(bp.grab, 0, 100, 60), cl(bp.dmg, 0, 99, 10)]
      : bh.arch === "defensive" ? [cl(bp.block, 0, 100, 35), aix(bp.counter), aix(bp.antiair), 0] : bh.arch === "chaotic" ? [aix(bp.bomb), 0, 0, 0]
      : bh.arch === "patrol" ? [cl((bp.see || 120) / 2, 10, 125, 60), cl((bp.wait ?? 120) / 2, 0, 125, 60), 0, 0] : bh.arch === "pshooter" ? [cl((bp.range || 200) / 2, 20, 125, 100), cl(bp.hide, 0, 200, 40), 0, 0]
      : bh.arch === "turret" ? [cl((bp.range || 200) / 2, 20, 125, 100), cl(bp.rate, 10, 250, 60), 0, 0] : bh.arch === "flyer" ? [cl(bp.height, 0, 120, 40), 0, 0, 0] : [0, 0, 0, 0];
    b.u8(bh ? ARCHETYPES[bh.arch].code : 0); b.u8((bh && bh.mods.friendly ? 1 : 0) | (r.a.kind === "projectile" && p.explode ? 2 : 0));
    par.forEach((v) => b.u8(v)); b.u16(0);
    // +188: arma — animacoes do jogador (parado, andando, atacando), tipo, cadencia, dano, usos/municao, bala, velocidade, derruba
    // (+188 era reservado): jogador no modo plataforma — climb, climb_top, climb_shoot (slots 31-33)
    r.animOfs.slice(31, 34).forEach((o) => b.u32(r.a.kind === "player" && isPlat() ? o : 0));
    const wb = r.a.kind === "weapon" && P.actors[p.bullet];
    b.u8(r.a.kind === "weapon" ? WEAPON_CODE[p.wtype] || 0 : 0); b.u8(cl(p.rate, 2, 60, 6)); b.u16(cl(p.damage, 0, 99, 8));
    b.u16(cl(p.uses, 0, 999, 0)); b.u16(wb && actorIndex.has(wb.id) ? actorIndex.get(wb.id) : 0xffff); b.u16(wb ? Math.round((Number(wb.props.speed) || 6) * 256) : 0); b.u16(p.knockdown ? 1 : 0);
    // +212: alcance extra, golpes levados para soltar, vezes que pode pegar de volta (255 = sem limite)
    b.u16(cl(p.reach, 0, 80, 12)); b.u8(cl(p.hitsToDrop, 0, 20, 3)); b.u8(p.pickups === "" || p.pickups === undefined || p.pickups === null ? 255 : cl(p.pickups, 0, 254, 3));
    // +216: animacoes do jogador com arma de fogo (gun_idle, gun_walk, gun_shoot), se a habilidade pede animacoes proprias
    r.animOfs.slice(26, 29).forEach((o) => b.u32(r.a.kind === "player" && p.gunAnims === false ? 0 : o));
    b.u32(r.animOfs[29]);   // +228: hurt_low (dano baixo, no estomago)
    b.u32(r.a.kind === "player" && p.weakKick === true ? r.animOfs[30] : 0);   // +232: jump_knee (voadora fraca)
    b.u8(cl(p.jumpAtkDamage, 0, 99, 8)); b.u8(cl(p.flyKickDamage, 0, 99, 11)); b.u16(Math.round(Math.max(0.25, Math.min(4, Number(p.climbSpeed) || 1)) * 256));   // +238: velocidade na escada (8.8)
    // +240 (plataforma): altura do pendurado (px do pe ate a mao), velocidade do rolamento (8.8); +244: animacoes hang, hang_up, hang_end, roll, land (slots 34-38)
    b.u16(cl(p.hangHeight, 16, 96, 44)); b.u16(Math.round(Math.max(0.5, Math.min(8, Number(p.rollSpeed) || 3)) * 256));
    r.animOfs.slice(34, 39).forEach((o) => b.u32(r.a.kind === "player" && isPlat() ? o : 0));
    // +264: pernas (5) e troncos da pistola e da arma grande (12) do corpo dividido; +332: tiles da maior perna (o tronco vai depois na VRAM)
    const pl = r.a.kind === "player" && isPlat();
    r.animOfs.slice(39, 56).forEach((o, i) => b.u32(pl && p.splitBody === true && (i < 11 || p.rifleTops === true) ? o : 0));
    // +332: tiles da maior perna; +334: bits extras do jogador (plataforma): 1 mira cima, 2 diagonal, 4 baixo no pulo, 8 diagonal para baixo,
    //   32 pulo duplo, 64 defesa, 128 dash (no lugar do rolamento), 256 nao espelhar, 512 golpe para cima, 1024 golpe para baixo no pulo
    b.u16(r.legsMax || 0);
    const aimOn = p.aimUp === true;
    b.u16((!pl ? 0 : (aimOn && p.aimU !== false ? 1 : 0) | (aimOn && p.aimD !== false ? 2 : 0) | (aimOn && p.aimDown !== false ? 4 : 0) | (aimOn && p.aimDD !== false ? 8 : 0)
      | (p.doubleJump === true ? 32 : 0) | (p.canBlock === true ? 64 : 0) | (p.canRoll !== false && p.rollStyle === "dash" ? 128 : 0) | (p.mirrorOn === false ? 256 : 0)
      | (p.meleeDir === true && p.meleeUp !== false ? 512 : 0) | (p.meleeDir === true && p.meleeDown !== false ? 1024 : 0) | (p.meleeDir === true && p.meleePogo === true ? 4096 : 0) | (p.hangArt !== false ? 8192 : 0))
      | (r.a.kind === "player" && p.preJump === true ? 2048 : 0));
    // +336: troncos mirando para baixo (slots 56-59), +352: double_jump, dash, attack_up, attack_down (60-63)
    r.animOfs.slice(56, 60).forEach((o) => b.u32(pl && p.splitBody === true ? o : 0));
    r.animOfs.slice(60, 64).forEach((o) => b.u32(pl ? o : 0));   // +236: dano do ataque no pulo e da voadora
    // +368: pre_jump (slot 64: impulso antes de sair do chao); +372: quadro (1 = primeiro) em que sai do chao, 0 = no fim da animacao
    const pj = r.a.kind === "player" && p.preJump === true;
    b.u32(pj ? r.animOfs[64] : 0); b.u16(pj ? cl(p.preJumpFrame, 0, 60, 0) : 0);
    b.u16(r.a.kind === "player" && isPlat() ? (cl(p.coyoteX, 0, 32, 4) << 8) | cl(p.coyoteY, 0, 32, 8) : 0);   // +374: coyote time em pixels: X (horizontal) e Y (vertical)
    b.u16(r.a.kind === "player" && isPlat() ? cl(p.coyoteT, 0, 30, 8) : 0);   // +376 (u16; o byte +377 vale): coyote time em quadros
    b.u16(r.a.kind === "player" && isPlat() ? cl(p.airControl, 0, 10, 4) : 0);   // +378 (u16; o byte +379 vale): controle no ar (0 = nenhum, 10 = total)
    // +380 ataques no agarrao, +381 bit0 o ultimo derruba, +382 grab_attack, +386 grab_throw, +390 (u16; o byte +391 vale) dano de cada ataque do agarrao
    b.u8(pl ? cl(p.grabHits, 1, 8, 3) : 0); b.u8(pl && p.grabLastKnock !== false ? 1 : 0);
    b.u32(pl && p.canGrab !== false ? r.animOfs[65] : 0); b.u32(pl && p.canGrab !== false ? r.animOfs[66] : 0);
    b.u16(pl ? cl(p.grabDmg, 1, 99, 4) : 0);
    b.u8(pl && p.grabHitStop === true ? 1 : 0); b.u8(0);   // +392: hit stop no golpe do agarrao
    b.u32(pl && isPlat() && p.canHang !== false ? r.animOfs[67] : 0);   // +394: hang_down (descida da borda)
    // +398 climb_start, +402 climb_end (saida pelo alto), +406 climb_down_start; +410 detector de saida (px, com sinal), +411 bit0 saida desenhada, bit1 descer com climb_end invertida
    [68, 69, 70].forEach((i) => b.u32(pl && isPlat() && p.canClimb !== false ? r.animOfs[i] : 0));
    b.u8(pl ? ((cl(p.climbExit, -16, 120, 0) + 256) & 255) : 0); b.u8(pl ? (p.climbExitArt !== false ? 1 : 0) | (p.climbDownRev !== false ? 2 : 0) : 0);
    b.u8(p.shadow === false ? 1 : 0); b.u8(pl ? ((cl(p.climbDownOff, -48, 48, 0) + 256) & 255) : 0);   // +412: 1 = sem sombra; +413: ajuste (px, com sinal) da posição ao começar a descer a escada
    b.u8(pl ? cl(p.climbDownStop, 1, 60, 1) : 1); b.u8(0);
    b.u16(cl(p.hurtTime, 4, 120, 22));   // +416: tempo de recuperação do dano (quadros)
    b.u32(r.animOfs[71]);   // +418: crouch_hurt (atingido agachado)
    b.u16(pl && Number(p.djumpForce) > 0 ? Math.round(Math.min(20, Number(p.djumpForce)) * 256) : 0);   // +422: força do pulo duplo (8.8), 0 = 7/8 do pulo normal   // +414: quadro da climb_end em que a descida invertida termina (1 = até o primeiro)
  });
  b.set32(12, tableOfs);
  // VRAM dos sprites: vaga do jogador + 15 vagas iguais (a maior dos outros) + a vaga da arma na mao
  const enemySlot = actorRec.filter((r) => r.a.kind !== "player").reduce((m, r) => Math.max(m, r.maxTiles), 1);
  const plSlot = Math.max(enemySlot, ...actorRec.filter((r) => r.a.kind === "player").map((r) => r.maxTiles), 1);
  const maxSlot = enemySlot, spriteVram = plSlot + 16 * enemySlot;
  stats.maxSlot = maxSlot; stats.plSlot = plSlot; stats.spriteVram = spriteVram; stats.actors = actorRec.map((r) => ({ name: r.a.name, tiles: r.maxTiles }));

  // fases
  b.align(2);
  const layTable = b.n; P.layouts.forEach(() => b.u32(0));
  b.set32(16, layTable);
  P.layouts.forEach((lay, li) => {
    const bg = buildBackground(lay);
    stats.layouts.push({ name: lay.name, bg: bg.tiles.length, vram: bg.tiles.length + spriteVram + 8 });
    if (bg.tiles.length + spriteVram + 8 > 1450) warn.push(`${lay.name}: cenário (${bg.tiles.length} tiles) + sprites passam do espaço da VRAM.`);
    const strings = [], addStr = (s) => { strings.push(String(s || "")); return strings.length - 1; };
    const groups = lay.groups || [], zones = lay.zones || [];
    const objs = (lay.objs || []).filter((o) => SOBJ_CODE[o.type]);
    const skipped = [...new Set((lay.objs || []).filter((o) => !SOBJ_CODE[o.type] && o.type !== "variable").map((o) => SOBJ[o.type].name))];
    if (skipped.length) warn.push(`${lay.name}: ${skipped.join(", ")} ainda não funcionam no jogo.`);
    const ctx = { actorIndex, layoutIndex, varIndex, addStr,
      groupIndex: new Map(groups.map((g, i) => [g.id, i])), zoneIndex: new Map(zones.map((z, i) => [z.id, i])), objIndex: new Map(objs.map((o, i) => [o.id, i])) };

    b.align(2);
    const lo = b.n; b.set32(layTable + li * 4, lo);
    for (let i = 0; i < 88; i++) b.u8(0);   // 76 + (plataforma) u32 ofs colisao, u16 largura, u16 altura em tiles, u16 suavidade da camera
    b.set16(lo + 84, Math.max(0, Math.min(15, Math.round(Number(lay.camSmooth) || 0))));
    const fl = lay.floor || { top: 150, bottom: 212 };
    b.set16(lo, lay.width); b.set16(lo + 2, lay.height);
    b.set16(lo + 4, fl.top & 0xffff); b.set16(lo + 6, (P.move === "side" ? fl.top : fl.bottom) & 0xffff);
    b.set16(lo + 8, lay.spawn.x & 0xffff); b.set16(lo + 10, lay.spawn.y & 0xffff);
    b.set16(lo + 24, MD.vdpWord(hexToKey(lay.bgColor)));
    b.set16(lo + 72, { none: 0, next: 1, end: 2 }[lay.onClear] || 0);       /* fim da fase ao limpar */
    // paleta 0 e cenario
    b.align(2); b.set32(lo + 60, b.n); palWords(bg.pal).forEach((w) => b.u16(w));
    b.set32(lo + 44, b.n); b.set16(lo + 48, bg.tiles.length); bg.tiles.forEach((t) => b.bytes(t));
    b.set32(lo + 52, b.n); b.set16(lo + 50, bg.w); b.set16(lo + 56, bg.h); bg.map.forEach((v) => b.u16(v));
    // colisao do modo plataforma (u8 por tile de 8x8)
    if (isPlat()) {
      const c = colGrid(lay);
      b.set32(lo + 76, b.n); b.set16(lo + 80, c.w); b.set16(lo + 82, c.h);
      for (let i = 0; i < c.w * c.h; i++) b.u8(+c.d[i] || 0);
      b.align(2);
      if (!c.d.includes("1") && !c.d.includes("2")) warn.push(`${lay.name}: não tem chão pintado (ferramenta Colisão, K): o jogador vai cair.`);
    }
    // copias de atores
    const inst = (lay.instances || []).filter((i) => actorIndex.has(i.actor));
    b.set16(lo + 12, inst.length); b.set32(lo + 16, b.n);
    inst.forEach((i) => { b.u16(actorIndex.get(i.actor)); b.s16(i.x); b.s16(i.y); b.u16(i.flip ? 1 : 0); });
    // grupos
    b.set16(lo + 14, groups.length);
    const gTable = b.n; groups.forEach(() => b.u32(0)); b.set32(lo + 20, gTable);
    groups.forEach((g, gi) => {
      b.align(2); b.set32(gTable + gi * 4, b.n);
      b.s16(g.x); b.s16(g.y); b.s16(g.w); b.s16(g.h);
      b.u8(g.lock === "enter" ? 1 : g.lock === "event" ? 2 : 0); b.u8({ both: 0, left: 1, right: 2, back: 3, top: 4 }[g.side] || 0);
      b.u16(g.interval || 0); b.u8({ go: 0, free: 1, stay: 2 }[g.onEnd] || 0);
      const rounds = g.rounds.map((r) => ({ ...r, entries: r.entries.filter((e) => actorIndex.has(e.enemy)) }));
      b.u8(rounds.length);
      rounds.forEach((r) => {
        b.u8(r.max || 1); b.u8(r.entries.length); b.u16(r.pause || 0);
        r.entries.forEach((e) => { b.u16(actorIndex.get(e.enemy)); b.u16(e.count || 1); b.u16(e.hp === "" || e.hp == null ? 0 : e.hp); b.u16(e.dmg || 100); b.u16(e.speed || 100); });
      });
    });
    // objetos de fase (24 bytes cada)
    b.align(2); b.set16(lo + 26, objs.length); b.set32(lo + 28, b.n);
    objs.forEach((o) => {
      const prm = sobjParams(o, ctx) || { p: [] };
      const isRect = SOBJ[o.type].shape === "rect";
      b.u8(SOBJ_CODE[o.type]); b.u8(0); b.u16(prm.s !== undefined ? addStr(prm.s) : 0xffff);
      b.s16(o.x); b.s16(o.y); b.s16(isRect ? o.w : 0); b.s16(isRect ? o.h : 0);
      for (let k = 0; k < 6; k++) b.u16((prm.p[k] || 0) & 0xffff);
    });
    // areas de camera e transicoes
    b.set16(lo + 34, zones.length); b.set32(lo + 64, b.n);
    zones.forEach((z) => { b.s16(z.x); b.s16(z.y); b.s16(z.w); b.s16(z.h); b.u16({ follow: 0, lerp: 1, fixed: 2 }[z.mode] || 0); b.u16(z.lockScroll ? 1 : 0); });
    const trans = (lay.transitions || []).filter((t) => ctx.zoneIndex.has(t.from) && ctx.zoneIndex.has(t.to));
    b.set16(lo + 58, trans.length); b.set32(lo + 68, b.n);
    const TT = { cut: 0, fade_black: 1, fade_white: 2, mosaic: 1, iris: 1, blinds: 1, scroll: 0 };
    trans.forEach((t) => { b.u16(ctx.zoneIndex.get(t.from)); b.u16(ctx.zoneIndex.get(t.to)); b.u16(TT[t.type] || 0); b.u16(t.duration || 30); });
    if (trans.some((t) => ["mosaic", "iris", "blinds"].includes(t.type))) warn.push(`${lay.name}: mosaico, íris e persiana ainda viram fade para preto no jogo.`);
    // eventos (as strings dos textos entram aqui)
    b.align(2); b.set32(lo + 36, b.n);
    b.set16(lo + 32, encodeEvents(lay, b, ctx));
    // strings
    const so = strings.map((s) => { const o = b.n; (s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^\x20-\x7e\n]/g, "?") + "\0").split("").forEach((c) => b.u8(c.charCodeAt(0))); return o; });
    b.align(2); b.set32(lo + 40, b.n); so.forEach((o) => b.u32(o));
  });
  if (!player) warn.push("O projeto não tem Jogador.");
  stats.unused = unusedActors;
  return { data: b.out(), warn, stats };
}

/* ROM = ROM-motor (1 MB) + pack */
function buildROM() {
  Object.values(P.actors).forEach((a) => { if (a.props) { a.props.splitBody = false; a.props.aimUp = false; } });   // corpo dividido e mira em outras direções foram removidos
  const eng = Uint8Array.from(atob(ENGINE_ROM_B64), (c) => c.charCodeAt(0));   /* o resto ate 1 MB fica 0xFF */
  const pk = buildPack();
  let size = PACK_ADDR + pk.data.length;
  size = Math.ceil(size / 0x20000) * 0x20000;
  if (size > 0x400000) throw new Error("A ROM passou de 4 MB.");
  if (eng.length > PACK_ADDR) throw new Error("O motor passou de 256 KB.");
  const rom = new Uint8Array(size).fill(0xff);
  rom.set(eng, 0);
  rom.set(pk.data, PACK_ADDR);
  return { rom, warn: pk.warn, packSize: pk.data.length, stats: pk.stats };
}

/* medidor de memoria do Mega Drive: ROM (ate 4 MB), VRAM da pior fase (~1450 tiles livres para cenario
 * e sprites), tiles do maior quadro de um personagem (ate 64) e a paleta dividida dos inimigos */
const MemMeter = (() => {
  let t = 0;
  const VRAM = 1450, ROMMAX = 0x400000;
  function level(v, max) { const r = v / max; return r > 1 ? "bad" : r > .85 ? "warn" : "ok"; }
  function run() {
    const el = document.getElementById("mem-meter"); if (!el || !P) return;
    let r;
    try { r = buildROM(); } catch (e) { el.className = "mem-meter bad"; el.textContent = "Memória: " + e.message; return; }
    const st = r.stats, worst = st.layouts.reduce((m, l) => (l.vram > m.vram ? l : m), { vram: 0, name: "-" });
    const romKB = (PACK_ADDR + r.packSize) / 1024, colors = r.warn.find((w) => /cores juntos/.test(w));
    const parts = [
      ["ROM", `${(romKB / 1024).toFixed(2)}/4 MB`, level(romKB * 1024, ROMMAX)],
      ["VRAM", `${worst.vram}/${VRAM}`, level(worst.vram, VRAM)],
      ["Sprite", `${st.plSlot}/192 · ${st.maxSlot}/64`, st.plSlot > 192 || st.maxSlot > 64 ? "bad" : st.plSlot > 160 || st.maxSlot > 54 ? "warn" : "ok"],
      ["Cores jogador", `${st.playerColors || 0}/15`, level(st.playerColors || 0, 15)],
    ];
    if (colors) parts.push(["Cores", "acima de 15", "warn"]);
    const lv = parts.some((p) => p[2] === "bad") ? "bad" : parts.some((p) => p[2] === "warn") ? "warn" : "ok";
    el.className = "mem-meter " + lv;
    el.innerHTML = parts.map(([n, v, l]) => `<span class="${l}">${n} ${v}</span>`).join("");
    el.title = `Memória do Mega Drive (estimativa)\n\nROM: ${romKB.toFixed(0)} KB de 4096 KB (motor 256 KB + jogo ${(r.packSize / 1024).toFixed(0)} KB)\n` + (r.stats.unused && r.stats.unused.length ? `Fora da ROM (não usados em nenhuma fase): ${r.stats.unused.join(", ")}\n` : "") +
      `VRAM da fase mais pesada (${worst.name}): ${worst.vram} de ~${VRAM} tiles (cenário + jogador ${st.plSlot} + 16 vagas de ${st.maxSlot} tiles)\n` +
      st.layouts.map((l) => `  ${l.name}: cenário ${l.bg} tiles, total ${l.vram}`).join("\n") +
      `\nMaior quadro: jogador ${st.plSlot} tiles (máx. 192), outros ${st.maxSlot} tiles (máx. 64)\n` + st.actors.filter((a) => a.tiles > 0).map((a) => `  ${a.name}: ${a.tiles}`).join("\n") +
      (r.warn.length ? "\n\nAvisos:\n- " + r.warn.join("\n- ") : "");
  }
  function schedule() { clearTimeout(t); t = setTimeout(run, 1200); }
  return { schedule, run };
})();

function exportROM() {
  try {
    const r = buildROM();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([r.rom], { type: "application/octet-stream" }));
    a.download = (P.name || "jogo").replace(/[^\w-]+/g, "_") + ".bin";
    a.click();
    status(`ROM exportada (${(r.rom.length / 1024) | 0} KB).` + (r.warn.length ? " Avisos: " + r.warn.join(" ") : ""));
    if (r.warn.length) alert("Avisos:\n\n" + r.warn.join("\n"));
  } catch (e) { alert("Não consegui gerar a ROM: " + e.message); }
}

/* ---------------------------------------------------------------- Testar: roda a ROM num emulador dentro do editor */
const Player = (() => {
  let root = null, frame = null, rom = null;
  function build() {
    root = document.createElement("div"); root.className = "modal hidden";
    root.innerHTML = `<div class="modal-box player-box">
      <div class="modal-head"><span>Testar</span><button class="fs" title="Tela cheia (F11 dentro do jogo também funciona)">⛶ Tela cheia</button><button class="x" title="Fechar (Esc)">${ICON("close")}</button></div>
      <iframe class="player-frame" allow="autoplay; gamepad; fullscreen" allowfullscreen></iframe>
      <div class="player-diag"></div>
      <div class="player-foot hint">Clique no jogo e use o teclado (setas, Enter = Start). Para ver ou trocar as teclas, use o ícone de controle do emulador. Emulador só para testes.</div>
    </div>`;
    document.body.appendChild(root);
    frame = root.querySelector("iframe");
    root.querySelector(".x").onclick = close;
    root.querySelector(".fs").onclick = () => {
      const el = frame.requestFullscreen ? frame : root.querySelector(".player-box");
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el).catch(() => status("O navegador não deixou abrir em tela cheia aqui. No app/navegador direto (fora do Claude) funciona."));
      frame.focus();
    };
    window.addEventListener("message", (e) => {
      if (e.data && e.data.type === "sg-player-ready" && e.source === frame.contentWindow) { diag.player = e.data.v ? "v" + e.data.v : "ANTIGA (sem versão)"; showDiag(); }
      if (e.data && e.data.type === "sg-player-ready" && rom && e.source === frame.contentWindow)
        frame.contentWindow.postMessage({ type: "sg-rom", rom: rom.buffer, controls: ejsControls() }, "*");
    });
  }
  function open() {
    let r;
    try { r = buildROM(); } catch (err) { alert("Não consegui gerar a ROM: " + err.message); return; }
    if (r.warn.length) status("Avisos: " + r.warn.join(" "));
    if (!root) build();
    rom = r.rom;
    root.classList.remove("hidden");
    root.querySelector(".player-foot").innerHTML = keyLegend();
    // ?v= muda a cada versao: o navegador nunca usa uma copia antiga da janela do jogo
    const q = window.SG_PLAYER_QUERY || "";
    frame.src = "player.html" + (q ? q + "&" : "?") + "v=" + ((window.SG_VERSION || {}).n || 0) + "-" + Date.now();
    frame.focus();
    padHeld = {}; clearInterval(padT); padT = setInterval(pollPad, 16); diag.ack = "—"; diag.started = "?"; showDiag();
  }
  function close() { root.classList.add("hidden"); frame.src = "about:blank"; clearInterval(padT); }
  /* teclado e controle: o editor le e manda para o jogo (funciona mesmo se o foco nao estiver no jogo) */
  let padT = 0, padHeld = {};
  const send = (k, v) => { if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: "sg-input", k, v }, "*"); };
  function keyIdx(e) {
    const name = ejsKeyName(e), c = ejsControls()[0];
    return Object.keys(c).filter((i) => c[i].value === name).map(Number);
  }
  /* diagnostico ao vivo no rodape do Testar */
  const diag = { key: "—", pads: "—", ack: "—", started: "?", player: "?" };
  function showDiag() {
    const d = root && root.querySelector(".player-diag"); if (!d) return;
    const ua = navigator.userAgent, br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : "outro";
    d.textContent = `Diagnóstico · navegador: ${br} · última tecla: ${diag.key} · controles: ${diag.pads} · jogo recebeu: ${diag.ack} · emulador iniciado: ${diag.started} · editor v${(window.SG_VERSION || {}).n} · janela do jogo ${diag.player}`;
  }
  window.addEventListener("message", (e) => { if (e.data && e.data.type === "sg-ack") { diag.ack = e.data.name; diag.started = e.data.started ? "sim" : "não"; showDiag(); } });
  /* teclas apertadas com o foco dentro do jogo chegam por mensagem e passam pelo mesmo caminho */
  window.addEventListener("message", (e) => {
    if (!e.data || e.data.type !== "sg-key" || !isOpen()) return;
    const ev = { key: e.data.key, code: e.data.code, repeat: e.data.repeat, preventDefault() {} };
    onKey(e.data.down ? "keydown" : "keyup", ev, true);
  });
  ["keydown", "keyup"].forEach((t) => window.addEventListener(t, (e) => onKey(t, e, false), true));
  function onKey(t, e, inGame) {
    if (!isOpen()) return;
    if (t === "keydown") { diag.key = `${e.key} (${e.code}) → ${ejsKeyName(e)}${keyIdx(e).length ? "" : " (sem ação)"} · ${inGame ? "foco no jogo" : "foco no editor"}`; showDiag(); }
    if (e.key === "Escape" && inGame && t === "keydown") { close(); return; }
    if (e.key === "Escape" || e.key === "F12" || e.key === "F5" || e.repeat) return;
    const ks = keyIdx(e); if (!ks.length) return;
    e.preventDefault(); ks.forEach((k) => send(k, t === "keydown" ? 1 : 0));
  }
  function pollPad() {
    const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(Boolean), g = pads[0];
    const pd = pads.length ? pads.map((x) => `${x.id.slice(0, 28)} [${x.mapping || "sem mapa"}] ${x.buttons.map((b, i) => (b.pressed ? i : null)).filter((i) => i !== null).join(",")}`).join(" | ") : "nenhum (aperte um botão do controle)";
    if (pd !== diag.pads) { diag.pads = pd; showDiag(); }
    const want = {};
    if (g) {
      Object.entries(PAD_STD).forEach(([b, k]) => { const bt = g.buttons[b]; if (bt && (bt.pressed || bt.value > .5)) want[k] = 1; });
      const ax = g.axes || [];
      if ((ax[0] || 0) < -.5) want[6] = 1; if ((ax[0] || 0) > .5) want[7] = 1;
      if ((ax[1] || 0) < -.5) want[4] = 1; if ((ax[1] || 0) > .5) want[5] = 1;
    }
    for (let k = 0; k < 12; k++) { const v = want[k] ? 1 : 0; if ((padHeld[k] || 0) !== v) { padHeld[k] = v; send(k, v); } }
  }
  function isOpen() { return root && !root.classList.contains("hidden"); }
  return { open, close, isOpen };
})();

/* legenda das teclas do Testar, a partir de Controles */
function keyLegend() {
  const c = ctl(), K = (k) => `<kbd>${esc((c.keys[k] || "?").replace(" arrow", "").toUpperCase())}</kbd>`;
  const parts = Object.entries(c.map).filter(([, b]) => b !== "none").map(([a, b]) => `${ACTIONS[a]}: ${K(b)}`);
  return `Clique no jogo e jogue: andar ${K("up")}${K("down")}${K("left")}${K("right")} · ${parts.join(" · ")} · pausa ${K("START")}` +
    ` <span class="dim">(mude em Controles)</span>`;
}
