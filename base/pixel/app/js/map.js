/* SG Pixel - modo Cenario: tiles 8x8, 4 paletas e mapa em dois planos, do jeito que o VDP do Mega Drive desenha.
 * Cada celula do mapa guarda a palavra do VDP: bit 15 prioridade, 14-13 paleta, 12 espelho V, 11 espelho H, 10-0 tile.
 * O tile 0 e sempre vazio (transparente). */
"use strict";

const MAP = (() => {
  const T = (c) => c & 0x7ff, HF = (c) => (c >> 11) & 1, VF = (c) => (c >> 12) & 1, PL = (c) => (c >> 13) & 3, PR = (c) => (c >> 15) & 1;
  const pack = (t, hf, vf, pl, pr) => (pr << 15) | (pl << 13) | (vf << 12) | (hf << 11) | t;
  const MAXT = 2047;

  let mtool = "tile", brushT = { w: 1, h: 1, cells: new Uint16Array([1]) }, flipH = 0, flipV = 0, prio = 0, editAll = false;
  let msel = null, showScreen = true, drag = null, img = null, imgDirty = true, refs = null, tsSel = null, hoverT = null;

  /* ------------------------------------------------ documento */
  function create(name, mw, mh) {
    const pals = [0, 1, 2, 3].map((p) => (p === 0 ? defaultPal() : Array(16).fill(0)));
    const d = { kind: "map", name, mw, mh, w: mw * 8, h: mh * 8, pals, palIx: 0, tiles: [new Uint8Array(64)], plane: 0,
      planes: [{ name: "Plano B (fundo)", vis: true, cells: new Uint16Array(mw * mh) }, { name: "Plano A (frente)", vis: true, cells: new Uint16Array(mw * mh) }] };
    d.pal = d.pals[0];
    return d;
  }
  function serialize(d) { return { format: "sgpixel", version: 2, kind: "map", name: d.name, mw: d.mw, mh: d.mh, pals: d.pals, palIx: d.palIx, plane: d.plane, lossy: d.lossy || 0, tiles: d.tiles.map(b64), planes: d.planes.map((p) => ({ name: p.name, vis: p.vis, cells: b64(new Uint8Array(p.cells.buffer.slice(0))) })) }; }
  function deserialize(o) {
    const d = { kind: "map", name: o.name, mw: o.mw, mh: o.mh, w: o.mw * 8, h: o.mh * 8, pals: o.pals, palIx: o.palIx || 0, plane: o.plane || 0, lossy: o.lossy || 0, tiles: o.tiles.map(unb64),
      planes: o.planes.map((p) => ({ name: p.name, vis: p.vis, cells: new Uint16Array(unb64(p.cells).buffer) })) };
    d.pal = d.pals[d.palIx];
    return d;
  }
  function snap() { return { kind: "map", mw: doc.mw, mh: doc.mh, pals: doc.pals.map((p) => p.slice()), palIx: doc.palIx, tiles: doc.tiles.map((t) => t.slice()), planes: doc.planes.map((p) => ({ ...p, cells: p.cells.slice() })), plane: doc.plane, cur: { ...cur } }; }
  function restore(s) { Object.assign(doc, { mw: s.mw, mh: s.mh, w: s.mw * 8, h: s.mh * 8, pals: s.pals, palIx: s.palIx, tiles: s.tiles, planes: s.planes, plane: s.plane }); doc.pal = doc.pals[doc.palIx]; touch(); }
  function touch() { imgDirty = true; }
  const plane = () => doc.planes[doc.plane];

  /* ------------------------------------------------ desenho do mapa */
  function compose() {
    if (!imgDirty && img && img.width === doc.w && img.height === doc.h) return img;
    img = new ImageData(doc.w, doc.h);
    const P = doc.pals.map((p) => p.map(rgbK)), D = img.data;
    doc.planes.forEach((pl) => {
      if (!pl.vis) return;
      for (let ty = 0; ty < doc.mh; ty++) for (let tx = 0; tx < doc.mw; tx++) {
        const c = pl.cells[ty * doc.mw + tx], t = doc.tiles[T(c)]; if (!T(c) || !t) continue;
        const hf = HF(c), vf = VF(c), pp = P[PL(c)];
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const v = t[(vf ? 7 - y : y) * 8 + (hf ? 7 - x : x)]; if (!v) continue;
          const o = ((ty * 8 + y) * doc.w + tx * 8 + x) * 4, rgb = pp[v];
          D[o] = rgb[0]; D[o + 1] = rgb[1]; D[o + 2] = rgb[2]; D[o + 3] = 255;
        }
      }
    });
    imgDirty = false; return img;
  }
  function render() {
    const r = cv.getBoundingClientRect();
    if (cv.width !== Math.round(r.width) || cv.height !== Math.round(r.height)) { cv.width = Math.round(r.width); cv.height = Math.round(r.height); }
    ctx.imageSmoothingEnabled = false; ctx.fillStyle = "#070708"; ctx.fillRect(0, 0, cv.width, cv.height);
    const W = doc.w * zoom, H = doc.h * zoom;
    // cor 0 da paleta 0 = cor de fundo da tela do Mega Drive
    ctx.fillStyle = css(doc.pals[0][0]); ctx.fillRect(panX, panY, W, H);
    off.width = doc.w; off.height = doc.h; og.putImageData(compose(), 0, 0); ctx.drawImage(off, panX, panY, W, H);
    if (showTiles && zoom >= 2) {
      ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.beginPath();
      for (let x = 0; x <= doc.mw; x++) { ctx.moveTo(panX + x * 8 * zoom + .5, panY); ctx.lineTo(panX + x * 8 * zoom + .5, panY + H); }
      for (let y = 0; y <= doc.mh; y++) { ctx.moveTo(panX, panY + y * 8 * zoom + .5); ctx.lineTo(panX + W, panY + y * 8 * zoom + .5); }
      ctx.stroke();
    }
    if (showGrid && zoom >= 8) {
      ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.beginPath();
      for (let x = 0; x <= doc.w; x++) { ctx.moveTo(panX + x * zoom + .5, panY); ctx.lineTo(panX + x * zoom + .5, panY + H); }
      for (let y = 0; y <= doc.h; y++) { ctx.moveTo(panX, panY + y * zoom + .5); ctx.lineTo(panX + W, panY + y * zoom + .5); }
      ctx.stroke();
    }
    if (showScreen) {   // telas de 320x224
      ctx.strokeStyle = "rgba(217,164,65,.7)"; ctx.setLineDash([8, 6]); ctx.fillStyle = "rgba(217,164,65,.9)"; ctx.font = "11px system-ui";
      for (let y = 0; y < doc.h; y += 224) for (let x = 0; x < doc.w; x += 320) { ctx.strokeRect(panX + x * zoom + .5, panY + y * zoom + .5, Math.min(320, doc.w - x) * zoom, Math.min(224, doc.h - y) * zoom); ctx.fillText(`tela ${x / 320 + 1},${y / 224 + 1}`, panX + x * zoom + 4, panY + y * zoom + 13); }
      ctx.setLineDash([]);
    }
    if (hoverT && mtool === "tile") {   // fantasma do carimbo
      ctx.globalAlpha = .55; const b = brushT;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) drawTile(b.cells[y * b.w + x], panX + (hoverT.x + x) * 8 * zoom, panY + (hoverT.y + y) * 8 * zoom, zoom);
      ctx.globalAlpha = 1; ctx.strokeStyle = "#fff"; ctx.strokeRect(panX + hoverT.x * 8 * zoom + .5, panY + hoverT.y * 8 * zoom + .5, b.w * 8 * zoom, b.h * 8 * zoom);
    } else if (hoverT && (mtool === "tileerase" || mtool === "tilefill")) { ctx.strokeStyle = "#fff"; ctx.strokeRect(panX + hoverT.x * 8 * zoom + .5, panY + hoverT.y * 8 * zoom + .5, 8 * zoom, 8 * zoom); }
    if (msel) { ctx.strokeStyle = "#fff"; ctx.setLineDash([4, 4]); ctx.strokeRect(panX + msel.x * 8 * zoom + .5, panY + msel.y * 8 * zoom + .5, msel.w * 8 * zoom, msel.h * 8 * zoom); ctx.setLineDash([]); }
    ctx.strokeStyle = "#d9a441"; ctx.strokeRect(panX - .5, panY - .5, W + 1, H + 1);
    document.getElementById("st-zoom").textContent = `${zoom * 100}% · ${doc.mw}×${doc.mh} tiles (${doc.w}×${doc.h} px)`;
  }
  const tcan = document.createElement("canvas"), tg = tcan.getContext("2d");
  tcan.width = tcan.height = 8;
  function tileImage(c) {
    const d = new ImageData(8, 8), t = doc.tiles[T(c)], P = doc.pals[PL(c)];
    if (t) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = t[(VF(c) ? 7 - y : y) * 8 + (HF(c) ? 7 - x : x)]; if (!v) continue;
      const [r, g, b] = rgbK(P[v]), o = (y * 8 + x) * 4; d.data[o] = r; d.data[o + 1] = g; d.data[o + 2] = b; d.data[o + 3] = 255;
    }
    return d;
  }
  function drawTile(c, x, y, z, g = ctx) { tg.putImageData(tileImage(c), 0, 0); g.drawImage(tcan, x, y, 8 * z, 8 * z); }

  /* ------------------------------------------------ edicao */
  function countRefs() { refs = new Map(); doc.planes.forEach((p) => { for (const c of p.cells) if (T(c)) refs.set(T(c), (refs.get(T(c)) || 0) + 1); }); }
  function setCell(tx, ty, c) { if (tx < 0 || ty < 0 || tx >= doc.mw || ty >= doc.mh) return; plane().cells[ty * doc.mw + tx] = c; touch(); }
  function stamp(tx, ty) {
    const b = brushT;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      let c = b.cells[y * b.w + x];
      if (b.fromSet) c = pack(T(c), flipH, flipV, doc.palIx, prio);
      setCell(tx + x, ty + y, c);
    }
  }
  /* pinta um pixel do mapa: o tile vira so desta celula (a nao ser com "editar todas as copias") */
  function setPixel(x, y, v) {
    if (x < 0 || y < 0 || x >= doc.w || y >= doc.h) return;
    const cells = plane().cells, i = (y >> 3) * doc.mw + (x >> 3);
    let c = cells[i], t = T(c);
    if (!t) {
      if (!v) return;
      if (doc.tiles.length > MAXT) { msg("Chegou no limite de 2047 tiles."); return; }
      t = doc.tiles.push(new Uint8Array(64)) - 1; refs.set(t, 1); c = pack(t, 0, 0, doc.palIx, prio);
    } else if (!editAll && (refs.get(t) || 0) > 1) {
      const n = doc.tiles.push(doc.tiles[t].slice()) - 1; refs.set(t, refs.get(t) - 1); refs.set(n, 1); t = n; c = (c & ~0x7ff) | n;
    }
    if (PL(c) !== doc.palIx) c = (c & ~0x6000) | (doc.palIx << 13);
    cells[i] = c;
    const lx = HF(c) ? 7 - (x & 7) : x & 7, ly = VF(c) ? 7 - (y & 7) : y & 7;
    doc.tiles[t][ly * 8 + lx] = v; touch();
  }
  function pixelAt(x, y) {
    for (let p = doc.planes.length - 1; p >= 0; p--) {
      if (p !== doc.plane && !doc.planes[p].vis) continue;
      const c = doc.planes[p].cells[(y >> 3) * doc.mw + (x >> 3)], t = doc.tiles[T(c)];
      if (!T(c)) continue;
      const v = t[(VF(c) ? 7 - (y & 7) : y & 7) * 8 + (HF(c) ? 7 - (x & 7) : x & 7)];
      if (v || p === doc.plane) return { v, pal: PL(c), c };
    }
    return { v: 0, pal: doc.palIx, c: 0 };
  }
  function fillPixels(x, y, v) {   // balde de pixel: dentro do tile
    const c = plane().cells[(y >> 3) * doc.mw + (x >> 3)];
    const target = T(c) ? pixelAt(x, y).v : 0, x0 = x & ~7, y0 = y & ~7, seen = new Set(), st = [[x, y]];
    if (!T(c) && !v) return;
    while (st.length) {
      const [px, py] = st.pop(), k = py * 8 + px;
      if (px < x0 || py < y0 || px > x0 + 7 || py > y0 + 7 || seen.has(k)) continue; seen.add(k);
      const cc = plane().cells[(py >> 3) * doc.mw + (px >> 3)];
      const cur_ = T(cc) ? doc.tiles[T(cc)][(VF(cc) ? 7 - (py & 7) : py & 7) * 8 + (HF(cc) ? 7 - (px & 7) : px & 7)] : 0;
      if (cur_ !== target) continue;
      setPixel(px, py, v); st.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
  }
  function fillCells(tx, ty, nc) {
    const cells = plane().cells, t0 = cells[ty * doc.mw + tx]; if (t0 === nc) return;
    const st = [[tx, ty]];
    while (st.length) {
      const [x, y] = st.pop(); if (x < 0 || y < 0 || x >= doc.mw || y >= doc.mh || cells[y * doc.mw + x] !== t0) continue;
      cells[y * doc.mw + x] = nc; st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    touch();
  }

  /* junta tiles iguais (inclusive espelhados) e tira os que ninguem usa */
  function flipT(d, h, v) { const o = new Uint8Array(64); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) o[y * 8 + x] = d[(v ? 7 - y : y) * 8 + (h ? 7 - x : x)]; return o; }
  const keyT = (d) => d.join(",");
  function optimize(silent) {
    if (!silent) push();
    const used = new Set(); doc.planes.forEach((p) => { for (const c of p.cells) if (T(c)) used.add(T(c)); });
    const before = doc.tiles.length - 1, out = [new Uint8Array(64)], dict = new Map([[keyT(out[0]), 0]]), remap = new Map();
    [...used].sort((a, b) => a - b).forEach((t) => {
      const d = doc.tiles[t];
      let found = null;
      for (const [h, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const k = keyT(flipT(d, h, v)); if (dict.has(k)) { found = [dict.get(k), h, v]; break; } }
      if (!found) { const n = out.push(d) - 1; dict.set(keyT(d), n); found = [n, 0, 0]; }
      remap.set(t, found);
    });
    doc.planes.forEach((p) => { for (let i = 0; i < p.cells.length; i++) { const c = p.cells[i]; if (!T(c)) continue; const [n, h, v] = remap.get(T(c)); p.cells[i] = n ? pack(n, HF(c) ^ h, VF(c) ^ v, PL(c), PR(c)) : 0; } });
    doc.tiles = out; touch();
    if (!silent) { renderAll(); msg(`Tiles: ${before} → ${out.length - 1} (iguais e espelhados viraram um só).`); }
  }

  /* ------------------------------------------------ importar imagem como cenario
   * Cada tile precisa caber numa paleta de 15 cores; ate 4 paletas. Tiles que nao cabem em nenhuma
   * usam a cor mais parecida e ficam contados como "com perda" no painel. */
  async function importScene(file, intoCurrent) {
    const im = new Image(); im.src = URL.createObjectURL(file); await im.decode();
    const mw = Math.ceil(im.width / 8), mh = Math.ceil(im.height / 8);
    const c = document.createElement("canvas"); c.width = mw * 8; c.height = mh * 8; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
    const D = g.getImageData(0, 0, c.width, c.height).data;
    const key = (x, y) => { const i = (y * c.width + x) * 4; return D[i + 3] < 128 ? -1 : keyOf(D[i], D[i + 1], D[i + 2]); };
    const sets = [];
    for (let ty = 0; ty < mh; ty++) for (let tx = 0; tx < mw; tx++) { const s = new Set(); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const k = key(tx * 8 + x, ty * 8 + y); if (k >= 0) s.add(k); } sets.push(s); }
    const pals = [], tilePal = new Array(sets.length).fill(0); let lossy = 0;
    sets.map((s, i) => i).sort((a, b) => sets[b].size - sets[a].size).forEach((i) => {
      const s = sets[i]; if (!s.size) return;
      let best = -1, bo = -1;
      pals.forEach((p, pi) => { const u = new Set([...p, ...s]); const ov = [...s].filter((k) => p.has(k)).length; if (u.size <= 15 && ov > bo) { bo = ov; best = pi; } });
      if (best < 0 && pals.length < 4) { pals.push(new Set()); best = pals.length - 1; }
      if (best < 0) { lossy++; pals.forEach((p, pi) => { const ov = [...s].filter((k) => p.has(k)).length; if (ov > bo) { bo = ov; best = pi; } }); tilePal[i] = best; return; }
      s.forEach((k) => pals[best].add(k)); tilePal[i] = best;
    });
    const name = file.name.replace(/\.[^.]+$/, "");
    const d = intoCurrent && doc.kind === "map" ? doc : create(name, mw, mh);
    if (d === doc) push();
    const palArr = pals.map((p) => [...p].sort((a, b) => hsv(a).l - hsv(b).l));
    for (let p = 0; p < 4; p++) d.pals[p] = [d.pals[p][0] || 0, ...(palArr[p] || []), ...Array(15).fill(0)].slice(0, 16);
    d.pal = d.pals[d.palIx];
    const near = (k, p) => { const a = d.pals[p], i = a.indexOf(k, 1); if (i > 0) return i; const [r, gg, b] = rgbK(k); let best = 1, bd = 1e9; for (let j = 1; j < 16; j++) { const [R, G, B] = rgbK(a[j]); const dd = (r - R) ** 2 * 3 + (gg - G) ** 2 * 4 + (b - B) ** 2 * 2; if (dd < bd) { bd = dd; best = j; } } return best; };
    const pl = d.planes[intoCurrent && d === doc ? d.plane : 0];
    for (let ty = 0; ty < Math.min(mh, d.mh); ty++) for (let tx = 0; tx < Math.min(mw, d.mw); tx++) {
      const i = ty * mw + tx; if (!sets[i].size) { pl.cells[ty * d.mw + tx] = 0; continue; }
      const t = new Uint8Array(64), p = tilePal[i];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const k = key(tx * 8 + x, ty * 8 + y); t[y * 8 + x] = k < 0 ? 0 : near(k, p); }
      const n = d.tiles.push(t) - 1; pl.cells[ty * d.mw + tx] = pack(n, 0, 0, p, 0);
    }
    d.lossy = lossy;
    if (d === doc) { optimize(true); renderAll(); } else { const prev = doc; doc = d; optimize(true); doc = prev; openTab(d); }
    msg(`Cenário importado: ${mw}×${mh} tiles, ${doc.tiles.length - 1} tiles únicos, ${pals.length} paleta(s)${lossy ? `, ${lossy} tile(s) não couberam numa paleta de 15 cores` : ""}.`);
  }

  /* ------------------------------------------------ mouse */
  const toP = (e) => { const r = cv.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left - panX) / zoom), y: Math.floor((e.clientY - r.top - panY) / zoom) }; };
  function down(e) {
    const p = toP(e), tx = p.x >> 3, ty = p.y >> 3, right = e.button === 2;
    let t = mtool;
    if (e.button === 1 || spaceDown || t === "hand") { drag = { t: "pan", sx: e.clientX - panX, sy: e.clientY - panY }; return; }
    if (t === "zoom") { zoomAt(e, right || e.altKey ? -1 : 1); return; }
    if (!plane().vis) { msg("O plano está escondido."); return; }
    if (e.altKey) t = mtool === "tile" ? "tilepick" : "picker";
    if (t === "tilepick" || (t === "tile" && right)) {   // pega a celula do mapa como carimbo
      const c = plane().cells[ty * doc.mw + tx] || 0; brushT = { w: 1, h: 1, cells: new Uint16Array([c]) }; flipH = HF(c); flipV = VF(c); prio = PR(c); tsSel = null; renderPanel(); return;
    }
    if (t === "picker") { const q = pixelAt(p.x, p.y); doc.palIx = q.pal; doc.pal = doc.pals[q.pal]; fg = q.v; renderPalettes(); return; }
    push(); countRefs();
    if (t === "tile") { stamp(tx, ty); drag = { t: "stamp", last: [tx, ty] }; }
    else if (t === "tileerase") { setCell(tx, ty, 0); drag = { t: "erase" }; }
    else if (t === "tilefill") { const b = brushT.cells[0]; fillCells(tx, ty, brushT.fromSet ? pack(T(b), flipH, flipV, doc.palIx, prio) : b); }
    else if (t === "pencil" || t === "eraser") { setPixel(p.x, p.y, t === "eraser" ? 0 : right ? bg : fg); drag = { t: "px", last: p, v: t === "eraser" ? 0 : right ? bg : fg }; }
    else if (t === "fill") fillPixels(p.x, p.y, right ? bg : fg);
    else if (t === "select") { undo.pop(); drag = { t: "sel", a: { x: tx, y: ty } }; msel = null; }
    render();
  }
  function move(e) {
    const p = toP(e), tx = p.x >> 3, ty = p.y >> 3;
    const inside = p.x >= 0 && p.y >= 0 && p.x < doc.w && p.y < doc.h;
    if (e.target === cv || drag) {
      hoverT = inside ? { x: tx, y: ty } : null;
      const c = inside ? plane().cells[ty * doc.mw + tx] : 0;
      document.getElementById("st-pos").textContent = inside ? `x ${p.x} y ${p.y} · tile ${tx},${ty} · nº ${T(c)} pal ${PL(c)}${HF(c) ? " ↔" : ""}${VF(c) ? " ↕" : ""}${PR(c) ? " prioridade" : ""}` : "";
    }
    if (!drag) { if (e.target === cv) render(); return; }
    if (drag.t === "pan") { panX = e.clientX - drag.sx; panY = e.clientY - drag.sy; }
    else if (drag.t === "stamp") { if (tx !== drag.last[0] || ty !== drag.last[1]) { const b = brushT; if (Math.abs(tx - drag.last[0]) >= b.w || Math.abs(ty - drag.last[1]) >= b.h || b.w * b.h === 1) { stamp(tx, ty); drag.last = [tx, ty]; } } }
    else if (drag.t === "erase") setCell(tx, ty, 0);
    else if (drag.t === "px") { linePts(drag.last.x, drag.last.y, p.x, p.y).forEach(([x, y]) => setPixel(x, y, drag.v)); drag.last = p; }
    else if (drag.t === "sel") { const a = drag.a, x0 = Math.max(0, Math.min(a.x, tx)), y0 = Math.max(0, Math.min(a.y, ty)), x1 = Math.min(doc.mw - 1, Math.max(a.x, tx)), y1 = Math.min(doc.mh - 1, Math.max(a.y, ty)); msel = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; }
    render();
  }
  function up() { if (!drag) return; const d = drag; drag = null; if (d.t !== "pan" && d.t !== "sel") { dirty(); renderPanel(); } render(); }

  /* ------------------------------------------------ teclado */
  function copyRegion(cut) {
    if (!msel) { msg("Marque uma área com a seleção (M)."); return; }
    const cells = new Uint16Array(msel.w * msel.h);
    if (cut) push();
    for (let y = 0; y < msel.h; y++) for (let x = 0; x < msel.w; x++) { const i = (msel.y + y) * doc.mw + msel.x + x; cells[y * msel.w + x] = plane().cells[i]; if (cut) plane().cells[i] = 0; }
    brushT = { w: msel.w, h: msel.h, cells }; tsSel = null; MAP.clip = { ...brushT, pals: doc.pals.map((p) => p.slice()), tiles: doc.tiles };
    if (cut) { touch(); dirty(); }
    setTool("tile"); msg(`${msel.w}×${msel.h} tiles no carimbo. Clique no mapa para colar.`);
  }
  /* colar vindo de outra aba: traz os tiles junto */
  function pasteClip() {
    const c = MAP.clip; if (!c) return;
    if (c.tiles === doc.tiles) { brushT = { w: c.w, h: c.h, cells: c.cells }; setTool("tile"); return; }
    push(); const map = new Map(), cells = new Uint16Array(c.cells.length);
    c.cells.forEach((v, i) => { if (!T(v)) return; if (!map.has(T(v))) map.set(T(v), doc.tiles.push(c.tiles[T(v)].slice()) - 1); cells[i] = (v & ~0x7ff) | map.get(T(v)); });
    brushT = { w: c.w, h: c.h, cells }; optimize(true); setTool("tile"); renderAll();
    msg("Tiles da outra aba copiados para cá. As paletas não mudam: confira as cores.");
  }
  const TOOLS_M = [["tile", "T", "Carimbo de tiles (Alt ou botão direito pega do mapa)"], ["tileerase", "Shift+E", "Apagar tiles"], ["tilefill", "Shift+G", "Balde de tiles"], ["select", "M", "Seleção de tiles"], ["sep"],
    ["pencil", "B", "Lápis (pixels)"], ["eraser", "E", "Borracha (pixels)"], ["picker", "I", "Conta-gotas"], ["fill", "G", "Balde (dentro do tile)"], ["sep"], ["hand", "H", "Mão (ou Espaço)"], ["zoom", "Z", "Zoom"]];
  const ICM = { tile: '<rect x="3" y="3" width="8" height="8" fill="currentColor"/><rect x="13" y="3" width="8" height="8" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="13" width="8" height="8" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13" y="13" width="8" height="8" fill="currentColor"/>',
    tileerase: '<rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2"/>',
    tilefill: '<rect x="3" y="3" width="8" height="8" fill="currentColor"/><path d="M13 11l5-5 5 5-5 5z" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="13" width="8" height="8" fill="currentColor"/>' };
  function toolbar() {
    const tb = document.getElementById("toolbar"); tb.innerHTML = "";
    TOOLS_M.forEach(([t, k, n]) => {
      if (t === "sep") { const s = document.createElement("span"); s.className = "sep"; tb.appendChild(s); return; }
      const b = document.createElement("button"); b.title = `${n} (${k})`; b.className = t === mtool ? "on" : "";
      b.innerHTML = `<svg viewBox="0 0 24 24">${ICM[t] || IC[t]}</svg>`; b.onclick = () => setTool(t); tb.appendChild(b);
    });
  }
  function setTool(t) { mtool = t; toolbar(); toolopts(); render(); }
  function toolopts() {
    const o = document.getElementById("toolopts");
    const n = (TOOLS_M.find((x) => x[0] === mtool) || [])[2];
    o.innerHTML = `<b>${n}</b>
      <label><input type="checkbox" id="m-fh" ${flipH ? "checked" : ""}> Espelho ↔ (F)</label>
      <label><input type="checkbox" id="m-fv" ${flipV ? "checked" : ""}> Espelho ↕ (Shift+F)</label>
      <label><input type="checkbox" id="m-pr" ${prio ? "checked" : ""}> Prioridade (P)</label>
      <label title="Pintar pixel muda todas as celulas que usam o mesmo tile"><input type="checkbox" id="m-all" ${editAll ? "checked" : ""}> Editar todas as cópias do tile</label>
      <label><input type="checkbox" id="m-scr" ${showScreen ? "checked" : ""}> Telas 320×224</label>`;
    const bind = (id, f) => { document.getElementById(id).onchange = (e) => { f(e.target.checked); render(); }; };
    bind("m-fh", (v) => { flipH = +v; }); bind("m-fv", (v) => { flipV = +v; }); bind("m-pr", (v) => { prio = +v; }); bind("m-all", (v) => { editAll = v; }); bind("m-scr", (v) => { showScreen = v; });
  }
  function key(e) {
    const k = e.key, K = k.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (ctrl) {
      if (K === "c" || K === "x") { e.preventDefault(); copyRegion(K === "x"); return true; }
      if (K === "v") { e.preventDefault(); pasteClip(); return true; }
      if (K === "a") { e.preventDefault(); msel = { x: 0, y: 0, w: doc.mw, h: doc.mh }; render(); return true; }
      if (K === "d") { e.preventDefault(); msel = null; render(); return true; }
      return ["z", "y", "s", "o", "n", "w", "tab", "0", "1", "m", "'"].includes(K) ? false : true;
    }
    if (k === "Delete" || k === "Backspace") { if (msel) { push(); for (let y = 0; y < msel.h; y++) for (let x = 0; x < msel.w; x++) plane().cells[(msel.y + y) * doc.mw + msel.x + x] = 0; touch(); dirty(); render(); renderPanel(); } return true; }
    if (k === "Escape") { msel = null; render(); return true; }
    if (K === "f") { if (e.shiftKey) flipV ^= 1; else flipH ^= 1; toolopts(); render(); return true; }
    if (K === "p") { prio ^= 1; toolopts(); return true; }
    if (k === "Tab" && !ctrl) { e.preventDefault(); doc.plane ^= 1; renderPanel(); render(); return true; }
    const t = { t: "tile", m: "select", b: "pencil", e: e.shiftKey ? "tileerase" : "eraser", i: "picker", g: e.shiftKey ? "tilefill" : "fill", h: "hand", z: "zoom" }[K];
    if (t) { setTool(t); return true; }
    return !["x", " ", "F1", "+", "-"].includes(k);
  }

  /* ------------------------------------------------ painel: planos, tileset, relatorio */
  function renderPanel() {
    const r = document.getElementById("mdreport");
    const used = new Set(); let cellsUsed = 0; const perPal = [new Set(), new Set(), new Set(), new Set()];
    doc.planes.forEach((p) => { for (const c of p.cells) if (T(c)) { used.add(T(c)); cellsUsed++; const t = doc.tiles[T(c)]; for (const v of t) if (v) perPal[PL(c)].add(v); } });
    const nT = used.size, cls = (ok, warn) => (ok ? "ok" : warn ? "warn" : "bad");
    const base = safe(doc.name) || "cenario";
    r.innerHTML = `
      <div class="ptitle" style="margin:0 -8px 4px;border-top:0">Planos</div>
      ${doc.planes.map((p, i) => `<div class="plane ${i === doc.plane ? "on" : ""}" data-pl="${i}"><button data-pv="${i}" class="${p.vis ? "" : "off"}">👁</button><span>${esc(p.name)}</span></div>`).join("")}
      <div class="hint" style="padding:2px 0">Tab troca o plano. O A fica na frente do B.</div>
      <div class="ptitle" style="margin:6px -8px 4px">Tiles (${doc.tiles.length - 1}) <button id="m-opt" style="float:right;padding:0 6px">Otimizar</button></div>
      <canvas id="tileset"></canvas>
      <div class="hint" style="padding:2px 0">Clique num tile para carimbar · Shift+arrastar pega um bloco. Mostrados com a paleta ativa.</div>
      <div class="ptitle" style="margin:6px -8px 4px">Mega Drive</div>
      <div><span class="k">Mapa:</span> ${doc.mw}×${doc.mh} tiles = ${doc.w}×${doc.h} px (${Math.ceil(doc.w / 320)}×${Math.ceil(doc.h / 224)} telas)</div>
      <div><span class="k">Tiles únicos usados:</span> <span class="${cls(nT <= 1024, nT <= 1536)}"><b>${nT}</b></span> (${(nT * 32 / 1024).toFixed(1)} KB de VRAM)</div>
      <div class="hint" style="padding:0">A VRAM tem 2048 tiles, mas planos, sprites e fonte também ocupam: acima de ~1500 não cabe junto.</div>
      ${perPal.map((s, i) => `<div><span class="k">Paleta ${i}:</span> <span class="${cls(s.size <= 15)}">${s.size}/15 cores usadas</span></div>`).join("")}
      ${doc.lossy ? `<div class="bad">${doc.lossy} tile(s) da imagem importada tinham cores demais para uma paleta de 15: foram aproximados. Redesenhe-os.</div>` : ""}
      ${doc.mw > 64 || doc.mh > 64 ? `<div class="warn">Maior que o plano do VDP (64×32 ou 64×64 tiles): use MAP no SGDK, que vai carregando conforme a câmera anda.</div>` : ""}
      <button id="m-export" class="on" style="width:100%;margin:6px 0">Exportar para Mega Drive (Ctrl+Shift+M)</button>
      <pre>PALETTE pal_${base} "${base}/${base}_b.png"\nIMAGE img_${base}_b "${base}/${base}_b.png" BEST ALL\nIMAGE img_${base}_a "${base}/${base}_a.png" BEST ALL</pre>`;
    r.querySelectorAll("[data-pl]").forEach((e) => e.onclick = () => { doc.plane = +e.dataset.pl; renderPanel(); render(); });
    r.querySelectorAll("[data-pv]").forEach((e) => e.onclick = (ev) => { ev.stopPropagation(); const p = doc.planes[+e.dataset.pv]; p.vis = !p.vis; touch(); renderPanel(); render(); });
    document.getElementById("m-opt").onclick = () => optimize(false);
    document.getElementById("m-export").onclick = exportMD;
    drawTileset();
  }
  const TS_COLS = 8, TS_Z = 3;
  function drawTileset() {
    const c = document.getElementById("tileset"); if (!c) return;
    const n = doc.tiles.length - 1, rows = Math.max(1, Math.ceil(n / TS_COLS)), s = 8 * TS_Z + 2;
    c.width = TS_COLS * s; c.height = rows * s; const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    g.fillStyle = "#24262c"; g.fillRect(0, 0, c.width, c.height);
    for (let i = 1; i <= n; i++) { const x = ((i - 1) % TS_COLS) * s + 1, y = Math.floor((i - 1) / TS_COLS) * s + 1; drawTile(pack(i, 0, 0, doc.palIx, 0), x, y, TS_Z, g); }
    if (tsSel) { const [a, b] = tsSel; const x0 = Math.min(a % TS_COLS, b % TS_COLS), x1 = Math.max(a % TS_COLS, b % TS_COLS), y0 = Math.min(Math.floor(a / TS_COLS), Math.floor(b / TS_COLS)), y1 = Math.max(Math.floor(a / TS_COLS), Math.floor(b / TS_COLS)); g.strokeStyle = "#d9a441"; g.lineWidth = 2; g.strokeRect(x0 * s + 1, y0 * s + 1, (x1 - x0 + 1) * s - 2, (y1 - y0 + 1) * s - 2); }
    let dn = null;
    const at = (e) => { const r = c.getBoundingClientRect(); const i = Math.floor((e.clientY - r.top) / s) * TS_COLS + Math.floor((e.clientX - r.left) / s); return Math.max(0, Math.min(n - 1, i)); };
    c.onmousedown = (e) => { dn = at(e); tsSel = [dn, dn]; pickSet(); };
    c.onmousemove = (e) => { if (dn === null || !(e.buttons & 1)) return; if (e.shiftKey) { tsSel = [dn, at(e)]; pickSet(); } };
    c.onmouseup = () => { dn = null; };
  }
  function pickSet() {
    const [a, b] = tsSel, x0 = Math.min(a % TS_COLS, b % TS_COLS), x1 = Math.max(a % TS_COLS, b % TS_COLS), y0 = Math.min(Math.floor(a / TS_COLS), Math.floor(b / TS_COLS)), y1 = Math.max(Math.floor(a / TS_COLS), Math.floor(b / TS_COLS));
    const w = x1 - x0 + 1, h = y1 - y0 + 1, cells = new Uint16Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y0 + y) * TS_COLS + x0 + x + 1; cells[y * w + x] = i < doc.tiles.length ? i : 0; }
    brushT = { w, h, cells, fromSet: true }; if (mtool !== "tilefill") mtool = "tile"; toolbar(); toolopts(); drawTileset();
  }

  /* ------------------------------------------------ exportar
   * PNG de 8 bits por plano: pixel = prioridade<<7 | paleta<<4 | cor, com as 4 paletas (64 cores) no PLTE,
   * que e como o rescomp do SGDK le paleta e prioridade de cada tile. */
  async function exportMD() {
    const base = safe(doc.name) || "cenario", files = [];
    const P = Array.from({ length: 256 }, (_, i) => rgbK(doc.pals[(i >> 4) & 3][i & 15]));
    const names = ["b", "a"];
    for (let pi = 0; pi < 2; pi++) {
      const p = doc.planes[pi], idx = new Uint8Array(doc.w * doc.h); let any = false;
      for (let ty = 0; ty < doc.mh; ty++) for (let tx = 0; tx < doc.mw; tx++) {
        const c = p.cells[ty * doc.mw + tx]; if (!T(c)) continue; any = true;
        const t = doc.tiles[T(c)], hi = (PR(c) << 7) | (PL(c) << 4);
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = t[(VF(c) ? 7 - y : y) * 8 + (HF(c) ? 7 - x : x)]; idx[(ty * 8 + y) * doc.w + tx * 8 + x] = hi | v; }
      }
      if (any || pi === 0) files.push({ name: `${base}/${base}_${names[pi]}.png`, data: new Uint8Array(await (await PNG.indexed(doc.w, doc.h, idx, P)).arrayBuffer()) });
    }
    const hasA = files.length > 1;
    const res = [`// ${doc.name}: cenário gerado pelo SG Pixel (${doc.mw}x${doc.mh} tiles)`, `PALETTE pal_${base} "${base}/${base}_b.png"   // as 4 paletas (64 cores)`,
      `IMAGE img_${base}_b "${base}/${base}_b.png" BEST ALL`, hasA ? `IMAGE img_${base}_a "${base}/${base}_a.png" BEST ALL` : "",
      "", "// mapas maiores que a tela: use TILESET + MAP (o SGDK carrega conforme a câmera anda)",
      `// TILESET ts_${base}_b "${base}/${base}_b.png" BEST ALL`, `// MAP map_${base}_b "${base}/${base}_b.png" ts_${base}_b BEST 0`].filter((l) => l !== null);
    const palh = `// paletas de ${doc.name} (formato do VDP)\nconst u16 pal_${base}[64] = {\n${doc.pals.map((p) => "  " + p.map(hex9).join(", ")).join(",\n")}\n};\n`;
    const readme = [`${doc.name} - cenário exportado pelo SG Pixel`, "", `${base}_b.png = plano B (fundo)${hasA ? `, ${base}_a.png = plano A (frente)` : ""}.`,
      "PNG indexado de 8 bits: cada pixel guarda prioridade (bit 7), paleta (bits 4-5) e cor (bits 0-3),", "que é como o rescomp do SGDK descobre a paleta e a prioridade de cada tile.",
      `Tiles únicos: ${new Set(doc.planes.flatMap((p) => [...p.cells].filter((c) => T(c)).map(T))).size}.`];
    files.push({ name: `${base}/${base}.res`, data: new TextEncoder().encode(res.join("\n") + "\n") });
    files.push({ name: `${base}/${base}_pal.h`, data: new TextEncoder().encode(palh) });
    files.push({ name: `${base}/LEIA-ME.txt`, data: new TextEncoder().encode(readme.join("\r\n") + "\r\n") });
    download(ZIP.store(files), base + "_megadrive.zip");
    msg(`Cenário exportado na pasta ${base}/ (${base}_megadrive.zip).`);
  }

  /* ------------------------------------------------ dialogos */
  const PRESETS = [[40, 28, "1 tela (320×224)"], [32, 28, "1 tela estreita (256×224)"], [80, 28, "2 telas de lado"], [160, 28, "fase lateral (4 telas)"], [320, 28, "fase lateral longa (8 telas)"], [40, 56, "2 telas em pé"], [64, 32, "plano do VDP 64×32"], [64, 64, "plano 64×64"]];
  function newDialog() {
    modal(`<h3>Novo cenário</h3>
      <div class="row"><label>Nome</label><input id="nm-name" value="fase1"></div>
      <div class="row"><label>Largura (tiles)</label><input id="nm-w" type="number" min="1" max="1024" value="40"></div>
      <div class="row"><label>Altura (tiles)</label><input id="nm-h" type="number" min="1" max="256" value="28"></div>
      <div class="presets">${PRESETS.map(([w, h, n]) => `<button data-p="${w},${h}">${n}</button>`).join("")}</div>
      <div class="hint" style="padding:0">Tile = 8×8 px. A tela do Mega Drive tem 40×28 tiles. Você pode importar uma imagem pronta em Cenário → Importar imagem.</div>
      <div class="btns"><button id="nm-c">Cancelar</button><button id="nm-ok" class="primary">Criar</button></div>`);
    document.querySelectorAll("[data-p]").forEach((b) => b.onclick = () => { const [w, h] = b.dataset.p.split(","); document.getElementById("nm-w").value = w; document.getElementById("nm-h").value = h; });
    document.getElementById("nm-c").onclick = closeModal;
    document.getElementById("nm-ok").onclick = () => {
      const w = Math.max(1, Math.min(1024, +document.getElementById("nm-w").value || 40)), h = Math.max(1, Math.min(256, +document.getElementById("nm-h").value || 28));
      closeModal(); openTab(create(document.getElementById("nm-name").value.trim() || "cenario", w, h)); setTool("tile");
    };
  }
  function resizeDialog() {
    ask("Tamanho do mapa (tiles)", [["Largura", "w", doc.mw, "number"], ["Altura", "h", doc.mh, "number"]], (v) => {
      const w = Math.max(1, Math.min(1024, +v.w || doc.mw)), h = Math.max(1, Math.min(256, +v.h || doc.mh));
      push();
      doc.planes.forEach((p) => { const n = new Uint16Array(w * h); for (let y = 0; y < Math.min(h, doc.mh); y++) for (let x = 0; x < Math.min(w, doc.mw); x++) n[y * w + x] = p.cells[y * doc.mw + x]; p.cells = n; });
      Object.assign(doc, { mw: w, mh: h, w: w * 8, h: h * 8 }); touch(); renderAll();
    });
  }
  function palRow() {
    const box = document.getElementById("palsel");
    box.classList.toggle("hidden", doc.kind !== "map");
    if (doc.kind !== "map") return;
    box.innerHTML = [0, 1, 2, 3].map((i) => `<button data-pi="${i}" class="${i === doc.palIx ? "on" : ""}">Paleta ${i}</button>`).join("");
    box.querySelectorAll("[data-pi]").forEach((b) => b.onclick = () => { doc.palIx = +b.dataset.pi; doc.pal = doc.pals[doc.palIx]; renderPalettes(); palRow(); drawTileset(); render(); });
  }
  function slotsInUse() {
    const u = new Set();
    doc.planes.forEach((p) => { for (const c of p.cells) if (T(c) && PL(c) === doc.palIx) for (const v of doc.tiles[T(c)]) if (v) u.add(v); });
    return u;
  }

  return { create, serialize, deserialize, snap, restore, render, down, move, up, key, toolbar, toolopts, renderPanel, exportMD, newDialog, resizeDialog,
    importScene, optimize: () => optimize(false), palRow, slotsInUse, touch, clip: null, setTool };
})();
