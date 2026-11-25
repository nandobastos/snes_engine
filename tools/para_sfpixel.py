#!/usr/bin/env python3
"""Exporta os lutadores do jogo (quadros ja cortados da engine) para o SF Pixel (.sgpx), com paleta, tags e as caixas
(hitbox, hitbox 2, hurtbox e ancora). Assim da para abrir o Ryu, o Sagat ou o DonLee no SF Pixel, editar e mandar de volta.
uso: python3 tools/para_sfpixel.py            -> project/arte/ryu.sgpx, sagat.sgpx, donlee.sgpx
Precisa dos arquivos gerados em engine/res (python3 engine/tools/mkfight.py)."""
import base64
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "engine", "res")
FX = {"fireball", "fireball_hit", "fireball_fx", "spark", "shadow"}   # efeitos (paleta propria): nao entram no desenho do lutador
PALS = ["ryu.pal", "sagat.pal", "boxer.pal"]
NAMES = ["Ryu", "Sagat", "DonLee"]


def s8(v):
    return v - 256 if v > 127 else v


def decode_piece(gfx, base, k, n):
    """pedaco k (de n) de um quadro: linhas de 8 pedacos; em cada linha, a metade de cima (2 chars por pedaco) e depois a de baixo"""
    r, c = k // 8, k % 8
    nr = min(8, n - r * 8)
    row0 = base + r * 2 * 8 * 64      # linhas anteriores sao cheias (8 pedacos)
    px = [0] * 256
    for half in range(2):
        for side in range(2):
            o = row0 + half * nr * 64 + c * 64 + side * 32
            ch = gfx[o:o + 32]
            for y in range(8):
                p0, p1, p2, p3 = ch[2 * y], ch[2 * y + 1], ch[16 + 2 * y], ch[16 + 2 * y + 1]
                for x in range(8):
                    b = 0x80 >> x
                    v = (1 if p0 & b else 0) | (2 if p1 & b else 0) | (4 if p2 & b else 0) | (8 if p3 & b else 0)
                    px[(half * 8 + y) * 16 + side * 8 + x] = v
    return px


def main():
    fr = json.load(open(os.path.join(RES, "frames.json")))
    A = {a["name"]: a["data"] for a in fr["arrays"]}
    chunks = [open(os.path.join(RES, c), "rb").read() for c in fr["chunks"]]
    layout = [l for l in fr["layout"] if l[0] not in FX]
    os.makedirs(os.path.join(ROOT, "project", "arte"), exist_ok=True)
    for fi, base in enumerate(fr["fighter_bases"]):
        idxs = [base + first + i for _, first, cnt in layout for i in range(cnt)]
        L = max(A["pf_ax"][k] for k in idxs)
        Rr = max(A["pf_w"][k] - A["pf_ax"][k] for k in idxs)
        T = max(A["pf_h"][k] for k in idxs)
        W = ((max(L, Rr) * 2 + 8 + 7) // 8) * 8
        H = ((T + 8 + 7) // 8) * 8
        AX, GY = W // 2, H - 4
        layers = [("Corpo", None), ("Hitbox", "hitbox"), ("Hitbox 2", "hitbox2"), ("Hurtbox", "hurtbox"), ("Âncora", "anchor")]
        cels = [[] for _ in layers]
        frames, tags = [], []
        seen = {}
        for anim, first, cnt in layout:
            # quadros repetidos no fim da animacao (a engine repete o ultimo) nao viram quadros novos
            ks = [base + first + i for i in range(cnt)]
            while len(ks) > 1 and ks[-1] != ks[-2] and all(A[n][ks[-1]] == A[n][ks[-2]] for n in ("pf_chunk", "pf_off", "pf_count")):
                ks.pop()
            t0 = len(frames)
            for k in ks:
                body = bytearray(W * H)
                ax, h, n = A["pf_ax"][k], A["pf_h"][k], A["pf_count"][k]
                ox, oy = AX - ax, GY - h      # canto de cima do quadro no documento
                gfx = chunks[A["pf_chunk"][k]]
                for j in range(n):
                    dx, dy = s8(A["pp_dx"][A["pf_first"][k] + j]), A["pp_dy"][A["pf_first"][k] + j]
                    px = decode_piece(gfx, A["pf_off"][k], j, n)
                    for yy in range(16):
                        for xx in range(16):
                            v = px[yy * 16 + xx]
                            X, Y = AX + dx - 64 + xx, oy + dy + yy
                            if v and 0 <= X < W and 0 <= Y < H:
                                body[Y * W + X] = v
                boxes = []
                for pre in ("pf_hb", "pf_hb2", "pf_hu"):
                    c = bytearray(W * H)
                    if A[pre][k]:
                        x0, x1 = s8(A[pre + "x0"][k]), s8(A[pre + "x1"][k])
                        y0, y1 = A[pre + "y0"][k], A[pre + "y1"][k]
                        for Y in range(GY - y1, GY - y0):
                            for X in range(AX + x0, AX + x1 + 1):
                                if 0 <= X < W and 0 <= Y < H:
                                    c[Y * W + X] = 1
                    boxes.append(c)
                an = bytearray(W * H)
                an[(GY - 1) * W + AX - 1] = an[(GY - 1) * W + AX] = 1
                for li, c in enumerate([body, boxes[0], boxes[1], boxes[2], an]):
                    cels[li].append(base64.b64encode(bytes(c)).decode())
                frames.append({"d": 100})
            tags.append({"name": anim, "from": t0, "to": len(frames) - 1, "loop": "loop" if anim in ("idle", "walk", "walkb", "victory", "tatsu") else "once"})
        raw = open(os.path.join(RES, PALS[fi]), "rb").read()[:32]
        pal = [raw[2 * i] | (raw[2 * i + 1] << 8) for i in range(16)]
        doc = {"format": "sfpixel", "version": 3, "name": NAMES[fi], "w": W, "h": H, "pal": pal, "loop": "loop", "tags": tags,
               "layers": [dict(name=n, vis=True, lock=False, **({"kind": k} if k else {})) for n, k in layers],
               "frames": frames, "cels": cels, "sgengine": None}
        out = os.path.join(ROOT, "project", "arte", NAMES[fi].lower() + ".sgpx")
        json.dump(doc, open(out, "w"))
        print("%s: %d quadros em %d animações, documento %dx%d -> %s" % (NAMES[fi], len(frames), len(tags), W, H, os.path.relpath(out, ROOT)))


main()
