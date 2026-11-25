#!/usr/bin/env python3
"""Sagat: le a folha (sprites/sagat_sheet.png), as hitboxes (sagat_hit.png, vermelho) e as hurtboxes
(sagat_hurt.png, verde) e monta as animacoes com a MESMA ordem e contagem de quadros das do Ryu (tools/mkfight.py
ANIMS). Assim o jogo usa as mesmas constantes A_* para os dois: o quadro do Sagat e A_* + SAGAT_OFF.
Quadros repetidos (postura, volta do golpe) sao guardados uma vez so (dicionario de IDs: o indice da folha).

Paleta do P2 (Sagat x Sagat): tabela SAGAT_P2 abaixo, em hexadecimal (cor do P1 -> cor do P2).
Veja as caixas numeradas com: python3 tools/mksagat.py  (gera /tmp/sagat_boxes.png)
"""
import collections
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mkassets import SPR  # noqa: E402

SHEET = os.path.join(SPR, "sagat_sheet.png")
HIT = os.path.join(SPR, "sagat_hit.png")      # a mesma folha com as hitboxes (vermelho)
HURT = os.path.join(SPR, "sagat_hurt.png")    # a mesma folha com as hurtboxes (verde)
HIT_COLOR = (255, 0, 0)
HURT_COLOR = (104, 255, 0)

# animacoes do Sagat no lugar das do Ryu (mesmo nome e mesma quantidade de quadros). Numeros = caixas da folha.
SAGAT_ANIMS = {
    "idle": [0, 1, 2, 3],
    "walk": [18, 19, 20, 21, 22],
    "walkb": [24, 25, 26, 27, 28],
    "crouch_in": [43],
    "crouch": [44],
    "jump": [67, 68],
    "fjump": [67, 68, 68, 68, 68, 69],
    "mp": [5, 6, 7],                     # soco fraco
    "hp": [8, 9, 10, 11, 12],            # soco forte
    "hpc": [8, 9, 10, 11, 12],           # (de perto: o mesmo soco forte)
    "mpc": [5, 6, 7],
    "mk": [30, 31, 32, 33, 34],          # chute fraco (quadro 2 = chute esticado)
    "mkc": [30, 31, 32, 33, 34],
    "hk": [37, 38, 39, 40, 41],          # chute medio/forte (quadro 2 = chute esticado)
    "hkc": [38, 39, 40],                 # de perto: joelho e chute (2 golpes)
    "cmp": [45, 46, 47],                 # soco agachado (quadro 1 ativo)
    "chp": [45, 45, 46, 47],             # soco forte agachado (quadro 2 ativo)
    # A folha nao tem chute agachado: a secao "Crouch/Kick" (48, 56, 57, 58, 49) e de quadros no ar (pernas
    # encolhidas, pes soltos). Ate chegarem os sprites certos, os chutes agachados usam esses quadros
    "cmk": [56, 57, 58],                 # chute agachado (quadro 1 ativo)
    "chk": [56, 57, 58, 49, 48],         # rasteira (quadro 1 ativo)
    "jp": [70, 71, 71],
    "jk": [70, 70, 71],
    "jdk": [73, 74, 75],                 # voadora com chute fraco (74 = chute reto)
    "jhk": [56, 57, 58],                 # voadora com chute FORTE: chute diagonal para baixo (57, caixa da folha)
    "hadouken": [51, 52, 53, 53],        # Tiger Shot (em pe): o tiro sai no quadro 2
    "shoryu": [90, 85, 86, 81, 87, 88],  # Tiger Uppercut: sobe (85, 86 = soco no alto) e desce com a cambalhota
                                         # para tras (81 encolhido, 87 girando, 88 de bracos para cima ate o chao)
    "tatsu": [113, 111, 111, 112, 113, 113],  # Tiger Knee: agacha, sobe com a joelhada (111), recolhe e pousa
    "throw": [77, 78, 79, 80, 80],
    "hit_body": [91, 92, 93, 93],
    "thrown": [92, 93, 89, 96],
    "rise": [98, 108],
    "hit_head": [92, 93, 92],
    "hit_crouch": [94, 94],
    "fall": [95, 89, 97],
    "ko": [107],
    "victory": [103, 104, 105, 106],
    "fireball": [54],                    # Tiger Shot (chama)
    "fireball_hit": [63],
    "fireball_fx": [63, 64, 65, 65],
    "block": [50],
    "block_c": [59],
}
FIRE = (54, 55, 63, 64, 65)
LOW_SHOT = [60, 61, 62, 62]                # Tiger Shot baixo (agachado)

