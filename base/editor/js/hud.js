/* SG Engine - HUD: barra de vida, pontos, vidas e barra do inimigo/chefe */
"use strict";

function defaultHud() { return { barColor: "#e0c000", enemyColor: "#e02020", barLen: 16, score: true, lives: true, enemyBar: true, names: true }; }
function hudProps() {
  P.hud = P.hud || defaultHud();
  const h = P.hud;
  form([
    "HUD",
    ["Cor da barra do jogador", h, "barColor", "color"],
    ["Cor da barra do inimigo", h, "enemyColor", "color"],
    ["Tamanho da barra (blocos)", h, "barLen", "number", { min: 4, max: 24 }],
    ["Mostrar pontos", h, "score", "check"],
    ["Mostrar vidas", h, "lives", "check"],
    ["Barra do inimigo atingido", h, "enemyBar", "check"],
    ["Nome do inimigo", h, "names", "check"],
    "!O chefe usa a barra configurada nele (segmentos). O cronômetro aparece quando a fase tem um objeto Cronômetro.",
    "!As cores viram as cores do Mega Drive mais próximas.",
  ]);
}
