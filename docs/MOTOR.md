# Motor SNES: como os dados chegam ao jogo

## Decisão de arquitetura (etapa 1)
- A ROM-motor é o jogo (`engine/`, PVSnesLib) com **2 MB**: bancos 0–31 = código e dados fixos; bancos **32–63 = PACK** (arquivo 0x100000, `$20:8000` / FastROM `$A0:8000`).
- O editor (no navegador) só troca os bytes do pack na ROM-motor, como no Mega Drive. Não precisa do compilador.
- No início da luta o motor **copia do pack para a RAM** as tabelas que a lógica usa (`pk_load_moves`, `sf_copy` em `src/sfcopy.asm`). Assim o código C quase não muda e fica até mais rápido (RAM em vez de ROM). Gráficos (tiles) continuam em ROM e vão direto para a VRAM por DMA.
- Fonte dos dados: `project/game.json` (o editor vai gravar este arquivo) → `tools/sfpack.py` → `res/pack.bin` + `res/pack.asm`.

## Já no pack (v2)
- **Quadros**: 25 tabelas (hitbox, hurtbox, peças) e **todos os gráficos dos lutadores** (16 blocos). Saíram da ROM fixa; o motor copia as tabelas para a RAM (~22 KB) no início da luta e o `plan_frames`/`draw_obj` em assembly leem os gráficos direto do pack por DMA.
- Tabela de golpes **por lutador** (19 golpes × dano, stun, altura, flags, hitstop, som do golpe, som do impacto, duração de cada quadro). O tempo do Sagat (fracos 1/3 mais rápidos) e do DonLee (impacto longo) deixaram de ser `if` no código: são só números do lutador.

- **Assets**: cenário (tiles, mapa, paleta), retratos, HUD e paletas dos 3 lutadores também vêm do pack (DMA direto para VRAM/CGRAM: `sf_vram`/`sf_cgram`).

## Regras da RAM (aprendido na marra)
- As variáveis do C (`.bss`) só cabem em `$7E:2000–$7FFF` (~24 KB): de `$7E:8000` em diante ficam as variáveis da PVSnesLib (texto, OAM...) e o linker **não avisa** quando as do C passam disso (sobrescreviam a OAM).
- Tabelas grandes ficam no banco **$7F**, declaradas em assembly (`res/sfram.asm`, gerado por `tools/mkfight.py`) e `extern` no C; o `sf_copy` copia por DMA para $7E ou $7F (`pk_db`).
- No tcc-816, passar `(u16)&variavel` como argumento de função empilha 4 bytes e embaralha os outros argumentos: o destino vai em `pk_dst`.

## Provado
`tests/equiv.py <ROM do fight-snes> <ROM da engine>`: 110 comandos aleatórios por lutador (Ryu, Sagat, DonLee) → registros e prints **idênticos** ao jogo original. Também conferidos pixel a pixel: seleção, luta e pausa.

## O que ainda é código fixo (próximos passos)
1. Animações `A_*` (hoje constantes de compilação: o conjunto de animações padrão é o contrato do motor; menos quadros = repete o último), sons, menus/logo/textos: para o pack.
2. ~25 usos de `fchar[i]` (lógica "Sagat") espalhados no `fight.c` que viram parâmetros do lutador: especiais (Tiger Shot, Tiger Uppercut/Knee), voadora, chute fraco de perto, passos mais lentos, agarrão, etc.
3. Física (andar, pulo, gravidade), custos de super/EX, IA, regras de round e HUD.
4. Número de lutadores (hoje 3 fixos: `CH_RYU/CH_SAGAT/CH_BOXER`, `SAGAT_OFF`, `BOXER_OFF`).

## Diferenca do DonLee x DonLee: RESOLVIDA (era bug do jogo original)
O print diferente (quadro 89, DonLee no ar) vinha do src/drawobj.asm do jogo original: o desenho no ar usava belt_ref[fchar] (o DonLee tem
fchar 0 = Ryu, entao pegava a altura do Ryu: 7 px de diferenca entre o desenho e as caixas). A engine usa belt_ref do proprio jogador.
Prova: o jogo original com esse unico ajuste (belt_ref[fgfx]) fica identico a engine nos 3 lutadores (0 de 33 prints diferentes).
Na comparacao com o original sem ajuste, o DonLee continua mostrando essa 1 diferenca (esperado).
Tracos 18-21 (retrato, retrato alt., paleta do game over, 1o oponente do arcade) sao copiados para a RAM no boot (ftc[]).

## Criar / clonar lutador (editor/lutadores.html e tools/lutadores.py)
Clone = copia profunda de golpes e tracos no game.json (independente do original). A arte comeca emprestada: traco `frames_from`
(indice do lutador dono dos quadros), `face_idx` (retrato), `pal_asset`. A tela de selecao mostra os lutadores do pack (ate 8; celulas
extras ficam cinza). Pendente: arte propria (SG Pixel -> quadros novos no pack), retrato e paleta proprios, e o estagio por lutador.
Testado: Ryu clonado como 4o lutador aparece na selecao e luta.

## Arte propria (SF Pixel -> engine)
traits.art = arquivo .sffighter.json (em project/). engine/tools/mkfight.py (bloco "lutadores com arte propria") le o arquivo e acrescenta os quadros
depois do DonLee (mesma ordem/contagem de animacoes do Ryu; animacao ausente = quadro do Ryu; menos quadros = repete o ultimo), gera graficos em pedacos 16x16,
caixas (relativas a ancora e ao chao) e art_<nome>.pal (P1=P2). frames.json ganha art_bases/art_pals; sfpack usa no frame_base e pal_asset. asset_tab agora tem 32 ids.

## Retrato proprio (ate 2 lutadores novos)
Tag "retrato" no SF Pixel (1 quadro, ate 56x80, mesma paleta do lutador) -> portrait no .sffighter.json -> rosto 3/4 no face.bin e
paleta 7/8 no face.pal; vai para as paletas alternativas 3/6 da selecao (face_vs_fix devolve a original no VS de espelho de um original).
Limite: a VRAM do BG1 (0x0000-0x17FF) cabe 5 rostos. Testado: selecao e VS com o retrato; telas dos originais identicas.

## Estagio por lutador
Tracos 36-38 = ids dos assets do cenario (tiles, mapa, paletas); a luta usa o estagio do P2 (oponente). Padrao 0,1,2 = o cenario original.
editor/sfstage.js converte qualquer imagem (256x224, encaixada pela largura, encostada embaixo) em 6 paletas de 15 cores e ate 512 tiles
(k-means nos grupos de tiles e nas cores; tiles repetidos e espelhados viram um so). Resultado = .sfstage.json (traits.stage).
Testado: estagio convertido aparece na luta quando o lutador e o P2; ROM do navegador = ROM do Python; lutadores originais identicos.
