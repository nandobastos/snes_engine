/* SG Engine - Controles: controle de 3 ou 6 botoes, acao de cada botao e conversao para emuladores */
"use strict";

const MD_BTNS = ["A", "B", "C", "X", "Y", "Z"];
const MD_MASK = { A: 0x40, B: 0x10, C: 0x20, X: 0x400, Y: 0x200, Z: 0x100, START: 0x80, MODE: 0x800 };
const ACTIONS = {
  attack: "Ataque / combo",
  jump: "Pulo",
  special: "Especial",
  back: "Golpe para trás",
  run: "Correr",
};
/* indice de cada botao do Mega Drive no controle do EmulatorJS (nucleo Genesis Plus GX) */
const PAD_EQUIV = { A: { idx: 1 }, B: { idx: 0 }, C: { idx: 8 }, X: { idx: 10 }, Y: { idx: 9 }, Z: { idx: 11 }, START: { idx: 3 }, MODE: { idx: 2 } };
const DIR_IDX = { up: 4, down: 5, left: 6, right: 7 };
/* controle de Xbox (ou qualquer controle padrao) ja vem ligado: direcional + botoes na posicao do Mega Drive */
const PAD_XBOX = { up: "DPAD_UP", down: "DPAD_DOWN", left: "DPAD_LEFT", right: "DPAD_RIGHT",
  A: "BUTTON_3", B: "BUTTON_1", C: "BUTTON_2", X: "LEFT_TOP_SHOULDER", Y: "BUTTON_4", Z: "RIGHT_TOP_SHOULDER", START: "START", MODE: "SELECT" };
/* botao do controle padrao (Gamepad API) -> botao do EmulatorJS */
const PAD_STD = { 12: 4, 13: 5, 14: 6, 15: 7, 2: 1, 0: 0, 1: 8, 4: 10, 3: 9, 5: 11, 9: 3, 8: 2 };
const XBOX_NAME = { A: "X", B: "A", C: "B", X: "LB", Y: "Y", Z: "RB", START: "Menu (☰)", MODE: "View (⧉)" };

function defaultControls() {
  return {
    pad: "3",
    map: { attack: "B", jump: "C", special: "A", back: "none", run: "none" },
    keys: { up: "up arrow", down: "down arrow", left: "left arrow", right: "right arrow",
      A: "a", B: "s", C: "d", X: "q", Y: "w", Z: "e", START: "enter", MODE: "shift" },
  };
}
function ctl() {
  P.controls = P.controls || defaultControls();
  // projeto antigo ou tecla apagada: completa com as teclas padrao
  const d = defaultControls(), c = P.controls;
  c.keys = c.keys || {}; c.map = c.map || {};
  Object.keys(d.keys).forEach((k) => { if (!c.keys[k]) c.keys[k] = d.keys[k]; });
  Object.keys(d.map).forEach((k) => { if (!c.map[k]) c.map[k] = d.map[k]; });
  if (!c.pad) c.pad = d.pad;
  return c;
}

/* nome de tecla no formato do EmulatorJS a partir de um KeyboardEvent */
function ejsKeyName(e) {
  const k = e.key;
  const special = { ArrowUp: "up arrow", ArrowDown: "down arrow", ArrowLeft: "left arrow", ArrowRight: "right arrow", Enter: "enter", " ": "space",
    Shift: "shift", Control: "ctrl", Alt: "alt", Tab: "tab", Backspace: "backspace", Escape: "escape" };
  return special[k] || k.toLowerCase();
}

