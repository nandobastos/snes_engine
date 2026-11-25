# Contexto do projeto Fight (memória para o Claude)

> Linha do tempo e pendências: ver **`HISTORICO.md`**.

Jogo de luta para **SNES escrito em C** (PVSnesLib) do usuário Nando Bastos, estilo **Street Fighter II**
só que mais simples. Usuário fala **português**; responder em PT-BR, de forma simples (não é programador
experiente). Repositório privado `nandobastos/fight-snes`. O usuário sobe arquivos pelo GitHub (lembrar:
clicar em "Commit changes"). O projeto **Morgan** (`nandobastos/morgan-snes`) é separado e continua em
paralelo — nunca mexer nele daqui.

## Especificação (resumo do md do usuário)
- Telas: **seleção** (8 caixas, só o Ryu colorido; as outras 7 em preto e branco; D-Pad move, **B** confirma,
  **A** volta ao título) → **VS** (P1 à esquerda, P2 à direita com paleta alternativa e espelhado, "VS" no
  centro, 3 s) → **luta** (P1 do jogador, P2 boneco parado).
- Física SF2: gravidade alta, sem controle no ar, andar com velocidade constante, pulo neutro e diagonais,
  o sprite vira (flip H) para encarar o oponente.
- Botões do SNES: **B** soco médio (MP), **Y** soco forte (HP), **A** chute médio (MK), **X** chute forte (HK).
  Sem agarrões.
- Especiais com buffer de ~12-24 quadros e espelhados pelo lado: Hadouken (↓↘→+soco, projétil),
  Shoryuken (→↓↘+soco, invencível na subida), Tatsumaki (↓↙←+chute, vários golpes).
- Caixas: pushbox, hurtbox (cabeça/tronco/pernas) e hitbox só nos quadros ativos. Chute forte agachado
  (rasteira) acerta as PERNAS e derruba.
- FSM: IDLE, WALKING, CROUCHING, JUMPING, ATTACKING, HITSTUN, KNOCKDOWN com frame data
  (startup/active/recovery).
- Barras de energia **provisórias** (a pedido): enchem e esvaziam com o dano; a 0 o lutador cai e, depois
  de ~2,5 s, o round recomeça com as barras cheias.

## Arquivos
- `src/fight.c`: tudo do jogo novo (seleção, VS, luta, FSM, golpes, hitboxes, bola de fogo, barras, entradas).
  `src/menu.c`: splash/menu/senha/créditos/opções + transição (caixa preta) + idiomas (herdado do Morgan);
  tem as funções `fx_text`/`fx_block_*` usadas por fight.c. `src/pieces.asm`: `draw_pieces` (metasprites de
  pedaços 16x16 direto na OAM, em assembly porque em C é lento).
- `tools/mkassets.py`: só as telas/idiomas (`idiomas/textos.tsv` → `res/txt_*.bin`, `res/menu.h`).
  `tools/mkfight.py`: cenário, retratos, barras, cursor e sprites do Ryu → `res/*.bin`, `res/fight.h`,
  `res/ryu.h`, `res/fight.asm`. `make` roda os dois. `tools/runtest.py` testa sem janela.
- Entradas: `stage.png` (cenário do Ryu, fica na raiz; usa o quadro composto do canto superior esquerdo,
  recorta 256 px centrais), `sprites/Player_1_test.png` (folha do Ryu; fundo azul-esverdeado
  (64,144,160) = transparente; as linhas amarelas separam animações), `sprites/BG_purple.png` (fundo do menu).

## Como o conversor acha os quadros do Ryu
`find_boxes()` em mkfight.py acha componentes conectados (ignora fundo, amarelo e legendas) e junta partes
do mesmo quadro por sobreposição. Os quadros são numerados por (linha, x) e a lista `ANIMS` do mkfight.py
diz quais caixas formam cada animação (nomes viram `A_<NOME>` e `A_<NOME>_N` em `res/ryu.h`). Se o usuário
trocar a folha, conferir `/tmp/ryu_contact.png` (gerado a cada build) e ajustar `ANIMS` / `ANCHOR_OVERRIDE`.
A âncora x de cada quadro é a mediana dos pixels. A bola de fogo azul colada no quadro do Hadouken é removida
(`is_fireball_blue`) e a bola de fogo é um objeto à parte (caixas 84/87, paleta 2).
Paleta do P2: pares alinhados do idle branco x idle azul espelhado (caixas 13 e 12). Cenário: 6 paletas de
BG por k-means de cores por tile, tiles repetidos juntados (com espelho).

