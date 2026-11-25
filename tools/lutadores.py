#!/usr/bin/env python3
"""Criar, clonar e remover lutadores do project/game.json (a mesma logica da pagina editor/lutadores.html).
Um lutador clonado e uma COPIA: golpes, tempos, danos e tracos sao independentes do original. A arte (quadros, retrato, paleta)
continua apontando para a do original ("frames_from", "face_idx", "pal_asset") ate voce trocar pela arte propria (SG Pixel).
uso:  python3 tools/lutadores.py listar
      python3 tools/lutadores.py clonar Ryu "Ken"
      python3 tools/lutadores.py novo   DonLee "Meu Lutador"     (parte do modelo escolhido)
      python3 tools/lutadores.py remover "Ken"                   (so lutadores criados; os 3 originais ficam)
      python3 tools/lutadores.py golpe "Ken" HP dmg 30           (muda um valor de um golpe)
      python3 tools/lutadores.py traco "Ken" jump_vy 270         (muda um traco)"""
import copy
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.join(os.path.dirname(HERE), "project", "game.json")
MAX_FIGHTERS = 8
ORIGINAIS = 3          # Ryu, Sagat, DonLee: o motor tem a arte deles; nao podem ser removidos


def find(g, nome):
    for i, f in enumerate(g["fighters"]):
        if f["name"].lower() == nome.lower():
            return i
    raise SystemExit("lutador nao encontrado: %s (use 'listar')" % nome)


def clonar(g, origem, nome):
    if len(g["fighters"]) >= MAX_FIGHTERS:
        raise SystemExit("limite de %d lutadores" % MAX_FIGHTERS)
    if any(f["name"].lower() == nome.lower() for f in g["fighters"]):
        raise SystemExit("ja existe um lutador chamado %s" % nome)
    i = find(g, origem)
    src = g["fighters"][i]
    novo = copy.deepcopy(src)          # copia profunda: mudar o clone nao mexe no original
    novo["name"] = nome
    t = novo["traits"]
    t.setdefault("frames_from", src["traits"].get("frames_from", i))   # arte emprestada do original (por enquanto)
    t["clone_of"] = src["name"]
    g["fighters"].append(novo)
    return len(g["fighters"]) - 1


def remover(g, nome):
    i = find(g, nome)
    if i < ORIGINAIS:
        raise SystemExit("%s e um lutador original: nao pode ser removido" % nome)
    for f in g["fighters"]:
        if f["traits"].get("frames_from", -1) == i:
            raise SystemExit("outro lutador usa a arte de %s" % nome)
    del g["fighters"][i]


def listar(g):
    for i, f in enumerate(g["fighters"]):
        t = f["traits"]
        print("%d  %-14s %s" % (i, f["name"], ("clone de " + t["clone_of"]) if "clone_of" in t else "original" if i < ORIGINAIS else "novo"))


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        return
    g = json.load(open(GAME))
    cmd = a[0]
    if cmd == "listar":
        listar(g)
        return
    if cmd in ("clonar", "novo"):
        clonar(g, a[1], a[2])
    elif cmd == "remover":
        remover(g, a[1])
    elif cmd == "golpe":
        f = g["fighters"][find(g, a[1])]
        m = f["moves"][a[2]]
        m[a[3]] = json.loads(a[4])
    elif cmd == "traco":
        f = g["fighters"][find(g, a[1])]
        f["traits"][a[2]] = json.loads(a[3])
    else:
        print(__doc__)
        return
    json.dump(g, open(GAME, "w"), indent=2, ensure_ascii=False)
    listar(g)


if __name__ == "__main__":
    main()
