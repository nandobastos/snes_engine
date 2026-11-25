# Formato do pack SFPK

## v2 (implementado: `engine/tools/sfpack.py`, lido por `pk_load_frames`/`pk_load_moves` em `engine/src/fight.c`)
Little-endian. O pack começa no arquivo 0x100000 da ROM (32 bancos de 32 KB; o motor lê pelo banco FastROM `$A0`). **Banco 0 do pack** (≤ 32 KB, o motor lê sem cruzar bancos) tem:
- Cabeçalho (32 bytes): `0` `"SFPK"`, `4` u16 versão (2), `6` u16 nº de lutadores, `8` u16 nº de golpes (19), `10` u16 ofs da tabela de lutadores, `12` u16 nº de quadros, `14` u16 nº de pedaços 16x16, `16` u16 nº de blocos de gráficos, `18` u16 ofs da tabela de blocos, `20` u16 ofs do diretório das tabelas de quadros, `22` u16 ofs da tabela de assets, `24` u16 nº de assets.
- Tabela de lutadores: `u16 ofs` do bloco de golpes de cada um. Bloco (19 golpes, ordem em `project/game.json` → `atk_names`): `dmg stun hgt flags hitstop snd_swing snd_hit` (19 u8 cada) e `dur` (19×8 u8).
- Tabela de blocos de gráficos: por bloco `u16 endereço (0x8000), u8 banco ($A0 + 1 + k), u8 0`. Os gráficos (4bpp, 128 bytes por peça 16x16) ficam **cada bloco no início de um banco** (bancos 1..N do pack, até 28 KB cada).
- Tabela de assets (8 bytes cada: `u16 endereço, u16 banco, u16 tamanho, u16 0`), ids fixos na ordem: `stage.bin stage.map stage.pal face.bin face.pal hud.bin hud.pal hud2.bin ryu.pal sagat.pal boxer.pal` (cenário, retratos, HUD e paletas dos lutadores). Os dados ficam depois dos blocos de gráficos, sem cruzar bancos.
- Diretório: `u16 ofs` de 25 tabelas, nesta ordem: `pf_chunk pf_off(u16) pf_count pf_w pf_h pf_ax pf_belt pf_hb pf_hbx0 pf_hbx1 pf_hby0 pf_hby1 pf_hu pf_hux0 pf_hux1 pf_huy0 pf_huy1 pf_hb2 pf_hb2x0 pf_hb2x1 pf_hb2y0 pf_hb2y1 pf_first(u16) pp_dx pp_dy`. Significado: quadro = bloco de gráficos, offset no bloco, nº de peças, largura, altura, âncora x, faixa de cintura, hitbox 1 (existe, x0 x1 y0 y1), hurtbox, hitbox 2; `pf_first` = índice da 1ª peça; `pp_dx/pp_dy` = posição de cada peça 16x16.

## Rascunho dos campos que virão (v0)

Tudo em **little-endian** (o SNES é 65816). Ofs = deslocamento a partir do início do pack. O editor cola o pack na ROM-motor num endereço fixo (a definir; o motor guarda o endereço no cabeçalho).
Este rascunho foi tirado das estruturas que o `fight-snes` usa hoje (res/ryu.h, tabelas `atk_*` do fight.c).

## Cabeçalho
`char[4] "SFPK"`, `u16 versão`, `u16 nLutadores`, `u32 ofs tabela de lutadores`, `u32 ofs regras`, `u32 ofs HUD`, `u32 ofs fases`, `u32 ofs textos`, `u32 ofs sons`, `u32 ofs gráficos (chunks)`.

## Lutador (um registro por lutador; tabela de u32 ofs)
- nome (idx de texto), retrato (tiles + paleta), fase vinculada (idx), modelo de tamanho (0 pequeno, 1 médio, 2 grande), lado: troca de paleta P2 (tipo 0 = paleta 2, tipo 1 = troca de vermelho↔azul por direção).
- **Física**: vida, velocidade frente/trás (1/8 px), força do pulo, gravidade subindo/descendo, tempo do pulinho/backdash, flags (pulinho frente ligado, etc.).
- **Paletas**: P1, P2 (15 cores + transparente, em BGR555).
- **Animações**: tabela fixa de ~45 animações (idx fixo; nomes na seção 3 de PLANO.md). Cada uma: `u16 primeiro quadro, u8 nQuadros, u8 flags (loop, ping-pong), u8 ticks por quadro`. Quantidade de quadros **por lutador** (não mais igual para todos).
- **Golpes**: lista de golpes (um por animação de ataque), ver abaixo.
- **Especiais**: `u8 comando (sequência de direções, até 4), u8 botão, u8 golpe, u8 custo em estoques, u8 versão EX`.
- **Projétil** (1 por lutador): animação, velocidade, dano, efeito de impacto.
- **Sons**: ids de swing/impacto por golpe + vozes.
- **IA**: agressividade, defesa, chance de anti-throw.

