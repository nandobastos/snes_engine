#!/usr/bin/env python3
"""Gera os graficos do jogo de luta no formato do SNES.

Entradas:
  stage.png                  cenario do Ryu (camadas); usa o quadro composto do canto superior esquerdo
  sprites/ryu_sheet.png           folha nova do Ryu (fundo transparente); ryu_sheet_hitboxes.png = a mesma com hitboxes (vermelho) e hurtboxes (verde)
Saidas: res/stage.*, res/face.*, res/fight.asm, res/fight.h (incluidos por data.asm / src/fight.c)
"""
import os
import sys

from PIL import Image, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mkassets import RES, SPR, ROOT, pixels, write_pal, encode_tiles, nearest, bgr555  # noqa: E402

SHEET = os.path.join(SPR, "ryu_sheet.png")                  # folha nova do Ryu (limpa, fundo transparente)
HB_SHEET = os.path.join(SPR, "ryu_sheet_hitboxes.png")      # a mesma folha com hitboxes (vermelho) e hurtboxes (verde)
FACE_SHEET = os.path.join(SPR, "Player_1_clean.png")        # folha antiga: so os retratos
TEAL = (64, 144, 160)           # cor de fundo da folha = transparente
STAGE_FILE = os.path.join(ROOT, "stage.png")
STAGE_CROP = (136, 8, 392, 224)  # 256 px centrais do cenario (chao de 512 px, ceu de 416)
STAGE_PALS = 6                   # paletas de BG 2..7 (15 cores cada)
FACE_P1 = (788, 10, 844, 90)     # retrato (paleta vermelha, olha para a esquerda)
FACE_P2 = (635, 10, 691, 90)     # retrato azul (espelhado em relacao ao vermelho)
SAGAT_FACE = (649, 686, 705, 766)  # retrato do Sagat na folha dele (56x80)

DUMP = None                      # tools/mksheet.py liga isto: lista com cada quadro emitido (para montar o spritesheet)
dump_char = ["ryu"]
outputs = {}                     # nome -> (arquivo .bin, rotulo) para o data.asm
defines = []                     # linhas do res/fight.h


def save_bin(name, data):
    open(os.path.join(RES, name), "wb").write(bytes(data))


def pal_words(colors, count=16):
    out = bytearray()
    for i in range(count):
        c = bgr555(colors[i]) if i < len(colors) else 0
        out += bytes((c & 0xFF, c >> 8))
    return out