## Memória/VRAM (palavras)
BG1 gfx 0x0000 (cenário até 368 tiles; passar de ~384 invade o mapa) · BG1 map 0x1800 · BG3 map 0x1C00 ·
BG3 gfx 0x2000 (barras 2bpp) · OBJ 0x6000 (512 chars, tamanho 16x16). Chars de OBJ: P1 0-159, P2 160-319,
bola de fogo P1 320, P2 352 (cada lutador = 5 faixas de 8 pedaços). Paletas OBJ: 0 = P1, 1 = P2, 2 = bola.
Os tiles do quadro novo vão por DMA no vblank (limite ~40 pedaços por vblank; `plan_frames`/`do_uploads`).
Unidades: x em 1/8 px, altura em 1/64 px. ROM 1 MB (blocos do Ryu < 32 KB cada: `CHUNK` no mkfight.py).

## Frame data / golpes (tabelas no começo da seção LUTA de fight.c)
`atk_dur` (duração de cada quadro), `atk_act` (quadros com hitbox), `hb_*` (caixa do golpe), `atk_dmg`,
`atk_stun`, `atk_flags`. Barra = 96 pontos (1 ponto = 1 px). Para ajustar o "feeling" mexer só nessas tabelas
e nas constantes GRAV/JUMP_VY/WALK_*.

## Quarta rodada do md (combos, golpes no ar, giro para tras, dissipacao do Hadouken)
- O 2o video enviado e uma tela de SF2 pausada (so o Idle): nao deu para medir nada nele. Tempos medidos no 1o video: pulo
  ~44-50 quadros no ar. Aqui o pulo dura ~57 passos de logica = ~48 quadros reais com o passo extra de 1,2x
  (`JUMP_VY` 290, `GRAV_UP` 10, `GRAV_DN` 11, `JUMP_VX` 15).
- **Pulo para tras**: os 4 quadros de giro passam na ordem inversa (decolagem e pouso iguais).
- **Golpes no ar** (`jseq_f/jseq_d`): estende (a hitbox so existe nesse quadro, ~6 passos), recolhe e fica no quadro anterior ate pousar.
- **Combos**: `fcombo`/`fcombo_air` contam golpes seguidos durante a mesma dor; cada golpe seguinte soma +3 de dor (max +9);
  golpe de pulo da dor longa (26-28) para dar tempo de ligar um golpe no chao; combo iniciado no ar que continua em
  especial (Shoryuken, Tatsumaki, Hadouken) ou chega a 3 acertos derruba.
- **Cancelamento**: MP, MK, agachado MP e MK que acertaram (ou foram defendidos) cancelam em especial (`attack_update`).
  O que o jogador aperta durante o hitstop fica guardado (`down_buf`) e as direcoes continuam sendo registradas.
- **Hadouken** se desfaz ao bater/ser defendido: `A_FIREBALL_FX` (explosao, circulo branco, lascas azuis).

## Terceira rodada do md (inicio direto, velocidade, especiais por botao)
- O jogo **comeca direto na selecao de lutadores**; o splash/menu (`src/menu.c`, `menu_run()`) esta guardado mas nao e
  chamado (em `main()`, comentario mostra onde religar). Na selecao, A nao faz nada; SELECT na luta volta para a selecao.
- **Velocidade**: a cada `SPEED_EVERY` (5) quadros roda 1 passo de logica a mais (jogo 1,2x mais rapido, incluindo animacoes).
- **Pushback**: atacante recua 12 (acerto) / 16 (defendido) (1/8 px por quadro, decai 1 por quadro).
- **Hadouken**: nasce na altura das maos (`FB_ALT` = 36 px, como o retangulo da folha). Soco medio = velocidade 4, forte = 5.
- **Tatsumaki**: nao atravessa o oponente em pe (para no corpo dele); medio avanca menos (10 em vez de 16) e bate 1 a menos.
- **Shoryuken**: comando tolerante (`motion_dp`: baixo+frente nos ultimos 15 quadros, precedido de 'frente'; o 'baixo' do meio
  e opcional); medio = sobe menos (vy 370 vs 440), recuperacao 8 (vs 14) e 3 de dano a menos (`dmg_of`).