# Paleta do P2 (Sagat x Sagat), como o Sagat da "Champion Edition" da folha: pele mais escura e calcao bege.
# cor do P1 (hex) -> cor do P2 (hex). Cores que nao estao aqui ficam iguais.
SAGAT_P2 = {
    # calcao: azul -> bege
    "#000050": "#584020",
    "#000070": "#907040",
    "#2018A0": "#C0A078",
    "#4030E0": "#E8D8B8",
    # pele: mais escura (bronzeada)
    "#402020": "#301000",
    "#503030": "#481800",
    "#805848": "#682818",
    "#A06838": "#883820",
    "#B07848": "#A05030",
    "#E0A068": "#B87050",
    "#F0D098": "#E0A888",
}
HURT_COPY = {70: 68, 71: 68}             # quadros sem hurtbox na folha: usam a de outro quadro parecido
HB_TIP = (74,)                           # sem hitbox na folha: caixa na ponta do chute (o pe mais a frente)


def hexrgb(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def is_line(c):
    r, g, b = c
    return b >= 200 and g < 20 and r < 60          # linhas e titulos da folha (azul puro e o contorno deles)


def pure_blue(c):
    return c[0] == 0 and c[1] == 0                  # textos escritos a mao (o calcao tambem tem esse azul)


def sagat_boxes():
    im = Image.open(SHEET).convert("RGBA")
    W, H = im.size
    px = im.load()

    def solid(x, y):
        r, g, b, a = px[x, y]
        return a >= 128 and not is_line((r, g, b))
    seen = [[False] * W for _ in range(H)]
    comps = []
    for y in range(H):
        for x in range(W):
            if seen[y][x] or not solid(x, y):
                continue
            q = collections.deque([(x, y)])
            seen[y][x] = True
            pts = []
            while q:
                cx, cy = q.popleft()
                pts.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < W and 0 <= ny < H and not seen[ny][nx] and solid(nx, ny):
                            seen[ny][nx] = True
                            q.append((nx, ny))
            if sum(1 for p in pts if pure_blue(px[p][:3])) > 0.7 * len(pts):
                continue                            # texto
            if len(pts) <= 30:
                continue
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            comps.append([[min(xs), min(ys), max(xs) + 1, max(ys) + 1], pts])

    def near(a, c):
        return a[0] < c[2] + 1 and c[0] < a[2] + 1 and a[1] < c[3] + 3 and c[1] < a[3] + 3
    merged = True
    while merged:
        merged = False
        for i in range(len(comps)):
            for j in range(i + 1, len(comps)):
                if near(comps[i][0], comps[j][0]):
                    a, c = comps[i][0], comps[j][0]
                    comps[i][0] = [min(a[0], c[0]), min(a[1], c[1]), max(a[2], c[2]), max(a[3], c[3])]
                    comps[i][1] += comps[j][1]
                    del comps[j]
                    merged = True
                    break
            if merged:
                break
    comps = [c for c in comps if len(c[1]) > 200 or (c[0][3] - c[0][1]) > 14]
    comps.sort(key=lambda c: (c[0][1] + c[0][3]) / 2.0)
    rows, cur = [], []
    for c in comps:
        cy = (c[0][1] + c[0][3]) / 2.0
        if cur and cy - (cur[0][0][1] + cur[0][0][3]) / 2.0 > 40:
            rows.append(cur)
            cur = []
        cur.append(c)
    if cur:
        rows.append(cur)
    comps = [c for r in rows for c in sorted(r, key=lambda c: c[0][0])]
    out = []
    for bb, pts in comps:
        d = {p: px[p][:3] for p in pts}
        # numeros escritos a mao grudados no quadro ("1.", "2."): azul puro fora do corpo
        body = [p for p, c in d.items() if not pure_blue(c)]
        if body:
            x0 = min(p[0] for p in body)
            x1 = max(p[0] for p in body)
            y0 = min(p[1] for p in body)
            y1 = max(p[1] for p in body)
            d = {p: c for p, c in d.items() if not (pure_blue(c) and not (x0 <= p[0] <= x1 and y0 + 6 <= p[1] <= y1))}
        xs = [p[0] for p in d]
        ys = [p[1] for p in d]
        out.append(([min(xs), min(ys), max(xs) + 1, max(ys) + 1], d))
    return im, out


def color_rects(path, color):
    """Caixas desenhadas na copia da folha: pixels da cor que mudaram em relacao a folha limpa."""
    a = Image.open(SHEET).convert("RGBA").load()
    im = Image.open(path).convert("RGBA")
    b = im.load()
    W, H = im.size
    S = set()
    for y in range(H):
        for x in range(W):
            if b[x, y][:3] == color and a[x, y] != b[x, y]:
                S.add((x, y))
    boxes, seen = [], set()
    for p in sorted(S):
        if p in seen:
            continue
        q = collections.deque([p])
        seen.add(p)
        xs, ys = [], []
        while q:
            cx, cy = q.popleft()
            xs.append(cx)
            ys.append(cy)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (cx + dx, cy + dy)
                    if n in S and n not in seen:
                        seen.add(n)
                        q.append(n)
        if max(xs) - min(xs) >= 5 and max(ys) - min(ys) >= 5:
            boxes.append((min(xs), min(ys), max(xs), max(ys)))
    return boxes


def owner_of(out, r):
    """Quadro dono da caixa r: o que ela mais cobre (area em comum com o retangulo do quadro). So se ela nao encostar
    em nenhum quadro vale o centro mais perto (antes era sempre o centro mais perto: a caixa do punho do quadro 85
    do Tiger Uppercut ia para o 86 e aparecia atras do Sagat)."""
    best = None
    for i, (bb, _) in enumerate(out):
        ox = min(r[2] + 1, bb[2]) - max(r[0], bb[0])
        oy = min(r[3] + 1, bb[3]) - max(r[1], bb[1])
        if ox > 0 and oy > 0 and (best is None or ox * oy > best[0]):
            best = (ox * oy, i)
    if best:
        return best[1]
    cx, cy = (r[0] + r[2]) / 2.0, (r[1] + r[3]) / 2.0
    for i, (bb, _) in enumerate(out):
        if bb[0] - 40 <= cx <= bb[2] + 40 and bb[1] - 14 <= cy <= bb[3] + 14:
            d = abs(cx - (bb[0] + bb[2]) / 2.0) + abs(cy - (bb[1] + bb[3]) / 2.0)
            if best is None or d < best[0]:
                best = (d, i)
    return best[1] if best else None


def shorts(c):
    return c[2] > 100 and c[2] > c[0] + 60       # calcao azul (referencia do corpo, como a faixa preta do Ryu)


def prepare(ryu_anims):
    from mkassets import reduce_colors, nearest
    im, boxes = sagat_boxes()
    anims = []
    for name, lst in ryu_anims:
        if name in ("shadow", "spark"):
            anims.append((name, lst))
            continue
        s = SAGAT_ANIMS[name]
        assert len(s) == len(lst), (name, len(s), len(lst))
        anims.append((name, s))
    anims.append(("low_shot", LOW_SHOT))
    need = sorted({b for _, lst in anims for b in lst if b >= 0})
    hit_of, hurt_of = {}, {}
    for r in color_rects(HIT, HIT_COLOR):
        i = owner_of(boxes, r)
        if i is not None:
            hit_of.setdefault(i, []).append(r)
    for r in color_rects(HURT, HURT_COLOR):
        i = owner_of(boxes, r)
        if i is not None:
            if i not in hurt_of or (r[2] - r[0]) * (r[3] - r[1]) > (hurt_of[i][2] - hurt_of[i][0]) * (hurt_of[i][3] - hurt_of[i][1]):
                hurt_of[i] = r
    for a, b in HURT_COPY.items():
        if a not in hurt_of and b in hurt_of:
            r = hurt_of[b]
            ba, bb_ = boxes[a][0], boxes[b][0]
            # mesma caixa, presa ao centro de baixo do quadro
            dx = (ba[0] + ba[2]) // 2 - (bb_[0] + bb_[2]) // 2
            dy = ba[3] - bb_[3]
            hurt_of[a] = (r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy)
    for b in HB_TIP:
        if b not in hit_of:
            pts = boxes[b][1]
            xm = max(x for x, y in pts)
            ys = [y for x, y in pts if x >= xm - 6]
            yc = sum(ys) // len(ys)
            hit_of[b] = [(xm - 22, yc - 8, xm, yc + 8)]
    rect_of, rect2_of = {}, {}
    for bi, lst in hit_of.items():
        lst = [r for r in lst if not any(o is not r and o[0] - 2 <= r[0] and o[1] - 2 <= r[1] and r[2] <= o[2] + 2 and r[3] <= o[3] + 2 for o in lst)]
        lst.sort()
        rect_of[bi] = lst[0]
        if len(lst) > 1:
            rect2_of[bi] = lst[1]
    counts, fc = {}, {}
    for i in need:
        tgt = fc if i in FIRE else counts
        for c in boxes[i][1].values():
            tgt[c] = tgt.get(c, 0) + 1
    keep, remap, _ = reduce_colors(counts, 15)
    keep.sort(key=lambda c: c[0] * 3 + c[1] * 6 + c[2])
    fkeep, fremap, _ = reduce_colors(fc, 15)
    fkeep.sort(key=lambda c: c[0] * 3 + c[1] * 6 + c[2])
    pal1 = [(0, 0, 0)] + keep
    sub = {hexrgb(k): hexrgb(v) for k, v in SAGAT_P2.items()}
    pal2 = [(0, 0, 0)] + [sub.get(c, c) for c in keep]
    pal3 = [(0, 0, 0)] + fkeep

    def pal_of(bi):
        return (fkeep, fremap) if bi in FIRE else (keep, remap)

    def anchor_of(bi, bb, pts, w):
        if bi in FIRE:
            return w // 2
        xs = [x for (x, y), c in pts.items() if shorts(c)]
        if len(xs) < 10:
            xs = [x for (x, y) in pts]
        return int(round(sum(xs) / float(len(xs)) - bb[0]))

    def belt_of(bi, bb, pts):
        if bi in FIRE:
            return 255
        ys = [y - bb[1] for (x, y), c in pts.items() if shorts(c)]
        if len(ys) < 10:
            return 255
        return int(round(sum(ys) / float(len(ys))))

    return dict(anims=anims, boxes=boxes, pal_of=pal_of, anchor_of=anchor_of, belt_of=belt_of, rect_of=rect_of,
                rect2_of=rect2_of, hurt_of=hurt_of, pal1=pal1, pal2=pal2, pal3=pal3, keep=keep)


if __name__ == "__main__":
    im, out = sagat_boxes()
    bg = Image.new("RGBA", im.size, (0, 140, 140, 255))
    bg.alpha_composite(im)
    bg = bg.convert("RGB").resize((im.size[0] * 2, im.size[1] * 2), 0)
    d = ImageDraw.Draw(bg)
    for i, (bb, _) in enumerate(out):
        d.rectangle([bb[0] * 2, bb[1] * 2, bb[2] * 2, bb[3] * 2], outline=(255, 255, 0))
        d.text((bb[0] * 2 + 2, bb[1] * 2 + 2), str(i), fill=(255, 0, 0))
    bg.save("/tmp/sagat_boxes.png")
    print(len(out), "quadros")
