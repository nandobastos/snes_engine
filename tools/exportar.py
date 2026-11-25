#!/usr/bin/env python3
"""Exporta o jogo (.sfc) a partir do projeto, SEM compilar: monta o pack (lutadores, golpes, quadros, arte do SF Pixel, paletas,
cenario...) e troca os bancos do pack na ROM-motor pronta (engine/base.sfc). So precisa de Python 3 + Pillow.
uso: python3 tools/exportar.py [saida.sfc]        (padrao: saida/jogo.sfc)
A ROM-motor e gerada com 'make' em engine/ e copiada para engine/base.sfc (python3 tools/exportar.py --base)."""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENG = os.path.join(ROOT, "engine")
PACK_OFS = 16 * 0x8000          # tools/sfpack.py: PACK_FIRST = 16


def checksum(rom):
    rom[0x7FDC:0x7FE0] = b"\xff\xff\x00\x00"
    s = sum(rom) & 0xFFFF
    rom[0x7FDC:0x7FDE] = (s ^ 0xFFFF).to_bytes(2, "little")
    rom[0x7FDE:0x7FE0] = s.to_bytes(2, "little")


def main():
    if sys.argv[1:] == ["--base"]:
        shutil.copy(os.path.join(ENG, "fight.sfc"), os.path.join(ENG, "base.sfc"))
        print("engine/base.sfc atualizada")
        return
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "saida", "jogo.sfc")
    py = sys.executable
    subprocess.check_call([py, "tools/mkfight.py"], cwd=ENG, stdout=subprocess.DEVNULL)
    subprocess.check_call([py, "tools/sfpack.py", "../project/game.json", "res/frames.json", "res/pack.bin", "res/pack.asm"], cwd=ENG)
    rom = bytearray(open(os.path.join(ENG, "base.sfc"), "rb").read())
    pack = open(os.path.join(ENG, "res", "pack.bin"), "rb").read()
    assert PACK_OFS + len(pack) <= len(rom)
    rom[PACK_OFS:PACK_OFS + len(pack)] = pack
    checksum(rom)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    open(out, "wb").write(rom)
    print("ROM exportada:", out)


main()
