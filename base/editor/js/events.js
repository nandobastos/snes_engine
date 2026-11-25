/* SG Engine - folha de eventos (estilo Construct): condicoes -> acoes, por fase.
 * Cada tipo tem um codigo (o mesmo da ROM-motor) e parametros. Parametro: [rotulo, chave, tipo]
 * tipos: num, text, trigger, timer, group, layout, zone, var, op, enemy, enemyAny, object, item, side */
"use strict";

const EV_COND = {
  start:          { code: 1,  name: "A fase começou", params: [] },
  trigger_enter:  { code: 2,  name: "Jogador entra no gatilho", params: [["Gatilho", "a", "trigger"]] },
  group_start:    { code: 3,  name: "Grupo de inimigos começou", params: [["Grupo", "a", "group"]] },
  group_done:     { code: 4,  name: "Grupo de inimigos terminou", params: [["Grupo", "a", "group"]] },
  enemy_killed:   { code: 5,  name: "Inimigos derrotados (total)", params: [["Inimigo", "a", "enemyAny"], ["Quantidade ≥", "b", "num"]] },
  player_hp:      { code: 6,  name: "Vida do jogador abaixo de", params: [["% da vida", "a", "num"]] },
  boss_hp:        { code: 7,  name: "Vida do chefe abaixo de", params: [["% da vida", "a", "num"]] },
  timer:          { code: 8,  name: "Temporizador disparou", params: [["Temporizador", "a", "timer"]] },
  every:          { code: 9,  name: "A cada X frames", params: [["Frames", "a", "num"]] },
  var_cmp:        { code: 10, name: "Comparar variável", params: [["Variável", "a", "var"], ["", "op", "op"], ["Valor", "b", "num"]] },
  cam_x:          { code: 11, name: "Câmera chegou em X", params: [["X ≥", "a", "num"]] },
  object_broken:  { code: 12, name: "Objeto destruído", params: [["Objeto", "a", "object"]] },
  item_picked:    { code: 13, name: "Item pego", params: [["Item", "a", "item"]] },
  no_enemies:     { code: 14, name: "Nenhum inimigo na tela", params: [] },
};
const EV_ACT = {
  start_group:  { code: 1,  name: "Iniciar grupo de inimigos", params: [["Grupo", "a", "group"]] },
  spawn:        { code: 2,  name: "Gerar inimigo", params: [["Inimigo", "a", "enemy"], ["Lado", "b", "side"], ["Quantidade", "c", "num"]] },
  lock_cam:     { code: 3,  name: "Travar a câmera", params: [] },
  unlock_cam:   { code: 4,  name: "Soltar a câmera", params: [] },
  show_go:      { code: 5,  name: "Mostrar seta GO", params: [] },
  set_var:      { code: 6,  name: "Definir variável", params: [["Variável", "a", "var"], ["Valor", "b", "num"]] },
  add_var:      { code: 7,  name: "Somar na variável", params: [["Variável", "a", "var"], ["Somar", "b", "num"]] },
  heal:         { code: 8,  name: "Dar vida ao jogador", params: [["Quanto", "a", "num"]] },
  hurt:         { code: 9,  name: "Tirar vida do jogador", params: [["Quanto", "a", "num"]] },
  shake:        { code: 10, name: "Tremer a tela", params: [["Frames", "a", "num"]] },
  flash:        { code: 11, name: "Piscar a tela", params: [] },
  text:         { code: 12, name: "Mostrar texto", params: [["Texto", "s", "text"], ["Frames", "a", "num"]] },
  goto_layout:  { code: 13, name: "Ir para outra fase", params: [["Fase", "a", "layout"]] },
  timer_start:  { code: 14, name: "Iniciar temporizador", params: [["Temporizador", "a", "timer"]] },
  timer_stop:   { code: 15, name: "Parar temporizador", params: [["Temporizador", "a", "timer"]] },
  score:        { code: 16, name: "Dar pontos", params: [["Pontos", "a", "num"]] },
  life:         { code: 17, name: "Dar vida extra", params: [] },
  goto_zone:    { code: 18, name: "Ir para área de câmera", params: [["Área", "a", "zone"]] },
};
const EV_OPS = { 0: "=", 1: "≠", 2: ">", 3: "<", 4: "≥", 5: "≤" };
const EV_SIDES = { 0: "Dos dois lados", 1: "Pela esquerda", 2: "Pela direita" };

