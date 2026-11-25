/* SG Engine (copia do SG Pixel) - leitura de arquivos .aseprite / .ase (formato aberto do Aseprite).
 * Devolve camadas, quadros, tags e os pixels de cada cel em RGBA no tamanho do sprite. */
"use strict";

const ASE = (() => {
  async function inflate(u8) {
    const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function parse(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let p = 0;
    const B = () => dv.getUint8(p++), W = () => { const v = dv.getUint16(p, true); p += 2; return v; }, S = () => { const v = dv.getInt16(p, true); p += 2; return v; };
    const D = () => { const v = dv.getUint32(p, true); p += 4; return v; };
    const STR = () => { const n = W(); const s = new TextDecoder().decode(u8.subarray(p, p + n)); p += n; return s; };
    D(); if (W() !== 0xa5e0) throw new Error("não é um arquivo do Aseprite");
    const nFrames = W(), w = W(), h = W(), depth = W(), flags = D();
    p += 2 + 8; const transp = B(); p += 3; W(); p = 128;
    const layers = [], frames = [], tags = [], pal = [];
    const raw = [];        // raw[frame] = lista de { layer, x, y, w, h, px (bytes no formato do arquivo), link }
    for (let f = 0; f < nFrames; f++) {
      const fStart = p, fSize = D(); W(); const old = W(), dur = W(); p += 2; const nNew = D();
      frames.push({ d: dur || 100 }); raw.push([]);
      const nChunks = nNew || old;
      for (let c = 0; c < nChunks; c++) {
        const cStart = p, cSize = D(), type = W(), end = cStart + cSize;
        if (type === 0x2004) {
          const lf = W(), lt = W(); W(); W(); W(); W(); B(); p += 3; const name = STR();
          layers.push({ name, vis: !!(lf & 1), type: lt });
        } else if (type === 0x2005) {
          const li = W(), x = S(), y = S(); B(); const ct = W(); S(); p += 5;
          if (ct === 0) { const cw = W(), ch = W(); raw[f].push({ layer: li, x, y, w: cw, h: ch, px: u8.slice(p, end) }); }
          else if (ct === 1) raw[f].push({ layer: li, link: W() });
          else if (ct === 2) { const cw = W(), ch = W(); raw[f].push({ layer: li, x, y, w: cw, h: ch, px: await inflate(u8.subarray(p, end)) }); }
        } else if (type === 0x2019) {
          D(); const first = D(), last = D(); p += 8;
          for (let i = first; i <= last; i++) { const fl = W(); pal[i] = [B(), B(), B(), B()]; if (fl & 1) STR(); }
        } else if (type === 0x0004 && !pal.length) {
          const packets = W(); let i = 0;
          for (let k = 0; k < packets; k++) { i += B(); let n = B() || 256; while (n--) pal[i++] = [B(), B(), B(), 255]; }
        } else if (type === 0x2018) {
          const n = W(); p += 8;
          for (let i = 0; i < n; i++) {
            const from = W(), to = W(), dir = B(); W(); p += 6 + 4; const name = STR();
            tags.push({ name, from, to, loop: dir >= 2 ? "pingpong" : "loop" });
          }
        }
        p = end;
      }
      p = fStart + fSize;
    }
    // cels -> RGBA do tamanho do sprite
    const bpp = depth / 8;
    const rgba = (cel) => {
      const out = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < cel.h; y++) for (let x = 0; x < cel.w; x++) {
        const X = cel.x + x, Y = cel.y + y; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const i = (y * cel.w + x) * bpp, o = (Y * w + X) * 4;
        let c;
        if (depth === 32) c = [cel.px[i], cel.px[i + 1], cel.px[i + 2], cel.px[i + 3]];
        else if (depth === 16) c = [cel.px[i], cel.px[i], cel.px[i], cel.px[i + 1]];
        else { const v = cel.px[i]; c = v === transp && !(flags & 0) ? [0, 0, 0, 0] : pal[v] || [0, 0, 0, 0]; }
        out.set(c, o);
      }
      return out;
    };
    const cels = layers.map(() => frames.map(() => null));
    raw.forEach((list, f) => list.forEach((c) => { if (!c.link && c.layer < layers.length) cels[c.layer][f] = rgba(c); }));
    raw.forEach((list, f) => list.forEach((c) => { if (c.link !== undefined && c.layer < layers.length) cels[c.layer][f] = cels[c.layer][c.link]; }));
    return { w, h, layers, frames, tags, cels };
  }
  return { parse };
})();

