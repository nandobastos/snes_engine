#!/usr/bin/env python3
"""Gera audio/sfx.it (modulo Impulse Tracker so com efeitos) a partir dos WAVs de audio/wav/.
Cada efeito e um instrumento (o numero do efeito no jogo = posicao em SFX, 0-based). O smconv (make) converte para SPC.
uso: python3 tools/mksfx.py"""
import os
import struct
import wave

import numpy as np

RATE_FIELD = int(os.environ.get("SFX_RATE_FIELD", "0"))
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WAV = os.path.join(ROOT, "audio", "wav")

# taxa nativa do tom 3 do SNESMOD (efeitos tocam a 4044 Hz x tom, ignorando a taxa do .it; src/fight.c: SFX_PITCH)
RATE = 8088            # tom 2 (4044 Hz x 2). Banco >32 KB (2 bancos de ROM) travou a inicializacao: tem que caber em 32 KB
RATE2 = 8088
RATE_KO = 4044         # tom 1 (vozes longas e o grito)
RATE_HAD = 12132       # Hadouken: tom 3 (voz mais clara)

# (nome no jogo, arquivo, taxa de amostragem). A ordem define o numero do efeito (SFX_* em src/fight.c).
SFX = [
    ("LIGHT",     "SFII_38 - Light Attack.wav", RATE),
    ("MEDIUM",    "SFII_39 - Medium Attack.wav", RATE),
    ("HARD1",     "SFII_40 - Hard Attack1.wav", RATE),
    ("HARD2",     "SFII_41- Hard Attack2.wav", RATE),
    ("JAB",       "SFII_42 - Jab Hit.wav", RATE),
    ("STRONG",    "SFII_43 - Strong Hit.wav", RATE),
    ("FIERCE",    "SFII_44 - Fierce Hit.wav", RATE),
    ("SHORT",     "SFII_45 - Short Hit.wav", RATE),
    ("FORWARD",   "SFII_46 - Forward Hit.wav", RATE),
    ("ROUNDHOUSE", "SFII_47 - Roundhouse Hit.wav", RATE),
    ("BLOCKED",   "SFII_51 - Blocked.wav", RATE),
    ("GROUND",    "SFII_52 - Hit the ground.wav", RATE),
    ("LANDING",   "SFII_53 - Landing.wav", RATE),
    ("HADOUKEN",  "SFII_69 - RyuKen Hadouken.wav", RATE),
    ("SHORYU",    "SFII_70_Shoryuken.wav", RATE2),          # voz do Shoryuken (arquivo 70, pelo tamanho/ordem)
    ("TATSU",     "SFII_71_Tatsumaki.wav", RATE2),          # voz do Tatsumaki (arquivo 71)
    ("MOVE",      "SFII_02_MoveCursor.wav", RATE2),          # SFII_02 - Move Cursor
    ("OK",        "SFII_03_Selection.wav", RATE2),          # SFII_03 - Selection
    ("TIGER",     "SFII_72 - Sagat Tiger.wav", RATE2),   # Sagat: "Tiger!" (Tiger Shot)
    ("TIGERUP",   "SFII_74_TigerUppercut.wav", RATE2),        # Sagat: "Tiger Uppercut" (arquivo 74)
    # anunciante (tom 2): conjuntos proprios por tela (intro do round, resultado, contagem do Continue)
    ("V_ROUND",   "SFII_18 - Round.wav", RATE),
    ("V_ONE",     "SFII_19 - One.wav", RATE),
    ("V_TWO",     "SFII_20 - Two.wav", RATE),
    ("V_THREE",   "SFII_22 - Three.wav", RATE),
    ("V_FIGHT",   "SFII_17 - Fight!.wav", RATE),
    ("V_WIN",     "SFII_14 - You win!.wav", RATE_KO),
    ("V_LOSE",    "SFII_15 - You lose.wav", RATE_KO),
    ("KO",        "SFII_67 - KO Male.wav", RATE_KO),   # grito de morte ("uoh uohh"): tom 1 (4044 Hz), cabe no conjunto da luta
    ("V_C9",      "SFII_79 - Count NINE.wav", RATE_KO),
    ("V_C8",      "SFII_80 - Count EIGHT.wav", RATE_KO),
    ("V_C7",      "SFII_81 - Count SEVEN.wav", RATE_KO),
    ("V_C6",      "SFII_82 - Count SIX.wav", RATE_KO),
    ("V_C5",      "SFII_83 - Count FIVE.wav", RATE_KO),
    ("V_C4",      "SFII_84 - Count FOUR.wav", RATE_KO),
    ("V_C3",      "SFII_85 - Count THREE.wav", RATE_KO),
    ("V_C2",      "SFII_86 - Count  TWO.wav", RATE_KO),
    ("V_C1",      "SFII_87 - Count ONE.wav", RATE_KO),
    ("V_PERFECT", "SFII_16 - Perfect.wav", RATE_KO),
    ("PAUSE",     "SFII_77 - Pause Game.wav", RATE2),
]


