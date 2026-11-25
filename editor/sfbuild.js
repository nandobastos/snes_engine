/* SF Engine: exportador no navegador (sem Python, sem compilar).
 * Pega a ROM-motor (engine/base.sfc) + engine/base.json + project/game.json + os .sffighter.json do SF Pixel e monta a ROM final:
 * o mesmo que tools/exportar.py (engine/tools/mkfight.py + engine/tools/sfpack.py), byte a byte.
 * Uso: SFBuild.build(romBytes, baseJson, gameJson, { "arte.sffighter.json": objeto }) -> Uint8Array (ROM .sfc) */
(function (root) {
  "use strict";
  const BANK = 0x8000, PACK_FIRST = 16, PACK_BANKS = 48, FAST = 0x80 + PACK_FIRST, PACK_OFS = PACK_FIRST * BANK, CHUNK = 0x7000;

  function pyRound(v) {   // round() do Python 3 (meio vai para o par)
    const f = Math.floor(v), d = v - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  }
  function b64dec(s) {
    if (typeof atob === "function") { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
    return new Uint8Array(Buffer.from(s, "base64"));
  }
  function encodeTiles(px, w, h) {   // 4 bpp, chars 8x8 em ordem de linha (engine/tools/mkassets.py encode_tiles)
    const out = [];
    for (let ty = 0; ty < h / 8; ty++) for (let tx = 0; tx < w / 8; tx++) {
      const pl = [0, 1, 2, 3].map(() => new Array(8).fill(0));
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = px[(ty * 8 + y) * w + tx * 8 + x]; for (let p = 0; p < 4; p++) if (v & (1 << p)) pl[p][y] |= 0x80 >> x; }
      for (let pair = 0; pair < 4; pair += 2) for (let y = 0; y < 8; y++) { out.push(pl[pair][y]); out.push(pl[pair + 1][y]); }
    }
    return out;
  }
  function quoteBlock(text, F) {   // frase de vitoria -> bloco do fx_text (= quote_block do engine/tools/sfpack.py)
    const lines = []; let cur = "";
    String(text || "").split(/\s+/).filter(Boolean).forEach((w0) => {
      let w = w0;
      while (w.length > 28) { if (cur) { lines.push(cur); cur = ""; } lines.push(w.slice(0, 28)); w = w.slice(28); }
      if (cur.length + (cur ? 1 : 0) + w.length <= 28) cur = cur ? cur + " " + w : w; else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    const L = lines.slice(0, 4), hdr = [L.length], data = [];
    L.forEach((ln) => {
      const chars = Array.from(ln), tw = chars.length * 8, left = Math.max(0, (256 - tw) >> 1), xt = left >> 3, pad = left & 7, w8 = (pad + tw + 1 + 7) >> 3;
      const rows = []; for (let y = 0; y < 16; y++) rows.push(new Array(w8 + 1).fill(0));
      chars.forEach((ch, i) => { const g = F[ch] || F["?"], x0 = pad + i * 8, b = x0 >> 3, sh = x0 & 7;
        for (let y = 0; y < 16; y++) { rows[y][b] |= g[y] >> sh; rows[y][b + 1] |= (g[y] << (8 - sh)) & 255; } });
      hdr.push(w8, 2, xt, xt * 8 + pad);
      for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < w8; tx++) for (let y = 0; y < 8; y++) data.push(rows[ty * 8 + y][tx]);
    });
    return hdr.concat(data);
  }
  const slugOf = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, (c) => (/[\p{L}\p{N}]/u.test(c) ? c : "_"));

  function build(rom, base, game, arts, stages) {
    stages = stages || {};
    const R = rom, rd16 = (o) => R[o] | (R[o + 1] << 8);
    const H = PACK_OFS, h = (i) => rd16(H + 2 * i);
    const romOff = (addr, bank) => PACK_OFS + (bank - FAST) * BANK + (addr - 0x8000);
    const nf0 = h(6), np0 = h(7), ofsct = h(9), ofsdir = h(10), ofsas = h(11), nas = h(12);
    if (nf0 !== base.nframes || np0 !== base.npieces) throw new Error("engine/base.sfc e engine/base.json não combinam");
    // ---- tabelas, blocos de graficos e assets da ROM-motor
    const A = {};
    base.arrays.forEach(([name, size], k) => {
      const o = romOff(rd16(H + ofsdir + 4 * k), rd16(H + ofsdir + 4 * k + 2)), n = name.startsWith("pp_") ? np0 : nf0, v = [];
      for (let i = 0; i < n; i++) v.push(size === 1 ? R[o + i] : rd16(o + 2 * i));
      A[name] = v;
    });
    const chunks = base.chunk_sizes.map((sz, k) => { const o = romOff(rd16(H + ofsct + 4 * k), R[H + ofsct + 4 * k + 2]); return Array.from(R.subarray(o, o + sz)); });
    const assets = base.assets.slice(), adata = [];
    for (let i = 0; i < base.assets.length; i++) { const e = H + ofsas + 8 * i, o = romOff(rd16(e), rd16(e + 2)); adata.push(Array.from(R.subarray(o, o + rd16(e + 4)))); }
    // ---- lutadores com arte propria (o mesmo bloco do engine/tools/mkfight.py)
    const done = chunks.slice(0, -1);
    let cur = chunks[chunks.length - 1].slice();
    const PF = base.arrays.map((a) => a[0]).filter((n) => n.startsWith("pf_"));
    const frames = [];   // quadros novos: {pf valores, pcs: [[dx, dy]]}
    const fromBase = (k) => { const f = {}; PF.forEach((n) => (f[n] = A[n][k])); f.pcs = []; for (let j = 0; j < A.pf_count[k]; j++) f.pcs.push([A.pp_dx[A.pf_first[k] + j], A.pp_dy[A.pf_first[k] + j]]); return f; };
    const first = {}; base.layout.forEach(([n, f]) => (first[n] = f));
    const artBases = {}, artPals = {}, artFaces = {}, artSwap = {}, artStages = {};
    let total = nf0;
    game.fighters.forEach((F) => {
      if (F.traits.stage) {   // estagio proprio: 3 assets (tiles, mapa, paletas)
        const st = stages[F.traits.stage];
        if (!st) throw new Error("Falta o estágio " + F.traits.stage + " (do lutador " + F.name + ")");
        artStages[F.name] = ["bin", "map", "pal"].map((ext) => { assets.push("stage_" + slugOf(F.name) + "." + ext); adata.push(Array.from(b64dec(st[ext]))); return assets.length - 1; });
      }
      const file = F.traits.art;
      if (!file) return;
      const data = arts[file];
      if (!data) throw new Error("Falta o arquivo de arte " + file + " (do lutador " + F.name + ")");
      const tags = {}; data.tags.forEach((t) => (tags[t.name] = t.frames));
      artBases[F.name] = total;
      base.layout.forEach(([anim, , count]) => {
        const frs = tags[anim], cache = {};
        for (let i = 0; i < count; i++) {
          if (!frs || !frs.length) { frames.push(fromBase(first[anim] + i)); total++; continue; }
          const k = Math.min(i, frs.length - 1);
          if (cache[k]) { frames.push(cache[k]); total++; continue; }
          const af = frs[k], h0 = af.h, dy = af.dy || 0;
          const ax = af.anchor ? pyRound(af.anchor[0]) : Math.floor(af.w / 2);
          const pcs = af.pieces.map((p) => [p.x, p.y + dy, b64dec(p.px)]);
          while (pcs.length > 24) { const cnt = pcs.map((p) => p[2].reduce((s, v) => s + (v ? 1 : 0), 0)); pcs.splice(cnt.indexOf(Math.min(...cnt)), 1); }
          const rows = Math.ceil(pcs.length / 8), sh = 16 * Math.max(1, rows), sheet = new Array(128 * sh).fill(0);
          pcs.forEach(([, , px], ii) => { const ox = (ii % 8) * 16, oy = Math.floor(ii / 8) * 16; for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) sheet[(oy + yy) * 128 + ox + xx] = px[yy * 16 + xx]; });
          const raw = encodeTiles(sheet, 128, sh), out = [];
          for (let r = 0; r < rows; r++) { const n = Math.min(8, pcs.length - r * 8); for (let half = 0; half < 2; half++) { const st = (r * 2 + half) * 16 * 32; for (let q = st; q < st + n * 64; q++) out.push(raw[q]); } }
          if (cur.length + out.length > CHUNK) { done.push(cur); cur = []; }
          const box = (b) => (b ? [b[0] - ax, b[2] - 1 - ax, Math.max(0, h0 - b[3]), h0 - b[1]] : null);
          const hb = box(af.hitbox), hb2 = box(af.hitbox2), hu = box(af.hurtbox);
          const fr = { pf_chunk: done.length, pf_off: cur.length, pf_count: pcs.length, pf_w: af.w, pf_h: h0 + dy, pf_ax: ax, pf_belt: 255,
            pf_hb: hb ? 1 : 0, pf_hbx0: hb ? hb[0] : 0, pf_hbx1: hb ? hb[1] : 0, pf_hby0: hb ? hb[2] : 0, pf_hby1: hb ? hb[3] : 0,
            pf_hu: hu ? 1 : 0, pf_hux0: hu ? hu[0] : 0, pf_hux1: hu ? hu[1] : 0, pf_huy0: hu ? hu[2] : 0, pf_huy1: hu ? hu[3] : 0,
            pf_hb2: hb2 ? 1 : 0, pf_hb2x0: hb2 ? hb2[0] : 0, pf_hb2x1: hb2 ? hb2[1] : 0, pf_hb2y0: hb2 ? hb2[2] : 0, pf_hb2y1: hb2 ? hb2[3] : 0,
            pcs: pcs.map(([x, y]) => [x - ax + 64, y]) };
          out.forEach((v) => cur.push(v));
          cache[k] = fr; frames.push(fr); total++;
        }
      });
      if (data.portrait && Object.keys(artFaces).length < 2) {   // retrato proprio: tiles no face.bin, paleta no face.pal
        const fpx = b64dec(data.portrait.px), fb = adata[assets.indexOf("face.bin")], fp = adata[assets.indexOf("face.pal")];
        encodeTiles(Array.from(fpx), 56, 80).forEach((v) => fb.push(v));
        const fw = (data.pal || []).map((v) => v | 0).concat(new Array(16).fill(0)).slice(0, 16);
        fw.forEach((v, i) => { const x = i ? v : 0; fp.push(x & 255, (x >> 8) & 255); });
        artFaces[F.name] = Object.keys(artFaces).length;
      }
      const pal = (data.pal || []).map((v) => v | 0).concat(new Array(16).fill(0)).slice(0, 16), w = [];
      pal.forEach((v) => w.push(v & 255, (v >> 8) & 255));
      const name = "art_" + slugOf(F.name) + ".pal", sw = (data.mirror_swap || []).filter((q) => q[0] > 0 && q[0] < 16 && q[1] > 0 && q[1] < 16);
      let w2 = w;
      if (sw.length) {   // troca de cores ao virar de lado: 2a paleta com os pares trocados
        const p2 = pal.slice(); sw.forEach(([a, b]) => { p2[a] = pal[b]; p2[b] = pal[a]; });
        w2 = []; p2.forEach((v) => w2.push(v & 255, (v >> 8) & 255)); artSwap[F.name] = 1;
      }
      artPals[F.name] = assets.length; assets.push(name); adata.push(w.concat(w2));
    });
    done.push(cur);
    frames.forEach((f) => { PF.forEach((n) => { if (n !== "pf_first") A[n].push(f[n]); }); A.pf_first.push(A.pp_dx.length); f.pcs.forEach(([x, y]) => { A.pp_dx.push(x); A.pp_dy.push(y); }); });
    // ---- pack (engine/tools/sfpack.py)
    const out = new Array(32).fill(0); [0x53, 0x46, 0x50, 0x4B].forEach((c, i) => (out[i] = c));
    const w16 = (arr, o, v) => { arr[o] = v & 255; arr[o + 1] = (v >> 8) & 255; };
    const p16 = (v) => out.push(v & 255, (v >> 8) & 255);
    const atk = game.atk_names, fs = game.fighters, tab = out.length;
    fs.forEach(() => p16(0));
    const offs = [];
    fs.forEach((f, fi) => {
      offs.push(out.length);
      const m = f.moves;
      ["dmg", "stun", "hgt", "flags", "hitstop", "snd_swing", "snd_hit"].forEach((key) => atk.forEach((a) => out.push(m[a][key] & 255)));
      atk.forEach((a) => m[a].dur.forEach((v) => out.push(v & 255)));
      const t = f.traits, bases = base.fighter_bases;
      const fb = artBases[f.name] !== undefined ? artBases[f.name] : bases[t.frames_from !== undefined ? t.frames_from : fi];
      if (fb === undefined) throw new Error("Lutador " + f.name + ": sem arte e sem frames_from");
      [t.moveset, fb, bases[t.fireball_from], t.jump_vy, t.walk_adj & 0xFFFF, t.walk_ticks, t.fb_pal, t.fb_alt_hi, t.fb_alt_lo,
        artPals[f.name] !== undefined ? artPals[f.name] : t.pal_asset, t.pal_alt_off, t.dirswap, t.fbpal_asset, t.fbpal_off1, t.fbpal_off2, t.fb_sfx,
        t.hp_close_hk, t.walk_pingpong, t.face_pal, t.face_pal_alt, t.gameover_fp, t.arcade_opp, t.face_idx, t.walk_fwd, t.walk_back, t.jump_vx,
        t.grav_up, t.grav_dn, t.fb_spd, t.fb_dmg, t.fb_spd_s, t.fb_dmg_s, t.fb_spd_ex, t.fb_dmg_ex, t.fb_spd_sup, t.fb_dmg_sup, t.stage_bin !== undefined ? t.stage_bin : 0, t.stage_map !== undefined ? t.stage_map : 1, t.stage_pal !== undefined ? t.stage_pal : 2, assets.length + fi].map((v, i, a) => {
        if (artStages[f.name] && i >= 36 && i <= 38) return artStages[f.name][i - 36];
        if (artBases[f.name] !== undefined && (i === 10 || i === 11)) return i === 10 ? 0 : (artSwap[f.name] ? 1 : 0);
        const j = artFaces[f.name];   // retrato proprio: rosto 3+j, paleta 3 ou 6 (P2 igual), game over le a paleta 7+j
        if (j === undefined) return v;
        return i === 18 || i === 19 ? [3, 6][j] : i === 20 ? 7 + j : i === 22 ? 3 + j : v;
      }).forEach(p16);
      const cm = (f.commands || []).slice(0, 5); while (cm.length < 5) cm.push([]);   // comandos dos especiais: 5 x 16 bytes
      cm.forEach((st) => { const row = [st.length]; st.slice().reverse().forEach(([m, v]) => row.push(m & 255, v & 255)); if (row.length > 16) throw new Error("Comando com mais de 7 passos (" + f.name + ")"); while (row.length < 16) row.push(0); row.forEach((b) => out.push(b)); });
    });
    offs.forEach((o, i) => w16(out, tab + 2 * i, o));
    const ofsFl = out.length;   // fluxo das telas do Arcade (= flow_block do sfpack.py)
    { const FT = { vs: 0, fight: 1, victory: 2, continue: 3, ending: 4, next: 5, select: 6, title: 7 }, fl = game.flow, nodes = fl ? fl.nodes : [], ids = {};
      if (nodes.length > 32) throw new Error("Fluxo com mais de 32 telas");
      nodes.forEach((n, i) => (ids[n.id] = i));
      const st = fl && ids[fl.start] !== undefined ? ids[fl.start] : 0, blk = [nodes.length, st];
      nodes.forEach((n) => { const nx = (n.next || [null, null, null]).slice(0, 3); while (nx.length < 3) nx.push(null);
        blk.push(FT[n.type], ...nx.map((x) => (x ? (ids[x] !== undefined ? ids[x] : st) : 0)), (n.param || 0) & 255, 0, 0, 0); });
      while (blk.length < 2 + 32 * 8) blk.push(0);
      blk.forEach((b) => out.push(b)); }
    const gm = game.game || {}, ofsGs = out.length, dv = (v, d) => (v === undefined ? d : v);   // bloco do jogo: HUD e rounds
    [dv(gm.hud_hp_row, 4), dv(gm.hud_win_row, 5), dv(gm.hud_sp_row, 23), dv(gm.rounds_to_win, 2)].forEach(p16);
    const tabs = base.arrays.map(([name, size]) => { const b = []; A[name].forEach((v) => { if (size === 1) b.push(v & 255); else b.push(v & 255, (v >> 8) & 255); }); if (b.length > BANK) throw new Error("tabela grande demais: " + name); return b; });
    let tpos = BANK; const tplace = [];
    tabs.forEach((b) => { if ((tpos % BANK) + b.length > BANK) tpos = (Math.floor(tpos / BANK) + 1) * BANK; tplace.push(tpos); tpos += b.length; tpos = (tpos + 1) & ~1; });
    const tbanks = Math.floor(tpos / BANK) + (tpos % BANK ? 1 : 0) - 1, gfx0 = 1 + tbanks;
    const ofsCt = out.length;
    done.forEach((c, k) => { if (c.length > BANK) throw new Error("bloco grande demais"); p16(0x8000); out.push(FAST + gfx0 + k, 0); });
    while (out.length % 2) out.push(0);
    const ofsDir = out.length;
    tplace.forEach((p) => { p16(0x8000 + (p % BANK)); p16(FAST + Math.floor(p / BANK)); });
    fs.forEach((f, i) => { assets.push("quote_" + i); adata.push(quoteBlock(f.win_quote, base.font8)); });   // frases de vitoria
    const ofsAs = out.length;
    assets.forEach(() => { for (let i = 0; i < 8; i++) out.push(0); });
    if (out.length > BANK) throw new Error("banco 0 do pack passou de 32 KB");
    [3, fs.length, atk.length, tab, A.pf_chunk.length, A.pp_dx.length, done.length, ofsCt].forEach((v, i) => w16(out, 4 + 2 * i, v));
    [ofsDir, ofsAs, assets.length, ofsGs, ofsFl].forEach((v, i) => w16(out, 20 + 2 * i, v));
    const pack = new Uint8Array(PACK_BANKS * BANK).fill(0xFF);
    pack.set(out, 0);
    tplace.forEach((p, i) => pack.set(tabs[i], p));
    done.forEach((c, k) => pack.set(c, (gfx0 + k) * BANK));
    let pos = (gfx0 + done.length) * BANK;
    if (gm.hud_pal) { const hi = assets.indexOf("hud.pal"), n = adata[hi].length >> 1; adata[hi] = []; gm.hud_pal.slice(0, n).forEach((v) => adata[hi].push(v & 255, (v >> 8) & 127)); }
    adata.forEach((d, i) => {
      if (d.length > BANK) throw new Error("asset grande demais: " + assets[i]);
      if ((pos % BANK) + d.length > BANK) pos = (Math.floor(pos / BANK) + 1) * BANK;
      if (pos + d.length > PACK_BANKS * BANK) throw new Error("o pack encheu (1,5 MB)");
      pack.set(d, pos);
      const e = ofsAs + 8 * i; w16(pack, e, 0x8000 + (pos % BANK)); w16(pack, e + 2, FAST + Math.floor(pos / BANK)); w16(pack, e + 4, d.length); w16(pack, e + 6, 0);
      pos += d.length; pos = (pos + 1) & ~1;
    });
    // ---- ROM: troca o pack e refaz o checksum
    const res = new Uint8Array(R);
    res.set(pack, PACK_OFS);
    res[0x7FDC] = 0xFF; res[0x7FDD] = 0xFF; res[0x7FDE] = 0; res[0x7FDF] = 0;
    let s = 0; for (let i = 0; i < res.length; i++) s = (s + res[i]) & 0xFFFF;
    w16(res, 0x7FDC, s ^ 0xFFFF); w16(res, 0x7FDE, s);
    return res;
  }
  root.SFBuild = { build };
  if (typeof module !== "undefined") module.exports = root.SFBuild;
})(typeof window !== "undefined" ? window : globalThis);
