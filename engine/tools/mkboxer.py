#!/usr/bin/env python3
"""Boxer: so a animacao de Idle (sprites/boxer_idle.png: 4 quadros lado a lado, fundo transparente).

O jogo exige a mesma ordem/contagem de animacoes do Ryu (tabela de quadros unica), entao todas as animacoes do Boxer
usam os quadros do idle em ciclo (a ROM guarda so os 4 quadros: quadros repetidos nao ocupam espaco, ver mkfight.emit).
Sem hitbox (os golpes nao acertam), hurtbox = o corpo todo. Paleta: 15 cores (as 24 da imagem sao juntadas pelas parecidas);
P2 (mesmo lutador dos dois lados) = troca vermelho <-> azul.
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "sprites", "boxer_folha.png")


def lum(c):
    return c[0] * 3 + c[1] * 6 + c[2]


def swap_pairs(keep):
    """Troca de lado (luvas e faixa do short): cada vermelho vira o azul de mesma luminosidade e vice-versa. Pele, cinzas e contorno
    nao mudam. Devolve a lista de cores trocada, na mesma ordem de 'keep' (a paleta do outro lado)."""
    def red(c):
        return c[0] >= 100 and c[0] > c[1] * 2 and c[0] > c[2] * 1.6

    def blue(c):
        return c[2] > c[0] * 1.6 and c[2] > c[1] * 1.3
    reds = sorted([c for c in keep if red(c)], key=lum)
    blues = sorted([c for c in keep if blue(c)], key=lum)
    m = {}
    for r, b in zip(reds, blues):
        m[r] = b
        m[b] = r
    return [m.get(c, c) for c in keep]


SHEET = os.path.join(ROOT, "sprites", "boxer_folha.png")   # folha unica (DonLee_Spritesheet_teste2.png): quadros em casas de 128 px
# casas (x/128) de cada animacao: idle, LP (jab), HP, LK, HK. O 1o quadro de cada golpe e a guarda parada (nao entra)
# casas da folha (numero do quadro na timeline do Aseprite - 1). Cada golpe so tem os quadros que o artista desenhou (sem a guarda
# do comeco nem a repeticao do idle no fim): o jogo tem uma contagem fixa de quadros por animacao (igual para todos os lutadores),
# entao o ultimo quadro e repetido e o tempo de cada quadro vem da tabela bx_dur (src/fight.c)
IDLE = [0, 1, 2, 3]
# (numero do quadro na timeline do Aseprite - 1). A folha segue as tags: Idle 1-4, LP 6-8, HP 10-14, LK 16-20, HK 22-26, HK Close 29-31, HP C 33-35
# (nao usado), Hit Body 37-40, Fall 41-43, KO 45-46, F_Walk 47-50, Victory 53-56
ANIM_SLOTS = {"walk": [48, 49, 50, 49, 48],          # andar (3 quadros: 49-51); o jogo toca em vai-e-volta (ping-pong) 1 2 3 2 1 2 3 2
              "walkb": [52, 53, 54, 53, 52],         # andar para tras (e o backdash): quadros 53-55
              "block": [46],                         # defesa
              "mp": [5, 6, 7],                       # LP: guarda, esticar (acerto), recolher
              "hp": [9, 10, 11, 12, 13],             # HP (acerto no 3o quadro)
              "mk": [15, 16, 17, 18, 19],            # LK
              "hk": [21, 22, 23, 24, 25],            # HK
              "hkc": [28, 29, 30],                   # HK de perto (o HP de perto tambem usa este)
              "mkc": [15, 16, 17, 18, 19],           # LK de perto = igual ao LK
              "hit_body": [36, 37, 38, 38],          # reacao de dor no corpo (3 quadros desenhados)
              "hit_head": [36, 37, 38],              # dor na cabeca: a mesma (so ha uma arte de dor)
              "hit_crouch": [36, 37],                # dor agachado: a mesma
              "fall": [40, 41, 42],                  # caindo
              "ko": [44],                            # derrotado no chao
              "victory": [56, 57, 58, 59]}
# casas com hitbox (o quadro de acerto de cada golpe)
HIT_SLOTS = [6, 11, 17, 23, 28, 29]
# casas com um desenho solto sobrando (erro na folha): fica so a maior peca
KEEP_LARGEST = set()
ORDER = IDLE + sorted({sl for l in ANIM_SLOTS.values() for sl in l})


def boxes_of(path):
    """quadros da folha: cada casa de 128 px e um quadro (as pecas soltas de uma casa ficam juntas); devolve (imagem, {casa: (caixa, pixels)})"""
    im = Image.open(path).convert("RGBA")
    px = im.load()
    out = {}
    for sl in range(im.size[0] // 128):
        pts = {}
        for y in range(im.size[1]):
            for x in range(sl * 128, sl * 128 + 128):
                if px[x, y][3] > 128:
                    pts[(x, y)] = px[x, y][:3]
        if pts and sl in KEEP_LARGEST:
            import collections
            seen, comps = set(), []
            for pt in list(pts):
                if pt in seen:
                    continue
                q, comp = collections.deque([pt]), []
                seen.add(pt)
                while q:
                    cx, cy = q.popleft()
                    comp.append((cx, cy))
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            n = (cx + dx, cy + dy)
                            if n in pts and n not in seen:
                                seen.add(n)
                                q.append(n)
                comps.append(comp)
            keep = set(max(comps, key=len))
            pts = {k: v for k, v in pts.items() if k in keep}
        if pts:
            xs = [x for x, _ in pts]
            ys = [y for _, y in pts]
            out[sl] = ([min(xs), min(ys), max(xs) + 1, max(ys) + 1], pts)
    return im, out


def boxer_boxes():
    """quadros em ordem (idle, lp, hp, lk, hk): devolve (imagem, lista, quantos do idle). indice de uma casa: ORDER.index(casa)"""
    im, d = boxes_of(SHEET)
    return im, [d[sl] for sl in ORDER], len(IDLE)


def glove_rect(bb, pts):
    """hitbox de um golpe: a luva esticada (vermelha ou azul forte, a que vai mais longe para a frente) com uma folga; sem luva
    esticada (golpe provisorio), a frente do corpo"""
    red = [(x, y) for (x, y), c in pts.items() if c[0] > 200 and c[1] < 90 and c[2] < 90]
    blue = [(x, y) for (x, y), c in pts.items() if c[2] > 140 and c[0] < 110 and c[1] < 110]
    best = max((l for l in (red, blue) if l), key=lambda l: max(x for x, _ in l), default=None)
    if best and max(x for x, _ in best) >= bb[2] - 6:
        return (min(x for x, _ in best) - 2, min(y for _, y in best) - 3, max(x for x, _ in best) + 1, max(y for _, y in best) + 3)
    up = [l for l in (red, blue) if l and min(y for _, y in l) <= bb[1] + 8]    # luva erguida (gancho para cima)
    if up:
        best = up[0]
        return (min(x for x, _ in best) - 3, min(y for _, y in best) - 3, max(x for x, _ in best) + 3, max(y for _, y in best) + 14)
    return (bb[2] - 20, bb[1] + 22, bb[2] + 2, bb[1] + 56)


def prepare(ryu_anims):
    from mkassets import reduce_colors
    im, boxes, ni = boxer_boxes()
    anims = []
    for name, lst in ryu_anims:
        if name in ("shadow", "spark"):
            anims.append((name, lst))
        elif name in ANIM_SLOTS:
            anims.append((name, [ORDER.index(sl) for sl in ANIM_SLOTS[name]]))   # golpes: preparar, esticar (hitbox), recolher / guarda
        else:
            anims.append((name, [i % ni for i in range(len(lst))]))
    counts = {}
    for bb, pts in boxes[:ni]:               # a paleta vem so do idle (15 cores); os golpes (provisorios) usam a cor mais proxima
        for c in pts.values():
            counts[c] = counts.get(c, 0) + 1
    keep, remap, merged = reduce_colors(counts, 15)
    keep.sort(key=lum)
    from mkassets import nearest
    for bb, pts in boxes[ni:]:
        for c in pts.values():
            if c not in remap:
                remap[c] = keep[nearest(c, keep)]
    pal1 = [(0, 0, 0)] + keep
    pal2 = [(0, 0, 0)] + swap_pairs(keep)

    def pal_of(bi):
        return keep, remap

    def anchor_of(bi, bb, pts, w):
        xs = [x for (x, y) in pts if y >= bb[3] - 24]    # pes: meio da parte de baixo
        return int(round(sum(xs) / float(len(xs)) - bb[0]))

    # hurtbox: so o tronco/pernas (32 px em volta da ancora), nao o braco esticado
    hurt_of = {}
    for i, (bb, pts) in enumerate(boxes):
        ax = bb[0] + anchor_of(i, bb, pts, 0)
        hurt_of[i] = (ax - 16, bb[1] + 2, ax + 16, bb[3] - 1)
    rect_of = {}
    for sl in HIT_SLOTS:
        bi = ORDER.index(sl)
        rect_of[bi] = glove_rect(*boxes[bi])

    def belt_of(bi, bb, pts):
        return int((bb[3] - bb[1]) * 55 // 100)

    return dict(anims=anims, boxes=boxes, pal_of=pal_of, anchor_of=anchor_of, belt_of=belt_of, rect_of=rect_of, rect2_of={},
                hurt_of=hurt_of, pal1=pal1, pal2=pal2, keep=keep, merged=merged)


def face():
    """Avatar de teste (56x80): o busto do 1o quadro, espelhado (os retratos olham para a esquerda no arquivo; o jogo vira)."""
    from mkassets import reduce_colors
    im, boxes, ni = boxer_boxes()
    bb, pts = boxes[0]
    w = bb[2] - bb[0]
    crop = Image.new("RGBA", (w, 70), (0, 0, 0, 0))
    for (x, y), c in pts.items():
        if y - bb[1] < 70:
            crop.putpixel((x - bb[0], y - bb[1]), c + (255,))
    crop = crop.resize((56, 80), Image.NEAREST)
    from PIL import ImageOps
    crop = ImageOps.mirror(crop)
    data = list(crop.getdata())
    counts = {}
    for p in data:
        if p[3] >= 128:
            counts[p[:3]] = counts.get(p[:3], 0) + 1
    keep, remap, _ = reduce_colors(counts, 15)
    keep.sort(key=lum)
    idx = [keep.index(remap[p[:3]]) + 1 if p[3] >= 128 else 0 for p in data]
    return idx, [(0, 0, 0)] + keep, [(0, 0, 0)] + swap_pairs(keep)


def art(out=None):
    """sprites/boxer_cores_jogo.png: o Boxer com as cores que o jogo realmente usa (15 cores), para pintar por cima.
    Fundo azul-esverdeado (64,144,160) = transparente; mesma ordem dos quadros das folhas originais."""
    from PIL import ImageDraw, ImageFont
    p = prepare([("idle", [0, 1, 2, 3])] + [(n, [0] * len(l)) for n, l in ANIM_SLOTS.items()])
    keep, remap = p["pal_of"](0)
    im, boxes, ni = boxer_boxes()
    BG = (64, 144, 160)
    font = ImageFont.truetype(os.path.join(ROOT, "tools", "fonts", "Tiny5-latin.woff"), 10)
    rows = [("IDLE (P1, olhando para a direita)", [0], False), ("IDLE (olhando para a esquerda: luvas e faixa trocadas)", [0], True)]
    for nm, sls in ANIM_SLOTS.items():
        rows.append((nm.upper() + " (quadros usados; repetidos so contam uma vez)", [ORDER.index(x) for x in dict.fromkeys(sls)], False))
    W = 8 * 90 + 20
    H = 20 + 14 * 3 + len(rows) * 130 + 10
    sheet = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    d.fontmode = "1"
    # paletas
    d.text((6, 4), "15 cores do jogo (P1):", font=font, fill=(0, 0, 0))
    for i, c in enumerate(keep):
        d.rectangle((140 + i * 14, 4, 140 + i * 14 + 11, 15), fill=c, outline=(0, 0, 0))
    sw = swap_pairs(keep)
    d.text((6, 20), "Lado esquerdo (so vermelho/azul trocam):", font=font, fill=(0, 0, 0))
    for i, c in enumerate(keep):
        d.rectangle((140 + i * 14, 20, 140 + i * 14 + 11, 31), fill=sw[i], outline=(0, 0, 0))
    d.text((6, 36), "Use so estas cores (+ transparente) em cada quadro.", font=font, fill=(0, 0, 0))
    y = 52
    for label, ids, p2 in rows:
        d.text((6, y), label, font=font, fill=(0, 0, 0))
        for k, bi in enumerate(ids):
            bb, pts = boxes[bi]
            base_x = 6 + k * 90
            base_y = y + 14 + 116
            for (x, yy), c in pts.items():
                col = keep[keep.index(remap[c])]
                if p2:
                    col = sw[keep.index(col)]
                sheet.putpixel((base_x + x - bb[0], base_y - (bb[3] - yy)), col)
        y += 130
    out = out or os.path.join(ROOT, "sprites", "boxer_cores_jogo.png")
    sheet.save(out)
    return out


if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    print(art())
