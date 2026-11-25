# Histórico do projeto Fight (SNES)

## 1. Criação (02/10/2026)
- Repositório criado para um jogo NOVO de SNES (não é o Morgan). A base (build, menus, transições e idiomas)
  foi copiada do `morgan-snes` v11.

## 2. Primeiro protótipo jogável (02/10/2026)
- O usuário passou a especificação (jogo de luta estilo SF2, Ryu como modelo) e os arquivos `stage.png` e
  `sprites/Player_1_test.png`.
- Troquei o jogo do Morgan por um novo: `src/fight.c` (seleção, VS, luta) e `tools/mkfight.py` (cenário,
  retratos, barras, sprites do Ryu). O Morgan (fase, magias, goblin) e os sprites dele foram removidos daqui
  (continuam no repositório morgan-snes).
- Funcionando e testado no emulador: seleção de 8 caixas, VS de 3 s, cenário, barras de energia provisórias,
  andar/agachar/pular (neutro e diagonal), os 8 golpes normais + 3 no ar, Hadouken (projétil), Shoryuken,
  Tatsumaki, rasteira que derruba, hitbox/hurtbox/pushbox, reações de dor, queda e levantar, round que reinicia
  quando a barra zera. Botões: B soco médio, Y soco forte, A chute médio, X chute forte.

## 3. Ajustes depois dos primeiros testes (02/10/2026)
- Corrigido: piscada de 1 quadro do Idle ao terminar ataque agachado (agora o fim do golpe já volta à animação certa).
- Pulo diagonal: janela de tolerância para a direção apertada depois de "cima" e o corpo não empurra mais quem
  está no ar (de perto o pulo para frente era empurrado de volta e parecia vertical).
- Alcance dos golpes ajustado pela ponta do sprite de cada golpe (soco médio agachado estava longo demais);
  corpo do oponente mais estreito (24 px em pé, 28 agachado).
- Debug no botão L (hurtboxes verdes / hitboxes vermelhas) e menos DMA por vblank (evita tiles quebrados).

## 4. Ajustes do md "Ajustes de Engine" + video de referencia (02/10/2026)
- Ancora nos pes e sombra independente (fica no chao), pushback duplo, CPU que se defende (alta/baixa) depois da
  dor/blockstun, pulo com gravidade maior na queda (~48 quadros) e giro sincronizado, levantar invulneravel.

## 5. Defesa, hitboxes da folha, hitstop, faísca, som e fake K.O. (02/10/2026)
- Folha nova do usuário (com quadros de defesa e retângulos vermelhos = hitboxes) guardada em
  `sprites/Player_1_test.png`; hitboxes agora vêm dela. Defesa alta/baixa (P1 segurando para trás), hitstop de 6-10 quadros,
  faísca e som metálico ao defender, soco no ar alinhado pelo corpo, e a barra volta a 100% quando zera (queda e levantar).

## 6. Inicio direto, velocidade e especiais por botao (02/10/2026)
- Jogo abre na selecao de lutadores; velocidade 1,2x; pushback maior; Hadouken na altura das maos e velocidade por botao;
  Tatsumaki sem atravessar e com versao media mais fraca/curta; Shoryuken com comando tolerante e versao media mais baixa/rapida.

## 7. Combos, golpes no ar e dissipacao do Hadouken (02/10/2026)
- Pulo para tras com giro invertido, golpes no ar que estendem e recolhem, combos com dor dinamica e knockdown de combo
  aereo, cancelamento de golpes medios em especial, Hadouken se desfazendo, pulo de ~48 quadros como no video.

## Pendências / ideias
- Conferir o "feeling" (frame data, velocidades, alcance dos golpes) jogando em um SNES/emulador de verdade.
- O boneco P2 não reage de outras formas (sem IA, sem bloqueio). Sem som. Sem efeitos de impacto (faíscas).
- Nome do lutador e "KO"/round na tela; placar; cenário rolando (hoje 256 px fixos); mais personagens.
- Alguns quadros do Ryu são só aproximados (âncora automática): se algum animar "pulando" de lado, ajustar
  `ANCHOR_OVERRIDE` no mkfight.py.

## Como retomar
Abra uma conversa nova no repositório **`nandobastos/fight-snes`**. O usuário fala português e não é
programador experiente: responder em PT-BR, de forma simples.

## Rodada 5
- Hadouken "quebrado": os envios para a VRAM passavam do tempo do vblank e eram perdidos. Agora a ordem e bolas, sombras, faisca e so depois os lutadores (`up_order`).
- Soco forte agachado: hitbox alargada (alcance 4..36 px a frente, desde a altura 30) para acertar o oponente.
- Golpe aereo: depois do quadro do golpe volta ao quadro anterior (soco e voadora descendo) enquanto cai.
- Camera: arena de 384 px (cenario 64x32, segunda metade espelhada), a tela segue o meio dos lutadores (`cam`, `cam_update`). Ninguem sai da tela.

## Rodada 6
- Rasgos na tela: o C era lento dentro do vblank. Agora `plan_frames` monta uma fila (`up_src/up_dst/up_sz`) fora do vblank e `do_uploads` so executa os DMAs. Frames com mais de 10 pecas vao em 2 vblanks para um segundo bloco da VRAM (`sbuf`, 64 chars de deslocamento) e so aparecem quando completos. Medido: 0 estouros do vblank (antes ~5%).
- Reacao de dor (cabeca, corpo, agachado) 25% mais longa e mais lenta.
- Golpe aereo: depois do golpe o pulo roda ao contrario ate o pouso (`frev`).
- Camera: so anda enquanto os dois cabem na tela (`cam_update` limita entre os dois lutadores); quem esta no canto nao arrasta nem e arrastado.
- Shoryuken: aceita tambem frente, diagonal baixo-frente, frente + soco (`motion_dp2`).
- Nova folha de hitboxes (`sprites/Player_1_test.png`); `find_boxes` junta pedacos separados por linha de 1 px (continua com 118 quadros).

## Rodada 7
- Shoryuken e checado antes do Hadouken.
- Quadro ativo dos golpes fica mais tempo na tela (+2 a +3 quadros; golpes aereos 9).
- Depois do golpe aereo roda sempre o pulo vertical parado ao contrario (tambem nos pulos diagonais).
- Camera: os lutadores sao presos na tela atual antes da camera andar (`resolve_bodies` -> `cam_update`); pular para tras no canto nao move a camera (testado: cam fixa).
- Visual: a folha com retangulos so serve de mapa de coordenadas; `sheet_and_rects` apaga os retangulos dos pixels do sprite e eles ficam so como numeros (pf_hb*).

## Rodada 8
- Soco medio agora usa o quadros do Light Punch da folha (3 quadros); o forte continua o Medium/Heavy Punch.
- Hitboxes: `sprites/Player_1_hitboxes.png` (areas verdes) so como mapa de coordenadas; `green_expand` troca cada retangulo vermelho da folha base pela area verde que o contem. Visual vem sempre da folha base.
- Shoryuken: avanco horizontal 10 -> 5 (metade).
- Quadros ativos duplicados (MP 10, HP/MK/HK/CHP/CHK 12 ticks; golpes aereos 12).
- Cross-up: `face_opponent` nao vira quem esta sendo sobrevoado enquanto o outro estiver no ar.
- Flicker/OAM: no maximo ~10 sprites 16x16 por linha de varredura (limite do SNES: 32), entao nao ha rotacao de OAM.
- Correcao da rodada 8: as areas verdes de `Player_1_hitboxes.png` marcam os quadros que podem durar mais (quadros de contato), NAO as hitboxes. As hitboxes voltaram a ser os retangulos vermelhos originais (`green_expand` fica sem uso). Os quadros de contato longos ja batem com os quadros verdes (MP, HP, MK, HK, CMP, CHP, CHK, golpes aereos).

## Rodada 9
- Hitboxes aereas (soco, chute, voadora diagonal) usam a area verde da folha de hitboxes (`green_expand`, so para y 600-800); as demais continuam os retangulos vermelhos.
- Parser: golpe agachado zera o 'frente' do buffer (`clear_fwd_hist`), entao Soco agachado -> Hadouken nao vira Shoryuken. Shoryuken continua checado primeiro.
- Faisca de acerto (vermelha/fogo, paleta OBJ 4) no ponto de contato + som de pancada (efeito 3 do sfx.it, marimba grave; so existem 5 sons no banco, dá para trocar por uma amostra de pancada).
- Hadouken colado: se o oponente esta na frente a ate 56 px, a bola nasce na hurtbox dele e acerta/dissipa no mesmo quadro (testado: dano + dissipacao + som).
- Ataques agachados: conferidos no emulador (CMP, CHP, CMK, CHK), nenhuma parte faltando.

