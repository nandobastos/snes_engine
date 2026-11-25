# Motor SNES: como os dados chegam ao jogo

## Decisão de arquitetura (etapa 1)
- A ROM-motor é o jogo (`engine/`, PVSnesLib) com **2 MB**: bancos 0–31 = código e dados fixos; bancos **32–63 = PACK** (arquivo 0x100000, `$20:8000` / FastROM `$A0:8000`).
- O editor (no navegador) só troca os bytes do pack na ROM-motor, como no Mega Drive. Não precisa do compilador.
- No início da luta o motor **copia do pack para a RAM** as tabelas que a lógica usa (`pk_load_moves`, `sf_copy` em `src/sfcopy.asm`). Assim o código C quase não muda e fica até mais rápido (RAM em vez de ROM). Gráficos (tiles) continuam em ROM e vão direto para a VRAM por DMA.
- Fonte dos dados: `project/game.json` (o editor vai gravar este arquivo) → `tools/sfpack.py` → `res/pack.bin` + `res/pack.asm`.

## Já no pack (v1)
Tabela de golpes **por lutador** (19 golpes × dano, stun, altura, flags, hitstop, som do golpe, som do impacto, duração de cada quadro). O tempo do Sagat (fracos 1/3 mais rápidos) e do DonLee (impacto longo) deixaram de ser `if` no código: são só números do lutador.

## Provado
`tests/equiv.py <ROM do fight-snes> <ROM da engine>`: 110 comandos aleatórios por lutador (Ryu, Sagat, DonLee) → registros e prints **idênticos** ao jogo original.

## O que ainda é código fixo (próximos passos)
1. Tabelas de quadros (`pf_*`, `pp_*`), animações `A_*` (hoje constantes), paletas, retratos, fase, HUD: para o pack.
2. ~25 usos de `fchar[i]` (lógica "Sagat") espalhados no `fight.c` que viram parâmetros do lutador: especiais (Tiger Shot, Tiger Uppercut/Knee), voadora, chute fraco de perto, passos mais lentos, agarrão, etc.
3. Física (andar, pulo, gravidade), custos de super/EX, IA, regras de round e HUD.
4. Número de lutadores (hoje 3 fixos: `CH_RYU/CH_SAGAT/CH_BOXER`, `SAGAT_OFF`, `BOXER_OFF`).
