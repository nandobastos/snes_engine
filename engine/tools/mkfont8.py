#!/usr/bin/env python3
"""Gera engine/font8.json: a fonte PressStart2P (a mesma das telas) letra por letra, 8x16 (letra 8x8 no meio de uma linha de 16).
O sfpack.py (Python) e o editor/sfbuild.js (navegador) montam os textos das frases de vitoria com esta tabela: saem iguais."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mkassets import fonts  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

F = fonts()["pixel"]
out = {}
for c in range(32, 256):
    ch = chr(c)
    if 127 <= c < 160:
        continue
    try:
        if F.width(ch) != 8:
            continue
    except RuntimeError:
        continue
    im = Image.new("L", (8, 16), 0)
    ImageDraw.Draw(im).text((0, F.yoff), ch, font=F.f, fill=255)
    px = im.load()
    rows = [sum((0x80 >> x) for x in range(8) if px[x, y] >= 128) for y in range(16)]
    if any(rows) or ch == " ":
        out[ch] = rows
json.dump(out, open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "font8.json"), "w"), ensure_ascii=False)
print(len(out), "letras")
