/* SG Engine - combos do inimigo por conectores e ataques especiais (voadora, faca, tiro, objeto).
 * Cada golpe vira um bloco; puxe da saida (direita) de um golpe ate outro golpe para dizer
 * "se este acertar, pode emendar aquele" com uma chance. O conector so encaixa quando faz sentido. */
"use strict";

const SPECIALS = {
  flykick: { name: "Voadora", anim: "flying_kick", proj: false, hint: "Pula na direção do jogador quando está a média distância." },
};
// faca, tiro e objetos arremessados sao golpes do tipo Projetil (lista de golpes do inimigo)
/* no jogador o conector diz qual comando emenda o proximo golpe */
const COND_NAME = { atk: "Ataque", fwd: "Frente + Ataque", back: "Trás + Ataque" };
const COND_CODE = { atk: 0, fwd: 1, back: 2 };

const ComboEditor = (() => {
  let root = null, A = null, drag = null;
  const NW = 160, NH = 58;

  function ensure(a) {
    a.combo = (a.combo || []).filter((l) => a.attacks.some((k) => k.id === l.from) && a.attacks.some((k) => k.id === l.to));
    a.comboPos = a.comboPos || {};
    // posicao inicial: coluna = passo do combo (quem abre na 1a, quem emenda na seguinte...)
    const depth = {}, inc = new Set(a.combo.filter((l) => l.from !== l.to).map((l) => l.to));
    a.attacks.forEach((k) => { if (!inc.has(k.id)) depth[k.id] = 0; });
    for (let it = 0; it < a.attacks.length; it++) a.combo.forEach((l) => { if (depth[l.from] !== undefined && l.from !== l.to && (depth[l.to] === undefined || depth[l.to] < depth[l.from] + 1) && depth[l.from] + 1 < a.attacks.length) depth[l.to] = depth[l.from] + 1; });
    const rows = {};
    a.attacks.forEach((k) => {
      if (a.comboPos[k.id]) return;
      const c = depth[k.id] ?? 0, r = rows[c] = (rows[c] || 0) + 1;
      a.comboPos[k.id] = { x: 30 + c * 240, y: 70 + (r - 1) * 100 };
    });
    a.specials = a.specials || [];
    Object.keys(SPECIALS).forEach((t) => { if (!a.specials.some((s) => s.type === t)) a.specials.push({ type: t, on: false, chance: 15, damage: 8, proj: null, speed: t === "gun" ? 6 : 3 }); });
  }
  const hasFrames = (name) => A.anims.some((x) => x.name === name && x.frames.length);
  const atk = (id) => A.attacks.find((k) => k.id === id);
  const outSum = (id) => A.combo.filter((l) => l.from === id).reduce((s, l) => s + l.chance, 0);
  const isP = () => A.kind === "player";
  const freeConds = (id) => Object.keys(COND_NAME).filter((c) => !A.combo.some((l) => l.from === id && l.cond === c));

  /* regras de encaixe */
  function canLink(fromId, toId) {
    const f = atk(fromId), t = atk(toId);
    if (!f || !t) return "Solte em cima de outro golpe.";
    if (f.knockdown) return `"${f.name}" derruba ${isP() ? "o inimigo" : "o jogador"}: o combo termina nele.`;
    if (!hasFrames(t.anim)) return `A animação "${t.anim}" de "${t.name}" não tem quadros.`;
    if (A.combo.some((l) => l.from === fromId && l.to === toId)) return "Esse conector já existe.";
    if (isP() && !freeConds(fromId).length) return `"${f.name}" já usa os três comandos (Ataque, Frente + Ataque, Trás + Ataque).`;
    if (!isP() && outSum(fromId) >= 100) return `As chances saindo de "${f.name}" já somam 100%.`;
    if (t.type === "projectile") return `"${t.name}" é de projétil: ele usa de longe, não emenda num combo.`;
    const fr = atkReach(A, f), tr = atkReach(A, t);
    if (fr && tr && tr + 12 < fr) return `A caixa de golpe de "${t.name}" alcança ${tr}px e "${f.name}" deixa o jogador a ${fr}px: não encaixa. Aumente a caixa de golpe.`;
    return "";
  }

  function open(actorId) {
    A = P.actors[actorId]; ensure(A);
    if (!root) {
      root = document.createElement("div"); root.className = "modal";
      document.body.appendChild(root);
    }
    root.classList.remove("hidden");
    render();
  }
  function close() { root.classList.add("hidden"); A = null; refresh(); }

  function render() {
    const ps = Object.values(A.comboPos), W = Math.max(840, Math.max(0, ...ps.map((p) => p.x)) + NW + 60), H = Math.max(260, Math.max(0, ...ps.map((p) => p.y)) + NH + 40);
    root.innerHTML = `<div class="modal-box combo-box">
      <div class="modal-head"><span>${ICON(isP() ? "player" : "enemy")} ${esc(A.name)} — ${isP() ? "combos" : "combos e especiais"}</span><button class="x" title="Fechar (Esc)">${ICON("close")}</button></div>
      <div class="hint">${isP()
        ? `Puxe da bolinha <b style="color:#d9a441">à direita</b> de um golpe até outro: se o primeiro acertar e o jogador apertar o comando do conector dentro do tempo de combo (${A.props.comboWindow ?? 14} quadros), sai o segundo. Clique no comando para trocar (Ataque, Frente + Ataque, Trás + Ataque) ou apagar. O primeiro golpe da lista sem conector chegando é o que abre o combo.`
        : `Puxe da bolinha <b style="color:#d9a441">à direita</b> de um golpe até outro golpe: se o primeiro acertar, ele emenda o segundo com a chance do conector. Clique no número para mudar a chance (0 apaga) e a <b>espera</b> antes do próximo golpe (em quadros; 60 = 1 segundo). Golpes que ninguém conecta são os que começam um combo.`}</div>
      <svg class="combo-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"></svg>
      <div class="combo-msg hint"></div>
      <h4 ${isP() ? "hidden" : ""}>Ataques especiais</h4>
      <div class="combo-specs" ${isP() ? "hidden" : ""}></div>
      <div class="hint" ${isP() ? "hidden" : ""}>A chance é testada cada vez que ele pensa em atacar de longe. Sem a animação flying_kick ele usa jump_attack. Faca, tiro e objeto arremessado: crie um golpe do tipo Projétil na lista de golpes.</div>
    </div>`;
    root.querySelector(".x").onclick = close;
    drawGraph(); drawSpecs();
  }

  function port(k, side) { const p = A.comboPos[k.id]; return side === "out" ? { x: p.x + NW, y: p.y + NH / 2 } : { x: p.x, y: p.y + NH / 2 }; }
  function curve(a, b) { const dx = Math.max(40, Math.abs(b.x - a.x) / 2); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; }
  function drawGraph() {
    const svg = root.querySelector(".combo-svg"), NS = "http://www.w3.org/2000/svg";
    svg.innerHTML = `<defs><marker id="cm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="#d9a441"/></marker></defs>`;
    const mk = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); parent.appendChild(e); return e; };
    const incoming = new Set(A.combo.filter((l) => l.from !== l.to).map((l) => l.to));
    // conectores
    A.combo.forEach((l, li) => {
      const f = atk(l.from), t = atk(l.to); let a = port(f, "out"), b = port(t, "in");
      let d = curve(a, b);
      if (l.from === l.to) { const p = A.comboPos[f.id]; d = `M${a.x},${a.y} C${a.x + 50},${a.y - 60} ${p.x - 50},${p.y - 60} ${b.x},${b.y}`; }
      mk("path", { d, class: "combo-link", "marker-end": "url(#cm-arrow)" });
      const mid = l.from === l.to ? { x: A.comboPos[f.id].x + NW / 2, y: A.comboPos[f.id].y - 38 } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const g = mk("g", { class: "combo-chance", transform: `translate(${mid.x},${mid.y})` });
      const label = isP() ? COND_NAME[l.cond || "atk"] : l.chance + "%" + (l.delay ? ` · espera ${l.delay}` : ""), lw = label.length * 6.5 + 14;
      mk("rect", { x: -lw / 2, y: -10, width: lw, height: 20, rx: 4 }, g);
      const tx = mk("text", { x: 0, y: 4, "text-anchor": "middle" }, g); tx.textContent = label;
      g.addEventListener("click", () => {
        if (isP()) {
          const opts = ["atk", "fwd", "back"].filter((c) => c === (l.cond || "atk") || freeConds(l.from).includes(c));
          const v = prompt(`Comando para emendar "${t.name}" depois de "${f.name}":\n${opts.map((c, i) => `${i + 1} = ${COND_NAME[c]}`).join("\n")}\n0 = apagar o conector`, String(opts.indexOf(l.cond || "atk") + 1));
          if (v === null) return;
          if (v.trim() === "0") A.combo.splice(li, 1); else if (opts[+v - 1]) l.cond = opts[+v - 1];
          changed(); render(); return;
        }
        const v = prompt(`Chance de emendar "${t.name}" depois de "${f.name}" (%). 0 apaga.`, l.chance);
        if (v === null) return;
        const n = Math.max(0, Math.min(100 - (outSum(l.from) - l.chance), Math.round(+v || 0)));
        if (!n) A.combo.splice(li, 1);
        else {
          l.chance = n;
          const w = prompt(`Espera antes de "${t.name}" (quadros; 60 = 1 segundo, 0 = emenda na hora):`, l.delay || 0);
          if (w !== null) l.delay = Math.max(0, Math.min(240, Math.round(+w || 0)));
        }
        changed(); render();
      });
    });
    // blocos
    A.attacks.forEach((k) => {
      const p = A.comboPos[k.id], g = mk("g", { class: "combo-node" + (k.knockdown ? " kd" : "") + (incoming.has(k.id) ? "" : " start"), transform: `translate(${p.x},${p.y})`, "data-id": k.id });
      mk("rect", { width: NW, height: NH, rx: 6, class: "body" }, g);
      const t1 = mk("text", { x: 10, y: 20, class: "t1" }, g); t1.textContent = k.name;
      const t2 = mk("text", { x: 10, y: 38, class: "t2" }, g); t2.textContent = `${k.anim}${hasFrames(k.anim) ? "" : " (sem quadros!)"} · dano ${k.damage}`;
      const t3 = mk("text", { x: 10, y: 52, class: "t2" }, g); t3.textContent = `${k.type === "projectile" ? "projétil" : "alcance " + atkReach(A, k) + "px"}${k.knockdown ? " · derruba" : ""}${incoming.has(k.id) ? "" : " · começa combo"}`;
      mk("circle", { cx: 0, cy: NH / 2, r: 6, class: "pin in" }, g);
      const out = mk("circle", { cx: NW, cy: NH / 2, r: 7, class: "pin out" + (k.knockdown ? " off" : "") }, g);
      out.addEventListener("mousedown", (e) => { e.stopPropagation(); drag = { t: "link", from: k.id, line: mk("path", { class: "combo-link temp" }) }; });
      g.addEventListener("mousedown", (e) => { const r = svg.getBoundingClientRect(); drag = { t: "move", id: k.id, ox: e.clientX - r.left - p.x, oy: e.clientY - r.top - p.y }; });
    });
    svg.onmousemove = (e) => {
      if (!drag) return;
      const r = svg.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (drag.t === "move") { A.comboPos[drag.id] = { x: Math.max(0, Math.round(x - drag.ox)), y: Math.max(44, Math.round(y - drag.oy)) }; drawGraph(); drag.moved = true; return; }
      const f = atk(drag.from); drag.line.setAttribute("d", curve(port(f, "out"), { x, y }));
      const over = nodeAt(x, y);
      svg.querySelectorAll(".combo-node").forEach((n) => n.classList.remove("ok", "no"));
      const msg = root.querySelector(".combo-msg");
      if (over) { const why = canLink(drag.from, over); svg.querySelector(`[data-id="${over}"]`).classList.add(why ? "no" : "ok"); msg.textContent = why || "Solte para conectar."; msg.className = "combo-msg hint " + (why ? "danger" : ""); }
      else { msg.textContent = ""; }
    };
    svg.onmouseup = (e) => {
      if (!drag) return;
      const d = drag; drag = null;
      if (d.t === "move") { if (d.moved) changed(); return; }
      const r = svg.getBoundingClientRect(), over = nodeAt(e.clientX - r.left, e.clientY - r.top);
      const why = over ? canLink(d.from, over) : "Solte em cima de outro golpe.";
      const msg = root.querySelector(".combo-msg");
      if (why) { msg.textContent = why; msg.className = "combo-msg hint danger"; drawGraph(); return; }
      if (isP()) A.combo.push({ from: d.from, to: over, chance: 100, cond: freeConds(d.from)[0] });
      else A.combo.push({ from: d.from, to: over, chance: Math.min(50, 100 - outSum(d.from)) });
      changed(); render();
    };
    svg.onmouseleave = () => { if (drag && drag.t === "link") { drag = null; drawGraph(); } };
  }
  function nodeAt(x, y) { const k = A.attacks.find((a) => { const p = A.comboPos[a.id]; return x >= p.x - 8 && x <= p.x + NW + 8 && y >= p.y && y <= p.y + NH; }); return k ? k.id : null; }

  function drawSpecs() {
    const box = root.querySelector(".combo-specs"); box.innerHTML = "";
    const projOpts = Object.values(P.actors).filter((x) => x.kind === "projectile").map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("");
    A.specials.filter((s) => SPECIALS[s.type]).forEach((s) => {
      const d = SPECIALS[s.type]; if (!d) return;
      const row = document.createElement("div"); row.className = "combo-spec" + (s.on ? " on" : "");
      const animOk = hasFrames(d.anim) || (s.type === "flykick" && hasFrames("jump_attack"));
      row.innerHTML = `<label class="cs-name"><input type="checkbox" ${s.on ? "checked" : ""}> ${d.name}</label>
        <label>Chance <input type="number" min="0" max="100" value="${s.chance}" data-k="chance">%</label>
        <label>Dano <input type="number" min="0" max="99" value="${s.damage}" data-k="damage"></label>
        ${d.proj ? `<label>Sprite <select data-k="proj"><option value="">${d.optional ? "(sem sprite: instantâneo)" : "(escolha)"}</option>${projOpts}</select></label>
        ${s.type === "gun" ? `<label>Velocidade <input type="number" min="0.5" max="12" step="0.5" value="${s.speed}" data-k="speed"> px/quadro</label>` : ""}` : ""}
        <span class="hint ${animOk ? "" : "warnc"}">${d.hint} Animação: <b>${d.anim}</b>${animOk ? "" : " (falta: usa outra)"}</span>`;
      const sel = row.querySelector("select"); if (sel) sel.value = s.proj || "";
      row.querySelector("input[type=checkbox]").onchange = (e) => { s.on = e.target.checked; changed(); drawSpecs(); };
      row.querySelectorAll("[data-k]").forEach((inp) => inp.onchange = () => { const k = inp.dataset.k; s[k] = k === "proj" ? inp.value || null : Number(inp.value); changed(); });
      box.appendChild(row);
    });
  }
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && root && !root.classList.contains("hidden")) close(); });
  return { open, ensure };
})();
