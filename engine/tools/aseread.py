#!/usr/bin/env python3
"""Leitor minimo de .aseprite (so o que o DonLee usa): devolve quadros compostos RGBA, duracoes e tags."""
import struct
import zlib

from PIL import Image


def read(path):
    d = open(path, "rb").read()
    fsize, magic, nf, W, H, depth = struct.unpack_from("<IHHHHH", d, 0)
    assert magic == 0xA5E0
    ncol = struct.unpack_from("<H", d, 28 + 0)[0] if False else 0
    pal = {}
    layers = []
    tags = []
    frames = []
    off = 128
    for f in range(nf):
        fs, fm, nold, dur, nnew = struct.unpack_from("<IHHH2xI", d, off)
        n = nnew if nnew else nold
        p = off + 16
        cels = []
        for c in range(n):
            cs, ct = struct.unpack_from("<IH", d, p)
            body = d[p + 6:p + cs]
            if ct == 0x2004:
                flags, ltype = struct.unpack_from("<HH", body, 0)
                layers.append(flags)
            elif ct == 0x2019:
                size, first, last = struct.unpack_from("<III", body, 0)
                q = 20
                for i in range(first, last + 1):
                    fl = struct.unpack_from("<H", body, q)[0]
                    r, g, b, a = body[q + 2:q + 6]
                    pal[i] = (r, g, b, a)
                    q += 6
                    if fl & 1:
                        ln = struct.unpack_from("<H", body, q)[0]
                        q += 2 + ln
            elif ct == 0x2018:
                nt = struct.unpack_from("<H", body, 0)[0]
                q = 10
                for i in range(nt):
                    a, b, di = struct.unpack_from("<HHB", body, q)
                    q += 17
                    ln = struct.unpack_from("<H", body, q)[0]
                    nm = body[q + 2:q + 2 + ln].decode()
                    q += 2 + ln
                    tags.append((nm, a, b))
            elif ct == 0x2005:
                li, x, y, op, ctype = struct.unpack_from("<HhhBH", body, 0)
                if ctype in (0, 2):
                    w, h = struct.unpack_from("<HH", body, 16)
                    raw = body[20:]
                    if ctype == 2:
                        raw = zlib.decompress(raw)
                    cels.append((li, x, y, w, h, raw, op))
            p += cs
        frames.append((dur, cels))
        off += fs
    out = []
    for dur, cels in frames:
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for li, x, y, w, h, raw, op in sorted(cels, key=lambda c: c[0]):
            if li < len(layers) and not (layers[li] & 1):
                continue
            cim = Image.new("RGBA", (w, h))
            px = cim.load()
            for j in range(w * h):
                if depth == 32:
                    px[j % w, j // w] = tuple(raw[j * 4:j * 4 + 4])
                elif depth == 8:
                    px[j % w, j // w] = pal.get(raw[j], (0, 0, 0, 0)) if raw[j] else (0, 0, 0, 0)
            im.alpha_composite(cim, (x, y)) if x >= 0 and y >= 0 else im.paste(cim, (x, y), cim)
        out.append((im, dur))
    return out, tags, (W, H)


if __name__ == "__main__":
    import sys
    fr, tags, sz = read(sys.argv[1])
    print(sz, len(fr), tags, [d for _, d in fr])