## Quadro (equivale aos arrays pf_* do jogo)
`u8 nPeças, u8 altura, s8 âncora x, u8 cinto(altura da cintura p/ pulo), u16 ofs peças, u32 ofs gráficos (chunk, offset)`, hitbox `s8 x0,x1, u8 y0,y1`, hitbox2, hurtbox `s8 x0,x1,u8 y0,y1`.
Peças: `s8 dx, u8 dy` por peça 16x16 (máx. 24 por quadro hoje). Gráficos: 4bpp, 128 bytes por peça, em blocos de até 28 KB.

## Golpe (equivale às tabelas atk_*)
`u8 animação, u8 duração por quadro[8] (startup/ativo/recovery), u8 máscara de quadros ativos, s8 hitbox (opcional, senão a do quadro), u8 dano, u8 stun, u8 altura (0 médio, 1 baixo, 2 alto), u8 flags (derruba, multi-hit, invulnerável…), u8 recuo atacante, u8 recuo vítima, u8 hitstop, u8 ganho de barra, u8 som swing, u8 som impacto`.

## Regras / HUD / Fases / Textos / Sons
- Regras: rounds, tempo, estoques de super, custos (EX, contragolpe), slow motion, quebra de agarrão.
- HUD: posição e tamanho de cada elemento (barra de vida, bolinhas de round, barra e bolinhas de super).
- Fases: cenário (tiles + mapa + paleta), chão, limites, rolagem, música.
- Textos: 4 idiomas (idx → bloco).
- Sons: conjuntos de efeitos (limite do SNESMOD: 16 por conjunto).

> Rascunho: os campos exatos serão fechados junto com o motor (etapa 1), medindo tamanho e desempenho no jogo real.

## Tracos do lutador (20 palavras u16, logo depois do bloco de golpes de cada lutador)
moveset, frame_base, fx_base, jump_vy, walk_adj, walk_ticks, fb_pal, fb_alt_hi, fb_alt_lo, pal_asset, pal_alt_off, dirswap,
fbpal_asset, fbpal_off1, fbpal_off2, fb_sfx, hp_close_hk, walk_pingpong, 0, 0. Substituem os antigos "if (Sagat)" / "if (Boxer)" do codigo.
Na parte critica do vblank use copias em u8 (ex.: fdsw): TR() custa CPU e atrasou uma troca de paleta em 1 quadro.
Tracos agora sao 28 palavras: ... 18 face_pal, 19 face_pal_alt, 20 gameover_fp, 21 arcade_opp, 22 face_idx, 23 walk_fwd, 24 walk_back, 25 jump_vx, 26 grav_up, 27 grav_dn
(fisica do lutador; o editor de lutadores mostra todos). Testado: clone com walk_fwd 30 anda ~2,4x mais rapido que o Ryu (12).

## SFPK v3 (atual)
- O pack fica nos bancos 16..63 da ROM (arquivo 0x80000, banco FastROM $90): 1,5 MB. O jogo fixo usa os bancos 0..15.
- Banco 0 do pack: cabecalho (versao 3), golpes+tracos dos lutadores, tabela de blocos de graficos, diretorio das tabelas de quadros
  (25 x [endereco u16, banco u16]) e tabela de assets.
- Bancos 1..T: as 25 tabelas de quadros (cada uma inteira num banco). Depois: um bloco de graficos por banco; depois os assets.
- Quantidades vem do cabecalho (quadros pk_h[6], pedacos pk_h[7], blocos pk_h[8], assets pk_h[12]); a RAM $7F reserva o maximo
  (1152 quadros, 15360 pedacos, 48 blocos: ~8 lutadores). Assim a ROM-motor (engine/base.sfc) serve para qualquer projeto.

## Exportar sem compilar
`python3 tools/exportar.py [saida.sfc]`: roda mkfight + sfpack e troca o pack na engine/base.sfc (precisa so de Python + Pillow).
Testado: o .sfc exportado e identico ao do `make`; com um lutador novo (arte do SF Pixel) exportado sem compilar, ele aparece e luta.