- Quadros no ar sem sombra usam o centro da faixa preta como ancora x (`belt_x` no mkfight.py).

## Segunda rodada do md (defesa, hitboxes da folha, hitstop, spark, fake K.O.)
- **Hitboxes vêm da folha**: o usuário desenha **retângulos vermelhos (240,0,0)** nos quadros de golpe de
  `sprites/Player_1_test.png`. `sheet_and_rects()` (mkfight.py) acha as linhas retas, tapa os pixels com a cor vizinha e liga
  cada retângulo ao quadro mais próximo; vira `pf_hb/pf_hbx0/x1/y0/y1` (x relativo à âncora, y = altura acima do chão) e a
  lógica usa em `get_hitbox()`. Quadros ativos = os que têm retângulo (o HK tem 2). Shoryuken/Tatsumaki/fogo ainda usam as
  tabelas (`hb_*`/`atk_act`) por não terem retângulo; a bola de fogo usa o retângulo do quadro `A_FIREBALL`.
  Para mudar uma hitbox: mexer no retângulo vermelho da folha e rodar `make`.
- A folha ganhou 2 quadros de **defesa** (agora há 118 caixas em vez de 116: os índices a partir do 23 deslocam +2; o
  conversor remapeia sozinho com `M()`): `A_BLOCK` (em pé) e `A_BLOCK_C` (agachado). A sombra desses quadros é marrom.
- **Defesa**: segurar "para trás" (relativo ao lado) no chão; para trás + baixo = defesa agachada. Altura do golpe em
  `atk_hgt`: golpes de pulo = ALTO (só defende em pé), chute agachado e rasteira = BAIXO (só agachado), o resto = MÉDIO
  (os dois). Sem defesa aérea. P1 usa o D-Pad (`fback`), a CPU usa o modo de guarda. Defendido: sem dano, `block_hit()`.
- **Hitstop**: 6 quadros (normal), 9 (golpes fortes), 10 (Shoryuken); congela a lógica dos dois e o recuo só vale depois.
- **Faísca de defesa** (`spark_*`, quadros `A_SPARK`..): no centro da área onde a hitbox encosta na hurtbox.
- **Som**: SNESMOD (PVSnesLib). `audio/sfx.it` vem dos exemplos da PVSnesLib (efeito 4 = cowbell = som de defesa); o
  Makefile gera `res/soundbank.*` (AUDIOFILES/smconv). `spcBoot()` no `main()`, `spcProcess()` em `fx_frame()`; volume =
  opção SFX do menu. Testar com `audio` no runtest (energia do som). Não dá para "ouvir" aqui: só se confirma que toca.
- **Fake K.O.**: `damage()` devolve 1 quando zera; a barra volta a 100% na hora, o lutador faz a queda pesada, levanta
  e a luta continua (não há mais fim de round).
- **Pulo no ar**: os quadros no ar são alinhados pela **faixa preta** (`pf_belt`), não pelos pés (`fbase`/`draw_obj`),
  para o soco/chute no ar não "descer" quando as pernas estão encolhidas.

## Regras do md "Ajustes de Engine" (video de referencia do SF2)
- **Ancora**: o ponto de origem de cada quadro do Ryu e o centro da sombra original da folha (entre os pes); a sombra
  e tirada do sprite (`strip_shadow` em mkfight.py). Quadros no ar usam a mediana dos pixels.
- **Sombra** e um objeto a parte (objetos 4/5, paleta OBJ 3, quadros `A_SHADOW`/`A_SHADOW+1`): fica no chao e so segue o x;
  fica pequena quando o lutador esta a mais de 20 px de altura.
- **Pushback duplo**: o golpe que acerta empurra o oponente e o atacante recua um pouco (`fkb`); defendido, o recuo e maior.
- **CPU (P2) em guarda**: ao sair do hitstun/blockstun fica `GUARD_T` quadros em guarda (e continua enquanto o P1 ataca).
  Guarda alta/baixa conforme a altura do golpe do P1 (`cpu_keys`, `can_block`, `block_hit`); golpe baixo exige agachado.
  Defendido = sem dano. Nao ha sprites de defesa na folha: usa o Idle/agachado.
