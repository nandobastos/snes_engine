/* SF Engine - Telas: o fluxo do modo Arcade como blueprint (como as Telas do SG Engine).
 * Cada tela e um no; puxe a bolinha de uma saida ate outra tela para ligar. A ROM segue esse fluxo (arcade_run no motor).
 * Dados: game.flow = { start, nodes: [{ id, type, next: [s1, s2, s3], param, x, y }] } */
(function (root) {
  "use strict";
  const T = {
    vs: { n: "Versus", c: "#7a5c9b", out: ["depois"], d: "Rostos dos dois lutadores (o 1º oponente é o 'oponente do Arcade' do lutador; depois o espelho)." },
    fight: { n: "Luta", c: "#b8323c", out: ["venceu", "perdeu", "saiu (START)"], d: "A luta (melhor de 1 ou 3 rounds, em Regras e HUD)." },
    victory: { n: "Vitória", c: "#c79a2e", out: ["depois"], d: "Rosto do vencedor e a frase de vitória dele." },
    continue: { n: "Continue", c: "#3f7fbf", out: ["continuar", "game over"], d: "Rosto de quem perdeu e contagem 9…0. START continua." },
    next: { n: "Próximo oponente", c: "#4f9a6a", out: ["tem mais", "acabou"], d: "Conta as lutas vencidas. Parâmetro: quantas lutas tem o Arcade.", p: "Lutas no Arcade" },
    ending: { n: "Final", c: "#d07a2a", out: ["depois"], d: "Tela de final (rosto e texto)." },
    select: { n: "Seleção", c: "#6d6a6a", out: [], d: "Volta para a escolha de lutador. Parâmetro 1 = recomeça do 1º oponente.", p: "Recomeçar (1 = sim)" },
    title: { n: "Título", c: "#4a4747", out: [], d: "Volta para a tela de título (zera o Arcade)." },
  };
  const NW = 168, NH = 58;
  let G = null, box = null, svg = null, side = null, sel = null, drag = null, link = null, onChange = () => {};
  const flow = () => (G.flow = G.flow || { start: null, nodes: [] });
  const byId = (id) => flow().nodes.find((n) => n.id === id);
  const uid = () => "t" + Math.random().toString(36).slice(2, 8);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const portY = (n, i) => n.y + 22 + i * 12;
  function render() {
    const F = flow(), w = Math.max(900, ...F.nodes.map((n) => n.x + NW + 140)), h = Math.max(460, ...F.nodes.map((n) => n.y + NH + 60));
    svg.setAttribute("width", w); svg.setAttribute("height", h);
    let s = '<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="var(--ac2)"/></marker></defs>';
    F.nodes.forEach((n) => (T[n.type].out || []).forEach((lab, i) => {
      const to = n.next && n.next[i] && byId(n.next[i]); if (!to) return;
      const x1 = n.x + NW, y1 = portY(n, i), x2 = to.x, y2 = to.y + NH / 2, mx = Math.max(40, Math.abs(x2 - x1) / 2);
      const on = sel && sel.link && sel.id === n.id && sel.i === i;
      s += `<path class="ln" data-l="${n.id}:${i}" d="M${x1},${y1} C${x1 + mx},${y1} ${x2 - mx},${y2} ${x2},${y2}" fill="none" stroke="${on ? "var(--ac2)" : "var(--mu)"}" stroke-width="${on ? 3 : 2}" marker-end="url(#ar)"/>`;
    }));
    F.nodes.forEach((n) => {
      const t = T[n.type], on = sel && !sel.link && sel.id === n.id, out = t.out || [];
      const sub = n.type === "next" ? (n.param || 2) + " lutas" : n.type === "select" ? (n.param ? "recomeça" : "mesma luta") : "";
      s += `<g class="nd" data-n="${n.id}" transform="translate(${n.x},${n.y})">
        <rect width="${NW}" height="${NH}" rx="8" fill="var(--pn)" stroke="${on ? "var(--ac2)" : "var(--ln)"}" stroke-width="${on ? 3 : 1.5}"/>
        <rect width="8" height="${NH}" rx="3" fill="${t.c}"/>
        <text x="16" y="18" font-weight="600" fill="var(--tx)" font-size="13">${F.start === n.id ? "▶ " : ""}${esc(t.n)}</text>
        <text x="16" y="34" fill="var(--mu)" font-size="11">${esc(sub)}</text>
        <circle cx="0" cy="${NH / 2}" r="5" fill="var(--ln)"/>
        ${out.map((lab, i) => `<text x="${NW - 12}" y="${22 + i * 12 + 4}" text-anchor="end" fill="var(--mu)" font-size="10">${esc(lab)}</text><circle class="pt" data-p="${n.id}:${i}" cx="${NW}" cy="${22 + i * 12}" r="6" fill="${n.next && n.next[i] ? t.c : "var(--bg)"}" stroke="${t.c}" stroke-width="2"/>`).join("")}
      </g>`;
    });
    if (link) s += `<line x1="${link.x1}" y1="${link.y1}" x2="${link.x2}" y2="${link.y2}" stroke="var(--ac2)" stroke-width="2" stroke-dasharray="5 4"/>`;
    svg.innerHTML = s;
    renderSide();
  }
  function renderSide() {
    const F = flow(), miss = [];
    F.nodes.forEach((n) => (T[n.type].out || []).forEach((lab, i) => { if (!n.next || !n.next[i]) miss.push(T[n.type].n + " → " + lab); }));
    let h = `<h3>Telas do Arcade</h3><p><small>Arraste as telas. Puxe a bolinha de uma saída até outra tela para ligar. Clique numa tela ou seta para editar; Delete apaga.</small></p>
      <label>Nova tela <select id="fl-add"><option value="">+ escolher…</option>${Object.entries(T).map(([k, t]) => `<option value="${k}">${t.n}</option>`).join("")}</select></label>`;
    if (miss.length) h += `<p style="color:#d05050"><small>Saídas sem ligação (vão para a tela inicial): ${miss.map(esc).join(", ")}</small></p>`;
    if (sel && !sel.link) {
      const n = byId(sel.id), t = n && T[n.type];
      if (n) {
        h += `<h3>${esc(t.n)}</h3><p><small>${esc(t.d)}</small></p>`;
        if (t.p) h += `<label>${esc(t.p)} <input id="fl-p" type="number" min="${n.type === "select" ? 0 : 1}" max="${n.type === "select" ? 1 : 20}" value="${n.param || (n.type === "next" ? 2 : 0)}"></label>`;
        h += `<p><button id="fl-start">${F.start === n.id ? "É a tela inicial" : "Usar como tela inicial"}</button> <button id="fl-del">Apagar tela</button></p>`;
      }
    } else if (sel && sel.link) h += `<p><button id="fl-dell">Apagar ligação</button></p>`;
    side.innerHTML = h;
    const q = (id) => side.querySelector("#" + id);
    q("fl-add").onchange = (e) => { const t = e.target.value; if (!t) return; const n = { id: uid(), type: t, next: [null, null, null], x: 40 + (F.nodes.length % 4) * 200, y: 40 + Math.floor(F.nodes.length / 4) * 110 };
      if (t === "next") n.param = 2; if (t === "select") n.param = 0; F.nodes.push(n); if (!F.start) F.start = n.id; sel = { id: n.id }; render(); onChange(); };
    if (q("fl-p")) q("fl-p").onchange = (e) => { const n = byId(sel.id); n.param = Math.max(+e.target.min, Math.min(+e.target.max, +e.target.value || 0)); render(); onChange(); };
    if (q("fl-start")) q("fl-start").onclick = () => { F.start = sel.id; render(); onChange(); };
    if (q("fl-del")) q("fl-del").onclick = del;
    if (q("fl-dell")) q("fl-dell").onclick = del;
  }
  function del() {
    const F = flow(); if (!sel) return;
    if (sel.link) { byId(sel.id).next[sel.i] = null; }
    else { F.nodes = F.nodes.filter((n) => n.id !== sel.id); F.nodes.forEach((n) => (n.next = (n.next || []).map((x) => (x === sel.id ? null : x)))); if (F.start === sel.id) F.start = F.nodes.length ? F.nodes[0].id : null; }
    sel = null; render(); onChange();
  }
  const pt = (e) => { const r = svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function open(game, container, changed) {
    G = game; onChange = changed || (() => {});
    container.innerHTML = '<div class="flow"><div class="flow-canvas"><svg></svg></div><div class="flow-side"></div></div>';
    box = container; svg = container.querySelector("svg"); side = container.querySelector(".flow-side");
    svg.addEventListener("mousedown", (e) => {
      const p = e.target.closest(".pt"), g = e.target.closest(".nd"), l = e.target.closest(".ln"), P = pt(e);
      if (p) { const [id, i] = p.dataset.p.split(":"); const n = byId(id); link = { id, i: +i, x1: n.x + NW, y1: portY(n, +i), x2: P.x, y2: P.y }; e.preventDefault(); return; }
      if (l) { const [id, i] = l.dataset.l.split(":"); sel = { link: true, id, i: +i }; render(); return; }
      if (g) { const n = byId(g.dataset.n); sel = { id: n.id }; drag = { n, dx: P.x - n.x, dy: P.y - n.y }; render(); e.preventDefault(); return; }
      sel = null; render();
    });
    window.addEventListener("mousemove", (e) => {
      if (!svg.isConnected) return;
      const P = pt(e);
      if (drag) { drag.n.x = Math.max(0, Math.round((P.x - drag.dx) / 4) * 4); drag.n.y = Math.max(0, Math.round((P.y - drag.dy) / 4) * 4); render(); }
      else if (link) { link.x2 = P.x; link.y2 = P.y; render(); }
    });
    window.addEventListener("mouseup", (e) => {
      if (!svg.isConnected) return;
      if (link) { const g = document.elementFromPoint(e.clientX, e.clientY), nd = g && g.closest && g.closest(".nd");
        if (nd && nd.dataset.n !== link.id) { const n = byId(link.id); n.next = n.next || [null, null, null]; n.next[link.i] = nd.dataset.n; onChange(); }
        link = null; render(); }
      if (drag) { drag = null; onChange(); }
    });
    window.addEventListener("keydown", (e) => { if (!svg.isConnected || !sel || ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return; if (e.key === "Delete") { del(); e.preventDefault(); } });
    render();
  }
  root.SFTelas = { open, TYPES: T };
})(window);
