/* SG Engine - importar do SG Pixel: cada tag do arquivo (.sgpx ou .aseprite) vira a animacao de mesmo nome do ator.
 * O quadro chega inteiro (ancora no centro de baixo); duracao vira velocidade e o modo da tag vira a repeticao. */
"use strict";

const PixelImport = (() => {
  function pick(actorId) {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".sgpx,.aseprite,.ase,.json";
    inp.onchange = async () => { const f = inp.files[0]; if (f) { try { await run(P.actors[actorId], f); } catch (e) { alert("Não consegui importar: " + e.message); } } };
    inp.click();
  }
  /* le o arquivo e devolve { w, h, frames:[{d}], tags, rgba: [frame] Uint8ClampedArray } */
  async function read(f) {
    if (/\.(aseprite|ase)$/i.test(f.name)) {
      const a = await ASE.parse(await f.arrayBuffer());
      const rgba = a.frames.map((_, fi) => {
        const out = new Uint8ClampedArray(a.w * a.h * 4);
        a.layers.forEach((L, li) => { if (!L.vis || L.type !== 0) return; const c = a.cels[li][fi]; if (!c) return; for (let i = 0; i < c.length; i += 4) if (c[i + 3] > 127) out.set([c[i], c[i + 1], c[i + 2], 255], i); });
        return out;
      });
      return { w: a.w, h: a.h, frames: a.frames, tags: a.tags, rgba };
    }
    const o = JSON.parse(await f.text());
    if (o.format !== "sgpixel" || o.kind === "map") throw new Error("este arquivo não é um sprite do SG Pixel");
    const un = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
    const cels = o.cels.map((r) => r.map(un)), P3 = o.pal.map((k) => MD.rgbOfKey(k));
    const rgba = o.frames.map((_, fi) => {
      const out = new Uint8ClampedArray(o.w * o.h * 4);
      o.layers.forEach((L, li) => { if (!L.vis) return; const c = cels[li][fi]; for (let i = 0; i < c.length; i++) if (c[i] && P3[c[i]]) out.set([...P3[c[i]], 255], i * 4); });
      return out;
    });
    return { w: o.w, h: o.h, frames: o.frames, tags: o.tags || [], rgba, kind: o.sgengine && o.sgengine.kind };
  }
  async function run(A, f) {
    const d = await read(f);
    if (!d.tags.length) throw new Error("o arquivo não tem tags (crie uma tag por animação, ou use Novo lutador para a SG Engine)");
    const drop = confirm(`Importar ${d.tags.length} animações de "${f.name}" em "${A.name}"?\n\nOK = também apagar as animações de "${A.name}" que não estão no arquivo (ex.: as do exemplo).\nCancelar = manter as outras.`);
    const used = new Map();
    const frameOf = async (fi) => {
      const c = document.createElement("canvas"); c.width = d.w; c.height = d.h;
      c.getContext("2d").putImageData(new ImageData(d.rgba[fi], d.w, d.h), 0, 0);
      const px = d.rgba[fi]; for (let i = 0; i < px.length; i += 4) if (px[i + 3]) { const k = MD.key(px[i], px[i + 1], px[i + 2]); used.set(k, (used.get(k) || 0) + 1); }
      const id = uid("img_"); SRC[id] = c.toDataURL("image/png"); images[id] = { img: c };
      return { img: id, w: d.w, h: d.h, ax: d.w >> 1, ay: d.h - 1 };
    };
    const names = [];
    for (const t of d.tags) {
      const frames = [];
      for (let fi = t.from; fi <= t.to; fi++) frames.push(await frameOf(fi));
      const ms = d.frames.slice(t.from, t.to + 1).reduce((s, x) => s + (x.d || 100), 0) / frames.length;
      let an = A.anims.find((x) => x.name === t.name);
      if (!an) { an = { id: uid("an_"), name: t.name, frames: [] }; A.anims.push(an); }
      const old = an.frames;
      an.frames = frames.map((fr, i) => (old[i] ? { ...fr, hurt: old[i].hurt, hit: old[i].hit, hand: old[i].hand } : fr));   // mantem caixas ja marcadas
      an.speed = Math.max(1, Math.min(60, Math.round(1000 / ms)));
      an.loop = t.loop !== "once"; an.pingpong = t.loop === "pingpong";
      names.push(t.name);
    }
    if (drop) A.anims = A.anims.filter((x) => names.includes(x.name));
    const pal = [...used.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    A.pal = pal.slice(0, 15);
    changed();
    status(`${names.length} animações importadas em "${A.name}"` + (pal.length > 15 ? ` · atenção: ${pal.length} cores (o Mega Drive dá 15; as que sobram viram a mais parecida)` : "") + ". Marque as caixas de corpo e golpe no editor de animações.");
  }
  return { pick };
})();