- **Pulo**: velocidade horizontal constante, sobe com `GRAV_UP` e cai com `GRAV_DN` (~48 quadros, ~68 px, como no video);
  o giro percorre os 6 quadros em tempos fixos (decolagem 6, giro 9+9+9+9, pouso 6).
- **Queda**: no chao ~40 quadros, levantando ~14 quadros, invulneravel ate ficar de pe. Golpes de proximidade: ignorados.
- Video (SF2 SNES, Ryu x Ken): mostra tambem camera que rola com os lutadores, HUD com nomes/timer/KO, rounds
  ("ROUND 2 / FIGHT!", "PERFECT!") e tela de bonus. Nada disso foi pedido no md ainda.

## Debug (botão L)
Na luta, **L** liga/desliga o desenho das caixas: **verde** = hurtboxes de cada lutador (um retângulo cabeça→pés
com duas divisórias: cabeça / tronco / pernas; some enquanto o lutador está caído ou invencível) e **vermelho** =
hitbox do golpe (só nos quadros ativos) e da bola de fogo. Usa exatamente os mesmos cálculos da lógica
(`hurt_x`, `hurt_y`, `hb_*`, `atk_act`), com precisão de pixel. Implementação (fight.c, seção DEBUG): tiles
prontos de contorno (`res/dbg.bin`, gerados em `build_dbg()` do mkfight.py: linhas, cantos e pontas em T, uma série
verde e outra vermelha) escolhidos pelo pixel de cada borda e colocados no mapa do BG3 (por cima de tudo, linhas
de tiles 4-27; as linhas 0-3 são das barras). Quando duas linhas caem na mesma célula, o tile vira a soma (OR) dos
dois (`dbg_merge`, tiles somados em RAM depois dos prontos). So remonta quando algo mudou (`dbg_sig`) e no máximo
1 vez a cada 2 quadros; parado custa zero, andando o jogo cai para ~36 quadros/s com o debug ligado.
Desenhar pixel a pixel em C (tcc) foi lento demais (o jogo caía para 1/5 da velocidade): por isso os tiles prontos.

## Testes sem janela
`python3 tools/runtest.py fight.sfc roteiro.txt saida/` (snes9x libretro): `"<frames> BOTOES"` (ex.
`3 DOWN+RIGHT`), `shot nome`, `print var`/`peek var idx`/`dump var n` (via .sym), `vdump endereco n` (VRAM), `start` (splash -> titulo -> Practice -> seleção), `title` (espera o título parado), `sram n`/`sramsave`/`sramload arquivo`, `wait <tela>` (1 seleção, 2 VS, 3 luta). Depois de `start` esperar uns 30 quadros antes do 1º botão.
`lag_frames` (fight.c) conta quadros em que a lógica não coube em 1/60 s (deve ficar em ~1).

## Cuidados (aprendidos no Morgan)
- tcc-816: cada comando em C custa ~100-200 ciclos (um quadro = ~60 mil). Medir com `PROF()` (linha da tela) antes de
  otimizar; laço de 128 sprites por quadro custou 1/3 do quadro (por isso `oam_last`).
- tcc-816 (compilador) é MUITO lento e tem bugs: evitar `? :` e condições longas com atribuição;
  não usar `/` e `%` em código de todo quadro; preparar tudo durante o quadro e no vblank só DMA.
- Variáveis globais podem começar com LIXO: inicializar explicitamente.
- Sprites: escrever direto em `oamMemory`; nunca `oamSetEx` depois de `oamSet`.

## Setup do ambiente (container novo)
```sh
sh tools/setup.sh                       # PVSnesLib em ~/pvsneslib, Pillow, fonte Unifont, snes9x libretro
export PVSNESLIB_HOME=$HOME/pvsneslib
make
```

## Camera / arena (rodada 5)
- `cam` = px do mundo no canto esquerdo (0..128); `draw_obj` e o debug subtraem `cam`. Todas as posicoes de luta sao do mundo (0..384 px).
- Mapa BG1 da luta em VRAM 0x5000 (64x32), 2a tela = espelho da 1a. Limites: `xlo`/`xhi` = cam+16 .. cam+240.
- Uploads de quadros: `up_order` (pequenos primeiro). Passar do vblank perde o upload silenciosamente.

