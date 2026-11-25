/* SG Pixel - PNG indexado (o rescomp do SGDK exige imagem com paleta, nao RGBA) */
"use strict";

const PNG = (() => {
  const CRC = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
  function crc(bytes) { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function u32(v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; }
  function chunk(type, data) {
    const t = [...type].map((c) => c.charCodeAt(0));
    const body = new Uint8Array(t.length + data.length); body.set(t); body.set(data, 4);
    return [...u32(data.length), ...body, ...u32(crc(body))];
  }
  async function deflate(raw) {
    const s = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"));   // formato zlib
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  /* idx: indices 0..15 (w*h), pal: 16 cores [r,g,b]; indice 0 = transparente */
  async function indexed(w, h, idx, pal) {
    const raw = new Uint8Array((w + 1) * h);
    for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; raw.set(idx.subarray(y * w, y * w + w), y * (w + 1) + 1); }
    const plte = new Uint8Array(pal.length * 3); pal.forEach((c, i) => plte.set(c, i * 3));
    const bytes = [
      137, 80, 78, 71, 13, 10, 26, 10,
      ...chunk("IHDR", new Uint8Array([...u32(w), ...u32(h), 8, 3, 0, 0, 0])),
      ...chunk("PLTE", plte),
      ...chunk("tRNS", new Uint8Array([0])),
      ...chunk("IDAT", await deflate(raw)),
      ...chunk("IEND", new Uint8Array(0)),
    ];
    return new Blob([new Uint8Array(bytes)], { type: "image/png" });
  }
  return { indexed };
})();

/* .zip sem compressao (os PNG ja vem comprimidos): pasta com os arquivos do Mega Drive */
const ZIP = (() => {
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function store(files) {
    const parts = [], central = []; let ofs = 0;
    const le = (n, v) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (v >>> (8 * i)) & 255; return a; };
    files.forEach((f) => {
      const name = new TextEncoder().encode(f.name), c = crc(f.data), sz = f.data.length;
      const common = [le(2, 20), le(2, 0x800), le(2, 0), le(2, 0), le(2, 0x21), le(4, c), le(4, sz), le(4, sz), le(2, name.length), le(2, 0)];
      parts.push(le(4, 0x04034b50), ...common, name, f.data);
      central.push(le(4, 0x02014b50), le(2, 20), ...common, le(2, 0), le(2, 0), le(2, 0), le(4, 0), le(4, ofs), name);
      ofs += 30 + name.length + sz;
    });
    const cSize = central.reduce((s, a) => s + a.length, 0);
    return new Blob([...parts, ...central, le(4, 0x06054b50), le(2, 0), le(2, 0), le(2, files.length), le(2, files.length), le(4, cSize), le(4, ofs), le(2, 0)], { type: "application/zip" });
  }
  return { store };
})();