## Rodada 10
- Voadoras (media/forte) e soco aereo usam a mesma hitbox, a da voadora diagonal (+6 px a frente, +-4 px de altura), alinhada pela faixa preta (`get_hitbox`).
- Shoryuken: depois do contato o quadro nao muda ate pousar (quadro 4 fixo) e o golpe termina assim que toca o chao (sem recuperacao).
- Agachados sem maos/pes: a folha de teste tem linhas azul-esverdeadas (cor do fundo) por cima do sprite, que fatiavam o desenho e o recorte descartava pontas. `sheet_and_rects` agora restaura esses pixels e os das linhas vermelhas a partir da folha limpa original (`sprites/Player_1_clean.png`).
- Soco medio: quadro de contato 10 -> 9 ticks.

## Rodada 11
- Soco aereo volta a usar a caixa do punho da folha (+6 px a frente, +-4 de altura); so as voadoras (media e forte) dividem a caixa da voadora diagonal. Antes o soco usava a caixa do chute e ficava solta, longe do punho.
- Soco forte agachado (gancho): hitbox menor (x 4..28 a frente, y 50..108) e hurtbox em pe a partir do quadro 1 (`is_crouching`).
- Hurtbox baixa (altura de agachado) enquanto ataca no ar e na recolha, normal ao pousar (`hurt_low`).
- Teste no canto direito (cam 128): soco e voadora aereos acertam; faisca vermelha aparece.

## Rodada 12
- 30 quadros por segundo na tela: cada quadro dura 2 vblanks e roda 2 passos de logica (`fight_tick` x2), entao fisica, gravidade, duracao dos golpes e hitstun continuam iguais (nada precisou ser recalibrado) e o desenho/envio de tiles cai pela metade. Botoes pressionados no 1o vblank sao guardados (`acc_down`).
- Piscar do cenario: o scroll da camera era escrito por variavel (16 bits) que o NMI podia ler pela metade. Agora e escrito direto nos registradores logo apos cada espera de vblank (`set_cam_scroll`). O mapa 64x32 e fixo na VRAM (nada e reescrito durante a luta).
- Chute forte em pe: hitbox maior (perna e pe). Chute forte agachado (varrida): a caixa cobre a largura do quadro todo.
- Agachados: nenhuma parte faltando nas capturas desta versao.

## Rodada 13 (performance + hitboxes de referencia)
- Descoberta: o C do tcc-816 custa ~1 linha de varredura por instrucao C (o quadro de 60 fps tem ~240). Cada `PROF()` (medida de linha) custava ~3 linhas e inflava a conta; agora so liga com `PROFILING 1`.
- `FRAME_VBLANKS` (fight.c): 1 = 60 fps (padrao agora; sem quadro perdido nos testes), 2 = 30 fps (2 passos de logica por quadro). Em 30 fps o jogo ficava com movimento picado e nao ganhava folga real.
- OAM persistente: cada objeto tem faixa fixa de sprites (`oam_base`/`oam_cap`) e so e redesenhado quando muda (posicao, quadro, lado, buffer). Lutadores parados nao chamam `draw_obj`.
- `plan_frames` sai cedo quando nada mudou; `cpu_update` e o atalho de idle em `fighter_update` (parado sem apertar nada) evitam o caminho completo; `resolve_bodies` pula quando ninguem se moveu; `fwant[]` iniciado em 255.
- Hitboxes de chao vindas das imagens de referencia (tabela `ov_x0/x1/y0/y1` por golpe e quadro, valores das miniaturas x 4/3 porque as imagens estao reduzidas): MP, HP, MK, HK (2 quadros), CMP, CHP (2 quadros), CMK, CHK. Golpes aereos continuam com as caixas da folha.

## Rodada 14
- Causa dos "frames menores / maos e pes sumindo": quadros de 17 pecas (ex.: soco forte e chute medio em pe) usam 3 pedacos de 8 pecas, mas cada buffer do lutador tinha so 64 chars (2 pedacos): a 17a peca ia parar na area do outro buffer e era apagada quando o buffer reserva era reescrito. Agora cada buffer tem 96 chars (`BUF_CH`) e o layout da OBJ foi refeito: P1 0-191, P2 192-383, bolas/sombras/faisca em blocos de 32 chars repartidos (`slot_char`).
- Hitboxes corrigidas a partir das imagens do usuario (`RECT_FIX` em mkfight.py, coordenadas da folha): voadora diagonal (2 caixas), voadora (perna), chute agachado medio (varrida), chute agachado forte (perna), chute medio em pe (2 caixas). Quadros com 2 hitboxes: `pf_hb2*` + `get_hitbox(..., n)`; `check_hit` e o debug testam as duas.
- Tabela de referencia (`ov_*`) agora so vale para MP, HP, HK, CMP, CHP; MK/CMK/CHK e golpes aereos usam as caixas da folha. Voadoras nao compartilham mais a caixa (cada quadro usa a sua).

## Rodada 15 (documento de diretrizes)
- Limpeza: o branch ja nao tem sprites/magias do Morgan (ficam so no `morgan-snes`); removido `res/ryu_5.bin` (sobra antiga) e `__pycache__`.
- Hurtboxes padrao: EM PE, AGACHADO (tambem no ar atacando) e PULANDO (`hurt_y`, 3 variacoes).
- Andar para tras tem animacao propria (`A_WALKB`; provisoria = ciclo de andar ao contrario ate chegar a folha nova).
- Golpes de perto (`close_range`, ate 44 px, oponente no chao): Y vira CLOSE HP (`ATK_CLOSE_HP`, quase sem empurrao, cancela em especial; provisorio com os quadros do HP) e X vira CLOSE HK (`ATK_CLOSE_HK`, quadros do Close Heavy Kick da folha, empurra ~37 px). Combo: voadora forte -> Close HP -> Hadouken testado.
- Nao feito: a folha nova e o gabarito de hitboxes NAO estao no repositorio (origin/main so tem a folha antiga); quando chegarem: novos quadros de andar frente/tras, Close HP real e hitboxes.

## Rodada 16 (folha nova do Ryu)
- Arquivos novos (raiz do repo, commit de 03/10): `ryu_sprites_.png` (folha limpa, fundo transparente) e `ryu_sprites_Hurt_hitbox.png` (mesma folha com hitboxes vermelhas e hurtboxes verdes). Copiados para `sprites/ryu_sheet.png` e `sprites/ryu_sheet_hitboxes.png`. As folhas antigas de teste foram removidas; `Player_1_clean.png` fica so pelos retratos.
- `tools/mkfight.py` reescrito para a folha nova: caixas achadas pela diferenca entre as duas folhas; sombras ficam fora da conta de componentes (ligavam quadros vizinhos) e entram depois no quadro mais proximo; linhas da folha agrupadas por posicao; indices das animacoes em `ANIMS` (mapa visual: veja o contato gerado).
- Novas animacoes: andar para tras (`walkb`, Walk Backward), Close Heavy Punch (`hpc`, 5 quadros), Close Light Kick (`mkc`), Close Heavy Kick (`hkc`), chutes agachados separados (medio e forte), Shoryuken/Tatsumaki/Hit/Fall/KO/Vitoria nos quadros novos, defesa nos quadros com hurtbox.
- Hitboxes: todas vem da folha (vermelho), ate 2 por quadro (caixas contidas em outras sao descartadas); Shoryuken e Tatsumaki tambem. A tabela estimada `ov_*` foi removida. O quadro do Hadouken (`ATK_HADOUKEN`) nao tem caixa propria (a bola e quem acerta).
- Hurtboxes: cada quadro tem a sua (verde); sem ela, 3 padroes (em pe 0-81, agachado 0-60, pulando 12-91).
- Golpes de perto: Y -> Close HP (agora com os quadros reais), A -> Close MK (Close Light Kick, novo `ATK_CLOSE_MK`), X -> Close HK.

