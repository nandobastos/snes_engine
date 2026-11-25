# Formato do pack SFPK (rascunho v0)

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
