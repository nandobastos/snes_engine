/* SG Engine - janela "Inserir objeto" (duplo clique no canvas), estilo Construct */
"use strict";

const Insert = (() => {
  let root = null, at = { x: 0, y: 0 }, sel = null, list = [];

  function catalog() {
    const soon = (cat, name, icon, desc) => ({ cat, name, icon, desc, soon: true });
    const out = [];
    // atores que ja existem: arraste da lista Projeto (direita) para a cena
    // novos atores
    Object.keys(KIND_NAME).forEach((k) => out.push({
      cat: "Novo ator", name: KIND_NAME[k], icon: KIND_ICON[k],
      desc: {
        player: "Personagem controlado pelo jogador: movimento, pulo, combo, agarrão e especial.",
        enemy: "Inimigo comum: HP, velocidade, tipo de IA, reação, agressividade e golpes.",
        boss: "Chefe: como o inimigo, com barra de vida própria.",
        object: "Objeto do cenário que quebra (barril, caixa, lixeira) e pode soltar itens.",
        item: "Item coletável: cura, pontos, vida extra ou energia.",
        projectile: "Projétil lançado por um golpe: faca, bala, garrafa, pedra.",
        weapon: "Arma que o jogador pega do chão: cano, faca, revólver, metralhadora.",
      }[k],
      run: () => { const a = newActor(k); if (k !== "player" && k !== "projectile") placeActor(a.id); ui.sel = { kind: "actor", id: a.id }; changed(); AnimEditor.open(a.id); },
    }));
    out.push(
      { cat: "Combate", name: "Grupo de inimigos", icon: "enemy", desc: "Área que trava a câmera e solta rodadas de inimigos. Cada inimigo do grupo pode ter HP, dano e velocidade próprios.", run: () => { const g = newGroup(at.x, at.y); ui.sel = { kind: "group", id: g.id }; changed(); } },
      { cat: "Câmera e fluxo", name: "Área de câmera", icon: "camera", desc: "Retângulo onde a câmera pode andar. Ligue duas áreas com uma transição.", run: () => {
        const z = { id: uid("cam_"), name: "Área " + (L.zones.length + 1), x: snap(at.x - MD_W / 2), y: snap(at.y - MD_H / 2), w: MD_W, h: MD_H, mode: "follow", lerp: 0.15, delay: 0, lockY: true, lockScroll: false };
        L.zones.push(z); ui.sel = { kind: "zone", id: z.id }; changed(); } },
      { cat: "Câmera e fluxo", name: "Início do jogador", icon: "flag", desc: "Onde o jogador começa a fase.", run: () => { L.spawn.x = Math.round(at.x); L.spawn.y = Math.round(at.y); ui.sel = { kind: "spawn" }; changed(); } },
    );
    Object.entries(SOBJ).forEach(([type, d]) => out.push({ cat: d.cat, name: d.name, icon: d.icon, desc: d.desc,
      run: () => { const o = newSobj(type, at.x, at.y); ui.sel = { kind: "sobj", id: o.id }; changed(); } }));
    if (screenTypeOf(L)) {   // tela: so o que faz sentido nela
      const keep = ["Texto da tela", "Decoração animada", "Ponto do mapa"];
      return out.filter((i) => keep.includes(i.name)).concat(Object.values(P.actors).filter((a) => a.kind !== "player").map((a) => ({ cat: "Atores do projeto", name: a.name, icon: KIND_ICON[a.kind], desc: "Coloca este ator como enfeite na tela (só o desenho).",
        run: () => { const o = newSobj("decor", at.x, at.y); o.actor = a.id; ui.sel = { kind: "sobj", id: o.id }; changed(); } })));
    }
    // ordem das categorias como na lista combinada
    const order = ["Atores do projeto", "Novo ator", "Combate", "Câmera e fluxo", "Cenário", "Armas e itens", "Interface", "Lógica"];
    return out.sort((x, y) => order.indexOf(x.cat) - order.indexOf(y.cat));
  }

  function placeActor(id) {
    if (P.actors[id].kind === "player") { L.spawn.x = Math.round(at.x); L.spawn.y = Math.round(at.y); ui.sel = { kind: "spawn" }; changed(); return; }
    const it = { id: uid("in_"), actor: id, x: Math.round(at.x), y: Math.round(at.y), flip: false };
    L.instances.push(it); ui.sel = { kind: "inst", id: it.id }; changed();
  }

  function build() {
    root = document.createElement("div"); root.className = "modal hidden";
    root.innerHTML = `
      <div class="modal-box ins">
        <div class="modal-head"><span>Inserir objeto</span><button class="x" title="Fechar">${ICON("close")}</button></div>
        <div class="ins-top"><span>Escolha o que colocar na fase:</span><input class="ins-search" placeholder="Buscar"></div>
        <div class="ins-list"></div>
        <div class="ins-foot">
          <div class="ins-name"></div>
          <div class="ins-desc hint"></div>
          <div class="ins-btns"><button class="on ins-ok">Inserir</button><button class="ins-cancel">Cancelar</button></div>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector(".x").onclick = close;
    root.querySelector(".ins-cancel").onclick = close;
    root.querySelector(".ins-ok").onclick = ok;
    root.querySelector(".ins-search").oninput = render;
    root.addEventListener("mousedown", (e) => { if (e.target === root) close(); });
    root.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); if (e.key === "Enter") ok(); });
  }
  function render() {
    const q = root.querySelector(".ins-search").value.trim().toLowerCase();
    const box = root.querySelector(".ins-list"); box.innerHTML = "";
    const cats = [...new Set(list.map((i) => i.cat))];
    cats.forEach((c) => {
      const items = list.filter((i) => i.cat === c && (!q || i.name.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q)));
      if (!items.length) return;
      const h = document.createElement("div"); h.className = "ins-cat"; h.textContent = c; box.appendChild(h);
      const grid = document.createElement("div"); grid.className = "ins-grid"; box.appendChild(grid);
      items.forEach((it) => {
        const b = document.createElement("button"); b.className = "ins-item" + (it === sel ? " sel" : "") + (it.soon ? " soon" : "");
        b.innerHTML = ICON(it.icon, 30) + `<span>${esc(it.name)}</span>` + (it.soon ? `<em>em breve</em>` : "");
        b.onclick = () => { sel = it; render(); };
        b.ondblclick = () => { sel = it; ok(); };
        grid.appendChild(b);
      });
    });
    root.querySelector(".ins-name").textContent = sel ? sel.name : "";
    root.querySelector(".ins-desc").textContent = sel ? sel.desc + (sel.soon ? " (em breve)" : "") : "";
    root.querySelector(".ins-ok").disabled = !sel || sel.soon;
  }
  function open(w) {
    if (!root) build();
    at = w; list = catalog();
    sel = list.find((i) => i.name === "Grupo de inimigos");
    root.querySelector(".ins-search").value = "";
    root.classList.remove("hidden");
    render();
    root.querySelector(".ins-search").focus();
  }
  function close() { root.classList.add("hidden"); }
  function ok() { if (!sel || sel.soon) return; const s = sel; close(); s.run(); }
  function isOpen() { return root && !root.classList.contains("hidden"); }
  return { open, close, isOpen };
})();