## Rodada 17 (sons + paleta do P2)
- Paleta do P2: na folha nova o Ryu azul tem a mesma pose do branco (nao espelhada) com 1 px de deslocamento; o pareamento antigo (espelhado) acertava so 66% dos pixels, o novo 99,6%. Corrigido em `build_ryu` (P2 agora com o cinza-azulado da folha, sem pixels errados).
- Sons: WAVs em `audio/wav/` (copiados da raiz do repo). `tools/mksfx.py` gera `audio/sfx.it` (14 efeitos, 11 kHz mono, ~23 KB de BRR) e o `make` converte. Mapa: swing ao iniciar golpe (Light: MP/CMP/JP; Medium: MK/CMK/CLOSE_MK/JK/Tatsu; Hard1: HP/CHP/CLOSE_HP/JDK/Shoryuken; Hard2: HK/CHK/CLOSE_HK), acerto (Jab: MP/CMP/JP; Short: MK/CMK/CLOSE_MK/JK; Strong: JDK/Tatsu/bola; Fierce: HP/CHP/CLOSE_HP/Shoryuken; Forward: CHK/CLOSE_HK; Roundhouse: HK), Blocked na defesa, Hit the ground na queda, Landing ao pousar, Hadouken na bola. Nao usados: Claw & Bite, Pause Game e os 5 arquivos de nome truncado (SFII_0~1/2/3, SFII_7~1/2) ate o usuario dizer o que sao.
- Correcao dos sons (rodada 17b): o SNESMOD ignora a taxa (C5Speed) do .it nos efeitos: a taxa de reproducao e 4044 Hz x o tom de `spcEffect` (tom 8 = 32 kHz; tons 0 e 1 saem quebrados). Os efeitos estavam a 11 kHz tocados a 32 kHz (2,9x mais rapidos e agudos; a voz do Hadouken durava 0,25 s). Agora as amostras sao geradas a 12132 Hz e tocadas no tom 3 (`SFX_PITCH`); duracao medida da voz do Hadouken no emulador: 0,71 s (original 0,72 s). Bancos maiores que 32 KB viram 2 bancos (`SOUNDBANK__0`), por isso ficou abaixo disso (25 KB).
- Tela de selecao: som ao mexer o cursor (Light Attack) e ao confirmar (Hard Attack1), provisorios ate o usuario dizer qual som quer.
- `tools/runtest.py`: comando `audiosave arquivo.wav` grava o som gerado (para conferir efeitos).

## Rodada 18
- Vozes do Shoryuken e do Tatsumaki (`SFII_7~1` e `SFII_7~2`, palpite: arquivos 70 e 71 do SF2) tocam ao iniciar cada especial (no lugar do swing).
- Cursor da selecao: `SFII_0~2` (bipe mais curto) ao mover e a mesma ao confirmar (palpite; `SFII_0~1` e `SFII_0~3` seguem sem uso).
- Banco de sons com mais de 32 KB (2 bancos da ROM) travou o jogo na inicializacao: tudo a 8088 Hz (tom 2), Hadouken a 12132 Hz (tom 3); banco = 30,6 KB. Tom de cada efeito em `sfx_tom[]`.
- Chute forte de perto (Close HK) com 2 golpes: 1o no quadro 0 (caixa propria na frente do corpo; a da folha ficava acima da cabeca), 2o no quadro 1; o 1o quase nao empurra, so o 2o empurra; dano 9 por golpe.

## Rodada 19
- Selecao: Move Cursor = `SFII_0~2` (SFII_02), Selection = `SFII_0~3` (SFII_03) ao confirmar. Limiar de corte de silencio menor para esses dois; confirmar limitado a 0,9 s, vozes dos especiais a 0,85 s (banco de sons = 31 KB, abaixo do limite de 32 KB). Todos os efeitos no tom 2.
- Close HK: o 2o golpe empurra; se o oponente esta no canto (a menos de 6 px do limite) quem bate recua no lugar (impede encurralar repetindo o golpe).
- CPU: ao sair da dor ela entra em guarda; o golpe que vem fora da janela de combo e bloqueado e, ao sair desse blockstun, a guarda e zerada (fica vulneravel). BUG achado: o atalho de idle da rodada 13 zerava `fback` da CPU e ela deixou de defender desde entao; corrigido (testado: 1o golpe acerta, 2o apos a dor e bloqueado, 3o acerta).

## Rodada 20 (folha atualizada + agarrao)
- Folha atualizada (commit 1b2039e de 03/10, 1709 px de altura): ANIMS remapeado. Novos: Close Light Punch (`mpc`, B colado) e Throw (`throw`, 5 quadros). Crouching Heavy Punch agora tem hitbox na folha. ATENCAO: esta folha NAO tem Walk Backward (a anterior tinha); `walkb` voltou a ser o ciclo de andar ao contrario ate o usuario mandar os quadros.
- Agarrao: L (KEY_L) + direcao do oponente, colados (<= 44 px) e os dois no chao. O P2 fica preso na dor ate o quadro 3 do agarrao; leva 22 de dano e cai (derrubada). O botao do debug passou de L para R.
- Buffer de comandos mais curto: ultimo passo em 8 quadros (era 15) e comando inteiro em 20 (era 30); o Shoryuken exige o 'baixo' puro (F, D, DF + soco) ou o atalho F, DF, F; andar para frente + diagonal + soco nao vira mais Shoryuken (testado). Hadouken e atalho continuam.
- Cancelamento em especial liberado depois de qualquer hit do golpe (`fcan`): Close HP (1o ou 2o hit), Close MP, Crouching HP, alem dos anteriores. Close HP agora tem 2 hits (quadros 1 e 2).
- Correcao (pedido do usuario: "so mexa no throw e no hit do crouching HP"): desfeitos o buffer de comandos mais curto, o Close MP, o 2o hit/cancelamento extra do Close HP e do Crouching HP. Ficam: folha atualizada (necessaria para o throw e para a hitbox do Crouching HP), o agarrao (L + direcao) e o debug movido de L para R.
- Rodada 20c: Walk Backward real de volta (recorte da folha anterior em `sprites/ryu_walkback.png`, lido por `find_boxes(caminho)` e anexado como `walkb`). Vozes dos especiais sem corte: tiradas as duracoes maximas (Shoryuken/Tatsumaki inteiros), limiar de silencio menor (0,4%) e fade de 40 ms; a selecao (OK) foi encurtada para 0,45 s para o banco continuar < 32 KB (31,2 KB).

## Rodada 21
- CPU basica do P2: SELECT liga/desliga (`ai_on`; toca o som do cursor como aviso). Desligada = P2 parado que so se defende (como antes). Ligada (`ai_think`): longe (>130 px) anda, solta Hadouken ou pula; meia distancia (50-130) aproxima, bate de longe, pula (com golpe no ar) ou solta Hadouken; colado (<=50) bate, bate agachado, recua ou se defende; de vez em quando se defende quando o jogador ataca de perto. Usa a guarda existente (fguard) depois da dor/bloqueio. Os especiais saem direto (a CPU nao usa o historico de direcoes do P1: `try_special` ignora a CPU).
- O botao START agora volta para a tela de selecao (antes era o SELECT).
- Rodada 21b: lutador flutuando. Causa: acertado no ar por golpe que usa `hitstun` (bola de fogo, descida do Shoryuken, giro do Tatsumaki) ficava na dor sem gravidade e voltava ao parado na altura em que estava; a bola de fogo continua saindo na altura do chao. Agora `hitstun` derruba quem esta no ar (`knockdown` mantem a altura). Reproduzido (4 de 80 amostras flutuando, com a CPU ligada e P1 pulando) e corrigido (0 de 80). Nao e colisao de hurtboxes.

## Rodada 22 - Shoryuken/Tatsumaki (video) e recuperacao
- Shoryuken medio: sobe com vy 350 e gravidade 17 (~34 quadros no ar, ~56 px), igual ao video. O forte nao mudou.
- Tatsumaki: altura de flutuacao 900 -> 1700 (~26 px, estimado a olho).
- Novo `fsp_lock`: 30 quadros sem soltar outro especial depois de pousar do Shoryuken e depois do Tatsumaki.
- NAO mexido: distancia X do Tatsumaki por forca, sincronia do agarrao, buffer dos especiais, cancel no 2o hit.

## Rodada 23 - LP/HP dos especiais e agarrao novo
- Shoryuken: HP (Y) = fisica do video (vy 350, gravidade 17). LP (B) = mais baixo e rapido (vy 310, gravidade 25).
- Tatsumaki: HK (X) = alcance do video (22 por passo, giro a 1700); LK (A) = alcance menor (9 por passo, giro mais baixo 1300).
- Agarrao: a vitima usa a animacao `thrown` (frames 116, 130, 129 da folha), travada quadro a quadro em relacao ao Ryu: agarrada na frente, sobe, passa por cima da cabeca e cai atras (dano + derrubada). Alcance do agarrao: `THROW_DIST` 36 px (distancia minima entre os corpos ~32 px), so com a direcao do oponente.