/* opcoes de cada tipo de parametro */
function evOptions(type) {
  const objs = (t) => Object.fromEntries((L.objs || []).filter((o) => o.type === t).map((o) => [o.id, o.name]));
  const acts = (...k) => Object.fromEntries(Object.values(P.actors).filter((a) => k.includes(a.kind)).map((a) => [a.id, a.name]));
  switch (type) {
    case "trigger": return objs("trigger");
    case "timer": return objs("timer");
    case "group": return Object.fromEntries((L.groups || []).map((g) => [g.id, g.name]));
    case "layout": return Object.fromEntries(P.layouts.map((l) => [l.id, l.name]));
    case "zone": return Object.fromEntries(L.zones.map((z) => [z.id, z.name]));
    case "var": return Object.fromEntries(allVars().map((v) => [v.name, v.name]));
    case "op": return EV_OPS;
    case "side": return EV_SIDES;
    case "enemy": return acts("enemy", "boss");
    case "enemyAny": return { any: "(qualquer um)", ...acts("enemy", "boss") };
    case "object": return { any: "(qualquer um)", ...acts("object") };
    case "item": return { any: "(qualquer um)", ...acts("item") };
  }
  return null;
}
/* variaveis do projeto = objetos Variavel de todas as fases (pelo nome) */
function allVars() {
  const seen = new Map();
  P.layouts.forEach((l) => (l.objs || []).filter((o) => o.type === "variable").forEach((o) => { if (!seen.has(o.name)) seen.set(o.name, { name: o.name, initial: Number(o.initial) || 0 }); }));
  return [...seen.values()];
}

function newEvent() { return { id: uid("ev_"), once: false, enabled: true, comment: "", conds: [], acts: [] }; }
function newPart(defs, type) {
  const p = { type };
  defs[type].params.forEach(([, k, t]) => {
    const o = evOptions(t);
    p[k] = t === "num" ? (k === "b" && type === "enemy_killed" ? 1 : 0) : t === "text" ? "" : o ? Object.keys(o)[0] || "" : "";
  });
  if (type === "every") p.a = 60;
  if (type === "player_hp" || type === "boss_hp") p.a = 30;
  if (type === "shake") p.a = 30;
  if (type === "text") p.a = 180;
  if (type === "spawn") p.c = 1;
  return p;
}

