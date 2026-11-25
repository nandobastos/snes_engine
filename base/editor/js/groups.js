/* SG Engine - Grupo de Inimigos (horda): area na fase que trava a camera e solta rodadas de inimigos */
"use strict";

const GROUP_LOCK = { edge: "Quando a borda da tela chega na área", enter: "Quando o jogador entra na área", event: "Só quando um evento mandar" };
const GROUP_SIDE = { both: "Dos dois lados", left: "Pela esquerda", right: "Pela direita", back: "Pelo fundo (porta)", top: "Caindo de cima" };
const GROUP_END = { go: "Libera a câmera e mostra GO", free: "Libera a câmera sem aviso", stay: "Mantém a câmera travada" };

function groupById(id) { return (L.groups || []).find((g) => g.id === id); }

function newGroup(x, y) {
  L.groups = L.groups || [];
  const enemy = Object.values(P.actors).find((a) => a.kind === "enemy");
  const g = {
    id: uid("grp_"), name: "Grupo " + (L.groups.length + 1),
    x: snap(x - 80), y: snap(y - 40), w: 160, h: 80,
    lock: "edge", side: "both", interval: 40, onEnd: "go",
    rounds: [newRound(enemy)],
  };
  L.groups.push(g);
  return g;
}
function newRound(enemy) {
  return { id: uid("rd_"), max: 3, pause: 60, entries: enemy ? [newEntry(enemy.id)] : [] };
}
function newEntry(enemyId) { return { id: uid("en_"), enemy: enemyId, count: 2, hp: "", dmg: 100, speed: 100 }; }
function groupTotal(g) { return g.rounds.reduce((s, r) => s + r.entries.reduce((t, e) => t + (Number(e.count) || 0), 0), 0); }

function drawGroups() {
  (L.groups || []).forEach((gr) => {
    const sel = isSel("group", gr.id), Z = ui.zoom;
    g.fillStyle = sel ? "rgba(209,32,43,.16)" : "rgba(209,32,43,.07)";
    g.fillRect(gr.x, gr.y, gr.w, gr.h);
    g.strokeStyle = "#ff4a52"; g.lineWidth = (sel ? 2 : 1.2) / Z; g.setLineDash([5 / Z, 3 / Z]);
    g.strokeRect(gr.x, gr.y, gr.w, gr.h); g.setLineDash([]);
    if (sel) label(`${gr.name} · ${gr.rounds.length} rodada(s) · ${groupTotal(gr)} inimigos`, gr.x + 3, gr.y + 11, "#ff8a8f");
    if (sel) handles(gr);
  });
}
function hitGroup(w) {
  const gs = (L.groups || []).filter((g) => w.x >= g.x && w.x <= g.x + g.w && w.y >= g.y && w.y <= g.y + g.h);
  return gs.length ? gs[gs.length - 1] : null;
}

function groupProps(gr) {
  form([
    "Grupo de inimigos",
    ["Nome", gr, "name"],
    ["X", gr, "x", "number", { step: 8 }], ["Y", gr, "y", "number", { step: 8 }],
    ["Largura", gr, "w", "number", { min: 32, step: 8 }], ["Altura", gr, "h", "number", { min: 16, step: 8 }],
    "Comportamento",
    ["Trava a câmera", gr, "lock", "select", GROUP_LOCK],
    ["Inimigos entram", gr, "side", "select", GROUP_SIDE],
    ["Intervalo (frames)", gr, "interval", "number", { min: 0, max: 600 }],
    ["Ao terminar", gr, "onEnd", "select", GROUP_END],
    "!Intervalo: tempo entre um inimigo e o próximo entrar (60 = 1 s).",
  ]);
  const box = $("#props");
  const enemies = Object.values(P.actors).filter((a) => a.kind === "enemy" || a.kind === "boss");
  const enemyOpts = Object.fromEntries(enemies.map((a) => [a.id, a.name]));
  gr.rounds.forEach((r, ri) => {
    const card = document.createElement("div"); card.className = "card";
    card.innerHTML = `<div class="card-title">Rodada ${ri + 1}</div>`;
    card.appendChild(fieldRow("Máx. na tela", r, "max", "number", { min: 1, max: 6 }));
    card.appendChild(fieldRow("Pausa antes (frames)", r, "pause", "number", { min: 0, max: 600 }));
    r.entries.forEach((en, ei) => {
      const e = document.createElement("div"); e.className = "entry";
      if (!P.actors[en.enemy] && enemies[0]) en.enemy = enemies[0].id;
      e.appendChild(fieldRow("Inimigo", en, "enemy", "select", enemyOpts));
      e.appendChild(fieldRow("Quantidade", en, "count", "number", { min: 1, max: 20 }));
      const base = P.actors[en.enemy];
      const hp = fieldRow("HP", en, "hp", "number", { min: 1, max: 999, placeholder: base ? `padrão ${base.props.hp}` : "" });
      e.appendChild(hp);
      e.appendChild(fieldRow("Dano dos golpes (%)", en, "dmg", "number", { min: 10, max: 500, step: 10 }));
      e.appendChild(fieldRow("Velocidade (%)", en, "speed", "number", { min: 10, max: 300, step: 10 }));
      const del = document.createElement("button"); del.className = "danger"; del.innerHTML = ICON("trash", 13) + " Tirar inimigo";
      del.onclick = () => { r.entries.splice(ei, 1); changed(); };
      e.appendChild(del);
      card.appendChild(e);
    });
    const bar = document.createElement("div"); bar.className = "card-actions";
    const addE = document.createElement("button"); addE.innerHTML = ICON("plus", 13) + " Inimigo";
    addE.disabled = !enemies.length;
    addE.onclick = () => { r.entries.push(newEntry(enemies[0].id)); changed(); };
    const delR = document.createElement("button"); delR.className = "danger"; delR.innerHTML = ICON("trash", 13) + " Rodada";
    delR.disabled = gr.rounds.length < 2;
    delR.onclick = () => { gr.rounds.splice(ri, 1); changed(); };
    bar.append(addE, delR); card.appendChild(bar);
    box.appendChild(card);
  });
  const addR = document.createElement("button"); addR.innerHTML = ICON("plus", 13) + " Nova rodada";
  addR.onclick = () => { gr.rounds.push(newRound(enemies[0])); changed(); };
  box.appendChild(addR);
  const tip = document.createElement("div"); tip.className = "hint";
  tip.textContent = enemies.length
    ? "HP vazio = o HP do ator. Dano e velocidade em % do valor do ator (100 = igual). A próxima rodada começa quando a anterior acaba."
    : "Crie um ator Inimigo primeiro (duplo clique no canvas → Atores).";
  box.appendChild(tip);
}