## Rodada 24 - Barra de super e Contra-Golpe
- HUD: barra de super na linha 27 do BG3 (paleta 2 azul, indice 8 da CGRAM), P1 embaixo a esquerda e P2 a direita, 10 tiles (80 px) cada, enchendo do centro para a borda; 3 marcas ao lado mostram os estoques (ate 3). `draw_super`, `gain_g`, `hud_dirty2`.
- Energia: +7 ao acertar/ser defendido (apply_hit), +5 ao apanhar (damage), +8 ao soltar Hadouken/Shoryuken/Tatsumaki (start_attack).
- Contra-Golpe: Y+X durante a defesa (fblk) gasta 1 estoque; `do_counter` solta o soco forte invulneravel (24 quadros), `fcounter` faz o golpe derrubar sem dano. A CPU usa sempre que tem 1 estoque.

## Rodada 25 - Barra de super (regras novas), flash e agarrao
- Barra de 100 pontos: +1 defender ou apanhar, +10 soltar especial (acertando ou nao), +3 golpe normal/agarrao que acerta (so quem acerta). Ao chegar em 100 vira 1 bolinha (max 3) e zera. Layout discreto: barra fina (3 px) na linha 27 e bolinhas 4x4 na linha 26, cores azuis (paleta 2). Tiles 19-38 do hud.bin; DBG_TILE0 foi para 40.
- Contra-Golpe: hitstop 12 (25% maior), derrubada com fvx 50% maior, flash branco de 2 quadros (`flash_t`, COLDATA + CGADSUB no vblank). Gasta 1 bolinha.
- Agarrao: durante o arremesso a vitima fica de costas para o Ryu (`fdir[d] = fdir[i]`).

## Rodada 26 - Agarrao pela referencia de 14 quadros do usuario
- Vitima (`thrown` = 116, 117, 128, 130) travada por quadro do Ryu: agarrada na frente, puxada para as costas (olhando para o mesmo lado do Ryu), deitada por cima da cabeca, de cabeca para baixo na frente (impacto/dano). No quadro seguinte e arremessada para frente.
- `fthrown`: ao bater no chao quica uma vez, deita e levanta com a animacao `rise` (129 de ponta-cabeca, 131 agachado).
- mkfight: rotulo `_end` dos dados ganha 1 byte extra (o `dbg_bin_end` caiu exatamente no limite do banco e quebrou o link).

## Rodada 27 - Barra 64 px, limite de golpes, Contra-Golpe garantido, choque de magias
- Barra de super: 64 px (8 tiles; P1 colunas 6-13, P2 18-25; bolinhas na linha 26). 64 pontos = 1 bolinha; com 3 bolinhas fica zerada e para de encher.
- `fhits`: golpes sofridos recentes; cai 1 a cada 30 quadros sem apanhar (`HITS_DECAY`). No limite (`HITS_LIMIT` 4) so golpe forte (`is_strong`: HP, HK, agachados fortes, de perto fortes, especiais) derruba. A regra antiga "3 golpes de combo aereo derrubam" saiu.
- Contra-Golpe: a partir do quadro ativo acerta o oponente a ate 80 px em qualquer posicao (agachado, no ar), sem depender da hitbox.
- Bolas de fogo que se encontram (ate 24 px) se desfazem as duas (animacao fireball_fx da folha).

## Rodada 28 - Agarrao no tempo do video
- Tempos do Ryu (passos): 4, 17, 24, 7, 10 (antes 4, 6, 6, 8, 10), medidos no video de 60 quadros/s. A vitima tem 5 fases (o quadro 2 do Ryu se divide: atras no alto, depois deitada por cima da cabeca).
- Ao soltar: pausa (hitstop) de 24 quadros, como o Ken parado no alto no video; voa com vy 150 e fvx 20 (~ distancia de uma derrubada pesada), quica, fica 50 quadros deitado (25% a mais) e levanta.
- `thr_hold`: enquanto a vitima esta presa, a camera e o empurrao entre os corpos ficam parados (a camera andava porque a vitima passa por tras do Ryu e o meio entre os dois mudava).

## Rodada 29 - Agarrao sem pausa no ar
- Tirada a pausa de 24 quadros na soltura (era do video no canto, onde o Ken bate na parede). No meio da tela a vitima voa direto.
- O som de impacto, a faisca e o dano agora entram quando a vitima bate no chao (antes tocavam no ar).

## Rodada 30 - Sagat (segundo personagem)
- Folhas na `sprites/`: `sagat_sheet.png` (limpa), `sagat_hit.png` (hitboxes vermelhas), `sagat_hurt.png` (hurtboxes verdes, cor (104,255,0)). Sons `SFII_72 - Sagat Tiger.wav` (TIGER) e `SFII_7~4.WAV` (TIGERUP) em `audio/wav/`.
- `tools/mksagat.py`: acha os 115 quadros da folha (ignora linhas/titulos azuis e textos a mao), as caixas e monta as animacoes do Sagat com o MESMO nome e quantidade de quadros das do Ryu (`SAGAT_ANIMS`). Quadros repetidos sao guardados uma vez so. A tabela de quadros tem Ryu (0..138) e depois o Sagat (`SAGAT_OFF` = 139): o jogo usa as mesmas constantes A_* e soma `choff[i]` (lutador) / `obj_off[o]` (objeto desenhado). Ancora x e "faixa" do Sagat = centro do calcao azul.
- Paleta P2 do Sagat (Sagat x Sagat): tabela `SAGAT_P2` em hexadecimal no `tools/mksagat.py` (calcao bege e pele bronzeada, como o Sagat "Champion Edition" da folha). `res/sagat.pal` = P1, P2, Tiger Shot (OBJ paleta 5).
- Selecao: Sagat na caixa ao lado do Ryu. Escolhe o P1 (cursor amarelo) e depois o P2 (cursor azul). Mesmo personagem dos dois lados: o P2 usa a paleta alternativa (luta e retrato do VS). Retrato do Sagat: quadro do rosto da folha, espelhado, BG paletas 5 e 6.
- Golpes do Sagat (`sagat_special`): Tiger Uppercut (frente, baixo, diagonal + soco; fisica do Shoryuken, mais baixa porque os quadros sao bem mais altos), Tiger Knee (o mesmo + chute: salto para frente com joelhada; o forte vai mais longe), Tiger Shot alto (baixo, diagonal, frente + soco) e baixo (+ chute, animacao agachada `A_LOW_SHOT`, tiro rasteiro). Fraco = lento, forte = rapido. Vozes: "Tiger Uppercut" e "Tiger".
- Banco de sons passou de 32 KB: `tools/fixbank.py` (chamado pelo Makefile) prende cada pedaco no inicio do seu banco de ROM ($8000), onde o SNESMOD continua a leitura. Antes isso travava a inicializacao.
- Testes: a selecao agora pede 2 confirmacoes (`2 B`, espera, `2 B`).

## Rodada 31 - Ajustes finos do Sagat, vozes e desempenho
- Tiger Shot baixo: sai na altura do punho do Sagat agachado (`pj_alt` 20, pela caixa do quadro 62). Alto continua na altura do punho em pe (52).
- Tiger Knee: salto mais alto (vy 260/290: o joelho chega no rosto do Ryu) e ~50/65 px para frente (mais que o Uppercut).
- Sagat anda mais devagar (passo 1/8 px menor em 2) e cada quadro da caminhada dura 7 (antes 5): passos pesados; para tras continua mais lento que para frente.
- Golpes fracos do Sagat 1/3 mais rapidos (`adur`); golpes fortes com hitstop 12 (antes 9).
- VOZES: o SNESMOD so toca 16 efeitos (o indice vai em 4 bits no comando). Efeitos 16+ tocavam outro som (o "Tiger Uppercut" virava um swing; os sons do cursor tambem eram trocados). Agora cada tela carrega so os efeitos que usa (`sfx_set_menu`, `sfx_set_fight`): `spcLoad(MOD_EMPTY)` (modulo de 1 amostra muda, `audio/empty.it`) zera a memoria e `sfx_slot[]` diz onde cada efeito ficou. Ryu x Sagat passa de 16: o swing medio usa o fraco e a aterrissagem usa o som do chao. Sons longos encurtados (`MAXS` no mksfx) para caber na memoria do SPC.
- Desempenho: `UP_MAX` 10 -> 16 pecas por vblank (medido com PROFILING: 16 pecas usam ~27 das ~37 linhas do vblank). Os quadros do Sagat (ate 20 pecas) chegam mais rapido na VRAM; a logica nao perdia quadros, o atraso era a troca de quadros.

