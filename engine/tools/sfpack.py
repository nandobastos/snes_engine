#!/usr/bin/env python3
"""Monta o pack da engine (formato SFPK v2, ver docs/FORMAT_SFPK.md) a partir do projeto JSON e das tabelas de quadros.
uso: python3 tools/sfpack.py ../project/game.json res/frames.json res/pack.bin res/pack.asm  (le tambem res/assets.json)
- pack.bin: ate 1 MB (32 bancos de 32 KB); o motor le a partir do banco $A0 (arquivo 0x100000 da ROM).
- pack.asm: poe o pack nos bancos 32..63 da ROM (o editor, no navegador, so troca esses bytes na ROM-motor).
Banco 0 do pack = cabecalho, golpes, tabela de blocos de graficos e tabelas de quadros (tem que caber em 32 KB: o motor le sem cruzar bancos);
bancos 1..N = um bloco de graficos (ate 28 KB) cada, comecando no inicio do banco."""
import json
import os
import struct
import sys

PACK_BANKS = 32
BANK = 0x8000
FAST_BASE = 0xA0     # banco do motor (FastROM) onde o pack comeca


def build(proj, fr, res_dir):
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
    for i, o in enumerate(offs):
        struct.pack_into("<H", out, tab + 2 * i, o)
    # tabela de blocos de graficos (endereco, banco)
    chunks = [open(os.path.join(res_dir, c), "rb").read() for c in fr["chunks"]]
    ofs_ct = len(out)
    for k, c in enumerate(chunks):
        assert len(c) <= BANK
        out += struct.pack("<HBB", 0x8000, FAST_BASE + 1 + k, 0)
    # tabelas de quadros
    while len(out) % 2:
        out += b"\0"
    arrays = fr["arrays"]
    ofs_dir = len(out)
    out += b"\0" * (2 * len(arrays))
    for i, a in enumerate(arrays):
        struct.pack_into("<H", out, ofs_dir + 2 * i, len(out))
        d = a["data"]
        out += bytes(v & 255 for v in d) if a["size"] == 1 else b"".join(struct.pack("<H", v) for v in d)
        while len(out) % 2:
            out += b"\0"
    # assets (cenario, retratos, HUD, paletas): tabela de (endereco, banco, tamanho) e dados depois dos blocos de graficos, sem cruzar bancos
    assets = json.load(open(os.path.join(res_dir, "assets.json")))
    ofs_as = len(out)
    out += b"\0" * (8 * len(assets))
    assert len(out) <= BANK, "banco 0 do pack passou de 32 KB (%d)" % len(out)
    struct.pack_into("<HHHHHHHH", out, 4, 2, len(fs), n, tab, fr["nframes"], fr["npieces"], len(chunks), ofs_ct)
    struct.pack_into("<HHH", out, 20, ofs_dir, ofs_as, len(assets))
    pack = bytearray(b"\xff" * (PACK_BANKS * BANK))
    pack[:len(out)] = out
    for k, c in enumerate(chunks):
        pack[(1 + k) * BANK:(1 + k) * BANK + len(c)] = c
    pos = (1 + len(chunks)) * BANK
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
        f.write("; gerado por tools/sfpack.py: o pack nos bancos 32..63 (arquivo 0x100000 da ROM)\n")
        for b in range(PACK_BANKS):
            f.write('.BANK %d SLOT 0\n.ORG $0000\n.SECTION "sfpack_%d" FORCE\n.incbin "res/pack.bin" SKIP %d READ %d\n.ENDS\n' % (32 + b, b, b * BANK, BANK))
    print("pack: banco 0 com %d bytes, %d blocos de graficos, %d bancos usados de %d" % (used0, nch, nb, PACK_BANKS))


main()
