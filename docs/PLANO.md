# Engine de jogo de luta para Super Nintendo — análise e plano

Nome provisório: **SF Engine** (SNES Fight Engine). Este documento mostra (1) o que já existe, (2) como a engine ficaria, (3) tudo que hoje está "fixo" no jogo e viraria opção, (4) as etapas e (5) o que preciso de você.

## 1. O que já existe

### SG Engine (Mega Drive) — repositório `sg-engine`
- **Editor no navegador** (abre `editor/index.html`, sem instalar nada): fases, atores, câmera, eventos, HUD, combos.
- **SG Pixel**: a ferramenta de pixel art/animação (versão navegador e Electron). Tem paleta indexada de 15 cores + transparente, camadas, frames com duração, **tags** (já existem no modelo de dados), importação de .aseprite.
- **Pack binário** (`engine/FORMAT.md`, "SGPK"): o editor gera um bloco de dados e **cola na ROM-motor** num endereço fixo. A ROM-motor é um programa C pronto (SGDK) que lê o pack. Ou seja: **você não escreve código; só gera dados**.
- **Testador**: o próprio editor tem um emulador embutido (EmulatorJS, com o core do Mega Drive) para jogar sem sair da ferramenta.
- **Exportador**: ROM-motor + pack = `.bin` pronto.

### Jogo de luta SNES — repositório `fight-snes`
- Jogo em C/assembly (PVSnesLib) com Ryu, Sagat e DonLee, rounds, Arcade/Versus/Practice, super, anti-throw, menus em 4 idiomas.
- Hoje os **dados são fixos na compilação**: tabelas de golpes, tempos, hitboxes e quadros são geradas por scripts Python a partir de folhas de sprites (`tools/mkfight.py`, `mksagat.py`, `mkboxer.py`). É por isso que você precisa me mandar a folha inteira e eu recorto.

## 2. Como a engine ficaria (mesma ideia do Mega Drive)

```
 SG Pixel (modo "Lutador SNES")  ──┐
   desenha frames, hitbox/hurtbox, │
   tags = nomes dos golpes         ├─►  Editor SF  ──►  PACK (.sfpk)  ──┐
 Editor SF: lutador, golpes,       │   (navegador)                      ├─► ROM-motor SNES  ─► .sfc
   inputs, fases, HUD, seleção ────┘                                    │   (lê o pack)
                                                                        │
 Testador: emulador SNES embutido (core snes9x do EmulatorJS) ◄─────────┘
```

Peças:
1. **ROM-motor SNES**: o jogo atual refatorado para **ler tudo de um pack na ROM** em vez de tabelas compiladas. O jogo de hoje vira o **projeto de exemplo** (Ryu, Sagat, DonLee dentro de um pack) e tem que continuar idêntico.
2. **Pack SFPK**: lutadores, quadros (já cortados em peças 16x16), tabelas de golpes, fases, HUD, textos, sons.
3. **SG Pixel modo Lutador**: camadas de **hitbox** (vermelha) e **hurtbox** (verde) por frame, ponto âncora, tags com nomes fixos (veja a lista abaixo) e validação ("faltam 2 quadros no HP", "frame com 26 peças: passa do limite").
4. **Editor SF**: telas de Lutador, Fase, Seleção/VS/HUD e Regras.
5. **Testador + exportador**: botão "Jogar" (emulador no navegador) e "Exportar .sfc".

## 3. O que hoje é fixo no jogo e viraria opção

**Lutador** (um registro por lutador)
- Nome, retrato (seleção/VS), paletas P1/P2 (troca de cor ou troca vermelho↔azul como no DonLee), **estágio vinculado**, voz/sons.
- Velocidade de andar (frente/trás), pulo (altura, distância), gravidade, vida, **tamanho (modelo)**.
- Animações por **tag** (nomes e quantidade de quadros que o jogo espera): idle 4, walk 5, walkb 5, crouch_in 1, crouch 1, jump 2, fjump 6, block 1, block_c 1, mp 3, hp 5, mk 5, hk 5, hkc 3, hpc 5, mkc 5, mpc 3, cmp 3, chp 4, cmk 3, chk 5, jp 3, jk 3, jdk 3, hadouken 4, shoryu 6, tatsu 6, throw 5, thrown 4, rise 2, hit_head 3, hit_body 4, hit_crouch 2, fall 3, ko 1, victory 4, fireball 1, fireball_hit 1, fireball_fx 4, spark 3, shadow 2. (Lista completa em `sprites/lista_animacoes.md` do fight-snes.)
  - Hoje a contagem de quadros por animação é igual para todos os lutadores (limite do meu código, não do SNES). Na engine isso passa a ser **por lutador** (você desenha 3 quadros no HP e a engine usa 3).