## Rodada 32 - Sagat (pulo, Tiger Knee, arremesso) e otimizacao geral
### Sagat
- Pulo: o quadro encolhido dele sobe 28 px para alinhar o corpo (Ryu 15): com a mesma forca os pes passavam da cabeca do oponente. Sagat pula com vy 255 (Ryu 290): pes a ~80 px no alto, como o Ryu.
- Tiger Knee: animacao era 109 (pulo de bracos para cima) -> agora 113 (agacha 3 passos no chao), 111 (joelhada, hitbox da folha) na subida e no alto, 112 na descida, 113 no pouso. Salto vy 330/350 (~39 px), 50/65 px para frente. Ao acertar ou ser defendido rebate para tras (nao passa por cima do oponente).
- Arremesso: a folha do Sagat gira de costas (79) e joga para TRAS (80); antes usava a coreografia do Ryu (joga para a frente). `thr_off/thr_hgt/thr_fr/thr_back[personagem][fase]`; Sagat solta a vitima para tras.
### Desempenho (medido no emulador: quadros de logica por 600 quadros de video)
- Antes: Ryu x Ryu 543/600, Sagat x Sagat 526/600 (perdia 10-12%). O contador `lag_frames` estava errado (so via atraso de 2+ quadros): corrigido (`>= FRAME_VBLANKS`).
- `draw_obj`, `do_uploads`, `plan_frames`, deteccao de comandos (`motion_id`) e `clear_fwd_hist` em assembly (`src/drawobj.asm`); `draw_pieces` reescrito enxuto (`src/pieces.asm`). Em C, cada linha virava ~20 instrucoes lentas.
- Barras do HUD: so os tiles que mudam (`bar_upd`); antes cada acerto redesenhava as 3 barras (~200 linhas de tela).
- `hit_region`: hurtbox calculada uma vez (antes 1 vez por regiao).
- FastROM (`FASTROM := 1` no Makefile): codigo e tabelas na ROM a 3,58 MHz. O tcc punha a RAM dos .c em $FE/$FF com FastROM: `tools/fixram.py` (regra %.asm do Makefile) prende as .RAMSECTION nos bancos $7E/$7F.
- Envio para a VRAM: 24 pecas por vblank (DMA em assembly; termina na linha ~256 de 262).
- Quadro em que um golpe acaba de acertar (o mais pesado): o desenho fica para o proximo quadro (`tick_heavy`): a acao congela no hitstop, a imagem seria a mesma.
- Resultado: 1798-1800 de 1800 quadros nos testes longos (Ryu x Ryu, Sagat x Sagat, Ryu x Sagat).
### Build
- `src/fight.asm` saiu do git (e gerado; com ele no git o make compilava a versao velha). Makefile ganhou dependencias: `data.obj` dos .bin/.pal, `src/fight.ps` dos .h gerados, `src/drawobj.obj` do `res/chunks.inc`.

## Rodada 33 - Sagat: voadora forte, cambalhota do Tiger Uppercut e hitbox
- Hitbox do Tiger Uppercut: a caixa pequena do punho (folha: 174..188) e do quadro 85 (subida), mas a regra antiga (centro mais perto) dava ela ao 86: aparecia ATRAS do Sagat. `owner_of` agora escolhe o quadro que a caixa mais cobre (so cai no centro mais perto se nao encostar em nenhum). A caixa grande do 86 foi trocada pela do print do usuario (folha: 202,525 - 233,653; o print e a folha ampliada 4x, conferido pixel a pixel).
- Tiger Uppercut: animacao [90, 85, 86, 81, 87, 88]. Pela velocidade vertical: sobe 85 (soco), 86 (alto) e desce com a cambalhota para tras 81 (encolhido), 87 (girando), 88 (bracos para cima) ate o chao. Antes parava no 87 a descida inteira.
- Voadora com chute FORTE (X no ar, parado ou na diagonal) do Sagat: quadros 56/57/58 (57 = chute diagonal para baixo, com a caixa da folha). Nova animacao `jhk` (no Ryu = a mesma voadora). Chute fraco no ar continua: joelho (parado) e chute reto 74 (diagonal).
- A secao "Crouch/Kick" da folha (48, 56, 57, 58, 49) e de quadros no ar (pes soltos, pernas encolhidas): a folha nao tem chute agachado do Sagat. Os chutes agachados seguem usando esses quadros ate chegarem sprites certos.
- Shoryuken/Tiger Uppercut: andava 5/passo olhando para a direita e 10 para a esquerda (erro antigo). Agora 5 dos dois lados.

## Rodada 34 - Pes do Sagat, Tiger Knee mais alto, arremesso do Sagat
- Pes sumindo: o plan_frames em assembly so enviava 2 pedacos (16 pecas) dos quadros "pequenos"; com UP_MAX 24, quadros de 17-24 pecas perdiam o 3o pedaco (os pes). Agora envia o 3o. UP_JOBS 48.
- Tiger Knee: vy 360/375 (~46/50 px): no alto o topo do quadro do joelho fica na altura da cabeca do Sagat em pe (imagem de referencia).
- Arremesso do Sagat: vitima na altura das maos erguidas (78), por cima da cabeca (79) e jogada para tras e para baixo (80).

## Rodada 35 - Ordem de desenho, Tiger Uppercut mais longo, Tiger Knee e SUPER
- Quem ataca fica na frente de quem apanha: `oam_base` virou RAM e `front` troca as faixas da OAM dos lutadores (4 = na frente).
- Tiger Uppercut: mesma altura, gravidade 9 (HP) / 13 (LP) e vy 207/178: ~40% mais tempo no ar para a cambalhota.
- Tiger Knee: ao acertar continua subindo como o Shoryuken (so para de avancar).
- SUPER (os 2 personagens): baixo, diagonal, frente 2 vezes + soco forte (`motion_id(4)`, tabela de comandos com linhas de 16 bytes). Flash preto (subtracao de cor, `flash_black`), congela 16 quadros, magia verde (OBJ paletas 6/7 geradas pelo mkfight) desenhada em 2 andares (`super_copy`, sprites 60-67) com hitbox 18 px mais alta, 40% de dano (38/96), derruba e hitstop 20 no impacto. Livre (nao gasta barra).

## Rodada 36 - Magia reforcada (2 socos)
- Hadouken e Tiger Shot alto com os 2 socos juntos (B + Y) no fim do comando (`ex_check`, le o `pad` do P1): magia vermelha, dano 20 (forte normal 14), velocidade 5, flash branco curto.
- Choque de magias por forca: simples 0 < reforcada 1 < super 2. A mais forte atravessa; iguais se desfazem.
- OBJ paletas 6 (P1) e 7 (P2) agora sao do JOGADOR: a cor da magia especial dele (verde = super, vermelha = reforcada) e carregada no vblank quando ele atira (`pal_pend`). ryu.pal/sagat.pal ganharam a versao vermelha.

## Rodada 37 - Menus do Street Combat v0.0.1 (md "especificação técnica e otimização")
- `src/menu.c` reescrito: splash verde "Designed by Nando Bastos" (fade 1 s / 1,5 s / 1 s, START/B/A pulam), titulo com
  logotipo STREET COMBAT (Press Start 2P x4, degrade), menu Arcade/Versus (cinza, cursor pula), Practice (selecao -> luta),
  Creditos, Opcoes; rodape em fonte Tiny5. Troca de tela = caixa preta de sempre.
- Opcoes: volume BGM/SFX 0-100 de 10 em 10 (curva quadratica; SFX toca um soco de teste), idioma PT/ES/EN/JA aplicado so
  ao sair, botoes (B Y A X L R) com troca automatica e Restaurar Padrao. D-pad repete (250 ms / 100 ms).
- Salvo na SRAM (cartucho com bateria, 2 KB; Makefile CARTRIDGETYPE 02 / SRAMSIZE 01), com assinatura "SC01" e soma.
- Luta: `key_map` (asm, src/drawobj.asm) traduz os botoes; R livre continua ligando o debug. Selecao: A volta (P2 -> P1 -> titulo).
- `idiomas/textos.tsv` = dicionario central (pt, es, en, ja). Fontes em `tools/fonts` (OFL).
- Pendente: md "Arcade/Versus v0.0.2" (rounds, ROUND/FIGHT, YOU WIN/LOSE, continue) - precisa das vozes (.wav) do usuario.

## Rodada 38 - Arcade e Versus (md "Arcade/Versus v0.0.2")
- Titulo: Arcade Game e Versus Mode liberados (`game_mode`: 0 Practice, 1 Arcade, 2 Versus).
- Arcade: P1 escolhe; CPU (ai_on) na escada `ARC_N` = 2 (primeiro o outro lutador, depois o espelho). Venceu tudo ->
  `ending_run` (retrato + "Parabens", texto `ending` do tsv). Perdeu -> `continue_run`: 9..0 (1/s), START (9-1) volta a
  selecao na mesma fase; 0 -> GAME OVER, paletas em cinza, fade para o titulo (`menu_fade`).
