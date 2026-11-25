# SF Pixel — editor de animação para a SF Engine (Super Nintendo)

Abra `index.html` no navegador (não precisa instalar nada). É o SG Pixel adaptado para o SNES.

- **Paleta do SNES:** 15 cores + transparente por lutador; cada cor é uma das 32768 do SNES (R, G, B de 0 a 31).
- **Custo de cada quadro:** número de pedaços 16×16 (limite 24), tiles/bytes na VRAM, pedaços por linha. O número aparece embaixo de cada quadro na linha do tempo e o painel da direita detalha. O corte é igual ao da engine (testado contra `engine/tools/mkfight.py`).
- **Camadas de caixa:** Hitbox, Hitbox 2, Hurtbox e Âncora (pés). Marque a área com o retângulo (U); a caixa é o menor retângulo que cobre o que foi marcado.
- **Tags = animações da engine:** Arquivo → Novo lutador cria as 42 tags com o número de quadros que a engine espera (idle, walk, hp, shoryu...). O painel mostra o que falta.
- **Salvar:** `.sgpx` (guarda as caixas). **Exportar:** `.sffighter.json` (pedaços, caixas, âncora e paleta por quadro), a entrada do conversor da engine.

Pendente: conversor `.sffighter.json` → pack da engine (quadros, gráficos e tabelas) e prévia com o emulador.
