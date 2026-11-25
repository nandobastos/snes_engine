# SF Engine (Super Nintendo)

## Como abrir (Windows)
1. Clone este repositório pelo **GitHub Desktop** (ou baixe a pasta).
2. Dê dois cliques em **`Abrir SF Engine.bat`**. Abre uma janela preta (o servidor) e o navegador na SF Engine.
   - Precisa do Python (o mesmo do SG Engine). Se a pasta veio pelo GitHub, o .bat já procura atualização sozinho.
3. Para atualizar: no GitHub Desktop, **Fetch origin** e depois **Pull**. Feche e abra o .bat de novo.
4. Para fechar: feche a janela preta.

Com o .bat, o editor abre o `project/game.json` sozinho e **Salvar** grava direto na pasta `project/`;
o SF Pixel exporta a arte direto para `project/` e os estágios criados também vão para lá.

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
