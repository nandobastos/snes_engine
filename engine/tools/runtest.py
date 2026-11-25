#!/usr/bin/env python3
"""Roda a ROM no snes9x (libretro) sem janela, com botoes programados, e salva capturas.

uso: python3 tools/runtest.py fight.sfc roteiro.txt saida/
roteiro: uma linha por trecho -> "<frames> <botoes separados por +>" (ex: "60 RIGHT+Y")
         "shot <nome>" salva a tela atual em saida/<nome>.png
         "print var1 var2 ..." mostra variaveis (16 bits) usando o arquivo .sym
         "audio" mostra a energia do som gerado desde a ultima chamada (0 = silencio)
         "dump var n" mostra n bytes a partir da variavel (hexadecimal)
         "poke var indice byte" muda um byte da RAM
         "start" espera a tela de selecao de lutadores (o jogo comeca nela)
         "wait <n>" espera a tela n (1 selecao, 2 VS, 3 luta) ficar revelada
"""
import ctypes as C
import os
import re
import sys
from PIL import Image

CORE = "/usr/lib/x86_64-linux-gnu/libretro/snes9x_libretro.so"
BUTTONS = {"B": 0, "Y": 1, "SELECT": 2, "START": 3, "UP": 4, "DOWN": 5, "LEFT": 6, "RIGHT": 7,
           "A": 8, "X": 9, "L": 10, "R": 11}


class GameInfo(C.Structure):
    _fields_ = [("path", C.c_char_p), ("data", C.c_void_p), ("size", C.c_size_t), ("meta", C.c_char_p)]


ENV = C.CFUNCTYPE(C.c_bool, C.c_uint, C.c_void_p)
VIDEO = C.CFUNCTYPE(None, C.c_void_p, C.c_uint, C.c_uint, C.c_size_t)
AUDIO = C.CFUNCTYPE(None, C.c_int16, C.c_int16)
AUDIOB = C.CFUNCTYPE(C.c_size_t, C.c_void_p, C.c_size_t)
POLL = C.CFUNCTYPE(None)
STATE = C.CFUNCTYPE(C.c_int16, C.c_uint, C.c_uint, C.c_uint, C.c_uint)

state = {"fmt": 0, "frame": None, "held": set(), "held2": set(), "aud": 0, "aud_n": 0}


def env(cmd, data):
    if cmd == 10:  # SET_PIXEL_FORMAT
        state["fmt"] = C.cast(data, C.POINTER(C.c_int)).contents.value
        return True
    if cmd in (9, 31):  # system / save dir
        C.cast(data, C.POINTER(C.c_char_p))[0] = b"/tmp"
        return True
    return False


def video(data, w, h, pitch):
    if data:
        state["frame"] = (C.string_at(data, pitch * h), w, h, pitch)


def audio_batch(data, frames):
    # soma da energia do som (|amostras|) para os testes de efeitos sonoros
    if data and frames:
        a = C.cast(data, C.POINTER(C.c_int16))
        state.setdefault("raw", bytearray()).extend(C.string_at(data, frames * 4))
        tot = 0
        for i in range(0, frames * 2, 7):
            tot += abs(a[i])
        state["aud"] += tot
        state["aud_n"] += frames
    return frames


def to_image():
    raw, w, h, pitch = state["frame"]
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        row = raw[y * pitch:(y + 1) * pitch]
        for x in range(w):
            v = row[2 * x] | (row[2 * x + 1] << 8)
            if state["fmt"] == 2:  # RGB565
                r, g, b = (v >> 11) & 31, (v >> 5) & 63, v & 31
                px[x, y] = (r << 3, g << 2, b << 3)
            else:  # 0RGB1555
                r, g, b = (v >> 10) & 31, (v >> 5) & 31, v & 31
                px[x, y] = (r << 3, g << 3, b << 3)
    return img


def read_var(core, syms, name, idx=0, size=2):
    ram = C.string_at(core.retro_get_memory_data(2), 0x20000)
    a = (syms[name] & 0x1FFFF) + idx * size
    v = ram[a] if size == 1 else ram[a] | (ram[a + 1] << 8)
    if size == 2 and v >= 32768:
        v -= 65536
    return v