**Cada golpe** (hoje espalhado em ~10 tabelas)
- Duração de cada quadro (startup / ativo / **recovery**), em quais quadros a hitbox liga, dano, stun (tempo de dor), altura (alto/médio/baixo), tipo de efeito (derruba, multi-hit), recuo de quem bate e de quem apanha, hitstop, som do golpe e do impacto, ganho de barra.
- Hitbox/hurtbox **por quadro, dentro do frame** (você não manda mais folha com caixas desenhadas por cima).
- **Derrubar**: regra "hitbox X em hurtbox Y derruba" (cabeça/corpo/pés).

**Entradas (inputs)**
- Botões: LP/HP/LK/HK, agarrão (L), contragolpe (HP+HK), **quebra de agarrão**, dois toques (backdash / pulinho — hoje ligável por chave).
- Comandos especiais: sequência de direções + botão, janela de tempo, versão normal/EX/Super, custo em estoques de barra.

**Especiais e projéteis**
- Hadouken (projétil: velocidade, dano, quadros, efeito de impacto), Shoryuken (invulnerável, 2 acertos), Tatsumaki (giro), Tiger Shot. Por lutador: 2 ou 3 especiais.

**Regras de jogo**
- Rounds (melhor de 3), tempo, K.O., slow motion, PERFECT, Arcade/Versus/Practice, IA da CPU (agressividade, defesa, anti-throw), barra de super (ganho por ação, 3 estoques), EX, menu de treino.

**Telas**
- HUD (posição da barra de vida, bolinhas de round, barra e bolinhas de super), título, seleção, VS, continue, final, textos em 4 idiomas, **fase bônus**.

**Estágio**
- Cenário (192 linhas, rolagem, parallax), música, chão, limites da arena — **1 estágio por lutador** (o do oponente na luta).

## 4. Modelos de tamanho (limite real do SNES, medido neste jogo)

O motor desenha cada lutador com **peças de 16x16**. Hoje o limite é **24 peças por quadro** (24 sprites de hardware de 128 disponíveis, e a VRAM dos sprites é pequena). Valores medidos: Ryu até 15 peças, Sagat até 20, DonLee até 24 (HK esticado).

| Modelo | Tamanho recomendado | Peças (aprox.) |
|---|---|---|
| Pequeno / ágil | até ~48×80 px | ≤ 12 |
| Médio (Ryu, Sagat, DonLee) | até ~64×96 px, golpe esticado até ~90 px de largura | 15–24 |
| Grande (estilo Zangief) | ~80×100 px de corpo cheio | **35+ peças: não cabe hoje** |

Honestidade: o **grande de verdade não cabe no motor atual**. Para ele preciso de uma rodada de engenharia (sprites de 32x32 e 64x64 do SNES, menos peças por quadro, blocos de VRAM maiores só para ele, e ajustar a OAM). Dá para fazer, mas é uma etapa própria. Por enquanto o SG Pixel avisaria "este frame passa de 24 peças".

## 5. Etapas (cada uma termina com algo testável)

1. **Formato do pack + exportador do jogo atual.** Defino o SFPK (a partir de `FORMAT.md`), converto Ryu/Sagat/DonLee/estágio para pack e refatoro o motor para ler dele. *Prova:* a ROM nova joga **idêntico** à atual. É a etapa mais pesada e mais arriscada.
2. **Editor de Lutador/Golpes.** Telas com todas as opções da seção 3 (tabelas, tempos, inputs, especiais), sem código. Gera o pack.
3. **SG Pixel modo Lutador.** Camadas de hitbox/hurtbox por frame, tags = golpes, validação de quadros/peças, retrato, modelos de tamanho.
4. **Fases, HUD e telas.** Estágio por lutador, seleção/VS, HUD configurável, fase bônus.
5. **Testador + Exportar .sfc** no navegador.
6. **Grande (Zangief)**: limites maiores de sprite.

Riscos principais: o `fight.c` tem ~4.500 linhas e várias partes em assembly otimizadas à mão; levar dados de ROM para a lógica sem perder desempenho (hoje a lógica usa ~50% do quadro). Para o testador no navegador preciso do **core snes9x** do EmulatorJS (arquivo `.wasm`/`.data`) — este ambiente não alcança o site que o hospeda.

## 6. O que preciso de você

1. **Onde ela mora?** Recomendo um **repositório novo** (ex.: `sf-engine`), copiando o editor e o SG Pixel do `sg-engine` (sem mexer no que já funciona no Mega Drive) e sem alterar o `fight-snes`, que continua como jogo de referência. Pode ser outro nome.
2. **Confirma:** o SG Pixel (pasta `pixel/`) é a ferramenta baseada no EasyBride? Vou estendê-la, não criar outra.
3. **Emulador:** me envie o core do snes9x do EmulatorJS (os arquivos do core SNES), ou autorize eu liberar o endereço de download.
4. **Começo pela etapa 1?** (é a base de tudo e não muda o que você vê no jogo).
5. Quantos especiais por lutador no máximo (2 ou 3), e se a **fase bônus** é prioridade agora ou depois.
