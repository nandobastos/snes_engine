#!/usr/bin/env python3
"""FastROM: o hdr.asm poe .BASE $80 (codigo na ROM rapida, bancos $80+), mas a RAM continua nos bancos $7E/$7F.
As secoes de RAM que o tcc gera (.RAMSECTION) ficariam em $FE/$FF (ROM!). Aqui cada .RAMSECTION ganha
.BASE $00 antes e .BASE $80 depois do .ENDS (como fazem as bibliotecas da PVSnesLib)."""
import sys

p = sys.argv[1]
out = []
inram = False
for line in open(p).read().split("\n"):
    if line.lstrip().upper().startswith(".RAMSECTION"):
        out.append(".BASE $00")
        inram = True
    out.append(line)
    if inram and line.strip().upper() == ".ENDS":
        out.append(".BASE $80")
        inram = False
open(p, "w").write("\n".join(out))
