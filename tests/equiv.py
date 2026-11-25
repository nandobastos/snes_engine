#!/usr/bin/env python3
"""Teste de equivalencia: roda os mesmos roteiros (110 comandos aleatorios com semente fixa, 3 lutadores) na ROM de referencia (fight-snes) e na ROM
da engine e compara os registros (vida, estado, posicao...) e os prints (pixel a pixel).
uso: python3 tests/equiv.py <ROM referencia> <ROM engine>"""
import os
import random
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
RUN = os.path.join(HERE, "..", "engine", "tools", "runtest.py")
KS = ["Y", "X", "B", "A", "L", "RIGHT", "LEFT", "DOWN", "Y+DOWN", "A+DOWN", "X+DOWN", "B+DOWN", "RIGHT+A", "RIGHT+X", "LEFT+B", "DOWN+RIGHT", "RIGHT+Y"]
SEL = {"ryu": "5 B\n60\n5 B\n", "sagat": "5 RIGHT\n5\n5 B\n60\n5 B\n", "donlee": "5 RIGHT\n5\n5 RIGHT\n5\n5 B\n60\n5 B\n"}


def script(sel, rnd):
    s = "start\n60\n" + sel + "wait 3\n60\npoke fhp 0 96\npoke fhp 1 96\n5 SELECT\n"
    for i in range(110):
        s += "%d %s\n%d\n" % (rnd.randint(2, 8), rnd.choice(KS), rnd.randint(2, 9))
        if i % 10 == 9:
            s += "print fhp fstate fx fatk\nshot s%d\n" % i
    return s + "poke fhp 0 96\nprint fhp fx fstate fidx\n"


def run(rom, txt, out):
    os.makedirs(out, exist_ok=True)
    r = subprocess.run([sys.executable, RUN, rom, txt, out + "/"], capture_output=True, text=True, timeout=1800)
    return r.stdout + r.stderr


def main():
    ref, eng = sys.argv[1:3]
    ok = True
    for name, sel in SEL.items():
        rnd = random.Random(7)
        tmp = tempfile.mkdtemp()
        txt = os.path.join(tmp, name + ".txt")
        open(txt, "w").write(script(sel, rnd))
        a, b = run(ref, txt, tmp + "/a"), run(eng, txt, tmp + "/b")
        shots = sorted(f for f in os.listdir(tmp + "/a") if f.endswith(".png"))
        diff = [f for f in shots if open(tmp + "/a/" + f, "rb").read() != open(tmp + "/b/" + f, "rb").read()]
        same = a == b and not diff
        ok &= same
        print("%-7s registros %s, prints diferentes: %d de %d" % (name, "iguais" if a == b else "DIFEREM", len(diff), len(shots)))
    sys.exit(0 if ok else 1)


main()
