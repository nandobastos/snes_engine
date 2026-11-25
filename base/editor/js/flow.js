/* SG Engine - Telas: o mapa "macro" do jogo (splash, título, fases, bônus, opções, finais, créditos...).
 * Cada tela é um nó; setas ligam uma tela à seguinte com uma transição. Duplo clique abre a edição da tela
 * (as telas são fases/layouts do projeto: a tela ganha um layout próprio na primeira vez). */
"use strict";

const SCREEN_TYPES = {
  splash: ["Splash / logo", "#6d6d78"], title: ["Tela de título", "#c8202f"], tutorial: ["Tutorial", "#2f8fd0"],
  stage: ["Fase do jogo", "#2fa860"], bonus: ["Fase bônus", "#d9a441"], options: ["Opções", "#8a63d2"],
  cutscene: ["Cena / história", "#4f9da6"], gameover: ["Game over", "#7a1f2a"], ending: ["Final", "#e07b24"],
  credits: ["Créditos", "#9aa4b0"], finalcredits: ["Créditos finais", "#c0c6cf"], map: ["Mapa de fases", "#3fb6a8"],
};
const SCREEN_TRANS = { cut: "Corte seco", fadeblack: "Fade para preto", fadewhite: "Fade para branco", wipe: "Cortina (wipe)", iris: "Íris" };
const LINK_WHEN = { auto: "Ao terminar / tempo", start: "Apertar START", clear: "Fase concluída", menu: "Opção do menu", gameover: "Perdeu todas as vidas" };

function defaultFlow() {
  const nodes = [{ id: uid("sc_"), name: "Título", type: "title", x: 60, y: 120 }];
  P.layouts.forEach((l, i) => nodes.push({ id: uid("sc_"), name: l.name, type: "stage", layout: l.id, x: 280 + i * 220, y: 120 }));
  nodes.push({ id: uid("sc_"), name: "Créditos finais", type: "finalcredits", x: 280 + P.layouts.length * 220, y: 120 });
  const links = [];
  for (let i = 0; i < nodes.length - 1; i++) links.push({ id: uid("ln_"), from: nodes[i].id, to: nodes[i + 1].id, trans: "fadeblack", when: i === 0 ? "start" : "clear" });
  return { nodes, links };
}

