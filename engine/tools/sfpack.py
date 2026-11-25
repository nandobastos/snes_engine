#!/usr/bin/env python3
"""Monta o pack da engine (formato SFPK, ver docs/FORMAT_SFPK.md) a partir do projeto JSON.
uso: python3 tools/sfpack.py ../project/game.json res/pack.bin res/pack.asm
- pack.bin: ate 1 MB (32 bancos de 32 KB); o motor le a partir do banco $A0 (arquivo 0x100000 da ROM).
- pack.asm: poe o pack nos bancos 32..63 da ROM (o editor, no navegador, so troca esses bytes na ROM-motor)."""
import json
import struct
import sys

PACK_BANKS = 32
BANK = 0x8000


def build(proj):
    atk = proj["atk_names"]
    n = len(atk)
    fs = proj["fighters"]
    hdr = bytearray(16)
    hdr[0:4] = b"SFPK"
    struct.pack_into("<HHHH", hdr, 4, 1, len(fs), n, 16)          # versao, lutadores, golpes, ofs da tabela de golpes
    body = bytearray()
    tab = 16
    body_start = tab + 2 * len(fs)
    offs = []
    for f in fs:
        offs.append(body_start + len(body))
        m = f["moves"]
        for key in ("dmg", "stun", "hgt", "flags", "hitstop", "snd_swing", "snd_hit"):
            body += bytes(m[a][key] for a in atk)
        for a in atk:
            body += bytes(m[a]["dur"])
    out = bytearray(hdr)
    out += b"".join(struct.pack("<H", o) for o in offs)
    out += body
    assert len(out) <= BANK, "o pack deste passo tem que caber no 1o banco (32 KB)"
    return out


def main():
    proj = json.load(open(sys.argv[1]))
    pk = build(proj)
    pad = bytearray(b"\xff" * (PACK_BANKS * BANK))
    pad[:len(pk)] = pk
    open(sys.argv[2], "wb").write(pad)
    with open(sys.argv[3], "w") as f:
        f.write("; gerado por tools/sfpack.py: o pack nos bancos 32..63 (arquivo 0x100000 da ROM)\n")
        for b in range(PACK_BANKS):
            f.write('.BANK %d SLOT 0\n.ORG $0000\n.SECTION "sfpack_%d" FORCE\n.incbin "res/pack.bin" SKIP %d READ %d\n.ENDS\n' % (32 + b, b, b * BANK, BANK))
    print("pack: %d bytes usados de %d" % (len(pk), len(pad)))


main()
