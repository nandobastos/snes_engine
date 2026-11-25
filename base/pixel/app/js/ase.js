/* SG Pixel - leitura de arquivos .aseprite / .ase (formato aberto do Aseprite).
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

/* gravacao de .aseprite: modo indexado (8 bits), indice 0 transparente, paleta com as cores do Mega Drive,
 * camadas, quadros com duracao, cels comprimidos (zlib) e tags. */
const ASEW = (() => {
  async function deflate(u8) {
    const s = new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  class W {
    constructor() { this.a = []; }
    u8(v) { this.a.push(v & 255); } u16(v) { this.u8(v); this.u8(v >> 8); } s16(v) { this.u16(v & 0xffff); }
    u32(v) { this.u16(v & 0xffff); this.u16((v >>> 16) & 0xffff); } zero(n) { for (let i = 0; i < n; i++) this.u8(0); }
    str(s) { const b = new TextEncoder().encode(s); this.u16(b.length); b.forEach((x) => this.u8(x)); }
    bytes(b) { for (let i = 0; i < b.length; i++) this.a.push(b[i]); }
  }
  function chunk(type, body) { const w = new W(); w.u32(6 + body.length); w.u16(type); w.bytes(body); return w.a; }
  /* doc: { w, h, pal:[[r,g,b]], layers:[{name, vis}], frames:[{d}], cels: [layer][frame] Uint8Array(w*h), tags:[{name,from,to,loop}] } */
  async function write(doc) {
    const frames = [];
    for (let f = 0; f < doc.frames.length; f++) {
      const chunks = [];
      if (f === 0) {
        const pw = new W(); pw.u32(doc.pal.length); pw.u32(0); pw.u32(doc.pal.length - 1); pw.zero(8);
        doc.pal.forEach(([r, g, b], i) => { pw.u16(0); pw.u8(r); pw.u8(g); pw.u8(b); pw.u8(i === 0 ? 0 : 255); });
        chunks.push(chunk(0x2019, pw.a));
        doc.layers.forEach((L) => { const lw = new W(); lw.u16((L.vis ? 1 : 0) | 2); lw.u16(0); lw.u16(0); lw.u16(0); lw.u16(0); lw.u16(0); lw.u8(255); lw.zero(3); lw.str(L.name); chunks.push(chunk(0x2004, lw.a)); });
        if (doc.tags.length) {
          const tw = new W(); tw.u16(doc.tags.length); tw.zero(8);
          doc.tags.forEach((t) => { tw.u16(t.from); tw.u16(t.to); tw.u8(t.loop === "pingpong" ? 2 : 0); tw.u16(t.loop === "once" ? 1 : 0); tw.zero(6); tw.u8(217); tw.u8(164); tw.u8(65); tw.u8(0); tw.str(t.name); });
          chunks.push(chunk(0x2018, tw.a));
        }
      }
      for (let l = 0; l < doc.layers.length; l++) {
        const px = doc.cels[l][f];
        // so a area usada da cel (como o Aseprite grava)
        let x0 = doc.w, y0 = doc.h, x1 = -1, y1 = -1;
        for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) if (px[y * doc.w + x]) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
        if (x1 < 0) continue;
        const cw = x1 - x0 + 1, ch = y1 - y0 + 1, raw = new Uint8Array(cw * ch);
        for (let y = 0; y < ch; y++) raw.set(px.subarray((y0 + y) * doc.w + x0, (y0 + y) * doc.w + x0 + cw), y * cw);
        const cwr = new W(); cwr.u16(l); cwr.s16(x0); cwr.s16(y0); cwr.u8(255); cwr.u16(2); cwr.s16(0); cwr.zero(5); cwr.u16(cw); cwr.u16(ch); cwr.bytes(await deflate(raw));
        chunks.push(chunk(0x2005, cwr.a));
      }
      const body = chunks.flat(), fw = new W();
      fw.u32(16 + body.length); fw.u16(0xf1fa); fw.u16(Math.min(chunks.length, 0xffff)); fw.u16(doc.frames[f].d || 100); fw.zero(2); fw.u32(chunks.length);
      frames.push(fw.a.concat(body));
    }
    const data = frames.flat(), h = new W();
    h.u32(128 + data.length); h.u16(0xa5e0); h.u16(doc.frames.length); h.u16(doc.w); h.u16(doc.h); h.u16(8); h.u32(1); h.u16(100); h.u32(0); h.u32(0);
    h.u8(0); h.zero(3); h.u16(doc.pal.length); h.u8(1); h.u8(1); h.s16(0); h.s16(0); h.u16(16); h.u16(16); h.zero(84);
    return new Blob([new Uint8Array(h.a.concat(data))], { type: "application/octet-stream" });
  }
  return { write };
})();