# duracao maxima (s): a memoria de amostras do SPC enche em ~33 KB; o que passa nao carrega (o ultimo efeito fica mudo)
MAXS = {"KO": 1.7, "OK": 0.45, "MOVE": 0.2, "TATSU": 0.95, "SHORYU": 0.9, "FIERCE": 0.35, "ROUNDHOUSE": 0.35, "GROUND": 0.28}
THR = {"V_PERFECT": 0.004, "V_ROUND": 0.004, "V_ONE": 0.004, "V_TWO": 0.004, "V_THREE": 0.004, "V_FIGHT": 0.004, "V_WIN": 0.004, "V_LOSE": 0.004, "KO": 0.004,
       **{"V_C%d" % i: 0.004 for i in range(1, 10)},
       "TIGER": 0.004, "TIGERUP": 0.004, "MOVE": 0.01, "OK": 0.01, "HADOUKEN": 0.004, "SHORYU": 0.004, "TATSU": 0.004}                      # limiar do corte de silencio (padrao 0.03)


VOICES = {"V_WIN", "V_LOSE", "V_PERFECT"} | {"V_C%d" % i for i in range(1, 10)}


def voice_filter(a, src, rate):
    """tira graves abaixo de ~120 Hz, corta nitido em 0,47 x taxa (sem o borrao do filtro de media) e realca os agudos
    (consoantes) para a voz nao ficar abafada na taxa baixa"""
    a = a - np.convolve(a, np.ones(int(src / 120)) / int(src / 120), mode="same")     # passa-alta ~120 Hz
    a = np.append(a[0], a[1:] - 0.55 * a[:-1])                                          # pre-enfase
    fc = 0.47 * rate / src                                                              # corte (fracao da taxa de entrada)
    n = 129
    t = np.arange(n) - n // 2
    h = np.sinc(2 * fc * t) * np.blackman(n)
    h /= h.sum()
    return np.convolve(a, h, mode="same")


def load(path, rate, name=""):
    w = wave.open(path)
    n, ch = w.getnframes(), w.getnchannels()
    a = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float64).reshape(-1, ch).mean(axis=1)
    src = w.getframerate()
    if name in VOICES:
        a = voice_filter(a, src, rate)                        # voz: passa-alta 120 Hz + passa-baixa nitido + realce de agudos
    else:
        k = max(1, int(round(src / float(rate))))
        a = np.convolve(a, np.ones(k) / k, mode="same")      # filtro simples antes de reduzir a taxa
    t = np.arange(0, len(a) - 1, src / float(rate))
    a = np.interp(t, np.arange(len(a)), a)
    peak = np.abs(a).max() or 1.0
    a = a / peak
    if name in VOICES:
        a *= 0.891                                            # pico em -1 dB
    keep = np.nonzero(np.abs(a) > THR.get(name, 0.03))[0]                   # tira silencio no comeco e no fim
    if len(keep):
        a = a[keep[0]:keep[-1] + 1]
    if name in MAXS:
        a = a[:int(MAXS[name] * rate)]
    fade = min(len(a), int(rate * (0.04 if name in THR else 0.01)))
    a[-fade:] *= np.linspace(1, 0, fade)
    a = a[:len(a) - len(a) % 16] if len(a) > 16 else a
    return (a * 30000).astype("<i2")


