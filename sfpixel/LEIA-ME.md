# SF Pixel — editor de animação para a SF Engine (Super Nintendo)

Abra `index.html` no navegador (não precisa instalar nada). É o SG Pixel adaptado para o SNES.

- **Paleta do SNES:** 15 cores + transparente por lutador; cada cor é uma das 32768 do SNES (R, G, B de 0 a 31).
- **Custo de cada quadro:** número de pedaços 16×16 (limite 24), tiles/bytes na VRAM, pedaços por linha. O número aparece embaixo de cada quadro na linha do tempo e o painel da direita detalha. O corte é igual ao da engine (testado contra `engine/tools/mkfight.py`).
- **Camadas de caixa:** Hitbox, Hitbox 2, Hurtbox e Âncora (pés). Marque a área com o retângulo (U); a caixa é o menor retângulo que cobre o que foi marcado.
- **Tags = animações da engine:** Arquivo → Novo lutador cria as 42 tags com o número de quadros que a engine espera (idle, walk, hp, shoryu...). O painel mostra o que falta.
- **Salvar:** `.sgpx` (guarda as caixas). **Exportar:** `.sffighter.json` (pedaços, caixas, âncora e paleta por quadro), a entrada do conversor da engine.

## Levar a arte para o jogo
1. No SF Pixel: Exportar → `.sffighter.json`; coloque o arquivo na pasta `project/`.
2. Clone um lutador (`editor/lutadores.html`) e, no `game.json`, ponha no lutador `"art": "nome.sffighter.json"` dentro de `traits`.
3. Gere a ROM (`make` em `engine/`): o `mkfight.py` corta os quadros, cria os gráficos, as caixas e a paleta do lutador.
Animações que a arte não tem usam o quadro do Ryu (o lutador continua funcionando). Testado com um lutador de teste: aparece na seleção e luta com a arte e as caixas do SF Pixel.

Pendente: prévia com o emulador, retrato e magia próprios.

## Editar os lutadores do jogo
Arquivo → **Abrir lutador do jogo** (Ryu, Sagat ou DonLee): abre com todos os quadros, a paleta, as tags e as caixas, lidos da ROM-motor.
Edite e exporte de volta (`.sffighter.json`). Testado: abrir o DonLee e exportar sem mudar nada dá exatamente os mesmos 131 quadros no jogo
(gráficos, pedaços e caixas). Também existe `tools/para_sfpixel.py` (mesma coisa em Python, gera `project/arte/*.sgpx`).

## Colar do Aseprite (ou de qualquer programa)
Copie no Aseprite (Ctrl+C) e cole no SF Pixel (Ctrl+V): a arte entra flutuando, com as cores convertidas para as do SNES.
Cores novas ocupam slots livres da paleta; passando de 15, as que sobram viram a mais parecida (a mensagem avisa).
Se a imagem vier sem transparência, a cor dos cantos vira transparente. Arraste para posicionar e aperte Enter.

## Trocar cores ao virar de lado (espelho)
Sprite → **Trocar cores ao virar de lado**: escreva os pares de slots que trocam quando o lutador olha para o outro lado
(o DonLee usa `2-3, 5-6`: luva vermelha ⇄ azul e os detalhes do short). O botão ⇋ da prévia mostra o lutador espelhado com a troca.
No jogo a troca acontece sozinha a cada virada. Testado: o DonLee aberto do jogo já vem com 2-3, 5-6, e a arte exportada vira
exatamente igual ao original.
