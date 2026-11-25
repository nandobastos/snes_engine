# Testador (emulador no navegador)

Abra `jogar.html` por um servidor local (ex.: `python3 -m http.server` na pasta do repositório e acesse
http://localhost:8000/tester/jogar.html) e escolha a ROM (`saida/jogo.sfc`, gerada por `python3 tools/exportar.py`).
Também aceita arrastar o arquivo, ou receber a ROM do editor por `postMessage({type: "sf-rom", rom})`.

Emulador: EmulatorJS 4.2.3 (GPL-3.0) com o núcleo snes9x, tudo local em `ejs/` (sem internet).
Licenças: EmulatorJS é GPL-3.0; o snes9x só permite uso não comercial. Serve para testar; para vender, rever.
Testado: abre o jogo, o menu e a seleção de lutadores rodam no navegador.
