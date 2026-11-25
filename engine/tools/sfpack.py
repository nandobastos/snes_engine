#!/usr/bin/env python3
"""Monta o pack da engine (formato SFPK v2, ver docs/FORMAT_SFPK.md) a partir do projeto JSON e das tabelas de quadros.
uso: python3 tools/sfpack.py ../project/game.json res/frames.json res/pack.bin res/pack.asm  (le tambem res/assets.json)
- pack.bin: ate 1,5 MB (48 bancos de 32 KB); o motor le a partir do banco $90 (arquivo 0x80000 da ROM).
- pack.asm: poe o pack nos bancos 16..63 da ROM (o editor, no navegador, so troca esses bytes na ROM-motor).
Banco 0 do pack = cabecalho, golpes/tracos, tabela de blocos de graficos, diretorio das tabelas de quadros e tabela de assets (32 KB);
bancos 1..T = tabelas de quadros; depois um bloco de graficos (ate 28 KB) por banco; depois os assets. (SFPK v3)"""
import json
import os
import struct
import sys

PACK_FIRST = 16     # banco da ROM onde o pack comeca (arquivo 0x80000); o jogo fixo fica nos bancos 0-15
PACK_BANKS = 48     # 1,5 MB de pack
BANK = 0x8000
FAST_BASE = 0x80 + PACK_FIRST     # banco do motor (FastROM) onde o pack comeca ($90)


