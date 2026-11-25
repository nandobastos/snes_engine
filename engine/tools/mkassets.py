#!/usr/bin/env python3
"""Gera os graficos das telas fora da luta (Street Combat): splash, titulo, creditos, opcoes, e os textos dos idiomas.

Entradas: idiomas/textos.tsv (dicionario central dos 4 idiomas: pt, es, en, ja) e as fontes de tools/fonts
          (Press Start 2P = letras do menu; Tiny5 = rodape pequeno; japones = Unifont JP do sistema)
Saidas: res/txt_*.bin, res/ui_txt.bin, res/logo*.bin/.pal, res/mcursor.bin, res/menu.asm, res/menu.h
O jogo de luta (lutadores, cenario, retratos) e gerado por tools/mkfight.py.
"""
import csv
import os
import re
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "res")
SPR = os.path.join(ROOT, "sprites")
os.makedirs(RES, exist_ok=True)


def pixels(im):
    if hasattr(im, "get_flattened_data"):
        return list(im.get_flattened_data())
    return list(im.getdata())


def bgr555(rgb):
    r, g, b = rgb[:3]
    return (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10)


def write_pal(name, colors, count=16):
    data = bytearray()
    for i in range(count):
        c = bgr555(colors[i]) if i < len(colors) else 0
        data += bytes((c & 0xFF, c >> 8))
    open(os.path.join(RES, name), "wb").write(data)


