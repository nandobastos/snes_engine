#!/usr/bin/env python3
"""Monta o spritesheet de TODOS os quadros que o jogo usa de cada lutador (Ryu e Sagat), sem hitboxes.

uso: python3 tools/mksheet.py          -> sprites/spritesheet_lutadores.png e sprites/spritesheet_lutadores.md

- Os quadros saem exatamente como entram no jogo: tamanho 1:1 e cores ja reduzidas para a paleta de 15 cores do P1.
- Um bloco por lutador, com bastante espaco entre eles. Dentro do bloco, cada animacao e um grupo (nome e quantidade de
  quadros em cima); os quadros ficam lado a lado, alinhados pelo chao. O tracinho escuro embaixo de cada quadro e a ancora
  (o ponto x que o jogo usa como "meio" do lutador: entre os pes).
- Quadro REPETIDO (a mesma imagem e usada em mais de uma animacao): so aparece uma vez, na primeira animacao em que e usada;
  nas outras entra uma caixinha magenta tracejada com "= NOME #n" (o que ele repete). Desenhe so o original.
- Fundo azul-esverdeado (64,144,160) = transparente (a mesma convencao das folhas antigas).
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
os.chdir(ROOT)
import mkfight  # noqa: E402

BG = (64, 144, 160)
INK = (0, 0, 0)
MAGENTA = (255, 0, 255)
WHITE = (255, 255, 255)
PAGE_W = 1180
GAP = 8             # entre quadros de uma animacao
GGAP = 20           # entre grupos
FIGHTER_GAP = 160   # entre os lutadores
LABEL_H = 12

NAMES = {"ryu": "RYU", "sagat": "SAGAT", "boxer": "DONLEE (BOXER)"}


def font(size):
    return ImageFont.truetype(os.path.join(HERE, "fonts", "Tiny5-latin.woff"), size)


def text(d, xy, t, fill=INK, f=None):
    d.fontmode = "1"
    d.text(xy, t, font=f or font(10), fill=fill)


def tw(t, f=None):
    return int((f or font(10)).getlength(t))


def frame_image(fr, pal4):
    w, h = fr["w"], fr["h"]
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = im.load()
    pal = fr["pal"]
    for i, v in enumerate(fr["idx"]):
        if not v:
            continue
        c = pal[v - 1] if pal else pal4[v]
        px[i % w, i // w] = tuple(c[:3]) + (255,)
    return im


def collect():
    mkfight.DUMP = []
    mkfight.build_ryu()
    D = mkfight.DUMP
    info = [d for d in D if d["char"] == "info"][0]
    out = {}
    for ch in ("ryu", "sagat", "boxer"):
        groups, order, first, count = [], {}, {}, {}
        for d in [d for d in D if d["char"] == ch]:
            a = d["anim"]
            if a not in order:
                order[a] = len(groups)
                groups.append((a, []))
            k = count.get(a, 0) + 1
            count[a] = k
            d["n"] = k
            if d["reuse"]:
                d["ref"] = first[d["box"]]
            else:
                first[d["box"]] = (a, k)
            groups[order[a]][1].append(d)
        out[ch] = groups
    return out, info


def swatches(d, x, y, label, pal, f):
    text(d, (x, y), label, INK, f)
    x0 = x + tw(label, f) + 6
    for i, c in enumerate(pal):
        d.rectangle((x0 + i * 10, y, x0 + i * 10 + 8, y + 8), fill=tuple(c[:3]), outline=INK)
    return x0 + len(pal) * 10


def build_block(ch, groups, info, pal4, notes):
    f = font(10)
    # --- medida dos grupos
    items = []
    for name, frs in groups:
        w = 0
        maxh = 0
        parts = []
        for fr in frs:
            if fr["reuse"]:
                ref = "= %s #%d" % (fr["ref"][0].upper(), fr["ref"][1])
                pw, ph = tw(ref, f) + 8, 22
                parts.append(("reuse", fr, ref, pw, ph))
            else:
                parts.append(("img", fr, None, fr["w"], fr["h"]))
                pw, ph = fr["w"], fr["h"]
            w += pw + GAP
            maxh = max(maxh, ph)
        w -= GAP
        label = "%s (%d)" % (name.upper(), len(frs))
        w = max(w, tw(label, f))
        items.append((label, parts, w, maxh))
    # --- fluxo em linhas
    rows, cur, x, rowh = [], [], 0, 0
    for it in items:
        gh = LABEL_H + it[3] + 14
        if cur and x + it[2] > PAGE_W - 20:
            rows.append((cur, rowh))
            cur, x, rowh = [], 0, 0
        cur.append((x, it))
        x += it[2] + GGAP
        rowh = max(rowh, gh)
    rows.append((cur, rowh))
    header_h = 120
    H = header_h + sum(r[1] + 8 for r in rows) + 10
    im = Image.new("RGB", (PAGE_W, H), BG)
    d = ImageDraw.Draw(im)
    # --- cabecalho
    big = font(10)
    t = NAMES[ch]
    # titulo grande (letras escaladas 3x)
    tmp = Image.new("RGB", (tw(t, big) + 2, 12), INK)
    ImageDraw.Draw(tmp).text((1, 0), t, font=big, fill=WHITE)
    tmp = tmp.resize((tmp.width * 2, tmp.height * 2), Image.NEAREST)
    im.paste(tmp, (14, 8))
    x = 14 + tmp.width + 20
    unique = sum(1 for g in groups for fr in g[1] if not fr["reuse"])
    repeated = sum(1 for g in groups for fr in g[1] if fr["reuse"])
    pieces = sum(fr["pieces"] for g in groups for fr in g[1] if not fr["reuse"])
    text(d, (x, 8), "%d quadros diferentes + %d repetidos | %d pecas 16x16 = %d KB na ROM" % (unique, repeated, pieces, pieces * 128 // 1024), INK, f)
    text(d, (x, 22), "maior quadro: %dx%d px" % (max(fr["w"] for g in groups for fr in g[1] if not fr["reuse"]),
                                                  max(fr["h"] for g in groups for fr in g[1] if not fr["reuse"])), INK, f)
    sw = notes[ch]
    yy = 44
    for label, pal in sw:
        swatches(d, 14, yy, label, pal, f)
        yy += 14
    # legenda das marcas
    lx = 520
    text(d, (lx, 44), "tracinho preto embaixo = ancora x do quadro (meio entre os pes)", INK, f)
    d.rectangle((lx, 60, lx + 40, 82), outline=MAGENTA)
    d.line((lx, 60, lx + 40, 82), fill=MAGENTA)
    text(d, (lx + 48, 64), "= NOME #n : este quadro e REPETIDO (igual ao quadro n de NOME): nao precisa desenhar", INK, f)
    text(d, (lx, 90), "numeros pequenos = ordem do quadro na animacao; cada grupo = uma animacao", INK, f)
    # --- grupos
    y = header_h
    for r, rowh in rows:
        for x, (label, parts, gw, maxh) in r:
            text(d, (x + 10, y), label, INK, f)
            base = y + LABEL_H + maxh
            px = x + 10
            for kind, fr, ref, pw, ph in parts:
                if kind == "img":
                    img = frame_image(fr, pal4)
                    im.paste(img, (px, base - fr["h"]), img)
                    ax = px + fr["ax"]
                    d.line((ax, base + 1, ax, base + 4), fill=INK)
                else:
                    top = base - ph
                    d.rectangle((px, top, px + pw - 1, base - 1), outline=MAGENTA)
                    d.line((px, top, px + pw - 1, base - 1), fill=MAGENTA)
                    d.rectangle((px + 2, top + 5, px + pw - 3, top + ph - 6), fill=BG)
                    text(d, (px + 4, top + 5), ref, INK, f)
                text(d, (px, base + 3), str(fr["n"]), INK, font(8))
                px += pw + GAP
        y += rowh + 8
    return im, groups


def portrait(ch):
    if ch == "boxer":
        import mkboxer
        idx, pal, _ = mkboxer.face()
        im = Image.new("RGBA", (56, 80), (0, 0, 0, 0))
        im.putdata([tuple(pal[v]) + (255,) if v else (0, 0, 0, 0) for v in idx])
    elif ch == "ryu":
        sheet = Image.open(mkfight.FACE_SHEET).convert("RGBA")
        im = sheet.crop(mkfight.FACE_P1)
    else:
        import mksagat
        sheet = Image.open(mksagat.SHEET).convert("RGBA")
        im = sheet.crop(mkfight.SAGAT_FACE)
    out = Image.new("RGBA", im.size, BG + (255,))
    out.paste(im, (0, 0), im)
    return out.convert("RGB")


def main():
    data, info = collect()
    pal4 = info["pal4"]
    notes = {
        "ryu": [("P1 (15 cores):", info["pal1"][1:]), ("P2 (troca de cor):", info["pal2"][1:]),
                ("bola de fogo:", info["pal3"][1:])],
        "sagat": [("P1 (15 cores):", info["spal1"][1:]), ("P2 (troca de cor):", info["spal2"][1:]),
                  ("Tiger Shot:", info["spal3"][1:])],
        "boxer": [("P1 (15 cores):", info["bpal1"][1:]), ("lado esquerdo (vermelho <-> azul trocados):", info["bpal2"][1:])],
    }
    blocks = []
    md = ["# Spritesheet dos lutadores (gerado por tools/mksheet.py)\n"]
    for ch in ("ryu", "sagat", "boxer"):
        im, groups = build_block(ch, data[ch], info, pal4, notes)
        face = portrait(ch)
        blocks.append((im, face, ch))
        md.append("\n## %s\n" % NAMES[ch])
        md.append("| animacao | quadros | tamanhos (px) | repetidos |\n|---|---|---|---|\n")
        for name, frs in groups:
            sizes = ", ".join("%dx%d" % (fr["w"], fr["h"]) if not fr["reuse"] else "=%s#%d" % (fr["ref"][0], fr["ref"][1]) for fr in frs)
            rep = sum(1 for fr in frs if fr["reuse"])
            md.append("| %s | %d | %s | %d |\n" % (name, len(frs), sizes, rep))
    W = PAGE_W
    H = sum(b[0].height + b[1].height + 30 for b in blocks) + FIGHTER_GAP * (len(blocks) - 1) + 20
    sheet = Image.new("RGB", (W, H), BG)
    y = 10
    for i, (im, face, ch) in enumerate(blocks):
        sheet.paste(im, (0, y))
        y += im.height
        d = ImageDraw.Draw(sheet)
        text(d, (14, y + 4), "retrato (tela de selecao / VS), %dx%d" % face.size, INK, font(10))
        sheet.paste(face, (14, y + 18))
        y += face.height + 30
        if i < len(blocks) - 1:
            y += FIGHTER_GAP
    out = os.path.join(ROOT, "sprites", "spritesheet_lutadores.png")
    sheet.crop((0, 0, W, y + 10)).save(out)
    open(os.path.join(ROOT, "sprites", "spritesheet_lutadores.md"), "w").write("".join(md))
    print("spritesheet: %s %dx%d" % (out, W, y + 10))


if __name__ == "__main__":
    main()