- Versus: `select_versus` (2 cursores ao mesmo tempo, controle 2 = pad 1); P2 humano (`fcpu[1]=0`, `p2_update`), historico de
  comandos por jogador (`dir_hist[64]`, `hist_off` no asm). Fim da partida volta para a selecao.
- Rounds (Arcade/Versus): `round_step` ROUND n -> FIGHT! (controles travados, `ctl_on`) -> K.O. de verdade (`fko`, barra a 0,
  fica deitado) -> YOU WIN / YOU LOSE / DRAW GAME (round extra, sem bolinha). Melhor de 3; bolinhas na linha 3 do HUD.
  Letreiros: `res/ann.bin` (mkassets `build_ann`, BG3 paleta 3) nos tiles do debug (debug so no Practice).
- runtest: botoes do controle 2 com prefixo "2" (ex.: `3 2DOWN+2Y`).

## Rodada 39 - Vozes do anunciante (zip do SF2 no repositorio) e grito de morte
- Vozes de `SNES - Street Fighter II...Sound Effects.zip` copiadas para `audio/wav` e incluidas em `sfx.it` (37 efeitos).
  Conjuntos de sons por tela (`sfx_set_voices(0/1/2)`): 0 = ROUND/ONE/TWO/THREE/FIGHT (round comeca com a tela coberta);
  1 = YOU WIN/YOU LOSE (carregado ~1,7 s depois do K.O.); 2 = contagem 9..1 do Continue (+ KO, MOVE, OK).
  Depois do FIGHT! carrega o conjunto da luta (pausa de ~16 quadros com o letreiro na tela).
- Grito de morte (KO Male, "uoh uohh", tom 1) esta no conjunto da luta e toca em `damage()` quando a vida zera (todos os modos).
  Para caber: no Ryu x Sagat o `SFX_FORWARD` usa o som do `SFX_ROUNDHOUSE`.
- Vozes de resultado/contagem no tom 1 (4044 Hz) para o modulo de efeitos caber no limite do smconv (58573 bytes).
- Faltam no zip: voz do "zero", "draw game" e "game over": zero toca o OK, game over toca o grito, draw game sem voz.

## Rodada 40 - Ajustes v0.0.3 (md "Ajustes e Correcoes de Gameplay")
- Barra de vida em 3 camadas: fundo preto + vermelha (BG2, 4bpp, `res/hud2.bin`, VRAM 0x4000/0x4800) atras da amarela (BG3,
  agora transparente alem do amarelo). Dano: a amarela cai na hora; a vermelha espera 18 quadros (`rdelay`) e desce 1/8 da
  diferenca por quadro (`red_update`/`red_draw`, `rv[]`). BG2 usa prioridade 1 (senao o cenario cobre).
- Super (Arcade/Versus) exige e gasta as 3 bolinhas (zera a barra); no Practice continua livre. "Duplo Forte" = o
  Contra-Golpe (Y+X na defesa), que ja gastava 1 bolinha.
- Bolinhas/barra de super passam de um round para o outro (guardadas em `fight_run` antes do `fighters_reset`).
- Largada mais afastada: 136 e 248 px (antes 152 e 232). Fim de round: fade por brilho (`fade_out`/`fade_in`), os lutadores
  voltam ao lugar com a tela 100% preta.
- K.O. em camera lenta (`slow_t`, 72 quadros, 1 de logica a cada 4); resultado depois de ~2,4 s. PERFECT! (texto na linha 14 +
  voz) quando o vencedor esta com a vida cheia. Voz `V_PERFECT` no conjunto de resultado.
- Contagem do Continue / YOU WIN / LOSE: passa-alta 120 Hz, filtro passa-baixa nitido, realce de agudos e pico em -1 dB
  (`voice_filter` em mksfx.py). Continuam no tom 1 (4044 Hz): o modulo de efeitos esta no limite do smconv.
- NAO feito: pose de vitoria (nao ha sprites; o vencedor fica no idle), pitch do som na camera lenta, zoom/tremor de camera.
- O "som de ganho de barra" ao acertar projetil nao existe no jogo (so toca o impacto do golpe).

## Rodada 41 - Ajustes v0.0.4
- **Bug do "passarinho" (magia/arremesso)**: `snd_swing`/`snd_hit` usam `SFX_NONE` (255) no Hadouken e no arremesso e o
  `play_sfx` chamava `spcEffect` com efeito inexistente (slot/tom lixo = apito agudo, pitch 15). O tcc-816 compara `u8 >= 128`
  como negativo, entao `id == 255` e `id >= SFX_COUNT` falhavam. Agora `if (id & 0xC0) return;` (src/fight.c, `play_sfx`). Achado
  gravando o audio no runtest e olhando a fila `spc_fifo` (mensagem `08 f8 df`).
- Continue: no 0 nao toca mais o som de confirmacao (so o game over; o OK so toca se apertar START de 9 a 1).
- Camera lenta do K.O. +0,5 s (`slow_t` = 100 quadros). Pose de vitoria do spritesheet (`A_VICTORY`, `fwin[]`) quando a camera
  lenta acaba, depois YOU WIN / PERFECT!.
- Fim de round: alem do fade, a camera (BG1) volta ao ponto zero com a tela preta (`set_cam_scroll` antes do `fade_in`).
- Soco duplo (B+Y no Hadouken, EX) exige e gasta 1 bolinha no Arcade/Versus; sem bolinha sai a magia normal.
- Nao ha EX de chute (A+X) nem golpe novo para Y+X fora da defesa: o Contra-Golpe (Y+X na defesa) ja gastava 1 bolinha.
- Armadilha de teste: lutas longas no runtest terminam o round e trocam o conjunto de sons (parece som corrompido): manter o
  P1 vivo (`poke fhp 0 96`) ao testar efeitos.

## Rodada 42 - Ajustes v0.0.5
- **EX (2 socos)**: a causa do "libera com a barra em ~90% e 0 bolinhas" era o +10 que o proprio especial da no `start_attack`:
  ele fechava uma bolinha e o `ex_check` a enxergava. Agora usa `fstock_pre[]` (bolinhas ANTES do golpe); a bolinha ganha
  na hora continua sendo do jogador. O Super tambem zera a barra DEPOIS do `start_attack` (o +10 nao sobra).
- **Super**: cenario (BG1 + fundo) escurecido ~40% (`dark_lvl` 12/31, color math subtrativa so em BG1+backdrop: lutadores,
  magias e HUD ficam por cima), segura ~0,7 s e volta em 4 quadros por nivel (vblank, junto do flash).
- **Reset de round**: alem de `fighters_reset`, zera o estado de envio de graficos (fwant/fshown/oc_f/up_t/plan_ch/sbuf/up_n),
  para nenhum quadro (ex.: Sagat caido) ficar em cache. O Sagat deitado nao foi reproduzido no emulador (P2 e P1 ok).
- **Sem pausa antes do round**: a troca "vozes -> sons da luta" agora e feita em pedacos (2 efeitos por quadro em `fx_frame`,
  `sfx_pump`, `sfx_async`); o FIGHT! fica na tela ate `sfx_k == sfx_n`. Mesma coisa na troca para as vozes do resultado.

## Rodada 43 - Spritesheet dos lutadores e barra vermelha
- `python3 tools/mksheet.py` gera `sprites/spritesheet_lutadores.png` (+ `.md`): todos os quadros do Ryu e do Sagat em 1:1, na paleta
  de 15 cores do jogo, sem hitboxes, um bloco por lutador. Repetidos aparecem so uma vez; nas outras animacoes entra uma caixa
  magenta "= NOME #n". Usa `mkfight.DUMP` (cada quadro emitido por `build_ryu`).
- Barra vermelha da vida espera 30 quadros (~0,5 s) antes de comecar a descer (antes 18).

## Rodada 44 - Arena em 192 linhas com tarjas pretas (como o SF2 do SNES)
- Referencia do usuario: no SF2 a arena tem 192 linhas e os pes do Ryu ficam ~89% da altura. Aqui: `GROUND_Y` 208 -> 187, o cenario
  (BG1) sobe `SCENE_DY` 21 linhas (`REG_BG1VOFS`), `lda #187` no asm. HUD: vida na linha de tiles 4 (`HUD_HP`), bolinhas de round 5
  (`HUD_WIN`), barra de super 22-23 (`HUD_SP`); BG2 (barra vermelha) na linha 4.
- Tarjas: HDMA no canal 5 escreve o INIDISP (`bars_on`, tabela `hdma_t` na RAM): apagada nas linhas 0-16 e 204+, acesa em 17-203.
  Canal 7 NAO serve (e o OAM do vblank da PVSnesLib). Fades da luta usam `fx_bright` (mudam a tabela).
