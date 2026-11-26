/* SF Engine - visualizacao: le da ROM-motor (engine/base.sfc + base.json) e da arte do SF Pixel os quadros dos lutadores,
 * os retratos e o cenario, prontos para desenhar no editor (canvas). Nao muda nada: so le.
 * SFView.open(rom, base) -> V;  V.anim(fighter, nomeDaAnimacao, arts) -> [{c: canvas, ax, h}];  V.portrait(fighter, arts) -> canvas;
 * V.stage(fighter, stages) -> canvas 256x224;  V.stats(fighter, arts) -> {frames, maxPieces, anims} */
(function (root) {
  "use strict";
  const PO = 16 * 0x8000, FAST = 0x90;
  const s8 = (v) => (v > 127 ? v - 256 : v);
  const rgb = (w) => [(w & 31) * 255 / 31, ((w >> 5) & 31) * 255 / 31, ((w >> 10) & 31) * 255 / 31];
  const unb64 = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  function canvasFrom(w, h, idx, pal) {
    const c = document.createElement("canvas"); c.width = Math.max(1, w); c.height = Math.max(1, h);
    const g = c.getContext("2d"), im = g.createImageData(c.width, c.height);
    for (let i = 0; i < w * h; i++) { const v = idx[i]; if (!v) continue; const [r, gg, b] = rgb(pal[v] || 0); im.data[i * 4] = r; im.data[i * 4 + 1] = gg; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0); return c;
  }
  function open(R, B) {
    const rd = (o) => R[o] | (R[o + 1] << 8), h = (i) => rd(PO + 2 * i), off = (a, b) => PO + (b - FAST) * 0x8000 + (a - 0x8000);
    const nf = h(6), np = h(7), A = {};
    B.arrays.forEach(([n, sz], k) => { const o = off(rd(PO + h(10) + 4 * k), rd(PO + h(10) + 4 * k + 2)), c = n.startsWith("pp_") ? np : nf, v = []; for (let i = 0; i < c; i++) v.push(sz === 1 ? R[o + i] : rd(o + 2 * i)); A[n] = v; });
    const chunkAt = (k) => off(rd(PO + h(9) + 4 * k), R[PO + h(9) + 4 * k + 2]);
    const asset = (name) => { const i = B.assets.indexOf(name), e = PO + h(11) + 8 * i, o = off(rd(e), rd(e + 2)); return R.subarray(o, o + rd(e + 4)); };
    const words = (u8, from, n) => { const w = []; for (let i = 0; i < n; i++) w.push(u8[from + 2 * i] | (u8[from + 2 * i + 1] << 8)); return w; };
    const first = {}; B.layout.forEach(([n, f, c]) => (first[n] = [f, c]));
    const piece = (o, k, n) => { const r = k >> 3, c = k & 7, nr = Math.min(8, n - r * 8), row0 = o + r * 2 * 8 * 64, px = new Uint8Array(256);
      for (let half = 0; half < 2; half++) for (let side = 0; side < 2; side++) { const q = row0 + half * nr * 64 + c * 64 + side * 32;
        for (let y = 0; y < 8; y++) { const p0 = R[q + 2 * y], p1 = R[q + 2 * y + 1], p2 = R[q + 16 + 2 * y], p3 = R[q + 17 + 2 * y];
          for (let x = 0; x < 8; x++) { const b = 0x80 >> x; px[(half * 8 + y) * 16 + side * 8 + x] = (p0 & b ? 1 : 0) | (p1 & b ? 2 : 0) | (p2 & b ? 4 : 0) | (p3 & b ? 8 : 0); } } }
      return px; };
    const cache = new Map();
    function romFrame(k, pal, key) {   // quadro k da tabela da engine
      const ck = key + ":" + k; if (cache.has(ck)) return cache.get(ck);
      const w = A.pf_w[k], hh = A.pf_h[k], ax = s8(A.pf_ax[k]), n = A.pf_count[k], go = chunkAt(A.pf_chunk[k]) + A.pf_off[k], idx = new Uint8Array(w * hh);
      for (let j = 0; j < n; j++) { const dx = s8(A.pp_dx[A.pf_first[k] + j]) - 64 + ax, dy = A.pp_dy[A.pf_first[k] + j], px = piece(go, j, n);
        for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) { const v = px[yy * 16 + xx], X = dx + xx, Y = dy + yy; if (v && X >= 0 && Y >= 0 && X < w && Y < hh) idx[Y * w + X] = v; } }
      const fr = { c: canvasFrom(w, hh, idx, pal), ax, h: hh, n };
      cache.set(ck, fr); return fr;
    }
    function artFrame(af, pal) {
      const w = af.w, hh = af.h + (af.dy || 0), dy0 = af.dy || 0, idx = new Uint8Array(w * hh);
      af.pieces.forEach((p) => { const px = unb64(p.px); for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) { const v = px[yy * 16 + xx], X = p.x + xx, Y = p.y + dy0 + yy; if (v && X >= 0 && Y >= 0 && X < w && Y < hh) idx[Y * w + X] = v; } });
      return { c: canvasFrom(w, hh, idx, pal), ax: af.anchor ? Math.round(af.anchor[0]) : w >> 1, h: hh, n: af.pieces.length };
    }
    const romPal = (t) => { const nm = B.assets[t.pal_asset] || "ryu.pal"; return [0].concat(words(asset(nm), 2, 15)); };
    const baseOf = (G, f) => { const i = G.fighters.indexOf(f), t = f.traits; return B.fighter_bases[t.frames_from !== undefined ? t.frames_from : i] || 0; };
    const V = {
      /* quadros de uma animacao do lutador (arte propria, ou os da engine) */
      anim(G, f, name, arts) {
        const art = f.traits.art && arts[f.traits.art];
        if (art) {
          const tg = art.tags.find((t) => t.name === name), pal = art.pal;
          if (tg && tg.frames.length) return tg.frames.map((af) => artFrame(af, pal));
        }
        const L = first[name]; if (!L) return [];
        const b = baseOf(G, f), pal = romPal(f.traits), out = [];
        let last = -1;
        for (let i = 0; i < L[1]; i++) { const k = b + L[0] + i, sig = A.pf_chunk[k] * 65536 + A.pf_off[k]; if (sig === last && i === L[1] - 1) break; last = sig; out.push(romFrame(k, pal, f.traits.pal_asset)); }
        return out;
      },
      /* retrato 56x80 */
      portrait(G, f, arts) {
        const art = f.traits.art && arts[f.traits.art];
        if (art && art.portrait) return canvasFrom(56, 80, unb64(art.portrait.px), art.pal);
        const fb = asset("face.bin"), fp = asset("face.pal"), slot = f.traits.face_pal || 2, pal = words(fp, (slot - 2) * 32, 16);
        const fi = f.traits.face_idx || 0, idx = new Uint8Array(56 * 80);
        for (let t = 0; t < 70; t++) { const o = (fi * 70 + t) * 32, tx = (t % 7) * 8, ty = Math.floor(t / 7) * 8;
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const b = 0x80 >> x; idx[(ty + y) * 56 + tx + x] = (fb[o + 2 * y] & b ? 1 : 0) | (fb[o + 2 * y + 1] & b ? 2 : 0) | (fb[o + 16 + 2 * y] & b ? 4 : 0) | (fb[o + 17 + 2 * y] & b ? 8 : 0); } }
        return canvasFrom(56, 80, idx, pal);
      },
      /* cenario 256x224 (o proprio, ou o padrao) */
      stage(G, f, stages) {
        const st = f.traits.stage && stages[f.traits.stage];
        const bin = st ? unb64(st.bin) : asset("stage.bin"), map = st ? unb64(st.map) : asset("stage.map"), pal = st ? unb64(st.pal) : asset("stage.pal");
        const c = document.createElement("canvas"); c.width = 256; c.height = 224;
        const g = c.getContext("2d"), im = g.createImageData(256, 224);
        for (let i = 0; i < 32 * 28; i++) {
          const cc = map[2 * i] | (map[2 * i + 1] << 8), n = cc & 0x3FF, p = ((cc >> 10) & 7) - 2;
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
            const xx = cc & 0x4000 ? 7 - x : x, yy = cc & 0x8000 ? 7 - y : y, o = n * 32, b = 0x80 >> xx;
            const v = (bin[o + 2 * yy] & b ? 1 : 0) | (bin[o + 2 * yy + 1] & b ? 2 : 0) | (bin[o + 16 + 2 * yy] & b ? 4 : 0) | (bin[o + 17 + 2 * yy] & b ? 8 : 0);
            const w = pal[p * 32 + 2 * v] | (pal[p * 32 + 2 * v + 1] << 8), q = (((i >> 5) * 8 + y) * 256 + (i & 31) * 8 + x) * 4, [r, gg, bb] = rgb(w);
            im.data[q] = r; im.data[q + 1] = gg; im.data[q + 2] = bb; im.data[q + 3] = 255;
          }
        }
        g.putImageData(im, 0, 0); return c;
      },
      /* numeros do lutador: quadros, maior custo, animacoes */
      stats(G, f, arts) {
        const art = f.traits.art && arts[f.traits.art];
        if (art) { const all = art.tags.flatMap((t) => t.frames); return { frames: all.length, maxPieces: Math.max(0, ...all.map((a) => a.pieces.length)), anims: art.tags.length }; }
        const b = baseOf(G, f), ks = []; B.layout.forEach(([n, f0, c]) => { if (!/fireball|spark|shadow/.test(n)) for (let i = 0; i < c; i++) ks.push(b + f0 + i); });
        return { frames: new Set(ks.map((k) => A.pf_chunk[k] * 65536 + A.pf_off[k])).size, maxPieces: Math.max(...ks.map((k) => A.pf_count[k])), anims: B.layout.length };
      },
    };
    return V;
  }
  /* animacao pequena num canvas: os quadros alinhados pela ancora (pes) e pelo chao */
  function player(canvas, frames, ms) {
    const g = canvas.getContext("2d"); g.imageSmoothingEnabled = false;
    let i = 0, alive = true;
    const W = canvas.width, H = canvas.height, ground = H - 4;
    const maxH = Math.max(1, ...frames.map((f) => f.h)), sc = Math.max(1, Math.min(2, Math.floor((H - 8) / maxH)));
    function draw() {
      if (!alive || !canvas.isConnected) return;
      g.clearRect(0, 0, W, H);
      if (frames.length) { const f = frames[i % frames.length]; g.drawImage(f.c, Math.round(W / 2 - f.ax * sc), ground - f.h * sc, f.c.width * sc, f.c.height * sc); }
      i++; setTimeout(draw, ms || 120);
    }
    draw();
    return { stop() { alive = false; } };
  }
  root.SFView = { open, player };
})(window);