## Envio de tiles (rodada 6)
- Nunca fazer DMA de VRAM em C pesado dentro do vblank: monte a fila em `plan_frames` e execute em `do_uploads`. Globais comecam com lixo: `up_n`/`up_used` sao zerados em `fight_gfx_init`.
- Limite ~10 pecas por vblank (`UP_MAX`); acima disso, envio parcial no bloco `sbuf^1` dos lutadores.

## Estado atual e proximos passos (fim da rodada 14)
- Branch de trabalho: `claude/inspiring-cerf-ukzi2p` (nunca main; sem PR ate o usuario pedir). ROM: `fight.sfc` (`make` com `PVSNESLIB_HOME=$HOME/pvsneslib`). Morgan fica em outro repositorio (nao mexer).
- Funciona: selecao -> luta direto, 60 fps (`FRAME_VBLANKS`), camera com arena de 384 px, golpes de chao/ar, especiais, defesa, faisca/som de acerto, fake K.O., debug (L).
- Hitboxes: retangulos vermelhos da folha + `RECT_FIX` (mkfight.py, ate 2 caixas por quadro) + tabela `ov_*` (fight.c) para MP, HP, HK, CMP, CHP. Valores da tabela sao estimativas (miniaturas x 4/3).
- Pendente conhecido: som de pancada provisorio (marimba), hurtbox do corpo no ar sem referencia, valores `ov_*` a conferir.
- Proximo: trocar o Ryu por um personagem novo do usuario. Ele vai mandar os sprites e um PNG separado com animacoes e hitboxes de referencia. Pipeline: `tools/mkfight.py` (find_boxes -> frames, `ANIMS`/`NEW_ANIMS`, `RECT_FIX`, exporta `res/ryu.h`); lembrar: quadros ate 17-24 pecas usam buffers de 96 chars; folha limpa em `sprites/Player_1_clean.png` (restaura pixels sob as linhas de hitbox).

## Personagens (rodada 30)
- Ryu e Sagat. Tabela de quadros unica: Ryu 0..138, Sagat a partir de `SAGAT_OFF` (mesma ordem/contagem de animacoes). Quadro real = A_* + `choff[i]` (lutador) ou `obj_off[o]` (objeto). Sagat: `tools/mksagat.py` (`SAGAT_ANIMS`, paleta P2 `SAGAT_P2` em hex).
- `fchar[i]` (0 Ryu, 1 Sagat) vem de `sel_char[]` (selecao: P1 e depois P2). Especiais do Sagat em `sagat_special` (usam os ids ATK_SHORYU/ATK_TATSU/ATK_HADOUKEN; `flow[i]` = Tiger Shot baixo; `pj_alt[i]` = altura do tiro).
- Banco de sons > 32 KB: `tools/fixbank.py` (Makefile) fixa as secoes no comeco de cada banco.

## Desempenho e build (rodada 32)
- FastROM ligado (Makefile). `tools/fixram.py` corrige os bancos de RAM do codigo C (senao as variaveis vao para $FE).
- Rotinas quentes em assembly: `src/drawobj.asm` (draw_obj, do_uploads, plan_frames, motion_id, clear_fwd_hist) e `src/pieces.asm` (draw_pieces). Nelas: variaveis de RAM por `.w` (banco de dados = $7E, como no tcc), tabelas da ROM por `.l`. Argumentos do C chegam na pilha (empilhados da direita para a esquerda; u8 = 1 byte); retorno em `tcc__r0`.
- Medir velocidade: `print logic_frames` antes e depois de N quadros no runtest (deve avancar N). PROFILING 1 mede linhas por trecho (pmax/psum).
- `src/fight.asm` e gerado: nao versionar (o make usaria a copia velha).

## Menus (rodada 37)
- `src/menu.c`: splash/titulo/creditos/opcoes (Street Combat). `main()` = menu_run -> select_run/vs_run/fight_run. Opcoes na SRAM (`cfg_save/cfg_load`). Remapeamento: `key_of[]`/`km_phys[]` + `key_map` (asm) no `fx_frame` so na luta.

## Pause / Anti-Throw (rodada 50)
- START = PAUSE (Arcade/Versus) ou menu de treino (Practice: CPU Anti-Throw, Power Gauge, EXIT). Ver `fight_pause` e `throw_break` em fight.c e HISTORICO rodada 50.
- Efeito novo de som exige conjunto proprio: o conjunto da luta Ryu x Sagat ja usa os 16 slots do SPC.
