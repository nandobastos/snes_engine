# SF Engine (SNES Fight Engine)

Engine e editor para jogos de luta de Super Nintendo, sem escrever código: você desenha os lutadores no **SG Pixel**, configura golpes, inputs, fases e telas no **editor**, joga no **testador** e exporta o `.sfc`.

Status: etapa 1 (formato do pack + motor lendo dados). Plano completo: `docs/PLANO.md`. Formato: `docs/FORMAT_SFPK.md`.

- `base/` — cópia de partida do editor e do SG Pixel do repositório `sg-engine` (Mega Drive). Vai ser adaptada para SNES; o `sg-engine` não é alterado.
- `docs/` — plano e formato do pack.
- O jogo de referência (Ryu, Sagat, DonLee) fica no repositório `fight-snes`; ele vira o primeiro projeto de exemplo.


## Estado atual (ferramentas prontas)
- `index.html`: página inicial com as ferramentas.
- `editor/lutadores.html`: lutadores (criar/clonar), golpes, física, magia, arte do SF Pixel, **Gerar ROM** e **Jogar** (tudo no navegador: `editor/sfbuild.js`, igual byte a byte ao `tools/exportar.py`).
- `sfpixel/`: editor de animação do SNES (paleta 15 bits, custo por quadro, camadas de hitbox/hurtbox/âncora, tags da engine).
- `tester/jogar.html`: emulador SNES local (EmulatorJS + snes9x).
- `tools/exportar.py`: exporta a ROM sem compilar (Python + Pillow). `engine/`: ROM-motor (compilar só quando o motor muda; depois `python3 tools/exportar.py --base`).