- Ganho: depois do NMI a tela fica apagada ~54 linhas (vblank 37 + 17 da tarja de cima) em vez de 37. `UP_MAX` 24 -> 40 pecas.
  Medido (stress de 1200 quadros): 1190 quadros de logica e 7 atrasados, igual ao anterior (1191 / 6): o gargalo hoje e a logica,
  nao o envio de graficos. O ganho e folga para lutadores/golpes maiores.
- Tentei enviar os graficos tambem na tarja de baixo (antes do NMI), mas o envio passava da linha 225 e o jogo perdia quadros
  (1150/1200): desfeito. `scan_now`/`wait_scan` ficaram disponiveis.

## Rodada 45 - Barra de super enchendo da posicao errada
- Causa: `super_full` (usada na troca de round, onde a barra guardada e restaurada) chamava `bar_upd` com valor antigo 255, que so
  redesenha do valor para fora; os tiles do comeco (centro) ficavam vazios e o preenchimento parecia comecar no meio. Agora
  apaga a barra inteira e redesenha do comeco ate o valor.

## Rodada 46 - Boxer (3o lutador, so idle) e IA do Practice
- `sprites/boxer_idle.png` (256x95, 4 quadros ~62x92, 24 cores -> 15 pela `reduce_colors`). `tools/mkboxer.py`: todas as animacoes do
  Ryu apontam para os 4 quadros do idle em ciclo (a tabela exige a mesma ordem/contagem; quadros repetidos nao ocupam ROM: +8 KB),
  sem hitbox, hurtbox = corpo todo, `BOXER_OFF` em res/ryu.h. Avatar de teste (busto do 1o quadro) em `mkboxer.face()`.
- Jogo: `fgfx[i]` (CH_RYU/SAGAT/BOXER) decide quadros, paletas e retrato; `fchar[i]` continua a LOGICA (o Boxer usa a do Ryu, a magia
  dele e a do Ryu). Selecao com 3 lutadores (celula 3), paleta de BG 7 (P1) e 1 (P2); P2 do Boxer so troca as cores vermelha/azul.
  Arcade: o Boxer enfrenta primeiro o Ryu.
- **Practice**: a CPU so age depois do SELECT. Causa: o tcc-816 errava `if (!ai_on || !ctl_on)` em `cpu_update` (a IA rodava com ai_on=0
  desde a v0.0.2). Agora duas condicoes simples (`act`).

## Rodada 47 - Boxer: soco fraco (LP)
- `sprites/boxer_lp.png` (4 quadros; os quadros sao achados por componentes conectados). Animacao `mp` (soco fraco = botao B) usa os 3
  ultimos: preparar, esticar (hitbox = luva azul + folga), recolher; o 1o e a guarda parada. Hurtbox = 32 px em volta da ancora.
- `python3 tools/mkboxer.py` gera `sprites/boxer_cores_jogo.png`: o Boxer nas 15 cores do jogo (P1 e P2) para o usuario pintar por cima.

## Rodada 48 - Boxer: luvas trocam de cor ao virar
- `bx_dir[]` + bloco no vblank do loop de luta: se `fdir` do Boxer mudou, regrava a paleta do lutador (32 bytes) com a normal (direita)
  ou a trocada (`boxer.pal` 2a paleta, esquerda). Sem sprites nem tiles extras. Vale para P1 e P2 (nao ha mais paleta fixa de P2 no Boxer).

## Rodada 49 - Boxer: idle novo (15 cores) e troca exata vermelho <-> azul
- `sprites/boxer_idle.png` agora e 1 quadro (64x95, 15 cores); o antigo ficou em `boxer_idle_antigo.png`. A paleta vem so do idle; o soco
  fraco (arte antiga) usa a cor mais proxima.
- Antes a "troca" era de canais (R<->B): o azul virava laranja. Agora `swap_pairs`: cada vermelho vira o azul de mesma luminosidade e
  vice-versa (luvas e faixa do short); pele, cinzas e contorno ficam. A paleta do lado esquerdo (2a de `boxer.pal`) e regravada ao virar
  (`bx_dir`, vblank do loop de luta).

## Rodada 50 - Anti-Throw, START = PAUSE e menu de treino (Practice)
- **Anti-Throw** (`throw_break` em fight.c): o defensor aperta Y/B/X/A enquanto o agarrao esta nos quadros 0-2 (antes do impacto) e o
  arremesso e anulado: sem dano, hitstop 14, flash VERMELHO (`flash_red`, COLDATA R=31/G=0/B=0) e os dois entram no quadro Head Hit
  (`A_HIT_HEAD`) e sao empurrados (`fkb` 24 = o empurrao do chute forte de perto). Defensor humano: dentro do ramo ST_HITSTUN de
  `fighter_update` (`fsp_t==255`, atacante com `ATK_THROW`). CPU: em `start_throw`, se `cpu_tech` e `ai_on`.
- **START = PAUSE** (`fight_pause`): so quando os controles estao liberados (`ctl_on`). Toca `SFX_PAUSE` (novo no `sfx.it`, WAV
  "SFII_77 - Pause Game"), mostra o letreiro PAUSE e para tudo (nao chama `fight_tick`/`round_step`: fisica, animacao e tempo parados).
  O SPC so tem 16 slots e o conjunto da luta Ryu x Sagat enche todos: na pausa carrega-se o conjunto `sfx_set_pause` (PAUSE + cursor)
  e ao voltar `sfx_set_fight`/`sfx_set_voices` recarrega o anterior (`sfx_cur` guardado).
- **Practice**: START abre o menu de treino (letreiros `ANN_*` novos em `mkassets.py`; os tiles do BG3 sao trocados com a tela apagada:
  `pause_gfx`; o desenho de hitboxes e desligado ao abrir, R liga de novo). Itens: CPU ANTI-THROW (NO/YES, `cpu_tech`), POWER GAUGE
  (OFF/ON, `pg_lock`: depois de cada `fight_tick` o `fstock` volta a 3 nos dois) e EXIT (volta a selecao: sem isso o Practice nao
  teria saida, ja que START nao volta mais). Cima/baixo escolhem, esquerda/direita/A mudam, START ou B fecham.
- Textos do menu em ingles (como ROUND/FIGHT!), nao entram no dicionario de 4 idiomas.
- Testado no emulador: CPU com Anti-Throw (flash, hitstop, recuo, sem dano), defensor humano (via poke de Versus), PAUSE em Arcade
  (imagem parada, som restaurado), menu de treino (opcoes, EXIT).

## Rodada 51 - DonLee: idle e jab novos
- `DonLee_Spritesheet_teste.png` (da main) cortado em `sprites/boxer_idle.png` (4 quadros) e `sprites/boxer_lp.png` (4 quadros; o 1o e a guarda,
  entram os 3 ultimos). `tools/aseread.py` le o .aseprite (so Idle, 4 quadros). Paleta de 15 cores, troca vermelho <-> azul por direcao mantida.
- Jab do DonLee bem rapido: `adur` usa 2+4+4 quadros (o MP do Ryu: 4+9+8). Agarrao ja valia para todos os lutadores (logica unica).

## Rodada 52 - DonLee: HP, LK e HK (provisorios) e jab com recuperacao
- `sprites/boxer_folha.png` (= DonLee_Spritesheet_teste2.png): folha unica em casas de 128 px (cada casa = 1 quadro, pecas soltas juntas).
  `mkboxer.py`: `SLOTS`/`ANIM_SLOTS`/`HIT_SLOT`. HP = casas 11,12,13(acerto),14,10(guarda); MK(LK) = 17,18,19(acerto),21,22; HK = 25,26,27(acerto),28,29;
  MP(LP) = 6,7(acerto),8. O ultimo quadro de HP/HK e a guarda (recuperacao). Hitbox = luva esticada (`glove_rect`); LK nao tem luva: frente do corpo.
- Jab: quadros 2+4+8 (o ultimo, recolher, segura 8) para o jogador nao ficar apertando sem parar. A contagem de quadros por animacao e a mesma
  para todos os lutadores (tabela unica): nao da para acrescentar um 4o quadro so no DonLee.
- Recuo do atacante apos acertar/ser defendido: ja vale para todos os golpes normais (`fkb`).
- `tools/mksheet.py` agora inclui o DonLee (spritesheet_lutadores.png/.md).

## Rodada 53 - DonLee: folha final com tags (golpes, golpes de perto, dor no corpo, vitoria)
- `sprites/boxer_folha.png` (da main, quadros em casas de 128 px; numero do quadro na timeline - 1). `ANIM_SLOTS` em `mkboxer.py`: LP 7-9, HP 11-14, LK 16-19,
  HK 21-23, HK de perto 26-28, HP de perto 30-32, dor no corpo 34-36, vitoria 41-44. Como o jogo tem contagem fixa de quadros por animacao, o
  ultimo quadro e repetido (a ROM guarda uma vez so).