def write_it(path, sfx, pcm):
    hdr = bytearray(open(os.path.join(HERE, "it_hdr.bin"), "rb").read())
    ins_t = open(os.path.join(HERE, "it_instr.bin"), "rb").read()
    smp_t = open(os.path.join(HERE, "it_smp.bin"), "rb").read()
    n = len(sfx)
    struct.pack_into("<4H", hdr, 0x20, 2, n, n, 1)            # ordens, instrumentos, amostras, padroes
    for off in (0x2C, 0x2E):
        pass
    orders = bytes([0, 255])
    base = 0xC0 + len(orders) + 4 * n * 2 + 4
    ins_off = [base + i * 554 for i in range(n)]
    smp_off = [base + n * 554 + i * 80 for i in range(n)]
    pat_off = base + n * 554 + n * 80
    pat = struct.pack("<HH4x", 64, 64) + bytes(64)
    data_off = pat_off + len(pat)
    out = bytearray(hdr)
    out += orders
    for o in ins_off:
        out += struct.pack("<I", o)
    for o in smp_off:
        out += struct.pack("<I", o)
    out += struct.pack("<I", pat_off)
    for i, (name, f, rate) in enumerate(sfx):
        ins = bytearray(ins_t)
        ins[0x04:0x10] = (name[:11] + "\0" * 12).encode()[:12]
        ins[0x20:0x3A] = (name + "\0" * 26).encode()[:26]
        for note in range(120):
            ins[0x40 + note * 2] = note
            ins[0x41 + note * 2] = i + 1
        out += ins
    ptr = data_off
    for i, (name, f, rate) in enumerate(sfx):
        s = bytearray(smp_t)
        s[0x04:0x10] = (name[:11] + "\0" * 12).encode()[:12]
        s[0x14:0x2E] = (name + "\0" * 26).encode()[:26]
        s[0x12] = 3                                           # presente + 16 bits
        s[0x13] = 64
        s[0x2E] = 1                                           # com sinal
        struct.pack_into("<I", s, 0x30, len(pcm[i]))
        struct.pack_into("<II", s, 0x34, 0, 0)                # sem loop
        struct.pack_into("<I", s, 0x3C, RATE_FIELD or rate)
        struct.pack_into("<II", s, 0x40, 0, 0)
        struct.pack_into("<I", s, 0x48, ptr)
        out += s
        ptr += len(pcm[i]) * 2
    out += pat
    for p in pcm:
        out += p.tobytes()
    open(path, "wb").write(out)


def main():
    pcm = [load(os.path.join(WAV, f), r, n) for n, f, r in SFX]
    write_it(os.path.join(ROOT, "audio", "sfx.it"), SFX, pcm)
    # modulo quase vazio (1 amostra muda): spcLoad dele zera a memoria de efeitos do SPC antes de carregar outro
    # conjunto de efeitos (o SNESMOD so toca 16 efeitos: o indice tem 4 bits)
    import numpy as _np
    write_it(os.path.join(ROOT, "audio", "empty.it"), [("EMPTY", "", RATE)], [_np.zeros(16, dtype="<i2")])
    tot = sum(len(p) for p in pcm)
    print("sfx.it: %d efeitos, %d amostras (~%d KB em BRR)" % (len(SFX), tot, tot * 9 // 16 // 1024))


if __name__ == "__main__":
    main()
