/* SG Engine - conversao de imagens para o Mega Drive.
 * O Mega Drive tem cores de 9 bits (8 niveis por canal) e cada paleta tem 16 cores,
 * sendo a primeira transparente. Aqui reduzimos qualquer imagem para esse formato. */
"use strict";

const MD = {
  /* nivel 0..7 de um canal 0..255 */
  level(v) { return Math.min(7, Math.round(v / 36.43)); },
  /* cor exibida para um nivel (aproximacao da saida do VDP) */
  show(l) { return Math.round(l * 36.43); },
  key(r, g, b) { return (MD.level(r) << 6) | (MD.level(g) << 3) | MD.level(b); },
  rgbOfKey(k) { return [MD.show((k >> 6) & 7), MD.show((k >> 3) & 7), MD.show(k & 7)]; },
  /* palavra de cor do VDP (0000 BBB0 GGG0 RRR0) */
  vdpWord(k) { const r = (k >> 6) & 7, g = (k >> 3) & 7, b = k & 7; return (b << 9) | (g << 5) | (r << 1); },

  /* reduz uma lista de {key, n} para no maximo max cores (median cut no espaco 8x8x8) */
  /* reduz para max cores: com poucas a mais, junta o par mais parecido (a cor menos usada vira a mais usada, exata);
   * a distancia pesa a diferenca de "cor" (um cinza nao vira marrom so por estar perto no brilho) */
  reduce(counts, max) {
    if (counts.length <= 64) {
      const comps = (k) => [(k >> 6) & 7, (k >> 3) & 7, k & 7];
      const dist = (a, b) => { const p = comps(a), q = comps(b), dr = p[0] - q[0], dg = p[1] - q[1], db = p[2] - q[2];
        const ca = Math.max(...p) - Math.min(...p), cb = Math.max(...q) - Math.min(...q);
        return 2 * dr * dr + 4 * dg * dg + db * db + 6 * (ca - cb) * (ca - cb) + ((ca === 0) !== (cb === 0) ? 8 : 0); };
      let l = counts.map((c) => ({ key: c.key, n: c.n }));
      while (l.length > max) {
        let bi = 0, bj = 1, bc = Infinity;
        for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) { const c = dist(l[i].key, l[j].key) * Math.min(l[i].n, l[j].n); if (c < bc) { bc = c; bi = i; bj = j; } }
        const [keep, drop] = l[bi].n >= l[bj].n ? [bi, bj] : [bj, bi];
        l[keep].n += l[drop].n; l.splice(drop, 1);
      }
      return l.map((c) => c.key);
    }
    return MD.reduceCut(counts, max);
  },
  reduceCut(counts, max) {
    let boxes = [counts.slice()];
    const comps = (k) => [(k >> 6) & 7, (k >> 3) & 7, k & 7];
    while (boxes.length < max) {
      let bi = -1, best = -1, axis = 0;
      boxes.forEach((b, i) => {
        if (b.length < 2) return;
        for (let a = 0; a < 3; a++) {
          const vs = b.map((c) => comps(c.key)[a]);
          const range = Math.max(...vs) - Math.min(...vs);
          if (range > best) { best = range; bi = i; axis = a; }
        }
      });
      if (bi < 0 || best <= 0) break;
      const b = boxes[bi].sort((p, q) => comps(p.key)[axis] - comps(q.key)[axis]);
      const total = b.reduce((s, c) => s + c.n, 0);
      let acc = 0, cut = 1;
      for (let i = 0; i < b.length - 1; i++) { acc += b[i].n; if (acc >= total / 2) { cut = i + 1; break; } }
      boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut));
    }
    return boxes.map((b) => {
      let s = [0, 0, 0], n = 0;
      b.forEach((c) => { const v = comps(c.key); s[0] += v[0] * c.n; s[1] += v[1] * c.n; s[2] += v[2] * c.n; n += c.n; });
      return (Math.round(s[0] / n) << 6) | (Math.round(s[1] / n) << 3) | Math.round(s[2] / n);
    });
  },

  nearest(pal, k) {
    const c = [(k >> 6) & 7, (k >> 3) & 7, k & 7];
    let bi = 0, bd = 1e9;
    pal.forEach((p, i) => {
      const d = (((p >> 6) & 7) - c[0]) ** 2 + (((p >> 3) & 7) - c[1]) ** 2 + ((p & 7) - c[2]) ** 2;
      if (d < bd) { bd = d; bi = i; }
    });
    return bi;
  },

  /* converte ImageData: devolve {pal:[keys], idx:Uint8Array, w, h, colors}
   * transparente = alpha < 128 ou a cor 'transp' (ex.: o fundo magenta/verde de folhas ripadas) */
  convert(img, maxColors = 15, transp = null) {
    const { width: w, height: h, data } = img;
    const idx = new Uint8Array(w * h);
    const map = new Map();
    const tk = transp ? MD.key(...transp) : -1;
    for (let i = 0; i < w * h; i++) {
      const a = data[i * 4 + 3];
      const k = MD.key(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      if (a < 128 || k === tk) continue;
      map.set(k, (map.get(k) || 0) + 1);
    }
    const counts = [...map].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
    const pal = counts.length > maxColors ? MD.reduce(counts, maxColors) : counts.map((c) => c.key);
    const cache = new Map();
    for (let i = 0; i < w * h; i++) {
      const a = data[i * 4 + 3];
      const k = MD.key(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      if (a < 128 || k === tk) { idx[i] = 0; continue; }
      if (!cache.has(k)) cache.set(k, 1 + MD.nearest(pal, k));
      idx[i] = cache.get(k);
    }
    return { pal, idx, w, h, colors: counts.length };
  },

  /* desenha o resultado convertido num canvas novo */
  toCanvas(conv) {
    const c = document.createElement("canvas");
    c.width = conv.w; c.height = conv.h;
    const g = c.getContext("2d");
    const out = g.createImageData(conv.w, conv.h);
    for (let i = 0; i < conv.w * conv.h; i++) {
      const j = conv.idx[i];
      if (!j) continue;
      const [r, gg, b] = MD.rgbOfKey(conv.pal[j - 1]);
      out.data.set([r, gg, b, 255], i * 4);
    }
    g.putImageData(out, 0, 0);
    return c;
  },
};