def main():
    rom, script, outdir = sys.argv[1:4]
    os.makedirs(outdir, exist_ok=True)
    core = C.CDLL(CORE)
    cbs = [ENV(env), VIDEO(video), AUDIO(lambda l, r: None), AUDIOB(audio_batch), POLL(lambda: None),
           STATE(lambda port, dev, idx, bid: 1 if (port == 0 and bid in state["held"]) or (port == 1 and bid in state["held2"]) else 0)]
    core.retro_set_environment(cbs[0])
    core.retro_set_video_refresh(cbs[1])
    core.retro_set_audio_sample(cbs[2])
    core.retro_set_audio_sample_batch(cbs[3])
    core.retro_set_input_poll(cbs[4])
    core.retro_set_input_state(cbs[5])
    core.retro_init()
    core.retro_get_memory_data.restype = C.c_void_p
    syms = {}
    symf = os.path.splitext(rom)[0] + ".sym"
    if os.path.exists(symf):
        for l in open(symf):
            f = l.split()
            if len(f) == 2 and len(f[0]) == 8:
                try:
                    syms[f[1]] = int(f[0], 16)
                except ValueError:
                    pass
    data = open(rom, "rb").read()
    buf = C.create_string_buffer(data, len(data))
    info = GameInfo(rom.encode(), C.cast(buf, C.c_void_p), len(data), None)
    if not core.retro_load_game(C.byref(info)):
        raise SystemExit("falha ao carregar ROM")
    for line in open(script):
        line = line.split("#")[0].strip()
        if not line:
            continue
        parts = line.split()
        if parts[0] == "print":
            print("  ".join("%s=%d" % (n, read_var(core, syms, n)) for n in parts[1:]))
            continue
        if parts[0] == "audiosave":  # audiosave arquivo.wav: grava o som desde o inicio (ou a ultima gravacao)
            import wave
            wf = wave.open(parts[1], "wb")
            wf.setnchannels(2)
            wf.setsampwidth(2)
            wf.setframerate(32040)
            wf.writeframes(bytes(state.get("raw", b"")))
            wf.close()
            state["raw"] = bytearray()
            continue
        if parts[0] == "audio":  # audio: mostra a energia do som desde a ultima chamada
            print("audio energia=%d amostras=%d" % (state["aud"], state["aud_n"]))
            state["aud"] = state["aud_n"] = 0
            continue
        if parts[0] == "dump":  # dump <var> <bytes>  (mostra os bytes em hexadecimal)
            a = (syms[parts[1]] & 0x1FFFF)
            mem = C.cast(core.retro_get_memory_data(2), C.POINTER(C.c_uint8))
            print("%s: %s" % (parts[1], " ".join("%02x" % mem[a + i] for i in range(int(parts[2])))))
            continue
        if parts[0] == "vdump":  # vdump <endereco em palavras> <bytes>: VRAM
            a = int(parts[1], 0) * 2
            mem = C.cast(core.retro_get_memory_data(3), C.POINTER(C.c_uint8))
            print("vram %s: %s" % (parts[1], " ".join("%02x" % mem[a + i] for i in range(int(parts[2])))))
            continue
        if parts[0] == "poke":  # poke <var> <indice> <valor_byte>
            a = (syms[parts[1]] & 0x1FFFF) + int(parts[2])
            C.cast(core.retro_get_memory_data(2), C.POINTER(C.c_uint8))[a] = int(parts[3])
            continue
        if parts[0] == "peek":  # peek <var> <indice>  (byte)
            print("%s[%s]=%d" % (parts[1], parts[2], read_var(core, syms, parts[1], int(parts[2]), 1)))
            continue
        if parts[0] == "set":  # set <var> <valor 16 bits>  (ex: teleportar o Morgan)
            a = syms[parts[1]] & 0x1FFFF
            v = int(parts[2]) & 0xFFFF
            mem = C.cast(core.retro_get_memory_data(2), C.POINTER(C.c_uint8))
            mem[a], mem[a + 1] = v & 255, v >> 8
            continue
        if parts[0] in ("start", "wait"):
            # start: splash -> menu -> Start Game -> tela de selecao; wait <tela>: espera a tela (1 selecao, 2 VS, 3 luta)
            def run_until(cond, limit=3000):
                for _ in range(limit):
                    if cond():
                        return
                    core.retro_run()
                raise SystemExit("%s: tempo esgotado" % parts[0])

            def tela_pronta(n):
                return read_var(core, syms, "game_screen", 0, 1) == n and read_var(core, syms, "wipe_phase", 0, 1) == 0
            if parts[0] == "wait":
                run_until(lambda: tela_pronta(int(parts[1])), 6000)
                continue
            state["held"] = set()
            # splash -> titulo (cursor ja em Practice) -> B -> selecao
            run_until(lambda: read_var(core, syms, "menu_idle", 0, 1) == 1 and read_var(core, syms, "screen", 0, 1) == 1
                      and read_var(core, syms, "wipe_phase", 0, 1) == 0, 6000)
            state["held"] = {BUTTONS["B"]}
            for _ in range(3):
                core.retro_run()
            state["held"] = set()
            run_until(lambda: tela_pronta(1), 6000)
            continue
        if parts[0] == "title":  # espera o titulo parado (menu_idle)
            for _ in range(6000):
                if read_var(core, syms, "menu_idle", 0, 1) == 1 and read_var(core, syms, "wipe_phase", 0, 1) == 0:
                    break
                core.retro_run()
            continue
        if parts[0] == "sram":  # sram <bytes>: mostra o comeco da SRAM; sramsave/sramload <arquivo>
            m = C.cast(core.retro_get_memory_data(0), C.POINTER(C.c_uint8))
            print("sram: " + " ".join("%02x" % m[i] for i in range(int(parts[1]))))
            continue
        if parts[0] in ("sramsave", "sramload"):
            core.retro_get_memory_size.restype = C.c_size_t
            n = core.retro_get_memory_size(0)
            m = C.cast(core.retro_get_memory_data(0), C.POINTER(C.c_uint8))
            if parts[0] == "sramsave":
                open(parts[1], "wb").write(bytes(m[i] for i in range(n)))
            else:
                d = open(parts[1], "rb").read()
                for i in range(min(n, len(d))):
                    m[i] = d[i]
            continue
        if parts[0] == "shot":
            to_image().save(os.path.join(outdir, parts[1] + ".png"))
            continue
        n = int(parts[0])
        bt = parts[1].split("+") if len(parts) > 1 else []
        state["held"] = {BUTTONS[b] for b in bt if not b.startswith("2")}   # "2B" = botao B do controle 2
        state["held2"] = {BUTTONS[b[1:]] for b in bt if b.startswith("2")}
        for _ in range(n):
            core.retro_run()
    core.retro_unload_game()
    core.retro_deinit()


if __name__ == "__main__":
    main()
