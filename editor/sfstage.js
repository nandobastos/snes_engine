/* SF Engine: conversor de estagio (imagem -> cenario do SNES), no navegador.
 * Entrada: qualquer imagem; vira 256x224 (encaixa pela largura, encostada embaixo). Saida (.sfstage.json):
 *   bin = tiles 8x8 de 4 bpp (sem repetidos, com espelhos), map = mapa 32x32 (paletas 2-7), pal = 6 paletas de 16 cores.
 * Limite: 512 tiles diferentes (a VRAM do cenario na luta); passando disso, os tiles menos usados viram o mais parecido.
 * Uso: SFStage.convert(imageData) -> { format: "sf-stage", tiles, bin, map, pal } (base64) e SFStage.render(stage) -> ImageData */
(function (root) {
  "use strict";
  const NP = 6, MAXT = 512;
  const b64 = (u8) => { if (typeof btoa === "function") { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); } return Buffer.from(u8).toString("base64"); };
  const unb64 = (s) => { if (typeof atob === "function") { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; } return new Uint8Array(Buffer.from(s, "base64")); };
  const key = (r, g, b) => (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10);
  const rgb = (k) => [k & 31, (k >> 5) & 31, (k >> 10) & 31];
  const d2 = (a, b) => { const x = rgb(a), y = rgb(b); return (x[0] - y[0]) ** 2 * 3 + (x[1] - y[1]) ** 2 * 4 + (x[2] - y[2]) ** 2 * 2; };

  function quant(count, K) {   // count: Map(cor -> vezes). K-means simples nas cores de 5 bits
    const cols = [...count.keys()];
    if (cols.length <= K) return cols;
    let cen = cols.slice().sort((a, b) => count.get(b) - count.get(a)).slice(0, K).map(rgb);
    for (let it = 0; it < 8; it++) {
      const acc = cen.map(() => [0, 0, 0, 0]);
      cols.forEach((c) => { const v = rgb(c), w = count.get(c); let bi = 0, bd = 1e9;
        cen.forEach((m, i) => { const d = (v[0] - m[0]) ** 2 * 3 + (v[1] - m[1]) ** 2 * 4 + (v[2] - m[2]) ** 2 * 2; if (d < bd) { bd = d; bi = i; } });
        acc[bi][0] += v[0] * w; acc[bi][1] += v[1] * w; acc[bi][2] += v[2] * w; acc[bi][3] += w; });
      cen = acc.map((a, i) => (a[3] ? [a[0] / a[3], a[1] / a[3], a[2] / a[3]] : cen[i]));
    }
    return [...new Set(cen.map((m) => Math.round(m[0]) | (Math.round(m[1]) << 5) | (Math.round(m[2]) << 10)))];
  }

  function convert(img) {   // img: ImageData (qualquer tamanho)
    // 256x224: encaixa pela largura, encostada embaixo (o chao fica no chao)
    const W = 256, H = 224, k = new Int32Array(W * H), sc = W / img.width, oy = H - Math.round(img.height * sc);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / sc)), sy = Math.floor((y - oy) / sc);
      if (sy < 0 || sy >= img.height) { k[y * W + x] = 0; continue; }
      const o = (sy * img.width + sx) * 4; k[y * W + x] = key(img.data[o], img.data[o + 1], img.data[o + 2]);
    }
    const tiles = [];
    for (let ty = 0; ty < 28; ty++) for (let tx = 0; tx < 32; tx++) { const t = new Int32Array(64); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) t[y * 8 + x] = k[(ty * 8 + y) * W + tx * 8 + x]; tiles.push(t); }
    // grupos de tiles (1 paleta por grupo): comeca pelo brilho e refina
    const lum = tiles.map((t) => { let s = 0; t.forEach((c) => { const v = rgb(c); s += v[0] * 3 + v[1] * 6 + v[2]; }); return s; });
    const order = tiles.map((_, i) => i).sort((a, b) => lum[a] - lum[b]), tp = new Array(tiles.length);
    order.forEach((i, r) => (tp[i] = Math.floor((r * NP) / tiles.length)));
    const err = (t, pl) => { let e = 0; const cache = new Map(); t.forEach((c) => { let d = cache.get(c); if (d === undefined) { d = Math.min(...pl.map((q) => d2(c, q))); cache.set(c, d); } e += d; }); return e; };
    let pals = [];
    const mkPals = () => { pals = []; for (let p = 0; p < NP; p++) { const cnt = new Map(); tiles.forEach((t, i) => { if (tp[i] === p) t.forEach((c) => cnt.set(c, (cnt.get(c) || 0) + 1)); }); pals.push(cnt.size ? quant(cnt, 15) : [0]); } };
    for (let it = 0; it < 5; it++) {
      mkPals();
      let ch = 0;
      tiles.forEach((t, i) => { let bp = tp[i], be = err(t, pals[bp]); for (let p = 0; p < NP; p++) { const e = err(t, pals[p]); if (e < be) { be = e; bp = p; } } if (bp !== tp[i]) { tp[i] = bp; ch++; } });
      if (!ch) break;
    }
    mkPals();
    // indices, sem repetidos (com espelhos)
    const idxOf = (t, pl) => Array.from(t, (c) => { let bi = 0, bd = 1e9; pl.forEach((q, j) => { const d = d2(c, q); if (d < bd) { bd = d; bi = j; } }); return bi + 1; });
    const flipH = (v) => v.map((_, i) => v[(i & ~7) + 7 - (i & 7)]), flipV = (v) => v.map((_, i) => v[(7 - (i >> 3)) * 8 + (i & 7)]);
    const uniq = new Map(), gfx = [], gpal = [], cells = [], uses = [];
    tiles.forEach((t, i) => {
      const p = tp[i], ix = idxOf(t, pals[p]), h = flipH(ix), v = flipV(ix), hv = flipV(h);
      let found = null;
      [[ix, 0], [h, 0x4000], [v, 0x8000], [hv, 0xC000]].some(([a, f]) => { const g = uniq.get(p + ":" + a.join(",")); if (g !== undefined) { found = [g, f]; return true; } return false; });
      if (!found) { uniq.set(p + ":" + ix.join(","), gfx.length); gfx.push(ix); gpal.push(p); uses.push(0); found = [gfx.length - 1, 0]; }
      uses[found[0]]++;
      cells.push([found[0], p, found[1]]);
    });
    // passou do limite: os tiles menos usados viram o mais parecido (mesma paleta)
    const alive = gfx.map(() => true), remap = gfx.map((_, i) => i);
    let n = gfx.length;
    if (n > MAXT) {
      const byUse = gfx.map((_, i) => i).sort((a, b) => uses[a] - uses[b]);
      for (const a of byUse) {
        if (n <= MAXT) break;
        let best = -1, bd = 1e18;
        gfx.forEach((g, b) => { if (b === a || !alive[b] || gpal[b] !== gpal[a]) return; let d = 0; for (let q = 0; q < 64 && d < bd; q++) d += (g[q] !== gfx[a][q]) ? 1 : 0; if (d < bd) { bd = d; best = b; } });
        if (best < 0) continue;
        alive[a] = false; remap[a] = best; n--;
      }
    }
    const final = [], fidx = gfx.map(() => -1);
    gfx.forEach((g, i) => { if (alive[i]) { fidx[i] = final.length; final.push(g); } });
    const res = (i) => { while (!alive[i]) i = remap[i]; return fidx[i]; };
    const map = new Uint8Array(2048);
    cells.forEach(([g, p, f], i) => { const v = res(g) | ((p + 2) << 10) | f; map[2 * i] = v & 255; map[2 * i + 1] = v >> 8; });
    const bin = new Uint8Array(final.length * 32);
    final.forEach((ix, t) => { for (let y = 0; y < 8; y++) { const pl = [0, 0, 0, 0]; for (let x = 0; x < 8; x++) { const v = ix[y * 8 + x]; for (let b = 0; b < 4; b++) if (v & (1 << b)) pl[b] |= 0x80 >> x; }
      bin[t * 32 + 2 * y] = pl[0]; bin[t * 32 + 2 * y + 1] = pl[1]; bin[t * 32 + 16 + 2 * y] = pl[2]; bin[t * 32 + 17 + 2 * y] = pl[3]; } });
    const pal = new Uint8Array(NP * 32);
    pals.forEach((pl, p) => pl.forEach((c, j) => { if (j < 15) { pal[p * 32 + 2 * (j + 1)] = c & 255; pal[p * 32 + 2 * (j + 1) + 1] = c >> 8; } }));
    return { format: "sf-stage", version: 1, tiles: final.length, bin: b64(bin), map: b64(map), pal: b64(pal) };
  }

  function render(st) {   // reconstrucao 256x224 (para a previa)
    const bin = unb64(st.bin), map = unb64(st.map), pal = unb64(st.pal), out = typeof ImageData !== "undefined" ? new ImageData(256, 224) : { width: 256, height: 224, data: new Uint8ClampedArray(256 * 224 * 4) };
    for (let i = 0; i < 32 * 28; i++) {
      const c = map[2 * i] | (map[2 * i + 1] << 8), n = c & 0x3FF, p = ((c >> 10) & 7) - 2;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const xx = c & 0x4000 ? 7 - x : x, yy = c & 0x8000 ? 7 - y : y, o = n * 32;
        const b = 0x80 >> xx, v = (bin[o + 2 * yy] & b ? 1 : 0) | (bin[o + 2 * yy + 1] & b ? 2 : 0) | (bin[o + 16 + 2 * yy] & b ? 4 : 0) | (bin[o + 17 + 2 * yy] & b ? 8 : 0);
        const w = pal[p * 32 + 2 * v] | (pal[p * 32 + 2 * v + 1] << 8), q = (((i >> 5) * 8 + y) * 256 + (i & 31) * 8 + x) * 4;
        out.data[q] = (w & 31) * 255 / 31; out.data[q + 1] = ((w >> 5) & 31) * 255 / 31; out.data[q + 2] = ((w >> 10) & 31) * 255 / 31; out.data[q + 3] = 255;
      }
    }
    return out;
  }
  root.SFStage = { convert, render, unb64 };
  if (typeof module !== "undefined") module.exports = root.SFStage;
})(typeof window !== "undefined" ? window : globalThis);
