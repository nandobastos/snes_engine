#!/bin/sh
# Instala tudo que o projeto precisa num ambiente Linux (Ubuntu) novo:
# PVSnesLib (compilador C para SNES), Pillow, a fonte Unifont (textos das telas em 9 idiomas)
# e o emulador snes9x (libretro) para testes.
set -e
PVS=${PVSNESLIB_HOME:-$HOME/pvsneslib}
if [ ! -x "$PVS/devkitsnes/bin/816-tcc" ]; then
    git clone --depth 1 --recurse-submodules --shallow-submodules https://github.com/alekmaul/pvsneslib "$PVS"
    # "make" completo falha num exemplo de audio, mas compilador e libs ja ficam prontos
    (cd "$PVS" && PVSNESLIB_HOME="$PVS" make -j8 >/dev/null 2>&1 || true)
    test -x "$PVS/devkitsnes/bin/816-tcc" && test -f "$PVS/pvsneslib/lib/LoROM_SlowROM/libc.obj"
fi
pip install -q pillow
if [ ! -f /usr/lib/x86_64-linux-gnu/libretro/snes9x_libretro.so ] || [ ! -f /usr/share/fonts/opentype/unifont/unifont.otf ]; then
    SUDO=$(command -v sudo || true)
    ($SUDO apt-get update -q >/dev/null 2>&1 || true)
    $SUDO apt-get install -y -q --no-install-recommends libretro-snes9x fonts-unifont >/dev/null
fi
echo "Pronto. Use: export PVSNESLIB_HOME=$PVS && make"
