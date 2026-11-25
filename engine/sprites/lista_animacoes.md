# Animações do jogo e quantos quadros cada uma tem

Todos os lutadores usam **o mesmo número de quadros** por animação. Se você desenhar menos, o último quadro se repete (os tempos de cada quadro ficam no código).
"Acerto" = quadro (contando de 1) em que a hitbox do golpe fica ligada.

## Parado e movimento
| Animação | Quadros | Observação |
|---|---|---|
| idle | 4 | parado (loop) |
| walk | 5 | andar para frente (loop) |
| walkb | 5 | andar para trás (loop) |
| crouch_in | 1 | abaixando |
| crouch | 1 | agachado parado |
| jump | 2 | pulo vertical |
| fjump | 6 | pulo para o lado |
| block | 1 | defesa em pé |
| block_c | 1 | defesa agachado |

## Golpes em pé (botões: B = LP, Y = HP, A = LK, X = HK)
| Animação | Quadros | Acerto | Botão |
|---|---|---|---|
| mp | 3 | 2 | B (LP, jab) |
| hp | 5 | 3 | Y |
| mk | 5 | 3 | A (LK) |
| hk | 5 | 3 | X |

## Golpes de perto
| Animação | Quadros | Acerto | Observação |
|---|---|---|---|
| hpc | 5 | 3 | Y de perto (o DonLee usa o "hkc") |
| hkc | 3 | 1 e 2 | X de perto (no DonLee, Y e X) |
| mkc | 5 | 3 | A de perto (no DonLee = mk) |
| mpc | 3 | 2 | LP de perto (hoje o jogo não usa) |

## Golpes agachado
| Animação | Quadros | Acerto |
|---|---|---|
| cmp | 3 | 2 |
| chp | 4 | 3 |
| cmk | 3 | 2 |
| chk | 5 | 2 (rasteira) |

## Golpes no ar
| Animação | Quadros | Acerto |
|---|---|---|
| jp | 3 | 2 |
| jk | 3 | 3 |
| jdk | 3 | 2 (chute para baixo) |
| jhk | 3 | igual ao jdk |

## Especiais e agarrão
| Animação | Quadros | Acerto | Observação |
|---|---|---|---|
| hadouken | 4 | — | lançar a magia |
| shoryu | 6 | 3 e 4 | golpe para cima |
| tatsu | 6 | 2 e 4 | giro (loop) |
| throw | 5 | — | quem agarra |
| thrown | 4 | — | quem é agarrado (presa, levantada, no ar, de cabeça para baixo) |
| rise | 2 | — | levantar depois do agarrão |

## Reações
| Animação | Quadros |
|---|---|
| hit_head | 3 |
| hit_body | 4 |
| hit_crouch | 2 |
| fall | 3 |
| ko | 1 |
| victory | 4 |

## Efeitos (iguais para todos, só o Ryu/Sagat têm arte própria)
| Animação | Quadros |
|---|---|
| fireball | 1 |
| fireball_hit | 1 |
| fireball_fx | 4 |
| spark | 3 |
| shadow | 2 |
| low_shot | 4 (só o Sagat: Tiger Shot baixo) |

## Limites
- Um quadro pode ter no máximo **24 pedaços de 16x16** (cerca de 90x90 px com o corpo cheio). O ideal é ficar abaixo de ~19.
- Cores: 15 + transparente por lutador.