def encode_tiles(pixels, width, height, bpp):
    """pixels: lista de indices (width*height). Retorna os chars 8x8 em ordem de linha."""
    out = bytearray()
    for ty in range(height // 8):
        for tx in range(width // 8):
            planes = [[0] * 8 for _ in range(bpp)]
            for y in range(8):
                for x in range(8):
                    v = pixels[(ty * 8 + y) * width + tx * 8 + x]
                    for p in range(bpp):
                        if v & (1 << p):
                            planes[p][y] |= 0x80 >> x
            # planos intercalados de 2 em 2 (formato SNES)
            for pair in range(0, bpp, 2):
                for y in range(8):
                    out.append(planes[pair][y])
                    out.append(planes[pair + 1][y])
    return out


def nearest(c, pal):
    return min(range(len(pal)), key=lambda i: sum((a - b) ** 2 for a, b in zip(c, pal[i])))


def reduce_colors(counts, maxc=15):
    """Se passar de maxc cores, junta aos poucos a cor que menos muda a imagem
    (distancia ate a cor mais parecida x quantidade de pixels)."""
    keep = list(counts)
    remap = {c: c for c in counts}
    merged = []
    while len(keep) > maxc:
        best = None
        for c in keep:
            others = [o for o in keep if o != c]
            o = others[nearest(c, others)]
            d = sum((a - b) ** 2 for a, b in zip(c, o)) * counts[c]
            if best is None or d < best[0]:
                best = (d, c, o)
        _, c, o = best
        keep.remove(c)
        merged.append((c, o))
        for k, v in remap.items():
            if v == c:
                remap[k] = o
    return keep, remap, merged




# ================================================================ telas (splash, titulo, creditos, opcoes) e idiomas
TEXT_FILE = os.path.join(ROOT, "idiomas", "textos.tsv")
LANGS = ["pt", "es", "en", "ja"]                       # ordem do seletor de idioma
LANG_NAMES = ["Português", "Español", "English", "日本語"]  # cada um na propria lingua
FONT_DIRS = [os.path.join(ROOT, "tools", "fonts"), "/usr/share/fonts/opentype/unifont",
             "/usr/share/fonts/truetype/unifont"]
UNIFONT_IDS = {"select", "back_hint"}   # textos da tela de selecao: continuam na fonte de antes (Unifont)
CENTER_IDS = {"ending", "arcade", "versus", "practice", "default_keys", "back", "remap_hint", "select", "back_hint",
              "credits", "options"}       # o resto fica alinhado a esquerda (coluna escolhida no jogo)
TEXT_MAX_W = 240                        # quebra de linha (px)
# regiao (em px) onde o nome do idioma fica centralizado, entre as setas (src/menu.c: OPT_ARROW_L/R)
LANG_REGION = (16 * 8, 26 * 8)
# logotipo: degrade de cima para baixo, contorno e sombra
LOGO_GRAD = [(255, 248, 168), (255, 232, 96), (255, 208, 48), (255, 176, 24), (248, 136, 16), (232, 96, 16),
             (208, 56, 16), (168, 32, 16)]
LOGO_OUT = (40, 0, 0)
LOGO_SHADOW = (112, 16, 24)
LOGO_SCALE = 4


def find_font(name):
    for d in FONT_DIRS:
        f = os.path.join(d, name)
        if os.path.exists(f):
            return f
    raise SystemExit("fonte %s nao encontrada: rode 'sudo apt-get install fonts-unifont' (ou tools/setup.sh)" % name)


class Font:
    """fonte + como ela fica numa linha de texto: altura da linha (px) e deslocamento vertical das letras"""

    def __init__(self, file, size, line_h, yoff):
        self.f = ImageFont.truetype(find_font(file), size)
        self.size, self.h, self.yoff = size, line_h, yoff

    def width(self, t):
        return int(self.f.getlength(t))


def fonts():
    return {
        "pixel": Font("PressStart2P-latin.woff", 8, 16, 4),   # letras 8x8 no meio de uma linha de 16 px
        "uni": Font("unifont.otf", 16, 16, 0),
        "jp": Font("unifont_jp.otf", 16, 16, 0),
        "tiny": Font("Tiny5-latin.woff", 10, 8, -3),          # rodape: letras de ~5 px numa linha de 8 px
    }


def wrap_text(font, text, maxw):
    """quebra em linhas de ate maxw px (palavras; em japones quebra entre letras)"""
    tokens = re.findall(r"\S+\s*|\s+", text)
    lines, cur = [], ""
    for tok in tokens:
        if font.width((cur + tok).rstrip()) <= maxw:
            cur += tok
            continue
        if cur.strip():
            lines.append(cur.rstrip())
            cur = ""
        while font.width(tok.rstrip()) > maxw:      # palavra maior que a linha: corta por letra
            k = 1
            while font.width(tok[:k + 1]) <= maxw:
                k += 1
            lines.append(tok[:k])
            tok = tok[k:]
        cur = tok
    if cur.strip():
        lines.append(cur.rstrip())
    return lines


def bits_1bpp(img, w8, h8):
    """imagem 'L' (0/255) -> tiles 1bpp: linha de tiles por linha, 8 bytes por tile"""
    px = img.load()
    out = bytearray()
    for ty in range(h8):
        for tx in range(w8):
            for y in range(8):
                b = 0
                for x in range(8):
                    if px[tx * 8 + x, ty * 8 + y]:
                        b |= 0x80 >> x
                out.append(b)
    return out


def render_line(font, t, center, scale=1, region=(0, 256)):
    """uma linha de texto -> (imagem 1 bit, coluna do primeiro tile, x do primeiro pixel)"""
    tw = font.width(t) * scale
    h = font.h * scale
    if center:
        left = max(0, region[0] + (region[1] - region[0] - tw) // 2)
        x_tile, pad = left // 8, left % 8
    else:
        x_tile, pad = 0, 0
    w8 = (pad + tw + 1 + 7) // 8
    img = Image.new("L", (w8 * 8, h), 0)
    small = Image.new("L", (max(1, font.width(t)), font.h), 0)
    ImageDraw.Draw(small).text((0, font.yoff), t, font=font.f, fill=255)
    small = small.point(lambda v: 255 if v >= 128 else 0)
    if scale != 1:
        small = small.resize((small.width * scale, small.height * scale), Image.NEAREST)
    img.paste(small, (pad, 0))
    return img, x_tile, x_tile * 8 + pad


def text_block(lines_imgs):
    """bloco de um texto: [n linhas] e por linha [w, h, x_tile, x_px] (em tiles/px) + as letras em 1 bit por pixel"""
    out = bytearray([len(lines_imgs)])
    for img, x_tile, x_px in lines_imgs:
        out += bytes([img.width // 8, img.height // 8, x_tile, x_px])
    for img, _, _ in lines_imgs:
        out += bits_1bpp(img, img.width // 8, img.height // 8)
    return out


def ui_tiles(F):
    """tiles fixos das telas (1 bit por pixel, 8x8): vazio, setas, digitos, barra de volume. Os de 2 andares
    (linha de 16 px) ficam em sequencia: em cima, embaixo. Devolve (lista de imagens 8x8, nomes)"""
    tiles, names = [], {}

    def add(name, im):
        names[name] = len(tiles)
        for y in range(0, im.height, 8):
            tiles.append(im.crop((0, y, 8, y + 8)))
    add("BLANK", Image.new("L", (8, 16), 0))   # 2 andares, como os outros
    for nm, flip in (("ARROW_L", True), ("ARROW_R", False)):
        im = Image.new("L", (8, 16), 0)
        d = ImageDraw.Draw(im)
        for i in range(4):          # triangulo de 7 px de altura, 4 de largura
            x = 6 - i if flip else 1 + i
            d.line((x, 4 + i, x, 10 - i), fill=255)
        add(nm, im)
    for dgt in "0123456789":
        im, _, _ = render_line(F["pixel"], dgt, False)
        add("DIG_%s" % dgt, im.crop((0, 0, 8, 16)))
    # barra de volume: celulas de 8 px com 0..8 px preenchidos (bordas em cima/embaixo), e as pontas
    for lv in range(9):
        im = Image.new("L", (8, 16), 0)
        d = ImageDraw.Draw(im)
        d.line((0, 4, 7, 4), fill=255)
        d.line((0, 11, 7, 11), fill=255)
        if lv:
            d.rectangle((0, 6, lv - 1, 9), fill=255)
        add("BAR_%d" % lv, im)
    for nm, x in (("BAR_L", 6), ("BAR_R", 1)):
        im = Image.new("L", (8, 16), 0)
        d = ImageDraw.Draw(im)
        d.line((x, 4, x, 11), fill=255)
        if nm == "BAR_L":
            d.line((x, 4, 7, 4), fill=255)
            d.line((x, 11, 7, 11), fill=255)
        else:
            d.line((0, 4, x, 4), fill=255)
            d.line((0, 11, x, 11), fill=255)
        add(nm, im)
    return tiles, names


def build_logo(F):
    """STREET / COMBAT em letras grandes (Press Start 2P x4) com degrade, contorno e sombra -> BG1 4bpp"""
    lines = []
    for word in ("STREET", "COMBAT"):
        f = F["pixel"].f
        w = int(f.getlength(word))
        g = Image.new("L", (w, 8), 0)
        ImageDraw.Draw(g).text((0, 0), word, font=f, fill=255)
        g = g.point(lambda v: 255 if v >= 128 else 0).resize((w * LOGO_SCALE, 8 * LOGO_SCALE), Image.NEAREST)
        lines.append(g)
    gw = max(g.width for g in lines)
    W = (gw + 6 + 15) // 16 * 16   # largura multipla de 16 px: fica centralizado na tela em coluna inteira
    gap = 2
    H = (sum(g.height + 6 for g in lines) + gap + 7) // 8 * 8
    img = Image.new("RGB", (W, H), (0, 0, 0))
    p = img.load()
    y0 = 0
    for g in lines:
        m = g.load()
        x0 = (W - g.width - 6) // 2

        def on(x, y):
            return 0 <= x < g.width and 0 <= y < g.height and m[x, y]
        for y in range(g.height + 6):
            for x in range(g.width + 6):
                gx, gy = x - 2, y - 2
                if on(gx, gy):
                    c = LOGO_GRAD[min(len(LOGO_GRAD) - 1, gy * len(LOGO_GRAD) // g.height)]
                elif any(on(gx + dx, gy + dy) for dx in range(-2, 3) for dy in range(-2, 3) if abs(dx) + abs(dy) <= 2):
                    c = LOGO_OUT
                elif any(on(gx - dx, gy - dy) for dx, dy in ((3, 3), (2, 3), (3, 2), (4, 4))):
                    c = LOGO_SHADOW
                else:
                    continue
                p[x0 + x, y0 + y] = c
        y0 += g.height + 6 + gap
    pal = [(0, 0, 0)] + LOGO_GRAD + [LOGO_OUT, LOGO_SHADOW]
    idx = [pal.index(c) if c in pal else 0 for c in pixels(img)]
    # tiles 8x8 sem repetir (o vazio = tile 0)
    tiles, tmap = {}, []
    blank = tuple([0] * 64)
    order = [blank]
    tiles[blank] = 0
    for ty in range(H // 8):
        for tx in range(W // 8):
            t = tuple(idx[(ty * 8 + y) * W + tx * 8 + x] for y in range(8) for x in range(8))
            if t not in tiles:
                tiles[t] = len(order)
                order.append(t)
            tmap.append(tiles[t])
    flat = [v for t in order for v in t]
    open(os.path.join(RES, "logo.bin"), "wb").write(encode_tiles(flat, 8, 8 * len(order), 4))
    mp = bytearray()
    for k in tmap:
        v = k | (2 << 10)              # paleta 2 do BG (cores 32-47)
        mp += bytes((v & 255, v >> 8))
    open(os.path.join(RES, "logo_map.bin"), "wb").write(mp)
    write_pal("logo.pal", pal)
    img.resize((W * 3, H * 3), Image.NEAREST).save("/tmp/logo_preview.png")
    return W // 8, H // 8, len(order)


# ================================================================ letreiros da luta (ROUND, FIGHT!, YOU WIN...) - BG3 2bpp
# Press Start 2P x2 (letras de 16 px): cor 3 = metade de cima (clara), 1 = metade de baixo, 2 = contorno escuro.
ANN = [("ROUND", "ROUND")] + [("D%d" % d, str(d)) for d in range(10)] + [
    ("FIGHT", "FIGHT!"), ("WIN", "YOU WIN"), ("LOSE", "YOU LOSE"), ("DRAW", "DRAW GAME"),
    ("CONT", "CONTINUE?"), ("OVER", "GAME OVER"), ("PERFECT", "PERFECT!"),
    ("PAUSE", "PAUSE"), ("ARROW", ">"), ("CPUAT", "CPU ANTI-THROW"), ("PGAUGE", "POWER GAUGE"),
    ("YES", "YES"), ("NO", "NO"), ("ON", "ON"), ("OFF", "OFF"), ("EXIT", "EXIT")]


def build_ann(F):
    f = F["pixel"].f
    data, t0, ws = bytearray(), [], []
    for _, txt in ANN:
        w = int(f.getlength(txt))
        g = Image.new("L", (w, 8), 0)
        ImageDraw.Draw(g).text((0, 0), txt, font=f, fill=255)
        g = g.point(lambda v: 255 if v >= 128 else 0).resize((w * 2, 16), Image.NEAREST)
        W = (w * 2 + 2 + 7) // 8 * 8
        H = 24
        m = g.load()
        idx = [0] * (W * H)
        for y in range(H):
            for x in range(W):
                gx, gy = x - 1, y - 4
                on = 0 <= gx < g.width and 0 <= gy < 16 and m[gx, gy]
                if on:
                    idx[y * W + x] = 3 if gy < 8 else 1
                elif any(0 <= gx + dx < g.width and 0 <= gy + dy < 16 and m[gx + dx, gy + dy]
                         for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                    idx[y * W + x] = 2
        t0.append(len(data) // 16)
        ws.append(W // 8)
        # tiles linha a linha (3 linhas de tiles)
        for ty in range(3):
            for tx in range(W // 8):
                tile = [idx[(ty * 8 + y) * W + tx * 8 + x] for y in range(8) for x in range(8)]
                data += encode_tiles(tile, 8, 8, 2)
    open(os.path.join(RES, "ann.bin"), "wb").write(data)
    with open(os.path.join(RES, "ann.h"), "w") as fh:
        fh.write("// gerado por tools/mkassets.py: letreiros da luta (3 linhas de tiles de altura, 2bpp)\n")
        for i, (nm, _) in enumerate(ANN):
            fh.write("#define ANN_%s %d\n" % (nm, i))
        fh.write("#define ANN_TILES %d\n" % (len(data) // 16))
        fh.write("const u16 ann_t0[%d] = {%s};\n" % (len(ANN), ", ".join(map(str, t0))))
        fh.write("const u8 ann_w[%d] = {%s};\n" % (len(ANN), ", ".join(map(str, ws))))
        fh.write("extern char ann_gfx, ann_end;\n")
    return len(data) // 16


def build_menu():
    F = fonts()
    rows = list(csv.reader(open(TEXT_FILE, encoding="utf-8"), delimiter="\t"))
    head, rows = rows[0], [r for r in rows[1:] if r and r[0].strip()]
    col = {h.strip(): i for i, h in enumerate(head)}
    for lg in LANGS:
        if lg not in col:
            raise SystemExit("idiomas/textos.tsv: falta a coluna '%s'" % lg)
    ids = [r[0].strip() for r in rows]
    blobs, offs = [], []
    for lg in LANGS:
        blob, o = bytearray(), []
        for r in rows:
            tid = r[0].strip()
            t = r[col[lg]].strip() if len(r) > col[lg] else ""
            if not t:
                t = r[col["en"]].strip()          # sem traducao: usa o ingles
            if lg == "ja":
                fnt = F["jp"]
            elif tid in UNIFONT_IDS:
                fnt = F["uni"]
            else:
                fnt = F["pixel"]
            lines = []
            for part in t.split("\\n"):          # \n no texto = quebra de linha manual
                lines += wrap_text(fnt, part.strip(), TEXT_MAX_W)
            o.append(len(blob))
            blob += text_block([render_line(fnt, ln, tid in CENTER_IDS) for ln in lines])
        blobs.append(blob)
        offs.append(o)
    # comum a todos os idiomas
    common, coffs, cnames = bytearray(), [], []

    def add_common(name, lines_imgs):
        nonlocal common
        cnames.append(name)
        coffs.append(len(common))
        common += text_block(lines_imgs)
    add_common("VS", [render_line(F["uni"], "VS", True, 4)])
    for i, (lg, nm) in enumerate(zip(LANGS, LANG_NAMES)):
        add_common("LANG%d" % i, [render_line(F["jp"] if lg == "ja" else F["pixel"], nm, True, 1, LANG_REGION)])
    add_common("SPLASH", [render_line(F["pixel"], "Designed by Nando Bastos", True)])
    add_common("FOOTER", [render_line(F["tiny"], "Street Combat is a trademark of Nando Bastos.", True),
                          render_line(F["tiny"], "All rights reserved. Version 0.0.1", True)])
    add_common("CREDITS_TEXT", [render_line(F["pixel"], "Design and Pixel Art", True),
                                render_line(F["pixel"], "by Nando Bastos", True)])
    for k in "BYAXLR":
        add_common("KEY_" + k, [render_line(F["pixel"], k, True, 1, LANG_REGION)])  # no meio da coluna dos valores
    for i, b in enumerate(blobs + [common]):
        if len(b) > 0x8000:
            raise SystemExit("textos do idioma %s passam de 32 KB" % (LANGS + ["comum"])[i])
        open(os.path.join(RES, "txt_%d.bin" % i), "wb").write(bytes(b))
    # tiles fixos
    tiles, names = ui_tiles(F)
    tb = bytearray()
    for im in tiles:
        tb += bits_1bpp(im, 1, 1)
    open(os.path.join(RES, "ui_txt.bin"), "wb").write(bytes(tb))
    # logotipo
    lw, lh, ltiles = build_logo(F)
    ann_tiles = build_ann(F)
    # cursor (sprite 8x8, cor 1): o '>' da fonte
    im, _, _ = render_line(F["pixel"], ">", False)
    im = im.crop((0, 4, 8, 12))
    cur = [1 if v else 0 for v in pixels(im)]
    open(os.path.join(RES, "mcursor.bin"), "wb").write(encode_tiles(cur, 8, 8, 4))
    with open(os.path.join(RES, "menu.asm"), "w") as f:
        f.write("; gerado por tools/mkassets.py (textos das telas, um bloco por idioma + o comum)\n")
        for i in range(len(blobs) + 1):
            f.write('.section ".txt%d" superfree\ntxt_gfx%d: .incbin "res/txt_%d.bin"\n.ends\n' % (i, i, i))
        f.write('.section ".menugfx" superfree\n')
        for nm in ("ui_txt", "logo", "logo_map", "mcursor"):
            f.write('%s_gfx: .incbin "res/%s.bin"\n%s_end:\n' % (nm, nm, nm))
        f.write('logo_pal: .incbin "res/logo.pal"\n.ends\n')
        f.write('.section ".anngfx" superfree\nann_gfx: .incbin "res/ann.bin"\nann_end:\n.ends\n')
    with open(os.path.join(RES, "menu.h"), "w") as f:
        f.write("// gerado por tools/mkassets.py a partir de idiomas/textos.tsv\n")
        f.write("#define LANG_COUNT %d\n#define TXT_COUNT %d\n" % (len(LANGS), len(ids)))
        for i, t in enumerate(ids):
            f.write("#define TXT_%s %d\n" % (t.upper(), i))
        for i, nm in enumerate(cnames):
            f.write("#define TXC_%s %d\n" % (nm, i))
        f.write("#define UI_TILES %d\n" % len(tiles))
        for nm, k in names.items():
            f.write("#define UI_%s %d\n" % (nm, k))
        f.write("#define LOGO_W %d\n#define LOGO_H %d\n#define LOGO_TILES %d\n" % (lw, lh, ltiles))
        f.write("const u16 txt_off[%d] = {%s};\n" % (len(LANGS) * len(ids), ", ".join(str(v) for o in offs for v in o)))
        f.write("const u16 txc_off[%d] = {%s};\n" % (len(coffs), ", ".join(map(str, coffs))))
        f.write("extern char %s;\n" % ", ".join("txt_gfx%d" % i for i in range(len(blobs) + 1)))
        f.write("extern char ui_txt_gfx, ui_txt_end, logo_gfx, logo_end, logo_map_gfx, logo_map_end, mcursor_gfx, "
                "mcursor_end, logo_pal;\n")
        f.write("u8 *txt_block(u8 lang, u8 id)\n{\n    u16 o = txt_off[lang * TXT_COUNT + id];\n")
        for i in range(1, len(blobs)):
            f.write("    if (lang == %d)\n        return (u8 *)&txt_gfx%d + o;\n" % (i, i))
        f.write("    return (u8 *)&txt_gfx0 + o;\n}\n")
        f.write("u8 *txc_block(u8 id)\n{\n    return (u8 *)&txt_gfx%d + txc_off[id];\n}\n" % len(blobs))
    sizes = [len(b) for b in blobs]
    print("telas: %d textos x %d idiomas (%d a %d bytes por idioma), comum %d bytes, %d tiles fixos, logo %dx%d tiles (%d)"
          % (len(ids), len(LANGS), min(sizes), max(sizes), len(common), len(tiles), lw, lh, ltiles))


def main():
    build_menu()


if __name__ == "__main__":
    main()