/* ------------------------------------------------------------------ interface */
const EventSheet = (() => {
  let box = null, justAdded = null;
  function show(on) {
    if (on && window.FlowEditor) FlowEditor.show(false);
    $("#viewport").classList.toggle("hidden", on);
    if (!box) { box = document.createElement("div"); box.id = "evsheet"; box.className = "evsheet"; $("#viewport").after(box); }
    box.classList.toggle("hidden", !on);
    $("#tab-layout").classList.toggle("on", !on);
    $("#tab-events").classList.toggle("on", on);
    if (on) render(); else resize();
  }
  function isOn() { return box && !box.classList.contains("hidden"); }

  function partRow(defs, part, list, i) {
    const d = defs[part.type];
    const row = document.createElement("div"); row.className = "ev-part";
    const title = document.createElement("span"); title.className = "ev-name"; title.textContent = d.name; row.appendChild(title);
    d.params.forEach(([lab, k, t]) => {
      if (lab) { const l = document.createElement("span"); l.className = "ev-lab"; l.textContent = lab; row.appendChild(l); }
      const opts = evOptions(t);
      let inp;
      if (opts) {
        inp = document.createElement("select");
        if (!Object.keys(opts).length) { const o = document.createElement("option"); o.textContent = "(nenhum na fase)"; o.value = ""; inp.appendChild(o); }
        Object.entries(opts).forEach(([v, n]) => { const o = document.createElement("option"); o.value = v; o.textContent = n; inp.appendChild(o); });
        inp.value = part[k];
      } else { inp = document.createElement("input"); inp.type = t === "num" ? "number" : "text"; inp.value = part[k]; if (t === "text") inp.className = "ev-text"; }
      inp.onchange = () => { part[k] = t === "num" ? Number(inp.value) || 0 : inp.value; changed(); };
      row.appendChild(inp);
    });
    const del = document.createElement("button"); del.className = "ev-del"; del.title = "Remover"; del.innerHTML = ICON("close", 12);
    del.onclick = () => { list.splice(i, 1); changed(); };
    row.appendChild(del);
    return row;
  }
  function adder(defs, list, label) {
    const s = document.createElement("select"); s.className = "ev-add";
    s.innerHTML = `<option value="">+ ${label}</option>` + Object.entries(defs).map(([k, d]) => `<option value="${k}">${d.name}</option>`).join("");
    s.onchange = () => { if (!s.value) return; list.push(newPart(defs, s.value)); changed(); };
    return s;
  }

  function render() {
    if (!isOn()) return;
    L.events = L.events || [];
    box.innerHTML = "";
    const head = document.createElement("div"); head.className = "ev-head";
    head.innerHTML = `<b>Eventos — ${esc(L.name)}</b>`;
    head.title = "Cada linha: quando TODAS as condições forem verdadeiras, as ações acontecem. A lista roda de cima para baixo, a cada quadro.";
    // como no Construct: só aparecem os eventos criados; linhas vazias (sem condição, ação nem comentário) somem, menos a que acabou de ser criada
    L.events = L.events.filter((ev) => ev.conds.length || ev.acts.length || (ev.comment || "").trim() || ev.id === justAdded);
    box.appendChild(head);
    L.events.forEach((ev, ei) => {
      const row = document.createElement("div"); row.className = "ev-row" + (ev.enabled === false ? " off" : "");
      const side = document.createElement("div"); side.className = "ev-side";
      side.innerHTML = `<span class="ev-num">${ei + 1}</span>`;
      const once = document.createElement("label"); once.className = "ev-flag"; once.title = "Depois de acontecer uma vez, não roda mais";
      once.innerHTML = `<input type="checkbox" ${ev.once ? "checked" : ""}> 1×`; once.querySelector("input").onchange = (e) => { ev.once = e.target.checked; changed(); };
      const en = document.createElement("label"); en.className = "ev-flag"; en.title = "Ligado";
      en.innerHTML = `<input type="checkbox" ${ev.enabled !== false ? "checked" : ""}> on`; en.querySelector("input").onchange = (e) => { ev.enabled = e.target.checked; changed(); };
      const up = document.createElement("button"); up.innerHTML = ICON("left", 12); up.title = "Subir"; up.className = "ev-mv";
      up.onclick = () => { if (ei > 0) { [L.events[ei - 1], L.events[ei]] = [L.events[ei], L.events[ei - 1]]; changed(); } };
      const dn = document.createElement("button"); dn.innerHTML = ICON("right", 12); dn.title = "Descer"; dn.className = "ev-mv";
      dn.onclick = () => { if (ei < L.events.length - 1) { [L.events[ei + 1], L.events[ei]] = [L.events[ei], L.events[ei + 1]]; changed(); } };
      const del = document.createElement("button"); del.innerHTML = ICON("trash", 12); del.title = "Apagar evento"; del.className = "ev-mv danger";
      del.onclick = () => { L.events.splice(ei, 1); changed(); };
      side.append(once, en, up, dn, del);
      const conds = document.createElement("div"); conds.className = "ev-conds";
      if (!ev.conds.length) { const h = document.createElement("div"); h.className = "ev-always"; h.textContent = "Sempre"; h.title = "Sem condição: roda a cada quadro."; conds.appendChild(h); }
      ev.conds.forEach((c, i) => conds.appendChild(partRow(EV_COND, c, ev.conds, i)));
      conds.appendChild(adder(EV_COND, ev.conds, "Condição"));
      const acts = document.createElement("div"); acts.className = "ev-acts";
      ev.acts.forEach((a, i) => acts.appendChild(partRow(EV_ACT, a, ev.acts, i)));
      acts.appendChild(adder(EV_ACT, ev.acts, "Ação"));
      const com = document.createElement("input"); com.className = "ev-comment"; com.placeholder = "Comentário (opcional)"; com.value = ev.comment || "";
      com.onchange = () => { ev.comment = com.value; changed(); };
      const body = document.createElement("div"); body.className = "ev-body"; body.append(conds, acts);
      row.append(side, com, body);
      box.appendChild(row);
    });
    const add = document.createElement("div"); add.className = "ev-new"; add.innerHTML = "+ Adicionar evento"; add.title = "Nova linha de evento";
    add.onclick = () => { const ev = newEvent(); justAdded = ev.id; L.events.push(ev); changed(); };
    box.appendChild(add);
    if (!(L.objs || []).some((o) => o.type === "trigger") || !allVars().length) {
      const h = document.createElement("div"); h.className = "hint"; h.style.margin = "8px 12px";
      h.textContent = "Dica: gatilhos, temporizadores e variáveis são objetos da fase (duplo clique no canvas → Lógica).";
      box.appendChild(h);
    }
  }
  return { show, isOn, render };
})();

