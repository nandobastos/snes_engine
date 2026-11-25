#!/usr/bin/env python3
"""Fixa cada secao do banco de sons (gerado pelo smconv) no comeco do seu banco de ROM ($8000) e cria o rotulo
SOUNDBANK__ (o 1o pedaco), que o jogo passa para o spcSetBank."""
import re
import sys

p = sys.argv[1]
s = open(p).read()
s = re.sub(r'\.SECTION "(SOUNDBANK\d*)"[^\n]*', r'.ORG 0\n.SECTION "\1" FORCE', s)
if "SOUNDBANK__:" not in s:
    s = s.replace("SOUNDBANK__0:", "SOUNDBANK__:\nSOUNDBANK__0:", 1)
open(p, "w").write(s)