def build(proj, fr, res_dir):   # traits do lutador (docs/FORMAT_SFPK.md): depois dos golpes
    atk = proj["atk_names"]
    n = len(atk)
    fs = proj["fighters"]
    out = bytearray(32)
    out[0:4] = b"SFPK"
    # golpes
    tab = len(out)
    out += b"\0" * (2 * len(fs))
    offs = []
    for f in fs:
        offs.append(len(out))
        m = f["moves"]
        for key in ("dmg", "stun", "hgt", "flags", "hitstop", "snd_swing", "snd_hit"):
            out += bytes(m[a][key] for a in atk)
        for a in atk:
            out += bytes(m[a]["dur"])
        t = f["traits"]
        bases = fr["fighter_bases"]
        words = [t["moveset"], fr.get("art_bases", {}).get(f["name"], bases[t.get("frames_from", fs.index(f))]), bases[t["fireball_from"]], t["jump_vy"], t["walk_adj"] & 0xFFFF, t["walk_ticks"], t["fb_pal"],
                 t["fb_alt_hi"], t["fb_alt_lo"], fr.get("art_pals", {}).get(f["name"], t["pal_asset"]), t["pal_alt_off"], t["dirswap"], t["fbpal_asset"], t["fbpal_off1"],
                 t["fbpal_off2"], t["fb_sfx"], t["hp_close_hk"], t["walk_pingpong"], t["face_pal"], t["face_pal_alt"], t["gameover_fp"], t["arcade_opp"], t["face_idx"], t["walk_fwd"], t["walk_back"], t["jump_vx"], t["grav_up"], t["grav_dn"],
                 t["fb_spd"], t["fb_dmg"], t["fb_spd_s"], t["fb_dmg_s"], t["fb_spd_ex"], t["fb_dmg_ex"], t["fb_spd_sup"], t["fb_dmg_sup"],
                 t.get("stage_bin", 0), t.get("stage_map", 1), t.get("stage_pal", 2), 0]
        if f["name"] in fr.get("art_stages", {}):   # estagio proprio (.sfstage.json): ids dos 3 assets
            words[36], words[37], words[38] = fr["art_stages"][f["name"]]
        if f["name"] in fr.get("art_bases", {}):    # arte do SF Pixel: troca de cores ao virar so se a arte pedir (mirror_swap)
            words[10], words[11] = 0, 1 if f["name"] in fr.get("art_swap", {}) else 0
        if f["name"] in fr.get("art_faces", {}):     # retrato proprio: rosto 3+j, paleta 3 ou 6 (P2 igual), game over le a paleta 7+j
            j = fr["art_faces"][f["name"]]
            words[18], words[19], words[20], words[22] = (3, 6)[j], (3, 6)[j], 7 + j, 3 + j
        out += b"".join(struct.pack("<H", w) for w in words)      # traits: 40 palavras (ver TRK_* em engine/src/fight.c)
    for i, o in enumerate(offs):
        struct.pack_into("<H", out, tab + 2 * i, o)
    # tabela de blocos de graficos (endereco, banco)
    chunks = [open(os.path.join(res_dir, c), "rb").read() for c in fr["chunks"]]
    # tabelas de quadros: nos bancos 1..T (cada tabela inteira num banco); o diretorio (endereco, banco) fica no banco 0
    arrays = fr["arrays"]
    tabs = []
    for a in arrays:
        d = a["data"]
        b = bytes(v & 255 for v in d) if a["size"] == 1 else b"".join(struct.pack("<H", v) for v in d)
        assert len(b) <= BANK, a["name"]
        tabs.append(b)
    tpos, tplace = BANK, []
    for b in tabs:
        if (tpos % BANK) + len(b) > BANK:
            tpos = (tpos // BANK + 1) * BANK
        tplace.append(tpos)
        tpos += len(b)
        tpos = (tpos + 1) & ~1
    tbanks = tpos // BANK + (1 if tpos % BANK else 0) - 1     # bancos usados pelas tabelas
    gfx0 = 1 + tbanks                                          # primeiro banco dos blocos de graficos
    ofs_ct = len(out)
    for k, c in enumerate(chunks):
        assert len(c) <= BANK
        out += struct.pack("<HBB", 0x8000, FAST_BASE + gfx0 + k, 0)
    while len(out) % 2:
        out += b"\0"
    ofs_dir = len(out)
    for p_ in tplace:
        out += struct.pack("<HH", 0x8000 + (p_ % BANK), FAST_BASE + p_ // BANK)
    # assets (cenario, retratos, HUD, paletas): tabela de (endereco, banco, tamanho) e dados depois dos blocos de graficos, sem cruzar bancos
    assets = json.load(open(os.path.join(res_dir, "assets.json")))
    ofs_as = len(out)
    out += b"\0" * (8 * len(assets))
    assert len(out) <= BANK, "banco 0 do pack passou de 32 KB (%d)" % len(out)
    struct.pack_into("<HHHHHHHH", out, 4, 3, len(fs), n, tab, fr["nframes"], fr["npieces"], len(chunks), ofs_ct)
    struct.pack_into("<HHH", out, 20, ofs_dir, ofs_as, len(assets))
    pack = bytearray(b"\xff" * (PACK_BANKS * BANK))
    pack[:len(out)] = out
    for p_, b in zip(tplace, tabs):
        pack[p_:p_ + len(b)] = b
    for k, c in enumerate(chunks):
        pack[(gfx0 + k) * BANK:(gfx0 + k) * BANK + len(c)] = c
    pos = (gfx0 + len(chunks)) * BANK
    for i, name in enumerate(assets):
        d = open(os.path.join(res_dir, name), "rb").read()
        assert len(d) <= BANK, name
        if (pos % BANK) + len(d) > BANK:
            pos = (pos // BANK + 1) * BANK
        assert pos + len(d) <= PACK_BANKS * BANK, "pack cheio"
        pack[pos:pos + len(d)] = d
        struct.pack_into("<HHHH", pack, ofs_as + 8 * i, 0x8000 + (pos % BANK), FAST_BASE + pos // BANK, len(d), 0)
        pos += len(d)
        pos = (pos + 1) & ~1
    return pack, len(out), len(chunks), pos // BANK + 1


def main():
    proj = json.load(open(sys.argv[1]))
    fr = json.load(open(sys.argv[2]))
    pack, used0, nch, nb = build(proj, fr, os.path.dirname(sys.argv[2]))
    open(sys.argv[3], "wb").write(pack)
    with open(sys.argv[4], "w") as f:
        f.write("; gerado por tools/sfpack.py: o pack nos bancos %d..%d (arquivo 0x%X da ROM)\n" % (PACK_FIRST, PACK_FIRST + PACK_BANKS - 1, PACK_FIRST * BANK))
        for b in range(PACK_BANKS):
            f.write('.BANK %d SLOT 0\n.ORG $0000\n.SECTION "sfpack_%d" FORCE\n.incbin "res/pack.bin" SKIP %d READ %d\n.ENDS\n' % (PACK_FIRST + b, b, b * BANK, BANK))
    print("pack: banco 0 com %d bytes, %d blocos de graficos, %d bancos usados de %d" % (used0, nch, nb, PACK_BANKS))


main()