/* ------------------------------------------------------------------ binario (ver engine/FORMAT.md) */
function encodeEvents(lay, b, ctx) {
  const evs = (lay.events || []).filter((e) => e.enabled !== false && (e.acts || []).length);   // evento sem ação não faz nada: nem vai para a ROM
  const ref = (t, v) => {
    switch (t) {
      case "trigger": case "timer": return ctx.objIndex.has(v) ? ctx.objIndex.get(v) : 0xffff;
      case "group": return ctx.groupIndex.has(v) ? ctx.groupIndex.get(v) : 0xffff;
      case "layout": return ctx.layoutIndex.has(v) ? ctx.layoutIndex.get(v) : 0;
      case "zone": return ctx.zoneIndex.has(v) ? ctx.zoneIndex.get(v) : 0;
      case "var": return ctx.varIndex.has(v) ? ctx.varIndex.get(v) : 0;
      case "enemy": case "enemyAny": case "object": case "item": return v === "any" ? 0xffff : ctx.actorIndex.has(v) ? ctx.actorIndex.get(v) : 0xffff;
      case "text": return ctx.addStr(v);
      default: return (Number(v) | 0) & 0xffff;
    }
  };
  const part = (defs, p) => {
    const d = defs[p.type]; if (!d) { b.u32(0); b.u32(0); return; }
    const vals = { a: 0, b: 0, c: 0 }; let op = 0;
    d.params.forEach(([, k, t]) => { if (k === "op") op = Number(p.op) || 0; else if (k === "s") vals.c = ref("text", p.s); else vals[k] = ref(t, p[k]); });
    b.u8(d.code); b.u8(op); b.u16(vals.a); b.u16(vals.b); b.u16(vals.c);
  };
  evs.forEach((e) => {
    b.u8(e.once ? 1 : 0); b.u8(e.conds.length); b.u8(e.acts.length); b.u8(0);
    e.conds.forEach((c) => part(EV_COND, c));
    e.acts.forEach((a) => part(EV_ACT, a));
  });
  return evs.length;
}