# ================================================================ cenario (BG1, tiles 8x8 com paleta por tile)
def build_stage():
    src = Image.open(STAGE_FILE).convert("RGB").crop(STAGE_CROP)
    canvas = Image.new("RGB", (256, 224), (0, 0, 0))
    canvas.paste(src, (0, 224 - src.height))
    px = pixels(canvas)
    tiles = []
    for ty in range(28):
        for tx in range(32):
            tiles.append([px[(ty * 8 + y) * 256 + tx * 8 + x] for y in range(8) for x in range(8)])

    def dist(a, b):
        return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

    def make_pal(tile_ids):
        pl = []
        for i in tile_ids:
            pl += tiles[i]
        if not pl:
            return [(0, 0, 0)]
        im = Image.new("RGB", (len(pl), 1))
        im.putdata(pl)
        qi = im.quantize(colors=15, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        raw = qi.getpalette()[:45]
        used = sorted(set(pixels(qi)) if not hasattr(qi, "get_flattened_data") else set(qi.get_flattened_data()))
        return [tuple(raw[u * 3:u * 3 + 3]) for u in used]

    def tile_err(i, pl):
        cache = {}
        e = 0
        for c in tiles[i]:
            d = cache.get(c)
            if d is None:
                d = cache[c] = min(dist(c, k) for k in pl)
            e += d
        return e

    # k-means: paletas e atribuicao de tiles se refinam juntas
    mean = [tuple(sum(c[k] for c in t) // 64 for k in range(3)) for t in tiles]
    order = sorted(range(len(tiles)), key=lambda i: sum(mean[i]) * 7 + mean[i][0] * 3)
    tile_pal = [0] * len(tiles)
    for r, i in enumerate(order):
        tile_pal[i] = r * STAGE_PALS // len(tiles)
    pals = [[] for _ in range(STAGE_PALS)]
    for it in range(6):
        pals = [make_pal([i for i in range(len(tiles)) if tile_pal[i] == p]) for p in range(STAGE_PALS)]
        changed = 0
        for i in range(len(tiles)):
            best = min(range(STAGE_PALS), key=lambda p: tile_err(i, pals[p]))
            if best != tile_pal[i]:
                tile_pal[i] = best
                changed += 1
        if not changed:
            break
    pals = [make_pal([i for i in range(len(tiles)) if tile_pal[i] == p]) for p in range(STAGE_PALS)]
    remapped = 0
    # indices por tile e remoção de repetidos (com espelho horizontal/vertical)
    uniq = {}
    gfx = []
    cells = []
    for i, t in enumerate(tiles):
        p = tile_pal[i]
        pl = pals[p]
        idx = [(pl.index(c) if c in pl else nearest(c, pl)) + 1 for c in t]

        def key(v):
            return (p, tuple(v))
        variants = [(idx, 0)]
        h = [idx[y * 8 + 7 - x] for y in range(8) for x in range(8)]
        v = [idx[(7 - y) * 8 + x] for y in range(8) for x in range(8)]
        hv = [h[(7 - y) * 8 + x] for y in range(8) for x in range(8)]
        variants += [(h, 0x4000), (v, 0x8000), (hv, 0xC000)]
        found = None
        for vi, flip in variants:
            if key(vi) in uniq:
                found = (uniq[key(vi)], flip)
                break
        if not found:
            uniq[key(idx)] = len(gfx)
            gfx.append(idx)
            found = (len(gfx) - 1, 0)
        n, flip = found
        cells.append(n | ((p + 2) << 10) | flip)
    # tilemap 32x32 (as 4 ultimas linhas ficam vazias)
    cells += [0] * (32 * 32 - len(cells))
    raw = bytearray()
    for n_idx in gfx:
        raw += encode_tiles(n_idx, 8, 8, 4)
    save_bin("stage.bin", raw)
    save_bin("stage.map", b"".join(bytes((c & 255, c >> 8)) for c in cells))
    allp = bytearray()
    for p in range(STAGE_PALS):
        allp += pal_words([(0, 0, 0)] + pals[p])
    save_bin("stage.pal", allp)
    outputs["stage"] = ["stage.bin", "stage.map", "stage.pal"]
    defines.append("#define STAGE_TILES %d" % len(gfx))
    # reconstrucao para conferir a olho
    rec = Image.new("RGB", (256, 224))
    for i, c in enumerate(cells[:32 * 28]):
        n, p, fl = c & 0x3FF, ((c >> 10) & 7) - 2, c & 0xC000
        pl = pals[p]
        for y in range(8):
            for x in range(8):
                xx = 7 - x if fl & 0x4000 else x
                yy = 7 - y if fl & 0x8000 else y
                v = gfx[n][yy * 8 + xx]
                rec.putpixel(((i % 32) * 8 + x, (i // 32) * 8 + y), pl[v - 1] if v - 1 < len(pl) else (255, 0, 255))
    rec.save(os.path.join(os.environ.get("MKFIGHT_DEBUG", "/tmp"), "stage_rec.png"))
    return len(gfx), remapped


# ================================================================ retratos (BG, 56x80 = 7x10 tiles)
def build_faces():
    sheet = Image.open(FACE_SHEET).convert("RGBA")
    red = sheet.crop(FACE_P1)
    blue = ImageOps.mirror(sheet.crop(FACE_P2))   # espelhado: mesmo desenho do vermelho
    # cores do retrato vermelho (opacas); pixels transparentes/azul-esverdeados = indice 0
    def opaque(p):
        return p[3] >= 128 and p[:3] != TEAL
    rp, bp = pixels(red), pixels(blue)
    counts = {}
    for p in rp:
        if opaque(p):
            counts[p[:3]] = counts.get(p[:3], 0) + 1
    from mkassets import reduce_colors
    keep, remap, merged = reduce_colors(counts, 15)
    keep.sort(key=lambda c: c[0] * 3 + c[1] * 6 + c[2])
    idx = [keep.index(remap[p[:3]]) + 1 if opaque(p) else 0 for p in rp]
    # paleta azul: para cada indice, a cor mais comum nos pixels equivalentes do retrato azul
    votes = [dict() for _ in range(len(keep) + 1)]
    for i, p in zip(idx, bp):
        if i and opaque(p):
            votes[i][p[:3]] = votes[i].get(p[:3], 0) + 1
    pal1 = [(0, 0, 0)] + keep
    pal2 = [(0, 0, 0)] + [max(votes[i], key=votes[i].get) if votes[i] else keep[i - 1] for i in range(1, len(keep) + 1)]
    # cinza (desabilitado): luminosidade, mais escuro
    pal3 = [(0, 0, 0)] + [(g, g, g) for g in
                          ((c[0] * 30 + c[1] * 59 + c[2] * 11) // 100 * 3 // 5 for c in keep)]
    # Sagat: retrato da folha dele (quadro do rosto), tiles logo depois dos do Ryu; paletas 5 (P1) e 6 (P2)
    import mksagat
    # so os pixels do quadro do retrato (sem as linhas e titulos da folha em volta), espelhado: olha como o Ryu
    _, sbx = mksagat.sagat_boxes()
    face_pts = next(d for bb, d in sbx if bb[0] <= SAGAT_FACE[0] + 8 and bb[1] >= SAGAT_FACE[1] and bb[2] >= SAGAT_FACE[2] - 8 and bb[3] - bb[1] > 70)
    sim = Image.new("RGBA", (SAGAT_FACE[2] - SAGAT_FACE[0], SAGAT_FACE[3] - SAGAT_FACE[1]), (0, 0, 0, 0))
    for (x, y), c in face_pts.items():
        if SAGAT_FACE[0] <= x < SAGAT_FACE[2] and SAGAT_FACE[1] <= y < SAGAT_FACE[3]:
            sim.putpixel((x - SAGAT_FACE[0], y - SAGAT_FACE[1]), c + (255,))
    sim = ImageOps.mirror(sim)
    sp = pixels(sim)

    def sopaque(p):
        return p[3] >= 128 and not mksagat.is_line(p[:3])
    sc = {}
    for p in sp:
        if sopaque(p):
            sc[p[:3]] = sc.get(p[:3], 0) + 1
    skeep, sremap, _ = reduce_colors(sc, 15)
    skeep.sort(key=lambda c: c[0] * 3 + c[1] * 6 + c[2])
    sidx = [skeep.index(sremap[p[:3]]) + 1 if sopaque(p) else 0 for p in sp]
    keys = [(mksagat.hexrgb(k), mksagat.hexrgb(v)) for k, v in mksagat.SAGAT_P2.items()]

    def alt(c):
        k, v = min(keys, key=lambda kv: sum((a - b) ** 2 for a, b in zip(kv[0], c)))
        if sum((a - b) ** 2 for a, b in zip(k, c)) > 40 * 40 * 3:
            return c
        return tuple(max(0, min(255, v[j] + c[j] - k[j])) for j in range(3))
    spal1 = [(0, 0, 0)] + skeep
    spal2 = [(0, 0, 0)] + [alt(c) for c in skeep]
    import mkboxer
    bidx, bpal1, bpal2 = mkboxer.face()    # Boxer: avatar de teste; paletas 7 (P1) e 1 (P2, so nas telas de selecao/VS)
    save_bin("face.bin", encode_tiles(idx, 56, 80, 4) + encode_tiles(sidx, 56, 80, 4) + encode_tiles(bidx, 56, 80, 4))
    save_bin("face.pal", pal_words(pal1) + pal_words(pal2) + pal_words(pal3) + pal_words(spal1) + pal_words(spal2)
             + pal_words(bpal1) + pal_words(bpal2))
    outputs["face"] = ["face.bin", "face.pal"]
    defines.append("#define FACE_W 7\n#define FACE_H 10")
    return merged


# ================================================================ Ryu (sprites 16x16 montados por pedacos)
ANIMS = [          # indices dos quadros na folha (veja o contato: python3 tools/mkfight.py --contato)
    ("idle", [0, 1, 2, 3]),
    ("walk", [4, 5, 6, 7, 8]),
    ("walkb", [8, 7, 6, 5, 4]),                     # andar para tras: a folha atual nao tem; provisorio = ciclo ao contrario
    ("crouch_in", [9]),
    ("crouch", [10]),
    ("jump", [70, 71]),
    ("fjump", [72, 73, 74, 75, 76, 77]),
    ("mp", [16, 17, 18]),                           # Light Punch = nosso medio
    ("hp", [19, 20, 21, 22, 23]),                   # Medium/Heavy Punch
    ("hpc", [24, 25, 26, 27, 28]),                  # Close Heavy Punch
    ("mpc", [31, 32, 33]),                          # Close Light Punch
    ("mk", [39, 40, 41, 42, 43]),                   # Light/Medium Kick
    ("mkc", [34, 35, 36, 37, 38]),                  # Close Light Kick
    ("hk", [47, 48, 49, 50, 51]),                   # Heavy Kick
    ("hkc", [44, 45, 46]),                          # Close Heavy Kick
    ("cmp", [52, 53, 54]),                          # Crouching Light/Medium Punch
    ("chp", [55, 56, 57, 58]),                      # Crouching Heavy Punch
    ("cmk", [62, 63, 64]),                          # Crouching Medium Kick
    ("chk", [65, 66, 67, 68, 69]),                  # Crouching Heavy Kick
    ("jp", [78, 79, 80]),
    ("jk", [81, 82, 83]),
    ("jdk", [85, 86, 87]),
    ("jhk", [85, 86, 87]),                          # chute forte no ar: o Ryu usa a mesma voadora (o Sagat tem outra)
    ("hadouken", [88, 89, 90, 91]),
    ("shoryu", [98, 99, 100, 101, 92, 102]),
    ("tatsu", [103, 104, 105, 106, 107, 108]),
    ("throw", [109, 110, 111, 112, 113]),
    ("hit_body", [114, 115, 116, 117]),
    ("thrown", [116, 117, 128, 130]),               # vitima do agarrao: presa, levantada, deitada no ar, de cabeca para baixo
    ("rise", [129, 131]),                           # levantar depois do agarrao: de ponta-cabeca e agachado
    ("hit_head", [118, 119, 120]),
    ("hit_crouch", [121, 122]),
    ("fall", [125, 126, 127]),
    ("ko", [139]),
    ("victory", [132, 133, 134, 135]),
    ("fireball", [93]),
    ("fireball_hit", [96]),
    ("fireball_fx", [96, 94, 95, 97]),   # a bola se desfazendo: explosao, circulo branco e as lascas azuis
    ("shadow", [-1, -2]),
]
RYU_PAL_COLORS = 15
CHUNK = 0x7000                 # tamanho maximo de cada bloco de graficos na ROM (<= 32 KB, com folga)


BG_COLOR = (0, 0, 0)            # fundo opaco da folha nova (alem do transparente)
HIT_COLOR = (255, 0, 0)         # folha de hitboxes: linhas vermelhas = hitbox (ataque)
HURT_COLOR = (32, 255, 0)       # linhas verdes = hurtbox (area vulneravel)


def sheet_and_rects(sheet_path=None, hb_path=None):
    """Le a folha de sprites (limpa) e a folha com as caixas por cima. As caixas sao achadas pela diferenca entre as
    duas: grupos de linhas vermelhas (hitbox) e verdes (hurtbox). Devolve (imagem RGBA, hits, hurts), cada caixa
    (x0, y0, x1, y1) com x1/y1 inclusivos."""
    import collections
    im = Image.open(sheet_path or SHEET).convert("RGBA")
    hb = Image.open(hb_path or HB_SHEET).convert("RGBA") if (hb_path or not sheet_path) else im
    W, H = im.size
    a, b = im.load(), hb.load()
    pts = {HIT_COLOR: set(), HURT_COLOR: set()}
    for y in range(H):
        for x in range(W):
            c = b[x, y][:3]
            if c in pts and a[x, y] != b[x, y]:
                pts[c].add((x, y))
    out = {}
    for col, S in pts.items():
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
        out[col] = boxes
    return im, out[HIT_COLOR], out[HURT_COLOR]


def find_boxes(sheet_path=None, hb_path=None):
    """Acha os quadros da folha: componentes conectados que nao sao fundo/legenda, juntando as partes de um mesmo
    quadro. Devolve [(bbox, {(x,y): (r,g,b)})], as hitboxes {quadro: [ate 2 caixas]} e as hurtboxes {quadro: caixa}."""
    import collections
    im, hits, hurts = sheet_and_rects(sheet_path, hb_path)
    W, H = im.size
    px = im.load()

    def solid(x, y):
        r, g, b, a = px[x, y]
        if a < 128 or (r, g, b) == BG_COLOR:
            return False
        if r > 200 and g > 180 and b < 80:    # linhas separadoras e legendas amarelas
            return False
        if (r, g, b) in SHADOW_COLORS:        # sombras ligam quadros vizinhos: entram depois, no quadro mais proximo
            return False
        return True
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
            if len(pts) <= 40:
                continue
            x0 = min(p[0] for p in pts)
            x1 = max(p[0] for p in pts) + 1
            y0 = min(p[1] for p in pts)
            y1 = max(p[1] for p in pts) + 1
            if (y1 - y0) <= 14 and len(pts) < 900:   # legendas e sombras soltas
                continue
            comps.append([[x0, y0, x1, y1], pts])

    def near(a, c):
        return a[0] < c[2] + 1 and c[0] < a[2] + 1 and a[1] < c[3] + 6 and c[1] < a[3] + 6
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
    # linhas da folha: agrupa pelo centro y e ordena por x dentro de cada linha
    comps.sort(key=lambda c: (c[0][1] + c[0][3]) / 2.0)
    rows, cur = [], []
    for c in comps:
        cy = (c[0][1] + c[0][3]) / 2.0
        if cur and cy - (cur[0][0][1] + cur[0][0][3]) / 2.0 > 55:
            rows.append(cur)
            cur = []
        cur.append(c)
    if cur:
        rows.append(cur)
    comps = [c for r in rows for c in sorted(r, key=lambda c: c[0][0])]
    out = [(bb, {p: px[p][:3] for p in pts}) for bb, pts in comps]
    # sombras: cada pixel vai para o quadro cujo centro x esta mais perto (e que termina logo acima da sombra)
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a < 128 or (r, g, b) not in SHADOW_COLORS:
                continue
            best = None
            for i, (bb, pts) in enumerate(out):
                if bb[0] - 3 <= x <= bb[2] + 3 and bb[3] - 14 <= y <= bb[3] + 14:
                    d = abs(x - (bb[0] + bb[2]) / 2.0) + abs(y - bb[3])
                    if best is None or d < best[0]:
                        best = (d, i)
            if best:
                bb, pts = out[best[1]]
                pts[(x, y)] = (r, g, b)
                bb[1] = min(bb[1], y)
                bb[3] = max(bb[3], y + 1)
                bb[0] = min(bb[0], x)
                bb[2] = max(bb[2], x + 1)

    def owner(r):
        cx, cy = (r[0] + r[2]) / 2.0, (r[1] + r[3]) / 2.0
        best = None
        for i, (bb, _) in enumerate(out):
            if bb[0] - 40 <= cx <= bb[2] + 40 and bb[1] - 14 <= cy <= bb[3] + 14:
                d = abs(cx - (bb[0] + bb[2]) / 2.0) + abs(cy - (bb[1] + bb[3]) / 2.0)
                if best is None or d < best[0]:
                    best = (d, i)
        return best[1] if best else None
    hit_of, hurt_of = {}, {}
    for r in hits:
        i = owner(r)
        if i is not None:
            hit_of.setdefault(i, []).append(r)
    for r in hurts:
        i = owner(r)
        if i is not None:
            # a hurtbox do quadro e a que contem o centro do corpo: fica com a maior se houver mais de uma
            if i not in hurt_of or (r[2] - r[0]) * (r[3] - r[1]) > (hurt_of[i][2] - hurt_of[i][0]) * (hurt_of[i][3] - hurt_of[i][1]):
                hurt_of[i] = r
    return out, hit_of, hurt_of


def is_fireball_blue(c):
    return c[2] > c[0] + 48 and c[2] > 150


def cut_pieces(idx, w, h):
    """Cobre os pixels visiveis com pedacos 16x16 (faixas de 16 px a partir do topo)."""
    def at(x, y):
        return idx[y * w + x] if 0 <= x < w and 0 <= y < h else 0
    pieces = []
    y = 0
    while y < h:
        x = 0
        while x < w:
            if any(at(x, yy) for yy in range(y, min(h, y + 16))):
                pieces.append((x, y))
                x += 16
            else:
                x += 1
        y += 16
    return pieces, at


SHADOW_COLORS = ((96, 96, 88), (88, 56, 16))   # cor da sombra desenhada embaixo do Ryu na folha (cinza; marrom na defesa)


def strip_shadow(bb, pts):
    """Tira a sombra do quadro (a sombra e um objeto a parte, que fica no chao) e devolve o centro da sombra:
    e a ancora x do lutador (entre os pes). Quadros no ar nao tem sombra: devolve None."""
    ybot = bb[3]
    last = [x for (x, y), c in pts.items() if y >= ybot - 3 and c in SHADOW_COLORS]
    if len(last) < 14:
        return bb, pts, None
    cx = (min(last) + max(last)) / 2.0
    pts2 = {p: c for p, c in pts.items() if not (p[1] >= ybot - 9 and c in SHADOW_COLORS)}
    bb2 = [min(x for x, _ in pts2), min(y for _, y in pts2), max(x for x, _ in pts2) + 1, max(y for _, y in pts2) + 1]
    return bb2, pts2, int(round(cx - bb2[0]))


NEW_ANIMS = [
    ("block", [142]),
    ("block_c", [141]),
    ("spark", [-3, -4, -5]),
]
SPARK_PAL = {2: (255, 255, 255), 3: (120, 210, 255)}


def spark_pixels(n):
    """Faisca de defesa: 3 quadros 16x16 (pequena, grande, desaparecendo). Valores: 2 = branco, 3 = azul claro."""
    px = [0] * 256
    c = 7.5
    for y in range(16):
        for x in range(16):
            dx, dy = x - c, y - c
            ax_, ay = abs(dx), abs(dy)
            v = 0
            if n == 0:
                if (ax_ <= 0.6 and ay <= 4.5) or (ay <= 0.6 and ax_ <= 4.5):
                    v = 3
                if ax_ <= 1.2 and ay <= 1.2:
                    v = 2
            elif n == 1:
                if (ax_ <= 1.1 and ay <= 7.5) or (ay <= 1.1 and ax_ <= 7.5):
                    v = 3
                if abs(abs(dx) - abs(dy)) <= 0.9 and ax_ <= 5.5:
                    v = 3
                if ax_ <= 2.2 and ay <= 2.2:
                    v = 2
            else:
                for (px_, py_) in ((5, 0), (-5, 0), (0, 5), (0, -5), (4, 4), (-4, 4), (4, -4), (-4, -4)):
                    if abs(dx - px_) <= 1.0 and abs(dy - py_) <= 1.0:
                        v = 3
                if ax_ <= 0.8 and ay <= 0.8:
                    v = 2
            px[y * 16 + x] = v
    return px


def belt_y(pts, bb):
    """Altura (a partir do topo do quadro) da faixa preta do Ryu: referencia do corpo para os quadros no ar."""
    h = bb[3] - bb[1]
    ys = [y - bb[1] for (x, y), c in pts.items() if c == (16, 16, 16) and 0.3 * h <= y - bb[1] <= 0.7 * h]
    if len(ys) < 10:
        return 255
    return int(round(sum(ys) / float(len(ys))))


def belt_x(pts, bb):
    """Centro x da faixa preta (o corpo do Ryu): ancora dos quadros no ar, que nao tem sombra para medir."""
    h = bb[3] - bb[1]
    xs = [x for (x, y), c in pts.items() if c == (16, 16, 16) and 0.3 * h <= y - bb[1] <= 0.7 * h]
    if len(xs) < 10:
        return None
    return int(round(sum(xs) / float(len(xs)) - bb[0]))


def build_ryu():
    boxes, hit_of, hurt_of = find_boxes()
    wb_boxes, _, _ = find_boxes(os.path.join(SPR, "ryu_walkback.png"))   # Walk Backward (a folha atual nao tem)
    walkb = []
    for bx in wb_boxes:
        boxes.append(bx)
        walkb.append(len(boxes) - 1)
    rect_of, rect2_of = {}, {}
    for bi, lst in hit_of.items():
        lst = [r for r in lst if not any(o is not r and o[0] - 2 <= r[0] and o[1] - 2 <= r[1] and r[2] <= o[2] + 2 and r[3] <= o[3] + 2 for o in lst)]
        lst.sort()
        rect_of[bi] = lst[0]
        if len(lst) > 1:
            rect2_of[bi] = lst[1]
    anims = [(n, walkb if n == "walkb" else lst) for n, lst in ANIMS] + NEW_ANIMS
    FIRE = (93, 96, 94, 95, 97)
    FX_CENTER = (96, 94, 95, 97)               # efeitos da bola: centralizados no quadro
    for i in (88, 89, 90, 91):     # tira a bola de fogo colada na mao do Ryu (ela e um objeto a parte)
        pts = {p: c for p, c in boxes[i][1].items() if not is_fireball_blue(c)}
        boxes[i] = ([min(x for x, _ in pts), min(y for _, y in pts), max(x for x, _ in pts) + 1,
                     max(y for _, y in pts) + 1], pts)
    need = sorted({b for _, lst in anims for b in lst if b >= 0})
    shadow_ax = {}
    for i in need:
        if i in FIRE:
            continue
        bb2, pts2, axs = strip_shadow(*boxes[i])
        boxes[i] = (bb2, pts2)
        if axs is not None:
            shadow_ax[i] = axs
    # cores do Ryu branco (paleta do P1) e do Ryu azul (P2: pares alinhados idle branco x idle azul espelhado)
    counts = {}
    for i in need:
        if i in FIRE:          # bola de fogo tem paleta propria
            continue
        for c in boxes[i][1].values():
            counts[c] = counts.get(c, 0) + 1
    from mkassets import reduce_colors
    keep, remap, merged = reduce_colors(counts, RYU_PAL_COLORS)
    keep.sort(key=lambda c: c[0] * 3 + c[1] * 6 + c[2])
    # P2: ryu branco (quadro 32) x azul (quadro 33): pares de pixels alinhados
    wb, bb_ = boxes[29], boxes[30]
    votes = {}
    w0, h0 = wb[0][2] - wb[0][0], wb[0][3] - wb[0][1]
    for (x, y), c in wb[1].items():
        mx = bb_[0][0] + (x - wb[0][0]) + 1       # folha nova: o azul tem a mesma pose, sem espelhar (1 px de deslocamento)
        my = bb_[0][1] + (y - wb[0][1])
        c2 = bb_[1].get((mx, my))
        if c2:
            k = keep.index(remap[c]) if c in remap else None
            if k is not None:
                votes.setdefault(k, {})
                votes[k][c2] = votes[k].get(c2, 0) + 1
    pal2 = [(0, 0, 0)] + [max(votes[k], key=votes[k].get) if k in votes else keep[k] for k in range(len(keep))]
    pal1 = [(0, 0, 0)] + keep
    # bola de fogo: paleta 3 (15 cores)
    # a paleta vem so da bola e da explosao (os efeitos de dissipacao, com muito branco, apagariam o azul); as
    # cores dos outros quadros viram a mais proxima
    fc = {}
    for i in (FIRE[0], FIRE[1]):
        for c in boxes[i][1].values():
            fc[c] = fc.get(c, 0) + 1
    fkeep, fremap, _ = reduce_colors(fc, 15)
    fkeep.sort(key=lambda c: c[0] * 3 + c[1] * 6 + c[2])
    from mkassets import nearest as _near
    for i in FIRE[2:]:
        for c in boxes[i][1].values():
            if c not in fremap:
                fremap[c] = fkeep[_near(c, fkeep)]
    pal3 = [(0, 0, 0)] + fkeep
    pal4 = [(0, 0, 0), (76, 60, 52), SPARK_PAL[2], SPARK_PAL[3]]   # sombra e faisca

    blobs = []
    chunks = []
    table = []                  # por quadro (na ordem de ANIMS)
    first = {}
    pp_dx, pp_dy, pf_first = [], [], []
    names = []
    st = dict(cur=bytearray())

    def ryu_anchor(bi, bb, pts, w):
        xs = sorted(x - bb[0] for (x, y) in pts)
        bx = None if bi in shadow_ax else belt_x(pts, bb)
        ax = ANCHOR_OVERRIDE.get(bi, shadow_ax.get(bi, bx if bx is not None else xs[len(xs) // 2]))
        if bi in FX_CENTER:
            ax = w // 2
        return ax

    def ryu_belt(bi, bb, pts):
        return 255 if bi in FIRE else belt_y(pts, bb)

    def emit(anims, boxes, pal_of, anchor_of, belt_of, rect_of, rect2_of, hurt_of, first):
        frames = {}
        for anim, lst in anims:
            first[anim] = len(table)
            for bi in lst:
                if bi in frames:
                    table.append(frames[bi])
                    names.append(anim)
                    if DUMP is not None:
                        DUMP.append(dict(char=dump_char[0], anim=anim, box=bi, reuse=True))
                    continue
                if bi in (-3, -4, -5):
                    w, h = 16, 16
                    idx = spark_pixels(-3 - bi)
                    bb = [0, 0, w, h]
                    pts = {}
                    ax = 8
                elif bi < 0:
                    # sombra: elipse (grande = no chao, pequena = o lutador esta alto no ar), paleta propria
                    w, h = (40, 8) if bi == -1 else (26, 8)
                    idx = [0] * (w * h)
                    for y in range(h):
                        for x in range(w):
                            dx, dy = (x - (w - 1) / 2.0) / (w / 2.0), (y - (h - 1) / 2.0) / (h / 2.0)
                            if dx * dx + dy * dy <= 1.0:
                                idx[y * w + x] = 1
                    bb = [0, 0, w, h]
                    pts = {}
                    ax = w // 2
                else:
                    bb, pts = boxes[bi]
                    w, h = bb[2] - bb[0], bb[3] - bb[1]
                    pk, prm = pal_of(bi)
                    idx = [0] * (w * h)
                    for (x, y), c in pts.items():
                        idx[(y - bb[1]) * w + (x - bb[0])] = pk.index(prm[c]) + 1
                    ax = anchor_of(bi, bb, pts, w)
                # grade dos pedacos 16x16 comecando um pouco acima do topo (0-15 linhas vazias): o que gasta menos pedacos
                best = (len(cut_pieces(idx, w, h)[0]), 0)
                for dy in range(1, 16):
                    n = len(cut_pieces([0] * (w * dy) + idx, w, h + dy)[0])
                    if n < best[0]:
                        best = (n, dy)
                if best[1]:
                    idx = [0] * (w * best[1]) + idx
                    h += best[1]
                pieces, at = cut_pieces(idx, w, h)
                # o bloco de cada lutador na VRAM tem 24 pedacos: passou disso, tira o mais vazio (e avisa)
                while len(pieces) > 24:
                    cnt = [sum(1 for yy in range(16) for xx in range(16) if at(px + xx, py + yy)) for px, py in pieces]
                    k = cnt.index(min(cnt))
                    print("AVISO: quadro de %s/%s com %d pedacos: tirado um pedaco com %d pixels" % (dump_char[0], anim, len(pieces), cnt[k]))
                    pieces.pop(k)
                if DUMP is not None:
                    DUMP.append(dict(char=dump_char[0], anim=anim, box=bi, reuse=False, w=w, h=h, ax=ax, idx=list(idx),
                                     pal=(list(pal_of(bi)[0]) if bi >= 0 else None), pieces=len(pieces)))
                rows = (len(pieces) + 7) // 8
                sheet = [0] * (128 * 16 * rows)
                for i, (x, y) in enumerate(pieces):
                    ox, oy = (i % 8) * 16, (i // 8) * 16
                    for yy in range(16):
                        for xx in range(16):
                            sheet[(oy + yy) * 128 + ox + xx] = at(x + xx, y + yy)
                raw = encode_tiles(sheet, 128, 16 * rows, 4)
                out = bytearray()
                for r in range(rows):
                    n = min(8, len(pieces) - r * 8)
                    for half in range(2):
                        start = (r * 2 + half) * 16 * 32
                        out += raw[start:start + n * 64]
                if len(st["cur"]) + len(out) > CHUNK:
                    chunks.append(st["cur"])
                    st["cur"] = bytearray()
                belt = 255
                hb = None
                hb2 = None
                hu = None
                if bi >= 0:
                    belt = belt_of(bi, bb, pts)
                    if bi in rect_of:
                        r = rect_of[bi]
                        axabs = bb[0] + ax
                        hb = (r[0] - axabs, r[2] - axabs, max(0, bb[3] - (r[3] + 1)), bb[3] - r[1])
                    if bi in rect2_of:
                        r = rect2_of[bi]
                        hb2 = (r[0] - axabs, r[2] - axabs, max(0, bb[3] - (r[3] + 1)), bb[3] - r[1])
                    if bi in hurt_of:
                        r = hurt_of[bi]
                        axabs = bb[0] + ax
                        hu = (r[0] - axabs, r[2] - axabs, max(0, bb[3] - (r[3] + 1)), bb[3] - r[1])
                fr = dict(chunk=len(chunks), off=len(st["cur"]), n=len(pieces), w=w, h=h, ax=ax,
                          pcs=[(x - ax + 64, y) for x, y in pieces], box=bi, belt=belt, hb=hb, hb2=hb2, hu=hu)
                st["cur"] += out
                frames[bi] = fr
                table.append(fr)
                names.append(anim)

    emit(anims, boxes, lambda bi: (fkeep, fremap) if bi in FIRE else (keep, remap), ryu_anchor, ryu_belt,
         rect_of, rect2_of, hurt_of, first)
    ryu_n = len(table)
    import mksagat
    sg = mksagat.prepare(anims)
    sfirst = {}
    dump_char[0] = "sagat"
    emit(sg["anims"], sg["boxes"], sg["pal_of"], sg["anchor_of"], sg["belt_of"], sg["rect_of"], sg["rect2_of"],
         sg["hurt_of"], sfirst)
    for anim, _ in anims:
        assert sfirst[anim] - ryu_n == first[anim], anim
    import mkboxer
    bx = mkboxer.prepare(anims)
    bfirst = {}
    dump_char[0] = "boxer"
    boxer_off = len(table)
    emit(bx["anims"], bx["boxes"], bx["pal_of"], bx["anchor_of"], bx["belt_of"], bx["rect_of"], bx["rect2_of"],
         bx["hurt_of"], bfirst)
    for anim, _ in anims:
        assert bfirst[anim] - boxer_off == first[anim], anim
    cur = st["cur"]
    chunks.append(cur)
    for i, c in enumerate(chunks):
        save_bin("ryu_%d.bin" % i, c)   # graficos dos quadros: vao para o PACK (tools/sfpack.py), nao para a ROM fixa
    pal5 = [(0, 0, 0), (76, 60, 52), (255, 235, 150), (255, 70, 20)]   # faisca de golpe acertado (fogo)
    def green(pal):
        # magia especial (super): mesma bola, em verde claro (luminosidade da cor original numa escala de verdes)
        out = [(0, 0, 0)]
        for c in pal[1:]:
            l = (c[0] * 30 + c[1] * 59 + c[2] * 11) / 100.0 / 255.0
            out.append((int(60 + 150 * l), int(150 + 105 * l), int(60 + 140 * l)))
        return out

    def red(pal):
        # magia reforcada (2 socos): a mesma bola em vermelho/laranja
        out = [(0, 0, 0)]
        for c in pal[1:]:
            l = (c[0] * 30 + c[1] * 59 + c[2] * 11) / 100.0 / 255.0
            out.append((int(150 + 105 * l), int(30 + 200 * l * l), int(20 + 120 * l * l)))
        return out
    save_bin("ryu.pal", pal_words(pal1) + pal_words(pal2) + pal_words(pal3) + pal_words(pal4) + pal_words(pal5)
             + pal_words(green(pal3)) + pal_words(red(pal3)))
    save_bin("sagat.pal", pal_words(sg["pal1"]) + pal_words(sg["pal2"]) + pal_words(sg["pal3"])
             + pal_words(green(sg["pal3"])) + pal_words(red(sg["pal3"])))  # Sagat: P1, P2, Tiger Shot, super (verde)
    save_bin("boxer.pal", pal_words(bx["pal1"]) + pal_words(bx["pal2"]))
    outputs.setdefault("ryu", []).append("boxer.pal")
    outputs["ryu"].append("sagat.pal")
    outputs["ryu"].append("ryu.pal")
    # contato visual para conferir recortes e ancoras
    cs = Image.new("RGB", (16 * 70, ((len(table) + 15) // 16) * 110), (64, 144, 160))
    for k, fr in enumerate(table[:ryu_n]):
        if fr["box"] < 0:
            continue
        bb, pts = boxes[fr["box"]]
        ox, oy = (k % 16) * 70 + 35, (k // 16) * 110 + 104
        for (x, y), c in pts.items():
            cx = ox + (x - bb[0]) - fr["ax"]
            cy = oy - fr["h"] + (y - bb[1])
            if 0 <= cx < cs.width and 0 <= cy < cs.height:
                cs.putpixel((cx, cy), c)
        for yy in range(oy - 6, oy + 1):
            cs.putpixel((ox, yy), (255, 0, 0))
    cs.save(os.path.join(os.environ.get("MKFIGHT_DEBUG", "/tmp"), "ryu_contact.png"))
    # tabelas C
    with open(os.path.join(RES, "ryu.h"), "w") as f:
        f.write("// gerado por tools/mkfight.py\n")
        for anim, lst in anims:
            f.write("#define A_%s %d\n#define A_%s_N %d\n" % (anim.upper(), first[anim], anim.upper(), len(lst)))
        f.write("#define RYU_FRAMES %d\n#define RYU_CHUNKS %d\n" % (len(table), len(chunks)))
        f.write("#define BOXER_OFF %d // quadros do Boxer (so o idle, repetido em todas as animacoes)\n" % boxer_off)
        f.write("#define SAGAT_OFF %d // quadros do Sagat: mesma ordem e contagem do Ryu, logo depois dos dele\n" % ryu_n)
        for anim, lst in sg["anims"]:
            if anim not in first:   # animacoes so do Sagat (indice relativo a SAGAT_OFF, como as outras)
                f.write("#define A_%s %d\n#define A_%s_N %d\n" % (anim.upper(), sfirst[anim] - ryu_n, anim.upper(), len(lst)))
        firsts, dx, dy = [], [], []
        for fr in table:
            firsts.append(len(dx))
            dx += [p[0] for p in fr["pcs"]]
            dy += [p[1] for p in fr["pcs"]]
        f.write("#define PF_N %d     // quadros (todas as tabelas pf_*)\n#define PP_N %d     // pedacos 16x16 (pp_dx/pp_dy)\n#define NCHUNK %d\n" % (len(table), len(dx), len(chunks)))
    hbv = lambda k, i: [(fr[k][i] if fr[k] else 0) & 255 for fr in table]
    arrays = [("pf_chunk", 1, [fr["chunk"] for fr in table]), ("pf_off", 2, [fr["off"] for fr in table]),
              ("pf_count", 1, [fr["n"] for fr in table]), ("pf_w", 1, [fr["w"] for fr in table]), ("pf_h", 1, [fr["h"] for fr in table]),
              ("pf_ax", 1, [fr["ax"] for fr in table]), ("pf_belt", 1, [fr["belt"] for fr in table]),
              ("pf_hb", 1, [1 if fr["hb"] else 0 for fr in table]), ("pf_hbx0", 1, hbv("hb", 0)), ("pf_hbx1", 1, hbv("hb", 1)),
              ("pf_hby0", 1, hbv("hb", 2)), ("pf_hby1", 1, hbv("hb", 3)),
              ("pf_hu", 1, [1 if fr["hu"] else 0 for fr in table]), ("pf_hux0", 1, hbv("hu", 0)), ("pf_hux1", 1, hbv("hu", 1)),
              ("pf_huy0", 1, hbv("hu", 2)), ("pf_huy1", 1, hbv("hu", 3)),
              ("pf_hb2", 1, [1 if fr["hb2"] else 0 for fr in table]), ("pf_hb2x0", 1, hbv("hb2", 0)), ("pf_hb2x1", 1, hbv("hb2", 1)),
              ("pf_hb2y0", 1, hbv("hb2", 2)), ("pf_hb2y1", 1, hbv("hb2", 3)),
              ("pf_first", 2, firsts), ("pp_dx", 1, [v & 255 for v in dx]), ("pp_dy", 1, [v & 255 for v in dy])]
    with open(os.path.join(RES, "sfram.asm"), "w") as ra:
        ra.write("; gerado por tools/mkfight.py: tabelas de quadros na RAM do banco $7F (as variaveis do C so cabem ate $7E:7FFF; de $8000 em diante ficam as da PVSnesLib)\n")
        ra.write(".BASE $00\n.RAMSECTION \"sf_frames\" BANK $7F SLOT 3\n")
        for n_, sz_, d_ in arrays:
            ra.write("%s dsb %d\n" % (n_, len(d_) * sz_))
        ra.write("chunk_tab dsb %d\nsmap dsb 2048\n.ENDS\n.BASE $80\n" % (4 * len(chunks)))
    import json as _json
    _json.dump(dict(nframes=len(table), npieces=len(dx), arrays=[dict(name=n, size=sz, data=d) for n, sz, d in arrays],
                    chunks=["ryu_%d.bin" % i for i in range(len(chunks))]), open(os.path.join(RES, "frames.json"), "w"))
    maxp = max(fr["n"] for fr in table)
    if DUMP is not None:
        DUMP.append(dict(char="info", pal1=pal1, pal2=pal2, pal3=pal3, pal4=pal4, spal1=sg["pal1"], spal2=sg["pal2"],
                         spal3=sg["pal3"], bpal1=bx["pal1"], bpal2=bx["pal2"], ryu_n=ryu_n, chunks=[len(c) for c in chunks]))
    return len(table), maxp, merged, len(chunks)


ANCHOR_OVERRIDE = {}


# ================================================================ barras de energia (BG3, 2bpp) e cursor
HUD_WHITE, HUD_YELLOW, HUD_RED = 1, 2, 3
HUD_PAL = [(0, 0, 0), (255, 255, 255), (248, 208, 40), (152, 16, 24)]


def build_hud():
    """Tile 0 = vazio. Tiles 1-9: barra preenchida k px (k=0..8) a partir da ESQUERDA; 10-18: a partir da
    DIREITA. Bordas brancas em cima e embaixo; miolo amarelo (energia) e vermelho (vazio)."""
    tiles = [[0] * 64]
    for fromright in (0, 1):
        for k in range(9):
            t = [0] * 64
            for y in range(8):
                for x in range(8):
                    if y in (0, 7):
                        v = HUD_WHITE
                    else:
                        fx = (7 - x) if fromright else x
                        v = HUD_YELLOW if fx < k else 0   # o resto e transparente: embaixo (BG2) ficam a barra vermelha e o fundo preto
                    t[y * 8 + x] = v
            tiles.append(t)
    # barra de super (discreta): tiles 19-27 = k px a partir da esquerda, 28-36 = a partir da direita (3 px de altura,
    # cor 2 = cheio, 3 = vazio); 37 = marca vazia, 38 = marca cheia (4x4)
    for fromright in (0, 1):
        for k in range(9):
            t = [0] * 64
            for y in (3, 4, 5):
                for x in range(8):
                    fx = (7 - x) if fromright else x
                    t[y * 8 + x] = 2 if fx < k else 3
            tiles.append(t)
    for full in (0, 1):
        t = [0] * 64
        for y in range(3, 7):
            for x in range(2, 6):
                t[y * 8 + x] = 2 if full else 3
        tiles.append(t)
    raw = bytearray()
    for t in tiles:
        raw += encode_tiles(t, 8, 8, 2)
    save_bin("hud.bin", raw)
    # BG2 (4bpp, atras do amarelo): mesma numeracao da barra amarela; cor 1 = fundo preto, cor 2 = dano pendente (vermelho)
    raw2 = bytearray()
    raw2 += encode_tiles([1] * 64, 8, 8, 4)                 # tile 0: tudo preto
    for fromright in (0, 1):
        for k in range(9):
            t = [(2 if ((7 - x) if fromright else x) < k else 1) for y in range(8) for x in range(8)]
            raw2 += encode_tiles(t, 8, 8, 4)
    save_bin("hud2.bin", raw2)
    save_bin("hud.pal", pal_words(HUD_PAL + [(0, 0, 0)] * 4 + [(0, 0, 0), (255, 255, 255), (96, 208, 255), (16, 40, 112)], 12))   # paleta 2 = barra de super (azul)
    outputs["hud"] = ["hud.bin", "hud.pal", "hud2.bin"]
    defines.append("#define HUD_TILES %d" % len(tiles))


def build_cursor():
    """Cursor da selecao: canto em L (16x16) -- o jogo espelha para fazer os 4 cantos."""
    px = [0] * (16 * 16)
    for i in range(10):
        for t in range(2):
            px[t * 16 + i] = 1
            px[i * 16 + t] = 1
    # layout de pedaco 16x16 na folha de 128 px: chars 0,1 / 16,17
    sheet = [0] * (128 * 16)
    for y in range(16):
        for x in range(16):
            sheet[y * 128 + x] = px[y * 16 + x]
    raw = encode_tiles(sheet, 128, 16, 4)
    out = raw[:64] + raw[16 * 32:16 * 32 + 64]      # parte de cima (chars 0,1) e de baixo (chars 16,17)
    save_bin("cursor.bin", out)
    outputs["cursor"] = ["cursor.bin"]


# ================================================================ tiles do debug (L): linhas de retangulo
def build_dbg():
    """Pecas de contorno de retangulo com precisao de pixel, em 2bpp. Cada cor (verde = plano 0, vermelho =
    plano 1) tem: 8 linhas horizontais inteiras, 8 verticais inteiras e os 4 cantos (TL, TR, BL, BR) para
    cada (linha, coluna), mais as pontas em T das divisorias -- 400 tiles por cor. Ordem: H[r], V[c], TL[r*8+c], TR, BL, BR, TL-T, TR-T."""
    def tile(hl, vl, val):
        t = [0] * 64
        if hl:
            r, a, b = hl
            for x in range(a, b + 1):
                t[r * 8 + x] = val
        if vl:
            c, a, b = vl
            for y in range(a, b + 1):
                t[y * 8 + c] = val
        return t
    out = bytearray()
    for val in (1, 2):
        tiles = []
        for r in range(8):
            tiles.append(tile((r, 0, 7), None, val))
        for c in range(8):
            tiles.append(tile(None, (c, 0, 7), val))
        for kind in ("TL", "TR", "BL", "BR"):
            for r in range(8):
                for c in range(8):
                    hl = (r, c, 7) if kind in ("TL", "BL") else (r, 0, c)
                    vl = (c, r, 7) if kind in ("TL", "TR") else (c, 0, r)
                    tiles.append(tile(hl, vl, val))
        # pontas das linhas divisorias (T): linha a partir da coluna c (esquerda) ou ate ela (direita) + coluna inteira
        for kind in ("L", "R"):
            for r in range(8):
                for c in range(8):
                    hl = (r, c, 7) if kind == "L" else (r, 0, c)
                    tiles.append(tile(hl, (c, 0, 7), val))
        for t in tiles:
            out += encode_tiles(t, 8, 8, 2)
    save_bin("dbg.bin", out)
    outputs["dbg"] = ["dbg.bin"]
    defines.append("#define DBG_STATIC 800")


# ================================================================ saida: data.asm / C
# arquivos que vao para o PACK (e nao para a ROM fixa), na ordem dos ids AS_* de src/fight.c
PACK_ASSETS = ["stage.bin", "stage.map", "stage.pal", "face.bin", "face.pal", "hud.bin", "hud.pal", "hud2.bin", "ryu.pal", "sagat.pal", "boxer.pal"]


def write_outputs():
    import json as _json
    _json.dump(PACK_ASSETS, open(os.path.join(RES, "assets.json"), "w"))
    for g in list(outputs):
        outputs[g] = [fn for fn in outputs[g] if fn not in PACK_ASSETS]
        if not outputs[g]:
            del outputs[g]
    with open(os.path.join(RES, "fight.asm"), "w") as f:
        f.write("; gerado por tools/mkfight.py\n")
        for group, files in outputs.items():
            for fn in files:
                nm = fn.replace(".", "_")
                f.write('.section ".fx_%s" superfree\n%s: .incbin "res/%s"\n%s_end: .db 0  ; 1 byte extra: o rotulo _end nunca cai no inicio do banco seguinte\n.ends\n' % (nm, nm, fn, nm))
    with open(os.path.join(RES, "fight.h"), "w") as f:
        f.write("// gerado por tools/mkfight.py\n")
        names = []
        for files in outputs.values():
            for fn in files:
                nm = fn.replace(".", "_")
                names += [nm, nm + "_end"]
        f.write("extern char %s;\n" % ", ".join(names))
        f.write("\n".join(defines) + "\n")


def main():
    nt, rm = build_stage()
    print("cenario: %d tiles diferentes, %d tiles com cores trocadas" % (nt, rm))
    m = build_faces()
    print("retrato: cores juntadas", m)
    build_hud()
    build_cursor()
    build_dbg()
    nf, maxp, rm, nc = build_ryu()
    print("Ryu: %d quadros, ate %d pedacos 16x16, %d blocos; cores juntadas: %s" % (nf, maxp, nc, rm))
    write_outputs()


if __name__ == "__main__":
    main()