const isGameScreen = (t) => t === "stage" || t === "bonus" || t === "tutorial";
/* layout de uma tela que nao e fase: 320x224, sem colisao, sem inimigos; so fundo, textos e sprites de enfeite */
function makeScreenLayout(l) {
  Object.assign(l, { width: MD_W, height: MD_H, instances: [], groups: [], zones: [], transitions: [], autoCol: false, onClear: "none", events: [] });
  l.objs = (l.objs || []).filter((o) => o.type === "screentext" || o.type === "decor");
  if (l.col) l.col = { w: l.col.w, h: l.col.h, d: "0".repeat(l.col.w * l.col.h) };
  if (l.autoSec === undefined) l.autoSec = 0; if (l.menuRow === undefined) l.menuRow = 16;
}
/* tipo de tela do layout (pelo mapa de Telas); null = fase normal */
function screenTypeOf(l) {
  const n = P.screens && P.screens.nodes && P.screens.nodes.find((x) => x.layout === l.id);
  return n && !isGameScreen(n.type) ? n.type : null;
}
function screenNodeOf(l) { return P.screens && P.screens.nodes && P.screens.nodes.find((x) => x.layout === l.id); }
const FlowEditor = (() => {
  let box = null, svg = null, side = null, sel = null, drag = null, linkDrag = null, lastClick = {};
  const NW = 170, NH = 64;
  function data() { if (!P.screens || !P.screens.nodes) P.screens = defaultFlow(); return P.screens; }
  function isOn() { return box && !box.classList.contains("hidden"); }
  function show(on) {
    if (!box) {
      box = document.createElement("div"); box.id = "flow"; box.className = "flow hidden";
      box.innerHTML = `<div class="flow-bar"><b>Telas do jogo</b><select id="flow-add"><option value="">+ Nova tela…</option>${Object.entries(SCREEN_TYPES).map(([k, [n]]) => `<option value="${k}">${n}</option>`).join("")}</select>
        <span class="hint" title="Arraste as telas para organizar. Puxe a bolinha da direita de uma tela até outra para ligar. Clique numa tela ou seta para editar. Duplo clique abre a edição da tela. Delete apaga o que está selecionado.">ⓘ</span></div>
        <div class="flow-main"><div class="flow-canvas"><svg id="flow-svg"></svg></div><div class="flow-side" id="flow-side"></div></div>`;
      $("#viewport").after(box);
      svg = box.querySelector("#flow-svg"); side = box.querySelector("#flow-side");
      box.querySelector("#flow-add").onchange = (e) => { const t = e.target.value; e.target.value = ""; if (!t) return; addNode(t); };
      svg.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
      svg.addEventListener("mousedown", (e) => { if (e.target === svg) { sel = null; render(); } });
      window.addEventListener("keydown", (e) => { if (!isOn() || !sel || ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return; if (e.key === "Delete") { removeSel(); e.preventDefault(); } });
    }
    box.classList.toggle("hidden", !on);
    if (on) {
      $("#viewport").classList.add("hidden");
      const ev = document.getElementById("evsheet"); if (ev) ev.classList.add("hidden");
      $("#tab-layout").classList.remove("on"); $("#tab-events").classList.remove("on");
      render();
    }
    const tb = document.getElementById("tab-flow"); if (tb) tb.classList.toggle("on", on);
  }
  function addNode(type) {
    const d = data(), maxX = d.nodes.reduce((m, n) => Math.max(m, n.x), 0);
    const n = { id: uid("sc_"), name: SCREEN_TYPES[type][0], type, x: maxX + 220, y: 120 };
    d.nodes.push(n); sel = { kind: "node", id: n.id }; changed(); render();
  }
  function removeSel() {
    const d = data();
    if (sel.kind === "node") { d.nodes = d.nodes.filter((n) => n.id !== sel.id); d.links = d.links.filter((l) => l.from !== sel.id && l.to !== sel.id); }
    else d.links = d.links.filter((l) => l.id !== sel.id);
    sel = null; changed(); render();
  }
  function openScreen(n) {   // duplo clique: abre a tela (fase/layout) — cria um layout para ela na primeira vez
    let l = P.layouts.find((x) => x.id === n.layout);
    if (!l) {
      l = newProject("", P.template, P.move).layouts[0]; l.name = n.name; P.layouts.push(l); n.layout = l.id;
      if (!isGameScreen(n.type)) makeScreenLayout(l);   // tela de titulo, opcoes, creditos...: do tamanho da tela do Mega Drive, sem fase
    }
    L = l; ui.sel = { kind: "layout", id: l.id }; show(false); EventSheet.show(false); fit(); changed();
  }
  const pt = (e) => { const r = svg.getBoundingClientRect(); return { x: e.clientX - r.left + svg.parentNode.scrollLeft * 0, y: e.clientY - r.top }; };
  function onMove(e) {
    if (drag) { const p = pt(e), n = data().nodes.find((x) => x.id === drag.id); n.x = Math.max(0, Math.round((p.x - drag.dx) / 10) * 10); n.y = Math.max(0, Math.round((p.y - drag.dy) / 10) * 10); drag.moved = true; render(); }
    else if (linkDrag) { linkDrag.p = pt(e); render(); }
  }
  function onUp(e) {
    if (drag) { if (drag.moved) changed(); drag = null; }
    if (linkDrag) {
      const p = linkDrag.p, d = data(), to = p && d.nodes.find((n) => p.x >= n.x && p.x <= n.x + NW && p.y >= n.y && p.y <= n.y + NH);
      if (to && to.id !== linkDrag.from && !d.links.some((l) => l.from === linkDrag.from && l.to === to.id)) {
        const l = { id: uid("ln_"), from: linkDrag.from, to: to.id, trans: "fadeblack", when: "auto" }; d.links.push(l); sel = { kind: "link", id: l.id }; changed();
      }
      linkDrag = null; render();
    }
  }
  const NS = "http://www.w3.org/2000/svg", mk = (t, a, p) => { const el = document.createElementNS(NS, t); Object.entries(a || {}).forEach(([k, v]) => el.setAttribute(k, v)); if (p) p.appendChild(el); return el; };
  function render() {
    if (!isOn()) return;
    const d = data(); svg.innerHTML = "";
    const W = Math.max(900, ...d.nodes.map((n) => n.x + NW + 80)), H = Math.max(400, ...d.nodes.map((n) => n.y + NH + 80));
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    const defs = mk("defs", {}, svg), mrk = mk("marker", { id: "fl-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto" }, defs);
    mk("path", { d: "M0 0L10 5L0 10z", fill: "#c8c8cf" }, mrk);
    const byId = Object.fromEntries(d.nodes.map((n) => [n.id, n]));
    d.links.forEach((l) => {
      const a = byId[l.from], b = byId[l.to]; if (!a || !b) return;
      const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
      const on = sel && sel.kind === "link" && sel.id === l.id;
      const path = mk("path", { d: `M${x1} ${y1} C${x1 + 60} ${y1} ${x2 - 60} ${y2} ${x2} ${y2}`, fill: "none", stroke: on ? "#ff4a55" : "#8a8a93", "stroke-width": on ? 3 : 2, "marker-end": "url(#fl-arrow)", class: "fl-link" }, svg);
      const hit = mk("path", { d: path.getAttribute("d"), fill: "none", stroke: "transparent", "stroke-width": 14, style: "cursor:pointer" }, svg);
      hit.addEventListener("mousedown", (e) => { e.stopPropagation(); sel = { kind: "link", id: l.id }; render(); });
      const t = mk("text", { x: mx, y: (y1 + y2) / 2 - 6, "text-anchor": "middle", class: "fl-ltext" }, svg); t.textContent = SCREEN_TRANS[l.trans] || "";
    });
    d.nodes.forEach((n) => {
      const [tn, col] = SCREEN_TYPES[n.type] || ["Tela", "#777"], on = sel && sel.kind === "node" && sel.id === n.id;
      const g = mk("g", { transform: `translate(${n.x},${n.y})`, class: "fl-node" + (on ? " sel" : "") }, svg);
      mk("rect", { width: NW, height: NH, rx: 9, fill: "#1f1f23", stroke: on ? "#fff" : "#0a0a0b", "stroke-width": on ? 2 : 1 }, g);
      mk("rect", { width: 6, height: NH, rx: 3, fill: col }, g);
      const t1 = mk("text", { x: 16, y: 26, class: "fl-name" }, g); t1.textContent = n.name;
      const t2 = mk("text", { x: 16, y: 46, class: "fl-type" }, g); t2.textContent = tn + (n.menu ? " · menu" : "") + (n.layout ? " · editável" : "");
      const port = mk("circle", { cx: NW, cy: NH / 2, r: 7, class: "fl-port" }, g);
      port.addEventListener("mousedown", (e) => { e.stopPropagation(); linkDrag = { from: n.id, p: null }; });
      g.addEventListener("mousedown", (e) => {
        if (e.target === port) return;
        const now = Date.now();
        if (lastClick.id === n.id && now - lastClick.t < 400) { lastClick = {}; openScreen(n); return; }   // duplo clique (o svg e redesenhado a cada clique)
        lastClick = { id: n.id, t: now };
        const p = pt(e); drag = { id: n.id, dx: p.x - n.x, dy: p.y - n.y, moved: false }; sel = { kind: "node", id: n.id }; render();
      });
    });
    if (linkDrag && linkDrag.p) { const a = byId[linkDrag.from]; mk("line", { x1: a.x + NW, y1: a.y + NH / 2, x2: linkDrag.p.x, y2: linkDrag.p.y, stroke: "#ff4a55", "stroke-width": 2, "stroke-dasharray": "5 4" }, svg); }
    renderSide();
  }
  function renderSide() {
    side.innerHTML = ""; const d = data();
    if (!sel) { side.innerHTML = `<div class="flow-empty">Selecione uma tela ou uma ligação.</div><div class="hint">Início do jogo: ${esc((d.nodes.find((n) => n.type === "splash") || d.nodes.find((n) => n.type === "title") || d.nodes.find((n) => !d.links.some((l) => l.to === n.id)) || { name: "—" }).name)} (o primeiro Splash; sem ele, o Título).</div>`; return; }
    const row = (lab, el) => { const r = document.createElement("div"); r.className = "row"; r.innerHTML = `<label>${lab}</label>`; r.appendChild(el); side.appendChild(r); };
    const sel_ = (opts, v, fn) => { const s = document.createElement("select"); Object.entries(opts).forEach(([k, t]) => { const o = document.createElement("option"); o.value = k; o.textContent = Array.isArray(t) ? t[0] : t; s.appendChild(o); }); s.value = v; s.onchange = () => fn(s.value); return s; };
    if (sel.kind === "node") {
      const n = d.nodes.find((x) => x.id === sel.id); if (!n) return;
      const h = document.createElement("div"); h.className = "panel-title"; h.textContent = "Tela"; side.appendChild(h);
      const nm = document.createElement("input"); nm.value = n.name; nm.onchange = () => { n.name = nm.value; changed(); render(); }; row("Nome", nm);
      row("Tipo", sel_(SCREEN_TYPES, n.type, (v) => { n.type = v; const l = P.layouts.find((x) => x.id === n.layout); if (l && !isGameScreen(v)) makeScreenLayout(l); changed(); render(); }));
      const lay = { "": "(nenhuma ainda)", ...Object.fromEntries(P.layouts.map((l) => [l.id, l.name])) };
      row("Fase / layout", sel_(lay, n.layout || "", (v) => { n.layout = v || undefined; changed(); render(); }));
      const mc = document.createElement("input"); mc.type = "checkbox"; mc.checked = !!n.menu; mc.onchange = () => { n.menu = mc.checked ? (n.menu || ["Começar", "Opções"]) : undefined; changed(); render(); }; row("Menu de opções", mc);
      if (n.menu) { const ta = document.createElement("textarea"); ta.rows = 4; ta.value = n.menu.join("\n"); ta.title = "Uma opção por linha"; ta.onchange = () => { n.menu = ta.value.split("\n").map((s) => s.trim()).filter(Boolean); changed(); render(); }; row("Opções (uma por linha)", ta); }
      const b = document.createElement("button"); b.className = "on"; b.textContent = "Abrir a tela (duplo clique)"; b.onclick = () => openScreen(n); side.appendChild(b);
      const out = d.links.filter((l) => l.from === n.id);
      if (out.length) { const t = document.createElement("div"); t.className = "hint"; t.textContent = "Vai para: " + out.map((l) => (d.nodes.find((x) => x.id === l.to) || {}).name).join(", "); side.appendChild(t); }
    } else {
      const l = d.links.find((x) => x.id === sel.id); if (!l) return;
      const a = d.nodes.find((x) => x.id === l.from), b = d.nodes.find((x) => x.id === l.to);
      const h = document.createElement("div"); h.className = "panel-title"; h.textContent = `${a ? a.name : "?"} → ${b ? b.name : "?"}`; side.appendChild(h);
      row("Transição", sel_(SCREEN_TRANS, l.trans, (v) => { l.trans = v; changed(); render(); }));
      row("Quando", sel_(LINK_WHEN, l.when || "auto", (v) => { l.when = v; changed(); render(); }));
      if (l.when === "menu" && a && a.menu) row("Opção", sel_(Object.fromEntries(a.menu.map((m) => [m, m])), l.option || a.menu[0], (v) => { l.option = v; changed(); }));
    }
    const del = document.createElement("button"); del.className = "danger"; del.textContent = sel.kind === "node" ? "Apagar tela" : "Apagar ligação"; del.onclick = removeSel; side.appendChild(del);
  }
  return { show, isOn, render };
})();
window.FlowEditor = FlowEditor;