function controlsProps() {
  const c = ctl();
  const btns = c.pad === "6" ? MD_BTNS : MD_BTNS.slice(0, 3);
  const opts = { none: "(nenhum)", ...Object.fromEntries(btns.map((b) => [b, "Botão " + b])) };
  // acao em botao que nao existe no controle de 3 botoes volta para "nenhum"
  Object.keys(c.map).forEach((a) => { if (c.map[a] !== "none" && !btns.includes(c.map[a])) c.map[a] = "none"; });
  const box = form([
    "Controle do Mega Drive",
    ["Tipo de controle", c, "pad", "select", { 3: "3 botões (A, B, C + Start)", 6: "6 botões (A, B, C, X, Y, Z + Start, Mode)" }],
    "!O de 6 botões também funciona com o de 3: X, Y e Z ficam só como atalho.",
    "Ações do jogador",
    ...Object.entries(ACTIONS).map(([k, n]) => [n, c.map, k, "select", opts]),
    "!Start pausa o jogo. Correr: a ROM-motor ainda não usa (fica gravado para a próxima versão).",
  ]);
  // conflitos
  const used = {};
  Object.entries(c.map).forEach(([a, b]) => { if (b !== "none") (used[b] = used[b] || []).push(ACTIONS[a]); });
  const dup = Object.entries(used).filter(([, l]) => l.length > 1);
  if (dup.length) { const w = document.createElement("div"); w.className = "hint danger"; w.textContent = "⚠ " + dup.map(([b, l]) => `Botão ${b}: ${l.join(" e ")}`).join(" · "); box.appendChild(w); }

  // teclado do emulador de teste
  const kb = section($("#props"), "Teclado do PC (jogar no Testar)");
  const rows = [["Cima", "up"], ["Baixo", "down"], ["Esquerda", "left"], ["Direita", "right"], ...btns.map((b) => ["Botão " + b, b]), ["Start", "START"]];
  if (c.pad === "6") rows.push(["Mode", "MODE"]);
  rows.forEach(([lab, k]) => {
    const row = document.createElement("div"); row.className = "row";
    row.innerHTML = `<label>${lab}</label>`;
    const inp = document.createElement("input"); inp.value = c.keys[k] || ""; inp.readOnly = true; inp.title = "Clique e aperte a tecla";
    inp.onkeydown = (e) => { e.preventDefault(); e.stopPropagation(); c.keys[k] = ejsKeyName(e); changed(); };
    row.appendChild(inp); kb.appendChild(row);
  });
  const hk = document.createElement("div"); hk.className = "hint"; hk.textContent = "Clique no campo e aperte a tecla. Em outros emuladores, o jogador configura os controles neles."; kb.appendChild(hk);
  const xb = section($("#props"), "Controle de Xbox (já vem ligado)");
  const xh = document.createElement("div"); xh.className = "hint";
  xh.innerHTML = "Direcional do controle = setas. " + [...btns, "START", ...(c.pad === "6" ? ["MODE"] : [])].map((b) => `${b === "START" ? "Start" : b === "MODE" ? "Mode" : "Botão " + b} = <b>${XBOX_NAME[b]}</b>`).join(" · ") +
    ". Ligue o controle antes de abrir o Testar (F12) e aperte um botão dele.";
  xb.appendChild(xh);

}

/* controles do EmulatorJS (jogador 1) a partir da configuracao */
function ejsControls() {
  const c = ctl(), p0 = {};
  Object.entries(DIR_IDX).forEach(([d, i]) => { p0[i] = { value: c.keys[d], value2: PAD_XBOX[d] }; });
  ["A", "B", "C", "X", "Y", "Z", "START", "MODE"].forEach((b) => { p0[PAD_EQUIV[b].idx] = { value: c.keys[b] || "", value2: PAD_XBOX[b] }; });
  return { 0: p0, 1: {}, 2: {}, 3: {} };
}
/* bloco de controles do pack: u16 6 botoes, mascaras de ataque, pulo, especial, para tras, correr */
function packControls(b) {
  const c = ctl(), m = (a) => (c.map[a] && c.map[a] !== "none" ? MD_MASK[c.map[a]] : 0);
  b.u16(c.pad === "6" ? 1 : 0);
  ["attack", "jump", "special", "back", "run"].forEach((a) => b.u16(m(a)));
}