- `bx_dur` (fight.c): tempos proprios do DonLee por quadro; os quadros de impacto duram mais. LP 2/5/8 e LK 4/3/12/6/12: recuperacao
  longa, nao da para repetir sem parar. HP 3/3/12/8/6, HK 5/4/12/8/8, HP de perto 3/10/12/8/8, HK de perto 7/14/8.

## Rodada 54 - DonLee: dor em todos os golpes, LK de perto = LK, pausa sem desenho pela metade
- Dor na cabeca e agachado agora usam a arte de dor no corpo (era so o idle: so o golpe de perto mostrava a dor). `mkc` (LK de perto) = quadros e tempos do LK.
- Pausa no meio de um golpe grande: os quadros do DonLee (ate 93 px) levam mais de um vblank para subir; o jogo parava com o quadro pela metade
  (pedacos do lutador faltando). `fight_pause` agora termina os envios (4x `fight_draw` + `do_uploads`) antes de congelar.

## Rodada 55 - Pedacos faltando nos quadros grandes (DonLee HK)
- Causa: cada lutador tem 24 pedacos 16x16 por bloco na VRAM e o HK do DonLee tinha 25: o 25o pedaco caia fora do bloco (faltava um pedaco do
  desenho em luta normal). `mkfight.emit` agora (1) escolhe a grade de pedacos (0-15 linhas vazias no topo) que gasta menos pedacos (Ryu/Sagat/DonLee
  ficam ~4% menores) e (2) se ainda passar de 24, tira o pedaco mais vazio e avisa (HK do DonLee: 3 pixels).

## Rodada 56 - Pedacos sumindo (envio passava do vblank), HK de perto do DonLee = HP, jab mais rapido
- Medido com PROFILING (golpes do DonLee, 1500 quadros): com `UP_MAX` 40 o envio de graficos passou do fim do vblank 61 vezes (o DMA na tela acesa
  e ignorado: sumiam pedacos/pes e o oponente ficava "transparente"); com 36 foram 13, com 32 foram 0. `UP_MAX` agora 32. Quadros do DonLee sao grandes
  (idle ja tem 19 pedacos; HK 24, LP 21; Ryu no maximo 15): o limite e pedacos por vblank somando os dois lutadores.
- HK de perto do DonLee e o HP (`try_normal`). Jab (LP): 2/4/7 quadros.
- Carga media do quadro nesse teste: 128 de 262 linhas; picos de ate 259 nos quadros de acerto; 0,4% dos quadros atrasam.

## Rodada 57 - Causa real do "transparente"/pes sumindo: faixa de sprites (OAM) pequena demais
- Cada lutador tinha so 20 sprites na OAM (`oam_cap`), mas o DonLee tem quadros de 21-24 pedacos (HK 24, LP 21): os pedacos de baixo (pes) nao cabiam e
  `draw_pieces` (sem limite) escrevia por cima da faixa do outro lutador (o oponente perdia pedacos = "transparente"). Agora 24 por lutador:
  P1 4-27, P2 28-51, bolas 52/56, sombras 60/64, copia da magia do super 68-75. `UP_MAX` 32 continua (envio ao fim do vblank).
- DonLee: o HP de perto (Y) e o HK de perto (X) usam a arte/golpe "HK de perto" (`ATK_CLOSE_HK`).

## Rodada 58 - DonLee: fall e KO
- Folha nova (`sprites/boxer_folha.png`): fall = quadros 38-40, KO = 42, vitoria = 45,46,47,49 (a folha tem 5; entram 4). Mesma logica do Ryu (so troca a arte).

## Rodada 59 - DonLee: folha nova (HP/LK/HK com 3 quadros, HP de perto final)
- `boxer_folha.png` (6400 px): LP 7-9, HP 11-13, LK 15-17, HK 19-21, HK de perto 24-26 (tambem usado pelo HP de perto), dor 32-34, fall 36-38, KO 40, vitoria 45-49.
  HP/LK/HK tem 3 quadros e o jogo 5: o ultimo se repete. O quadro 36 (fall) vinha com um desenho solto (tronco de calcao branco) por cima: `KEEP_LARGEST`
  deixa so a maior peca. "HP C" (28-30) nao e usado (o HP de perto e o HK de perto).

## Rodada 60 - DonLee: terceira folha (DonLee_Spritesheet_teste3.png), com andar
- Ordem pelas tags do Aseprite: Idle 1-4, LP 6-8, HP 10-14, LK 16-20, HK 22-26, HK Close 29-31, HP C 33-35 (nao usado), Hit Body 37-40 (3 desenhados),
  Fall 41-43, KO 45-46 (1 desenhado), F_Walk 47-50, Victory 53-56. F_Walk tem 4 quadros: `walk` = 47,48,49,50,49; `walkb` = o ciclo ao contrario.
- O quadro 41 (fall) veio de novo com o desenho solto por cima: `KEEP_LARGEST` na casa 40.

## Rodada 61 - DonLee: andar novo (5 quadros, ping-pong, mais lento) e defesa
- Folha atualizada: Block = 47, F_Walk = 49-53 (5 quadros), Victory = 56-59 (as casas depois do KO mudaram).
- O andar do DonLee toca em vai-e-volta (0 1 2 3 4 3 2 1, `pp_seq`/`fpp` em `fight.c`) e cada quadro dura 7 (antes 5). Andar para tras = a lista ao contrario.

## Rodada 62 - Pulinho (dois toques, estilo KOF 95), folha nova e correcao da camera lenta no inicio
- Dois toques na MESMA direcao (esquerda ou direita, ate 14 quadros entre eles, sem segurar cima/baixo): `start_hop` (fight.c). Salto baixo e curto
  (`HOP_VY` 150, `HOP_VX` 16: ~65 px e ~18 px de altura), sem golpes no ar, vulneravel como no pulo; usa a animacao `jump`. Espera `HOP_WAIT` 70 quadros
  antes de poder de novo (nao encadeia). So jogadores (a CPU nao faz). Vale para todos os lutadores.
- Bug antigo achado no teste: `slow_t` (camera lenta) nao era zerado no inicio da luta: com lixo na RAM o comeco da luta podia rodar em camera lenta.
- DonLee, folha `DonLee_Spritesheet3.png`: andar = quadros 49-51 (3, em ping-pong), pulinho/pulo = 53-54, vitoria 57-60. Sem tags novas no arquivo: o uso de 49-51 (andar) e 53-55 (pulinho) foi deduzido.

## Rodada 63 - Backdash (dois toques para tras); pulinho para frente desligado
- `start_backdash`: dois toques para TRAS (ate 18 quadros entre eles) = desliza 4 px (8 quadros x 4/8 px) sem sair do chao, sem golpes durante (`fdash`), espera 40 quadros.
  O pulinho para frente (`start_hop`, dois toques para frente) ficou no codigo, desligado: `#define HOP_FORWARD 0`.
- Bug evitado: a deteccao nao pode alterar `dx` (direcao do andar do mesmo quadro).
- DonLee: `walkb` (andar para tras e backdash) = quadros 53-55 da folha (ping-pong); antes o andar para tras era o do 49-51 ao contrario (por isso pareciam iguais).

## Rodada 64 - Backdash: andar travado depois dele; barra e bolinhas de super nos cantos
- Causa do andar travado: o backdash chamava `set_anim(..., 255)`, deixando `ftick` em 255; o andar do DonLee (ping-pong) esperava 255 passos para trocar de quadro.
  Agora `ftick` = 7 e `fpp` = 0 durante/depois do backdash.
- HUD: barra de super P1 colunas 1-8 (antes 6-13), P2 colunas 23-30 (antes 18-25); bolinhas P1 colunas 1-3, P2 28-30.

## Rodada 65 - Barra de super mais baixa
- `HUD_SP` 22 -> 23: bolinhas na linha 23 (y 184) e barra na 24 (y 192), rente ao fim da arena (visivel ate a linha 203).

## Rodada 66 - Backdash = o salto para tras de antes, mas so 4 px de altura
- Os "4 px" eram de ALTURA. Voltou o `start_hop` so para tras (dois toques para tras, ate 18 quadros): `HOP_VY` 70 (sobe ~4 px), `HOP_VX` 34 (~65 px para tras
  em ~11 quadros), espera 45 quadros. Anima com o andar para tras. O deslize de 4 px (`start_backdash`) foi removido. Para frente continua desligado (`HOP_FORWARD`).
