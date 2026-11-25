#!/bin/sh
# Monta o SG Pixel para Windows: Electron (win32-x64) + o editor em resources/app.
# Uso: sh pixel/tools/build-win.sh  ->  pixel/dist/SG-Pixel-win64.zip
set -e
VER=33.2.1
HERE=$(cd "$(dirname "$0")/.." && pwd)
OUT=$HERE/dist; W=$OUT/SG-Pixel
mkdir -p "$OUT"; rm -rf "$W"
[ -f "$OUT/electron-$VER.zip" ] || curl -sL -o "$OUT/electron-$VER.zip" https://github.com/electron/electron/releases/download/v$VER/electron-v$VER-win32-x64.zip
mkdir -p "$W"; unzip -q "$OUT/electron-$VER.zip" -d "$W"
rm -f "$W/resources/default_app.asar"
mkdir -p "$W/resources/app"
cp "$HERE/electron/main.js" "$HERE/electron/preload.js" "$HERE/electron/package.json" "$W/resources/app/"
cp -r "$HERE/app" "$W/resources/app/app"
mv "$W/electron.exe" "$W/SG Pixel.exe"
cd "$OUT"; rm -f SG-Pixel-win64.zip; zip -qr -9 SG-Pixel-win64.zip SG-Pixel
ls -la "$OUT/SG-Pixel-win64.zip"
