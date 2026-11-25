#!/usr/bin/env python3
"""Extrai as tabelas de golpes do fight.c ORIGINAL do jogo (fight-snes) para o projeto JSON (project/game.json).
Feito uma vez: depois disso o JSON e a fonte (o editor vai grava-lo); o fight.c da engine nao tem mais essas tabelas.
uso: python3 tools/extract_from_c.py <fight.c original> <sfx.h> <saida.json>"""
import json
import re
import sys

ATK = ["MP", "HP", "MK", "HK", "CMP", "CHP", "CMK", "CHK", "JP", "JK", "JDK", "HADOUKEN", "SHORYU", "TATSU",
       "CLOSE_HP", "CLOSE_HK", "CLOSE_MK", "CLOSE_MP", "THROW"]


def table(src, name, ns):
    m = re.search(r"const\s+[us]8\s+%s\[[^\]]*\]\s*=\s*\{(.*?)\};" % name, src, re.S)
    body = re.sub(r"//[^\n]*", "", m.group(1))
    return [eval(x.strip(), {}, ns) for x in body.replace("\n", " ").split(",") if x.strip()]


def main():
    c, h, out = sys.argv[1:4]
    src = open(c, encoding="utf-8").read()
    sfx = re.search(r"enum\s*\{(.*?)\};", open(h).read(), re.S).group(1)
    ns = {n.strip(): i for i, n in enumerate(x for x in sfx.replace("\n", " ").split(",") if x.strip())}
    ns.update(SFX_NONE=255, F_LOW=1, F_KD=2, F_MULTI=4, HGT_MID=0, HGT_LOW=1, HGT_HIGH=2)
    n = len(ATK)
    dur, dmg, stun = table(src, "atk_dur", ns), table(src, "atk_dmg", ns), table(src, "atk_stun", ns)
    hgt, flags = table(src, "atk_hgt", ns), table(src, "atk_flags", ns)
    swing, hit = table(src, "snd_swing", ns), table(src, "snd_hit", ns)
    bx = table(src, "bx_dur", ns)
    assert len(dur) == n * 8 and len(dmg) == n and len(bx) == n * 8
    strong = {"HP", "HK", "CHP", "CHK", "CLOSE_HP", "CLOSE_HK"}
    weak3 = {"MP", "MK", "CMP", "CMK", "CLOSE_MP", "CLOSE_MK"}   # Sagat: golpes fracos 1/3 mais rapidos
    fighters = []
    for name, ch in (("Ryu", 0), ("Sagat", 1), ("DonLee", 2)):
        moves = {}
        for k, a in enumerate(ATK):
            d = []
            for f in range(8):
                v = dur[k * 8 + f]
                if ch == 1 and a in weak3 and v > 1 and v != 255:
                    v -= v // 3
                if ch == 2 and bx[k * 8 + f]:
                    v = bx[k * 8 + f]
                d.append(v)
            hs = 6
            if a == "SHORYU":
                hs = 10
            elif a in strong:
                hs = 12 if ch == 1 else 9
            moves[a] = dict(dur=d, dmg=dmg[k], stun=stun[k], hgt=hgt[k], flags=flags[k], hitstop=hs,
                            snd_swing=swing[k], snd_hit=hit[k])
        fighters.append(dict(name=name, moves=moves))
    json.dump(dict(atk_names=ATK, fighters=fighters), open(out, "w"), indent=1)
    print("ok:", out)


main()
