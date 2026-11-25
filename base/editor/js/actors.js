/* SG Engine - atores (jogador, inimigo, chefe, item) e o editor de pixel art / animacoes */
"use strict";

const KIND_ICON = { player: "player", enemy: "enemy", boss: "boss", object: "object", item: "item", projectile: "hit", weapon: "edit" };
const KIND_COLOR = { player: "#ffb84a", enemy: "#ff7b7b", boss: "#ff4fd8", object: "#c9a46b", item: "#7bd7ff", projectile: "#ffd24a", weapon: "#b0b6c0" };
const KIND_NAME = { player: "Jogador", enemy: "Inimigo", boss: "Chefe", object: "Objeto destrutível", item: "Item", projectile: "Projétil", weapon: "Arma" };
const WEAPON_TYPES = { melee: "Arma branca (cano, faca, taco)", revolver: "Revólver (um tiro por aperto)", machinegun: "Metralhadora (segura e atira)" };
const ATK_TYPES = { hitbox: "Hitbox (corpo a corpo)", projectile: "Projétil (lança um objeto)" };
const DROP_SOURCES = ["object", "enemy", "boss"];
const AI_TYPES = { patrol: "Anda de um lado para o outro", chase: "Persegue o jogador", smart: "Cerca e espera a vez (inteligente)" };
const ITEM_TYPES = { heal_small: "Cura pequena (maçã)", heal_big: "Cura grande (frango)", score: "Pontos (moeda, dinheiro)", life: "Vida extra (1UP)", energy: "Energia do especial" };
const BAR_STYLES = { segments: "Segmentos", solid: "Barra contínua", image: "Imagem própria" };

const DEFAULT_ANIMS = {
  player: ["idle", "walk", "run", "run_attack", "hurt_low", "jump", "jump_fall", "attack1", "attack2", "attack3", "attack4", "jump_attack", "flying_kick", "grab", "hurt", "knockback", "down", "getup", "special"],
  enemy: ["idle", "walk", "hurt_low", "jump", "jump_fall", "attack1", "attack2", "attack3", "attack4", "jump_attack", "flying_kick", "throw", "shoot", "hurt", "knockback", "down", "getup"],
  boss: ["idle", "walk", "hurt_low", "jump", "jump_fall", "attack1", "attack2", "attack3", "attack4", "attack5", "jump_attack", "flying_kick", "throw", "shoot", "hurt", "knockback", "down", "getup", "special"],
  object: ["idle", "hit", "broken"],
  item: ["idle"],
  projectile: ["idle"],
  weapon: ["idle"],
};

function defaultProps(kind) {
  const side = !hasDepth();
  if (kind === "player") return { speed: 2, speedY: side ? 0 : 1.5, jumpForce: 5, gravity: 0.25, hp: 80, lives: 3, comboWindow: 14, knockX: 2, knockZ: 4, deathX: 3, deathZ: 4.5, hitPause: 3, specialCost: 6, runSpeed: 170, runAttackDamage: 10, canGrab: true, special: true, canCrouch: side };
  if (kind === "item") return { itemType: "heal_small", value: 20, size: "16" };
  if (kind === "projectile") return { speed: 3, arc: false };
  if (kind === "weapon") return { wtype: "melee", damage: 10, knockdown: false, uses: 6, rate: 6, bullet: null, reach: 12, hitsToDrop: 3, pickups: 3 };
  if (kind === "object") return { hp: 2, solid: true, flashOnHit: true };
  const p = { hp: kind === "boss" ? 150 : 24, speed: 1, speedY: side ? 0 : 0.75, ai: kind === "boss" ? "smart" : "chase", reaction: 20, aggression: 50, score: kind === "boss" ? 5000 : 100, strafe: true, flank: false };
  return p;
}

function defaultAnims(kind) {
  let l = DEFAULT_ANIMS[kind].slice();
  if (!hasDepth() && (kind === "player" || kind === "enemy" || kind === "boss")) l.splice(3, 0, "crouch", "crouch_attack");
  return l;
}
/* alcance do golpe: ate onde a caixa de golpe chega a frente da ancora, no quadro mais longo */
function atkReach(a, k) {
  const an = a.anims.find((x) => x.name === k.anim);
  let r = 0;
  if (an) an.frames.forEach((f) => { if (f.hit && f.hit.w) r = Math.max(r, f.hit.x + f.hit.w - f.ax); });
  return r;
}
function newActor(kind) {
  const n = Object.values(P.actors).filter((a) => a.kind === kind).length + 1;
  const a = {
    id: uid("act_"), name: KIND_NAME[kind] + " " + n, kind,
    pal: [], props: defaultProps(kind),
    anims: defaultAnims(kind).map((name) => ({ id: uid("an_"), name, speed: 10, loop: name === "idle" || name === "walk", frames: [] })),
    attacks: kind === "enemy" || kind === "boss" ? [{ id: uid("atk_"), name: "Soco", anim: "attack1", damage: 6, type: "hitbox", knockdown: false }] : [],
  };
  if (kind === "boss") a.bar = { style: "segments", segments: 15, color: "#e0e000", img: null, showName: true };
  P.actors[a.id] = a;
  return a;
}

function newActorMenu(anchor) {
  document.querySelectorAll(".popmenu").forEach((m) => m.remove());
  const m = document.createElement("div"); m.className = "dropdown open popmenu";
  const r = anchor.getBoundingClientRect();
  m.style.cssText = `position:fixed;left:${r.left}px;top:${r.bottom + 2}px`;
  Object.keys(KIND_NAME).forEach((k) => {
    const b = document.createElement("button"); b.innerHTML = ICON(KIND_ICON[k]) + " " + KIND_NAME[k];
    b.onclick = () => { const a = newActor(k); ui.sel = { kind: "actor", id: a.id }; m.remove(); changed(); };
    m.appendChild(b);
  });
  document.body.appendChild(m);
  setTimeout(() => document.addEventListener("click", () => m.remove(), { once: true }), 0);
}

/* primeiro frame que existir (idle de preferencia) */
function actorThumbFrame(a) {
  const an = a.anims.find((x) => x.name === "idle" && x.frames.length) || a.anims.find((x) => x.frames.length);
  return an ? an.frames[0] : null;
}
function instBox(it) {
  const a = P.actors[it.actor], f = a && actorThumbFrame(a);
  if (!f) return { x: it.x - 8, y: it.y - 16, w: 16, h: 16 };
  const x = it.flip ? it.x - (f.w - f.ax) : it.x - f.ax;
  return { x, y: it.y - f.ay, w: f.w, h: f.h };
}

/* --------------------------------------------------------------- propriedades do ator */
/* troca a paleta do personagem inteiro a partir do primeiro frame repintado (importado):
 * compara pixel a pixel com o frame original e aplica a troca (cor antiga -> cor nova mais votada) em todas as animacoes */
async function recolorFromImage(a, src) {
  const first = a.anims.find((an) => an.frames.length); if (!first) return;
  const f0 = first.frames[0], base = images[f0.img].img;
  const im = await loadImage(src), c = document.createElement("canvas"); c.width = im.width; c.height = im.height; c.getContext("2d").drawImage(im, 0, 0);
  if (c.width !== base.width || c.height !== base.height) { alert(`O frame importado tem ${c.width}×${c.height}, mas o primeiro frame de "${first.name}" tem ${base.width}×${base.height}. Exporte com o mesmo tamanho.`); return; }
  const od = base.getContext("2d").getImageData(0, 0, base.width, base.height).data, nd = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  const votes = new Map();
  for (let i = 0; i < od.length; i += 4) {
    if (od[i + 3] < 128 || nd[i + 3] < 128) continue;
    const k0 = MD.key(od[i], od[i + 1], od[i + 2]), k1 = MD.key(nd[i], nd[i + 1], nd[i + 2]);
    if (!votes.has(k0)) votes.set(k0, new Map()); const m = votes.get(k0); m.set(k1, (m.get(k1) || 0) + 1);
  }
  const map = new Map(), conflicts = []; votes.forEach((m, k0) => { let best = k0, n = -1, tot = 0; m.forEach((q, k1) => { tot += q; if (q > n) { n = q; best = k1; } }); if (best !== k0) map.set(k0, best); if (m.size > 1 && n < tot * 0.8) conflicts.push(k0); });
  if (!map.size) { alert("As cores do frame importado são iguais às do original: nada para trocar."); return; }
  // cores que nao aparecem no primeiro frame (sombras e brilhos de outras animacoes): seguem a troca da cor mais parecida do frame base, com a mesma diferenca de tom
  const C = (k) => [(k >> 6) & 7, (k >> 3) & 7, k & 7], all = new Set();
  a.anims.forEach((an) => an.frames.forEach((f) => { const cv = images[f.img] && images[f.img].img; if (!cv) return; const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) all.add(MD.key(d[i], d[i + 1], d[i + 2])); }));
  let guessed = 0;
  all.forEach((k) => {
    if (votes.has(k)) return;
    let best = null, bd = 99; const p = C(k);
    votes.forEach((m, k0) => { const q = C(k0), d = Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); if (d < bd) { bd = d; best = k0; } });
    if (best === null || bd > 3 || !map.has(best)) return;
    const q0 = C(best), q1 = C(map.get(best)), cl = (v) => Math.max(0, Math.min(7, v));
    map.set(k, (cl(p[0] + q1[0] - q0[0]) << 6) | (cl(p[1] + q1[1] - q0[1]) << 3) | cl(p[2] + q1[2] - q0[2])); guessed++;
  });
  let nf = 0;
  for (const an of a.anims) for (const f of an.frames) {
    if (!images[f.img]) continue;
    const cv = images[f.img].img, d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height), D = d.data; let hit = false;
    for (let i = 0; i < D.length; i += 4) { if (D[i + 3] < 128) continue; const k = map.get(MD.key(D[i], D[i + 1], D[i + 2])); if (k !== undefined) { const [r, g, b] = MD.rgbOfKey(k); D[i] = r; D[i + 1] = g; D[i + 2] = b; hit = true; } }
    if (!hit) continue;
    const n = document.createElement("canvas"); n.width = cv.width; n.height = cv.height; n.getContext("2d").putImageData(d, 0, 0);
    const id = uid("img_"); SRC[id] = n.toDataURL(); images[id] = { img: n }; f.img = id; nf++;
  }
  a.pal = a.pal.map((k) => (map.has(k) ? map.get(k) : k)).filter((k, i, arr) => arr.indexOf(k) === i);
  map.forEach((k) => { if (!a.pal.includes(k) && a.pal.length < 15) a.pal.push(k); });
  if (typeof thumbCache !== "undefined") thumbCache.clear();
  changed();
  alert(`Paleta trocada: ${map.size} cor(es) em ${nf} frame(s)` + (guessed ? ` (${guessed} tom(ns) que só aparecem em outras animações seguiram a cor mais parecida)` : "") + "." + (conflicts.length ? `\n\nAtenção: ${conflicts.length} cor(es) do original foram pintadas com cores diferentes em lugares diferentes (ex.: o mesmo cinza na camisa e na calça). Uma cor só pode ir para uma cor nova; separe esses tons no desenho original para trocar cada parte de um jeito.` : ""));
}
function actorProps(a) {
  const p = a.props, side = !hasDepth();
  const f = [KIND_NAME[a.kind], ["Nome", a, "name"]];
  if (a.kind === "player" || a.kind === "enemy" || a.kind === "boss") f.push(["Sombra no jogo", p, "shadow", "check"]);
  if ((a.kind === "player" || a.kind === "enemy" || a.kind === "boss") && p.shadow === undefined) p.shadow = true;
  if (a.kind === "player") {
    f.push("Movimento", ["Velocidade (px/frame)", p, "speed", "number", { step: 0.25, min: 0 }]);
    if (!side) f.push(["Velocidade em Y", p, "speedY", "number", { step: 0.25, min: 0 }]);
    if (isPlat()) { if (p.coyoteX === undefined) p.coyoteX = 4; if (p.coyoteY === undefined) p.coyoteY = 8; if (p.coyoteT === undefined) p.coyoteT = 8; if (p.airControl === undefined) p.airControl = 4; }
    f.push(["Força do pulo", p, "jumpForce", "number", { step: 0.25, min: 0 }], ["Gravidade", p, "gravity", "number", { step: 0.05, min: 0 }],
      ...(isPlat() ? ["Controle no ar", ["Controle no ar (0–10)", p, "airControl", "number", { min: 0, max: 10 }],
        "!Com controle no ar, a direção que você aperta durante o pulo acelera o herói para esse lado (ele mantém o impulso se soltar). 0 = o pulo segue reto, como no beat'em up.",
        "Coyote time", ["Tolerância X (px)", p, "coyoteX", "number", { min: 0, max: 32 }], ["Tolerância Y (px)", p, "coyoteY", "number", { min: 0, max: 32 }],
        ["Tempo (quadros)", p, "coyoteT", "number", { min: 0, max: 30 }],
        "!Coyote time: X = quantos pixels ele continua em pé, \"no ar\", além da beirada antes de cair (para não cair colado na plataforma). Depois de cair, ele ainda pode pular por alguns quadros (60 = 1 segundo) ou enquanto o chão estiver a até Y pixels. Tudo em 0 desliga."] : []),
      "Combate", ["Vida", p, "hp", "number", { min: 1 }], ["Vidas (continues)", p, "lives", "number", { min: 1, max: 9 }],
      ["Janela do combo (quadros)", p, "comboWindow", "number", { min: 4, max: 60, placeholder: "14" }],
      "Impacto", ["Tempo de recuperação do dano (quadros; 60 = 1 s)", p, "hurtTime", "number", { min: 4, max: 120, placeholder: "22" }], ["Hit pause (quadros)", p, "hitPause", "number", { min: 0, max: 20, placeholder: "3" }],
      "!Hit pause: quando um golpe do jogador acerta, o jogo congela esses quadros para dar sensação de impacto (0 = desliga).",
      "Arremesso do inimigo", ["Knockdown: distância", p, "knockX", "number", { step: 0.25, min: 0, max: 12, placeholder: "2" }], ["Knockdown: altura", p, "knockZ", "number", { step: 0.25, min: 0, max: 12, placeholder: "4" }],
      ["Ao morrer: distância", p, "deathX", "number", { step: 0.25, min: 0, max: 12, placeholder: "3" }], ["Ao morrer: altura", p, "deathZ", "number", { step: 0.25, min: 0, max: 12, placeholder: "4.5" }],
      "!Força com que o inimigo voa quando um golpe do jogador derruba (ou mata). Distância = velocidade para trás; altura = força para cima. Valores maiores = voa mais longe.",
      "!Tempo para emendar: depois de um golpe acertar, quantos quadros (60 = 1 segundo) o jogador tem para apertar o próximo comando. Os golpes e quem emenda em quem ficam em Golpes, logo abaixo.");
  }
  if (a.kind === "enemy" || a.kind === "boss") {
    f.push("Movimento", ["Velocidade (px/frame)", p, "speed", "number", { step: 0.25, min: 0 }]);
    if (!side) f.push(["Velocidade em Y", p, "speedY", "number", { step: 0.25, min: 0 }]);
    f.push("Inteligência", ["Reação (frames)", p, "reaction", "number", { min: 0, max: 120 }],
      ["Agressividade (%)", p, "aggression", "number", { min: 0, max: 100 }],
      "!Reação: quanto tempo ele demora para responder. Menor = mais rápido. O jeito de lutar fica em Comportamentos, logo abaixo.",
      "Combate", ["Vida", p, "hp", "number", { min: 1 }], ["Pontos ao derrotar", p, "score", "number", { min: 0 }]);
  }
  if (a.kind === "item") {
    f.push("Item", ["Tipo", p, "itemType", "select", ITEM_TYPES], ["Valor", p, "value", "number", { min: 0 }], ["Tamanho", p, "size", "select", { 16: "16×16", 32: "32×32" }],
      "!Valor: quanto cura, quantos pontos ou quanta energia dá.",
      "!Para deixar o item na fase, arraste-o para o canvas. Para ele cair de objetos e inimigos, marque-o nos drops deles.");
  }
  if (a.kind === "weapon") {
    const gun = p.wtype !== "melee";
    const projs = Object.values(P.actors).filter((x) => x.kind === "projectile");
    f.push("Arma", ["Tipo", p, "wtype", "select", WEAPON_TYPES], ["Dano", p, "damage", "number", { min: 0, max: 99 }],
      [gun ? "Munição" : "Resistência: acertos até quebrar (0 = não quebra)", p, "uses", "number", { min: 0, max: 999 }],
      ...(gun ? [["Munição infinita", p, "infiniteAmmo", "check"]] : []),
      ["Golpes levados para soltar (0 = só ao cair)", p, "hitsToDrop", "number", { min: 0, max: 20 }],
      ["Vezes que pode pegar de volta (vazio = sempre)", p, "pickups", "number", { min: 0, max: 254, placeholder: "sempre" }]);
    if (!gun) f.push(["Alcance extra (px)", p, "reach", "number", { min: 0, max: 80 }], ["Derruba", p, "knockdown", "check"]);
    if (gun) f.push(["Bala", p, "bullet", "select", { "": "(sem sprite: acerta na hora)", ...Object.fromEntries(projs.map((x) => [x.id, x.name])) }]);
    if (p.wtype === "machinegun") f.push(["Cadência (quadros entre tiros)", p, "rate", "number", { min: 2, max: 60 }]);
    f.push("Desenho da arma",
      "!Jeito simples: desenhe a arma na animação idle e marque o ponto de pega dela com a ferramenta Mão (J). Nos quadros do jogador, marque o ponto da mão com a mesma ferramenta: a arma vai para lá.",
      "!Jeito completo: crie animações com o mesmo nome das do jogador (walk, attack1…), desenhadas por cima dele, sem ponto de pega; elas acompanham quadro a quadro. Quadro do jogador sem mão marcada esconde a arma. Animação ground = como ela fica no chão (sem ela, usa a idle).",
      `!${gun ? "Sem munição, o próximo ataque joga a arma (ela acerta quem estiver no caminho)." : "Ao ser derrubado o jogador solta a arma, e pode pegá-la de novo."} Para pegar: ficar em cima e apertar ataque.`);
  }
  if (a.kind === "projectile") {
    f.push("Projétil", ["Velocidade (px/frame)", p, "speed", "number", { step: 0.5, min: 0.5, max: 12 }], ["Trajetória em arco", p, "arc", "check"], ["Explode (bomba)", p, "explode", "check"],
      "!Explode: ao cair (ou ao bater em alguém) acerta todo mundo em volta e derruba. Use com arco para bomba e dinamite.",
      "!Reto: faca, bala. Em arco: garrafa, pedra, objeto arremessado.",
      "!O dano e se derruba vêm do golpe que lança o projétil. Desenhe a animação idle (pode ter vários quadros, ex.: faca girando).");
  }
  if (a.kind === "object") {
    f.push("Objeto", ["Resistência (golpes)", p, "hp", "number", { min: 1, max: 20 }], ["Bloqueia passagem", p, "solid", "check"], ["Pisca ao apanhar", p, "flashOnHit", "check"],
      "!Animações: idle (inteiro), hit (apanhando), broken (quebrado).");
  }
  if (a.anims.some((an) => an.frames.length) && a.kind !== "projectile") {
    const first = a.anims.find((an) => an.frames.length), f0 = first.frames[0];
    const btn = document.createElement("button"); btn.textContent = "Importar frame pintado e trocar a paleta…"; btn.style.width = "100%";
    btn.title = `Pinte no SG Pixel (ou outro editor) o primeiro frame de "${first.name}" (${f0.w}×${f0.h}) com as cores novas e importe aqui: a mesma troca de cores vai para todas as animações.`;
    btn.onclick = () => pickImages(false, (srcs) => srcs[0] && recolorFromImage(a, srcs[0]));
    f.push("Trocar paleta", btn, `!Base: primeiro frame de "${first.name}" (${f0.w}×${f0.h} px). O frame importado precisa ter o mesmo tamanho e o desenho na mesma posição; só as cores mudam.`);
  }
  if (a.kind === "boss") {
    f.push("Barra de vida", ["Estilo", a.bar, "style", "select", BAR_STYLES], ["Segmentos", a.bar, "segments", "number", { min: 1, max: 30 }],
      ["Cor", a.bar, "color", "color"], ["Mostrar nome", a.bar, "showName", "check"]);
  }
  form(f);
  const box = $("#props");
  // golpes
  if (a.kind === "enemy" || a.kind === "boss" || a.kind === "player") {
    a.attacks = a.attacks || [];
    const h = document.createElement("h4"); h.textContent = a.kind === "player" ? "Golpes (combo)" : "Golpes"; box.appendChild(h);
    if (a.kind === "player" && !a.attacks.length) { const e = document.createElement("div"); e.className = "hint"; e.textContent = "Sem golpes aqui o jogador usa o combo automático attack1 → attack2 → attack3 (→ attack4 → attack5). Adicione golpes para escolher a sequência."; box.appendChild(e); }
    const animOpts = Object.fromEntries(a.anims.map((x) => [x.name, x.name]));
    a.attacks.forEach((k, i) => {
      const d = document.createElement("div"); d.style.cssText = "border:1px solid var(--line);border-radius:4px;padding:6px;display:flex;flex-direction:column;gap:4px";
      box.appendChild(d);
      k.type = a.kind === "player" ? "hitbox" : k.type || "hitbox";
      const projs = Object.values(P.actors).filter((x) => x.kind === "projectile");
      const sub = [["Nome", k, "name"], ["Animação", k, "anim", "select", animOpts], ["Dano", k, "damage", "number", { min: 0 }],
        ...(a.kind === "player" ? [] : [["Tipo", k, "type", "select", ATK_TYPES]])];
      if (k.type === "projectile") { k.chance = k.chance ?? 30; sub.push(["Chance de usar de longe (%)", k, "chance", "number", { min: 0, max: 100 }]); }
      if (k.type === "projectile") sub.push(["Projétil", k, "proj", "select", { "": projs.length ? "(escolha)" : "(crie um ator Projétil)", ...Object.fromEntries(projs.map((x) => [x.id, x.name])) }]);
      if (k.type !== "projectile") sub.push(["Acerta", k, "height", "select", { high: "Alto (rosto) → hurt", low: "Baixo (estômago) → hurt_low" }]);
      sub.push(["Derruba", k, "knockdown", "check"]);
      if (a.kind === "player") { if (k.hitStop === undefined) k.hitStop = true; sub.push(["Hit stop ao acertar (congela um instante; duração em Impacto)", k, "hitStop", "check"]); }
      sub.forEach((s) => d.appendChild(fieldRow(...s)));
      const info = document.createElement("div"); info.className = "hint";
      if (k.type === "projectile") {
        info.textContent = projs.length ? "Sai no quadro que tem caixa de golpe (ou no 2º quadro). Ele usa esse golpe de longe, na mesma linha do jogador." : "Crie um ator do tipo Projétil (botão + da lista de atores) e escolha aqui.";
        if (projs.length) { const nb = document.createElement("button"); nb.textContent = "+ Novo projétil"; nb.onclick = () => { const pj = newActor("projectile"); k.proj = pj.id; changed(); }; d.appendChild(nb); }
        else { const nb = document.createElement("button"); nb.textContent = "+ Criar projétil"; nb.onclick = () => { const pj = newActor("projectile"); k.proj = pj.id; changed(); }; d.appendChild(nb); }
      } else { const r = atkReach(a, k); info.textContent = r ? `Alcance: ${r}px (vem da caixa de golpe vermelha da animação).` : "Desenhe a caixa de golpe (vermelha) na animação: o alcance vem dela."; if (!r) info.classList.add("danger"); }
      d.appendChild(info);
      const del = document.createElement("button"); del.textContent = "Remover golpe"; del.className = "danger";
      del.onclick = () => { a.attacks.splice(i, 1); changed(); }; d.appendChild(del);
    });
    if (a.kind === "player") {
      // golpes no pulo: ficam junto dos golpes, cada um com dano e se derruba
      const jp = document.createElement("div"); jp.style.cssText = "border:1px solid var(--line);border-radius:4px;padding:6px;display:flex;flex-direction:column;gap:4px;margin-top:4px";
      const ttl = document.createElement("div"); ttl.className = "hint"; ttl.innerHTML = "<b>Golpes no pulo</b>"; jp.appendChild(ttl);
      if (p.jumpAtkDamage === undefined) Object.assign(p, { jumpAtkDamage: 8, jumpAtkKnock: false, flyKickDamage: 11, flyKickKnock: true });
      if (p.jumpAtkOn === undefined) Object.assign(p, { jumpAtkOn: true, flyKickOn: true });
      if (p.jumpAtkName === undefined) Object.assign(p, { jumpAtkName: "Ataque no pulo", flyKickName: "Voadora" });
      [["Ataque no pulo (ligado)", p, "jumpAtkOn", "check"], ["Ataque no pulo: nome", p, "jumpAtkName"], ["Ataque no pulo: dano", p, "jumpAtkDamage", "number", { min: 0, max: 99 }], ["Ataque no pulo derruba", p, "jumpAtkKnock", "check"],
        ["Voadora (ligada)", p, "flyKickOn", "check"], ["Voadora: nome", p, "flyKickName"], ["Voadora: dano", p, "flyKickDamage", "number", { min: 0, max: 99 }], ["Voadora derruba", p, "flyKickKnock", "check"]].forEach((s) => jp.appendChild(fieldRow(...s)));
      const jh = document.createElement("div"); jh.className = "hint"; jh.textContent = "Ataque no pulo (animação jump_attack): pular parado + ataque. Voadora (animação flying_kick): pular andando + ataque (sem ela, usa jump_attack). Os nomes são só para você se organizar. A voadora fraca (baixo + ataque) fica em Habilidades.";
      jp.appendChild(jh); box.appendChild(jp);
    }
    const add = document.createElement("button"); add.textContent = "+ Golpe";
    add.onclick = () => { a.attacks.push({ id: uid("atk_"), name: "Golpe " + (a.attacks.length + 1), anim: "attack1", damage: 6, type: "hitbox", knockdown: false }); changed(); };
    box.appendChild(add);
    const isPl = a.kind === "player";
    if (isPl) {
      const hb = document.createElement("h4"); hb.textContent = "Habilidades"; box.appendChild(hb);
      const on = Object.entries(PLAYER_ABILITIES).filter(([k]) => abilityOn(a, k)), iss = abilityIssues(a);
      const sum = document.createElement("div"); sum.className = "bh-sum"; sum.style.setProperty("--c", "#ffb84a");
      sum.innerHTML = on.map(([, d]) => `<span>${esc(d.name)}</span>`).join("") + (iss.length ? `<div class="hint danger">⚠ ${iss.map(esc).join("<br>⚠ ")}</div>` : "");
      box.appendChild(sum);
      const bb = document.createElement("button"); bb.innerHTML = `${ICON("edit")} Plugar habilidades…`; bb.onclick = () => AbilityEditor.open(a.id); box.appendChild(bb);
    }
    if (!isPl) {
      const b = ensureBehavior(a), Ar = ARCHETYPES[b.arch], iss = behaviorIssues(a);
      const hb = document.createElement("h4"); hb.textContent = "Comportamentos"; box.appendChild(hb);
      const sum = document.createElement("div"); sum.className = "bh-sum"; sum.style.setProperty("--c", Ar.color);
      sum.innerHTML = `<b>${ICON(Ar.icon)} ${esc(Ar.name)}</b>${Object.entries(b.mods).filter(([, on]) => on).map(([k]) => `<span>${esc(MODIFIERS[k].name)}</span>`).join("")}` + (iss.length ? `<div class="hint danger">⚠ ${iss.map(esc).join("<br>⚠ ")}</div>` : "");
      box.appendChild(sum);
      const bb = document.createElement("button"); bb.innerHTML = `${ICON("edit")} Plugar comportamentos…`; bb.onclick = () => BehaviorEditor.open(a.id); box.appendChild(bb);
    }
    const h2 = document.createElement("h4"); h2.textContent = isPl ? "Combos" : "Combos e especiais"; box.appendChild(h2);
    const nL = (a.combo || []).length, nS = (a.specials || []).filter((s) => s.on).length;
    const ce = document.createElement("button"); ce.innerHTML = `${ICON("edit")} ${isPl ? "Editar combos…" : "Editar combos e especiais…"}`; ce.onclick = () => ComboEditor.open(a.id); box.appendChild(ce);
    const hint = document.createElement("div"); hint.className = "hint";
    hint.textContent = isPl ? `${nL} conector(es): ` + ((a.combo || []).map((l) => { const f = a.attacks.find((k) => k.id === l.from), t = a.attacks.find((k) => k.id === l.to); return f && t ? `${f.name} → ${t.name} (${COND_NAME[l.cond || "atk"]})` : ""; }).filter(Boolean).join(" · ") || "nenhum")
      : `${nL} conector(es) de combo · ${nS} especial(is) ligado(s)` + (nS ? ": " + a.specials.filter((s) => s.on).map((s) => `${SPECIALS[s.type].name} ${s.chance}%`).join(", ") : "");
    box.appendChild(hint);
  }
  if (a.kind === "boss" && a.bar.style === "image") {
    const b = document.createElement("button"); b.textContent = a.bar.img ? "Trocar arte da barra…" : "Importar arte da barra…";
    b.onclick = () => pickImages(false, async ([src]) => { const id = uid("img_"); SRC[id] = src; await registerRawImage(id); a.bar.img = id; changed(); });
    box.appendChild(b);
  }
  if (a.kind === "item" || a.kind === "weapon") droppedBy(a, box);

  if (DROP_SOURCES.includes(a.kind)) dropEditor(a, box);
  // acoes
  const h = document.createElement("h4"); h.textContent = "Sprites"; box.appendChild(h);
  const fr = a.anims.reduce((s, x) => s + x.frames.length, 0);
  const info = document.createElement("div"); info.className = "hint";
  info.textContent = `${a.anims.length} animações, ${fr} frames, ${a.pal.length} cores (máx. 15).`; box.appendChild(info);
  const ed = document.createElement("button"); ed.innerHTML = ICON("edit") + " Editar animações e sprites"; ed.onclick = () => AnimEditor.open(a.id); box.appendChild(ed);
  const imp = document.createElement("button"); imp.innerHTML = ICON("image") + " Importar do SG Pixel (.sgpx / .aseprite)…";
  imp.title = "Cada tag do arquivo vira a animação de mesmo nome deste ator (no SG Pixel: Arquivo → Novo lutador para a SG Engine)";
  imp.onclick = () => PixelImport.pick(a.id); box.appendChild(imp);
  const pl = document.createElement("div"); pl.className = "hint";
  pl.textContent = a.kind === "player" ? "O jogador começa no ponto Início da fase. Duplo clique nele abre os sprites." : "Para colocar na fase: arraste o ator da árvore (à esquerda) para o canvas.";
  box.appendChild(pl);
  const del = document.createElement("button"); del.textContent = "Apagar ator"; del.className = "danger";
  del.onclick = () => {
    if (!confirm(`Apagar "${a.name}" e todas as cópias dele nas fases?`)) return;
    delete P.actors[a.id]; P.layouts.forEach((l) => { l.instances = (l.instances || []).filter((i) => i.actor !== a.id); });
    ui.sel = { kind: "layout", id: L.id }; changed();
  };
  box.appendChild(del);
}

/* uma linha de formulario solta (mesma logica do form()) */
function fieldRow(lab, obj, key, type, extra) {
  const row = document.createElement("div"); row.className = "row";
  row.innerHTML = `<label>${lab}</label>`;
  let inp;
  if (type === "select") {
    inp = document.createElement("select");
    Object.entries(extra).forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; inp.appendChild(o); });
    inp.value = obj[key];
  } else if (type === "textarea") { inp = document.createElement("textarea"); inp.rows = 6; inp.value = obj[key] ?? ""; row.classList.add("wide"); }
  else if (type === "check") { inp = document.createElement("input"); inp.type = "checkbox"; inp.checked = !!obj[key]; inp.style.width = "auto"; }
  else { inp = document.createElement("input"); inp.type = type || "text"; inp.value = obj[key]; if (extra) Object.assign(inp, extra); }
  inp.onchange = () => {
    let v = type === "check" ? inp.checked : inp.value;
    if (type === "number" && inp.value === "" && extra && extra.placeholder) v = "";        // vazio = usa o padrao
    else if (type === "number") { v = Number(v); if (extra && extra.min !== undefined) v = Math.max(extra.min, v); if (extra && extra.max !== undefined) v = Math.min(extra.max, v); }
    obj[key] = v; changed();
  };
  row.appendChild(inp);
  return row;
}

function pickImages(multiple, cb) {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.multiple = multiple;
  inp.onchange = async () => {
    const files = [...inp.files].sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
    const srcs = await Promise.all(files.map((f) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); })));
    cb(srcs, files);
  };
  inp.click();
}

/* ======================================================================
 * Editor de animacoes e pixel art (estilo Construct)
 * ====================================================================== */
const AnimEditor = (() => {
  let A = null;          // ator
  let anim = null, fi = 0;
  let tool = "pencil", color = 1, zoom = 8, showGrid = true;
  let work = null, wg = null;           // canvas do frame em edicao (RGBA)
  let stroke = null, selRect = null, playTimer = null, prevZoom = 0;
  let flt = null, fdragT = null, bgMode = "checker", rareKey = -1;   // pixels flutuando (mover / transformar) e o arraste em curso
  let root = null;
  let layer = "art", vis = { art: true, box: true }, clip = null;   // camada ativa, camadas visiveis, area de transferencia

  const html = `
  <div class="ae-box">
    <div class="ae-head"><b id="ae-title"></b><span class="hint">Ctrl+Z desfaz · Ctrl+Y refaz · roda = zoom</span><button id="ae-close"><span data-icon="close"></span>Fechar</button></div>
    <div class="ae-body">
      <div class="ae-left">
        <div class="panel-title">Animações <button id="ae-add-anim"><span data-icon="plus"></span></button></div>
        <div id="ae-anims"></div>
      </div>
      <div class="ae-props"><div class="panel-title">Propriedades</div><div id="ae-anim-props" class="props"></div></div>
      <div class="ae-center">
        <div class="ae-tools">
          <button data-t="hurt" title="Caixa de dano: onde o ator pode ser atingido (H)" style="color:#4aa8ff"><span data-icon="body"></span>Corpo</button>
          <button data-t="hit" title="Caixa de golpe: onde o ataque acerta (K)" style="color:#ff4a4a"><span data-icon="hit"></span>Golpe</button>
          <button id="ae-box-clear" title="Apaga as caixas deste frame">Limpar caixas</button>
          <span class="sep"></span>
          <button id="ae-crop" title="Recortar o frame na seleção"><span data-icon="crop"></span>Recortar</button>
          <span class="sep"></span>
          <label>L <input id="ae-w" type="number" min="1" max="248"></label>
          <label>A <input id="ae-h" type="number" min="1" max="248"></label>
          <button id="ae-resize" title="Muda o tamanho do frame (mantém a âncora)">Aplicar</button>
        </div>
        <div class="ae-stage">
          <div class="ae-side">
            <button data-t="pencil" title="Lápis (B)"><span data-icon="pencil"></span></button>
            <button data-t="eraser" title="Borracha (E)"><span data-icon="eraser"></span></button>
            <button data-t="picker" title="Conta-gotas (I)"><span data-icon="picker"></span></button>
            <button data-t="fill" title="Balde (G)"><span data-icon="bucket"></span></button>
            <button data-t="fillall" title="Balde de troca (Shift+G): troca a cor clicada pela cor atual em todos os frames (opção: só nesta animação)"><span data-icon="bucketall"></span></button>
            <label id="ae-fill-opt" class="hint" style="display:none;padding:0;font-size:10px;text-align:center" title="Marcado: pinta só a área ligada. Desmarcado: pinta todos os pixels daquela cor no frame"><input type="checkbox" id="ae-fill-cont" checked><br>contínuo</label>
            <label id="ae-fa-opt" class="hint" style="display:none;padding:0;font-size:10px;text-align:center" title="Desmarcado: troca só nesta animação"><input type="checkbox" id="ae-fa-all" checked><br>todas</label>
            <button data-t="rect" title="Retângulo (R)"><span data-icon="rect"></span></button>
            <button data-t="rectfill" title="Retângulo cheio (Shift+R)"><span data-icon="rectfill"></span></button>
            <button data-t="select" title="Seleção para recortar (M)"><span data-icon="marquee"></span></button>
            <button data-t="move" title="Mover (V): arrasta os pixels da seleção (sem seleção, o desenho todo) · setas movem 1 px · Ctrl+T: caixa de transformação (botão direito: girar, espelhar)"><span data-icon="move"></span></button>
            <button data-t="anchor" title="Ponto âncora (A) · setas movem 1 px com Shift"><span data-icon="anchor"></span></button>
            <button id="ae-rare" title="Cor rara: mostra no frame primeiro as cores fora da paleta e depois as mais raras. Cada clique passa para a próxima; no fim, desliga." style="font-size:15px">◔</button>
            <button data-t="hand" title="Mão (J): ponto da mão do jogador / ponto de pega da arma. Clicar de novo no mesmo ponto apaga." style="color:#3fd6e0"><span data-icon="hand"></span></button>
            <span class="sep"></span>
            <button id="ae-copy" title="Copiar a camada ativa deste frame (Ctrl+C)"><span data-icon="copy"></span></button>
            <button id="ae-paste" title="Colar no frame atual (Ctrl+V)"><span data-icon="file"></span></button>
            <span class="sep"></span>
            <button id="ae-trim" title="Aparar: tirar bordas vazias de todos os frames"><span data-icon="trim"></span></button>
            <button id="ae-grid" title="Grade"><span data-icon="grid"></span></button>
            <button id="ae-bgm" title="Fundo atrás da arte: xadrez, verde ou rosa (para achar buracos no sprite)" style="font-size:10px;padding:2px">▦</button>
          </div>
          <div class="ae-canvas-wrap" id="ae-wrap"><canvas id="ae-cv"></canvas></div>
        </div>
        <div class="ae-frames-bar">
          <button id="ae-f-new" title="Frame vazio"><span data-icon="plus"></span>Vazio</button>
          <button id="ae-f-imp" title="Importar uma ou várias imagens"><span data-icon="image"></span>Importar imagens…</button>
          <button id="ae-f-sheet" title="Cortar uma folha de sprites em frames"><span data-icon="grid"></span>Importar folha…</button>
          <button id="ae-f-dup"><span data-icon="copy"></span>Duplicar</button>
          <button id="ae-f-left" title="Mover para a esquerda"><span data-icon="left"></span></button><button id="ae-f-right" title="Mover para a direita"><span data-icon="right"></span></button>
          <button id="ae-f-del" class="danger"><span data-icon="trash"></span>Apagar frame</button>
        </div>
        <div class="ae-frames" id="ae-frames"></div>
      </div>
      <div class="ae-right">
        <div class="panel-title">Camadas</div>
        <div id="ae-layers" class="ae-layers"></div>
        <div class="panel-title">Paleta do ator</div>
        <div id="ae-pal" class="ae-pal"></div>
        <div class="panel-title">Cor do Mega Drive (512)</div>
        <div style="display:flex;gap:4px;padding:0 8px"><button data-mdv="ramp" style="flex:1">Rampas</button><button data-mdv="hue" style="flex:1">Por tom</button><button data-mdv="grid" style="flex:1">Grade</button></div>
        <div id="ae-md" class="ae-md"></div>
        <div style="padding:8px;display:flex;flex-direction:column;gap:6px">
          <button id="ae-conv">Reduzir tudo para 15 cores</button>
          <button id="ae-restore" title="Abra um pack antigo (.zip) deste projeto: os pixels deste personagem voltam às cores que tinham lá (só onde o desenho continua igual)">Recuperar cores de um pack antigo…</button>
          <button id="ae-clear-ph" title="Tira os desenhos de exemplo (camiseta azul etc.) para as cores deles não ocuparem vagas da sua paleta de 15">Apagar desenhos de exemplo</button>
        </div>
        <div class="panel-title">Prévia</div>
        <canvas id="ae-prev" width="220" height="220" title="Roda do mouse = zoom · duplo clique = automático"></canvas>
      </div>
    </div>
  </div>`;

  function el(id) { return root.querySelector("#" + id); }

  function open(actorId) {
    A = P.actors[actorId];
    if (A.kind === "player") { const n0 = A.anims.length; A.anims = A.anims.filter((x) => !/^(legs_|top_|rifle_)/.test(x.name)); if (A.anims.length !== n0) { if (anim && !A.anims.includes(anim)) anim = A.anims[0] || null; changed(); } }   // corpo dividido removido do SG Engine
    if (A.kind === "player" && typeof abilityOn === "function") { const ct = A.anims.find((x) => x.name === "climb_top"); if (ct && ct.frames.length && !A.anims.some((x) => x.name === "climb_end" && x.frames.length)) { A.anims = A.anims.filter((x) => x.name !== "climb_end"); ct.name = "climb_end"; ct.loop = false; } }   // climb_top virou climb_end
    ["grab", "hang", "ladder", "crouch"].forEach((k) => { if (abilityOn(A, k)) abilityAnimList(A, k).forEach((n) => { if (!A.anims.some((x) => x.name === n)) A.anims.push({ id: uid("an_"), name: n, speed: 8, loop: n === "hang" || n === "grab", frames: [] }); }); });   // animações das habilidades novas aparecem em projetos antigos
    if (A.kind === "enemy" || A.kind === "boss") { const pl = Object.values(P.actors).find((x) => x.kind === "player"); if (pl && abilityOn(pl, "grab") && !A.anims.some((x) => x.name === "grabbed")) A.anims.push({ id: uid("an_"), name: "grabbed", speed: 8, loop: true, frames: [] }); }
    if (!root) {
      root = document.createElement("div"); root.className = "ae"; root.innerHTML = html; document.body.appendChild(root); fillIcons(root);
      bind();
    }
    root.classList.remove("hidden");
    anim = A.anims[0]; fi = 0; selRect = null;
    reload();
  }
  function close() { root.classList.add("hidden"); clearInterval(playTimer); A = null; refresh(); }
  function isOpen() { return root && !root.classList.contains("hidden") && A; }

  /* depois de desfazer/refazer o projeto foi recarregado: reencontra os objetos pelos ids */
  function reload() {
    if (!A) return;
    A = P.actors[A.id];
    if (!A) { close(); return; }
    anim = A.anims.find((x) => anim && x.id === anim.id) || A.anims[0];
    fi = Math.max(0, Math.min(fi, (anim ? anim.frames.length : 1) - 1));
    loadFrame(); renderAll();
  }

  /* ---------------------------------------------------- frame atual -> canvas de trabalho */
  function frame() { return anim && anim.frames[fi]; }
  function loadFrame() {
    flt = null; fdragT = null; if (rareKey >= 0) { rareKey = -1; const b = document.getElementById("ae-rare"); if (b) b.classList.remove("on"); }
    const f = frame();
    work = document.createElement("canvas");
    work.width = f ? f.w : 32; work.height = f ? f.h : 32;
    wg = work.getContext("2d");
    if (f && images[f.img]) wg.drawImage(images[f.img].img, 0, 0);
  }
  /* grava o canvas de trabalho como uma imagem nova (imutavel) e registra no historico */
  function commit() {
    const f = frame(); if (!f) return;
    const id = uid("img_");
    SRC[id] = work.toDataURL("image/png");
    const c = document.createElement("canvas"); c.width = work.width; c.height = work.height; c.getContext("2d").drawImage(work, 0, 0);
    images[id] = { img: c };
    f.img = id; f.w = work.width; f.h = work.height;
    changed(); renderAll();
  }
  async function addImageFrame(src, ax, ay) {
    const id = uid("img_"); SRC[id] = src; await registerRawImage(id);
    const im = images[id].img;
    return { img: id, w: im.width, h: im.height, ax: ax ?? Math.floor(im.width / 2), ay: ay ?? im.height - 1 };
  }

  /* ---------------------------------------------------- render */
  function renderLayers() {
    const box = el("ae-layers"); box.innerHTML = "";
    [["box", "Caixas (corpo e golpe)"], ["art", "Arte"]].forEach(([k, n]) => {
      const d = document.createElement("div"); d.className = "ae-layer" + (layer === k ? " sel" : "");
      d.innerHTML = `<button title="Mostrar/ocultar">${ICON(vis[k] ? "eye" : "eyeoff")}</button><span>${n}</span>`;
      d.onclick = () => setLayer(k);
      d.querySelector("button").onclick = (e) => { e.stopPropagation(); vis[k] = !vis[k]; renderLayers(); renderCanvas(); };
      box.appendChild(d);
    });
    const h = document.createElement("div"); h.className = "hint"; h.style.padding = "0 8px";
    box.title = "Copiar/colar e Delete agem na camada ativa.";
  }
  const BOX_TOOLS = ["hurt", "hit"];
  function setLayer(k) {
    layer = k; vis[k] = true;
    if (k === "box" && !BOX_TOOLS.includes(tool)) tool = "hurt";
    if (k === "art" && BOX_TOOLS.includes(tool)) tool = "pencil";
    renderTools(); renderLayers(); renderCanvas();
  }
  function renderAll() { renderLayers(); renderTitle(); renderAnims(); renderAnimProps(); renderCanvas(); renderFrames(); renderPal(); renderMD(); startPreview(); syncSize(); }
  function renderTitle() { el("ae-title").innerHTML = `${ICON(KIND_ICON[A.kind])} ${esc(A.name)} — animações e sprites`; }
  function syncSize() { const f = frame(); el("ae-w").value = f ? f.w : ""; el("ae-h").value = f ? f.h : ""; }
  /* animacao fora do padrao: algum pixel com cor que nao esta na paleta do ator (fica em vermelho na lista) */
  const offCache = new Map();
  function frameOffPal(f) {
    const im = images[f.img]; if (!im) return false;
    const key = f.img + "|" + A.pal.join(",");
    if (offCache.has(key)) return offCache.get(key);
    const set = new Set(A.pal), d = im.img.getContext("2d").getImageData(0, 0, im.img.width, im.img.height).data; let bad = false;
    for (let i = 0; i < d.length && !bad; i += 4) if (d[i + 3] > 127 && !set.has(MD.key(d[i], d[i + 1], d[i + 2]))) bad = true;
    offCache.set(key, bad); return bad;
  }
  function animOffPal(an) { return an.frames.some((f) => !isPlaceholderFrame(f) && frameOffPal(f)); }
  function renderAnims() {
    const box = el("ae-anims"); box.innerHTML = "";
    // grupos com divisória: movimento, golpes, golpes no ar, agachado, agarrão, escada/borda, tiro, corpo dividido, reações
    const GROUPS = [
      ["Movimento", /^(idle|walk|run|jump|jump_fall|land|crouch|roll|dash|double_jump|pre_jump)$/],
      ["Golpes", /^(attack\d|special|run_attack|throw|attack_up)$/],
      ["Golpes no ar", /^(jump_attack|flying_kick|jump_knee|attack_down)$/],
      ["Agachado", /^(crouch_attack|crouch_hurt)$/],
      ["Agarrão", /^(grab|grab_attack|grab_throw|grabbed)$/],
      ["Escada e borda", /^(climb|climb_top|climb_start|climb_end|climb_down_start|hang|hang_up|hang_end|hang_down)$/],
      ["Tiro e armas", /^(shoot|climb_shoot|gun_.*|top_.*|rifle_.*)$/],
      ["Corpo dividido (pernas)", /^legs_/],
      ["Reações e defesa", /^(hurt|hurt_low|knockback|knockdown|down|getup|wakeup|block|broken|hit)$/],
    ];
    const gOf = (n) => { const i = GROUPS.findIndex(([, re]) => re.test(n)); return i < 0 ? GROUPS.length : i; };
    let lastG = -1;
    [...A.anims].sort((u, v) => gOf(u.name) - gOf(v.name)).forEach((x) => {
      const g = gOf(x.name);
      if (g !== lastG) { lastG = g; const h = document.createElement("div"); h.className = "hint"; h.style.cssText = "border-top:1px solid var(--line);margin-top:6px;padding-top:3px;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:.05em"; h.textContent = g < GROUPS.length ? GROUPS[g][0] : "Outras"; box.appendChild(h); }
      const d = document.createElement("div"); d.className = "node" + (x === anim ? " sel" : "") + (animOffPal(x) ? " offpal" : "");
      d.textContent = `${x.name} (${x.frames.length})`;
      if (animOffPal(x)) d.title = "Esta animação tem pixels com cores fora da paleta do personagem: no jogo eles viram a cor mais parecida. Use o balde de troca ou Reduzir tudo para 15 cores.";
      const sp = (A.kind === "player" ? { ...playerBehaviorAnims(), ...abilityAnims(A) } : behaviorAnims(A))[x.name];
      if (sp) { d.classList.add("special"); d.title = (d.title ? d.title + "\n" : "") + `Animação da habilidade ou comportamento: ${sp}`; }
      d.onclick = () => { anim = x; fi = 0; selRect = null; loadFrame(); renderAll(); };
      box.appendChild(d);
    });
  }
  function renderAnimProps() {
    const box = el("ae-anim-props"); box.innerHTML = "";
    if (!anim) return;
    box.appendChild(fieldRow("Nome", anim, "name"));
    box.appendChild(fieldRow("Velocidade (fps)", anim, "speed", "number", { min: 1, max: 60 }));
    { const sg = { get v() { return anim.snapGround !== undefined ? anim.snapGround : ["down", "getup", "wakeup", "crouch_hurt"].includes(anim.name); }, set v(x) { anim.snapGround = x; } }; box.appendChild(fieldRow("Colisão de corpo apoiada no chão (base da caixa de dano = chão)", sg, "v", "check")); }
    const an = anim, mode = { get m() { return (an.pingpong ? "pp" : "") + (an.loop ? "loop" : "once"); },
      set m(v) { an.loop = v.endsWith("loop"); an.pingpong = v.startsWith("pp"); } };
    box.appendChild(fieldRow("Repetição", mode, "m", "select", { once: "Uma vez (1 2 3)", loop: "Loop (1 2 3 1 2 3…)", pponce: "Ping-pong uma vez (1 2 3 2 1)", pploop: "Ping-pong em loop (1 2 3 2 1 2 3…)" }));
    // loop a partir de um quadro: os quadros antes sao a entrada; os depois do fim sao a saida (tocam ao voltar para a idle)
    const nfr = anim.frames.length;
    const lo = fieldRow("Loop a partir de um quadro", anim, "loopOn", "check");
    lo.querySelector("input").addEventListener("change", () => { if (anim.loopOn) { anim.loopFrom = anim.loopFrom || Math.min(2, nfr); anim.loopTo = anim.loopTo || nfr; } changed(); renderAnimProps(); startPreview(); });
    box.appendChild(lo);
    if (anim.loopOn) {
      anim.loopFrom = Math.max(1, Math.min(nfr, anim.loopFrom || 1)); anim.loopTo = Math.max(anim.loopFrom, Math.min(nfr, anim.loopTo || nfr));
      [["Começa no quadro", "loopFrom"], ["Termina no quadro", "loopTo"]].forEach(([l, k]) => { const r = fieldRow(l, anim, k, "number", { min: 1, max: nfr }); r.querySelector("input").addEventListener("change", () => { renderAnimProps(); startPreview(); }); box.appendChild(r); });
      const lh = document.createElement("div"); lh.className = "hint";
      const intro = anim.loopFrom > 1 ? `entrada 1–${anim.loopFrom - 1}, ` : "", out = anim.loopTo < nfr ? `, saída ${anim.loopTo + 1}–${nfr} (toca ao voltar para a idle)` : "";
      lh.textContent = `${intro}loop ${anim.loopFrom}–${anim.loopTo}${out}. A repetição acima vale para o trecho do loop.`;
      box.appendChild(lh);
    }
    if (anim.name === "hang") {
      const hh = document.createElement("div"); hh.className = "hint"; hh.style.cssText = "color:var(--acc2)";
      hh.textContent = "Engate na borda: marque com a ferramenta Mão (J) o ponto da luva que segura a quina. O jogo põe esse ponto exatamente no canto. Sem marcar, ele usa o ponto mais alto do desenho.";
      box.appendChild(hh);
    }
    const f = frame();
    if (f) {
      const h = document.createElement("div"); h.className = "hint";
      h.textContent = `Frame ${fi + 1}/${anim.frames.length} · ${f.w}×${f.h} · âncora (${f.ax}, ${f.ay})`; box.appendChild(h);
      box.appendChild(fieldRow("Âncora X", f, "ax", "number")); box.appendChild(fieldRow("Âncora Y", f, "ay", "number"));
      f.hold = f.hold || 0;
      box.appendChild(fieldRow("Duração extra (frames)", f, "hold", "number", { min: 0, max: 120 }));
      if (A.kind === "weapon") {
        const al = document.createElement("button"); al.textContent = "Alinhar âncoras com o jogador";
        al.title = "Copia a âncora de cada quadro da animação do jogador com o mesmo nome (para desenhar a arma por cima dele)";
        al.onclick = () => { const pl = Object.values(P.actors).find((x) => x.kind === "player"), pan = pl && pl.anims.find((x) => x.name === anim.name); if (!pan) { status(`O jogador não tem a animação "${anim.name}".`); return; } anim.frames.forEach((g, i) => { const pf = pan.frames[Math.min(i, pan.frames.length - 1)]; if (pf) { g.ax = pf.ax; g.ay = pf.ay; } }); changed(); renderAll(); };
        box.appendChild(al);
      }
      const hb = document.createElement("div"); hb.className = "hint";
      hb.innerHTML = `<span style="color:#4aa8ff">Corpo</span>: ${f.hurt ? `${f.hurt.w}×${f.hurt.h}` : "—"} · <span style="color:#ff4a4a">Golpe</span>: ${f.hit ? `${f.hit.w}×${f.hit.h}` : "—"}`;
      box.appendChild(hb);
      const t = document.createElement("div"); t.className = "panel-title"; t.textContent = "Aplicar deste frame em"; box.appendChild(t);
      [["Corpo", "hurt"], ["Golpe", "hit"], ["Âncora", "anchor"]].forEach(([n, k]) => {
        const r = document.createElement("div"); r.className = "row ae-apply";
        r.innerHTML = `<label>${n} →</label><button>Esta animação</button><button>Todas</button>`;
        const [b1, b2] = r.querySelectorAll("button");
        b1.onclick = () => applyFrom(k, [anim]); b2.onclick = () => applyFrom(k, A.anims);
        box.appendChild(r);
      });
    }
    const del = document.createElement("button"); del.textContent = "Apagar animação"; del.className = "danger";
    del.onclick = () => { if (A.anims.length < 2) return; A.anims.splice(A.anims.indexOf(anim), 1); anim = A.anims[0]; fi = 0; loadFrame(); changed(); renderAll(); };
    box.appendChild(del);
  }
  /* editando uma arma: mostra o quadro do jogador por baixo (mesma animacao, mesmo quadro).
   * Quadro com ponto de pega: o jogador fica com a mao no ponto de pega; sem: alinhado pela ancora. */
  function drawPlayerUnder(c) {
    if (!A || A.kind !== "weapon" || !anim) return;
    const pl = Object.values(P.actors).find((x) => x.kind === "player"), f = frame(); if (!pl || !f) return;
    const pan = pl.anims.find((x) => x.name === anim.name && x.frames.length) || pl.anims.find((x) => x.name === "idle" && x.frames.length); if (!pan) return;
    const pf = pan.frames[Math.min(fi, pan.frames.length - 1)], im = images[pf.img]; if (!im) return;
    let ox, oy;
    if (f.hand) { if (!pf.hand) return; ox = f.hand.x - pf.hand.x; oy = f.hand.y - pf.hand.y; } else { ox = f.ax - pf.ax; oy = f.ay - pf.ay; }
    c.globalAlpha = .35; c.drawImage(im.img, ox * zoom, oy * zoom, pf.w * zoom, pf.h * zoom); c.globalAlpha = 1;
  }
  function renderCanvas() {
    const cvs = el("ae-cv"), wrap = el("ae-wrap");
    const W = work.width, H = work.height;
    cvs.width = W * zoom + 1; cvs.height = H * zoom + 1;
    const c = cvs.getContext("2d"); c.imageSmoothingEnabled = false;
    // xadrez = transparente
    if (bgMode === "checker") { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { c.fillStyle = (x + y) & 1 ? "#3a3d45" : "#2f3138"; c.fillRect(x * zoom, y * zoom, zoom, zoom); } }
    else { c.fillStyle = bgMode === "green" ? "#00ff00" : "#ff00ff"; c.fillRect(0, 0, W * zoom, H * zoom); }   // fundo chapado: buracos na arte aparecem na hora
    drawPlayerUnder(c);   // arma: o jogador aparece apagado por baixo para desenhar por cima
    c.globalAlpha = vis.art ? (layer === "box" ? .55 : 1) : 0;
    c.drawImage(work, 0, 0, W * zoom, H * zoom); c.globalAlpha = 1;
    if (showGrid && zoom >= 6) {
      c.strokeStyle = "rgba(0,0,0,.25)"; c.beginPath();
      for (let x = 0; x <= W; x++) { c.moveTo(x * zoom + .5, 0); c.lineTo(x * zoom + .5, H * zoom); }
      for (let y = 0; y <= H; y++) { c.moveTo(0, y * zoom + .5); c.lineTo(W * zoom, y * zoom + .5); }
      c.stroke();
      c.strokeStyle = "rgba(255,255,255,.18)"; c.beginPath();      // tiles 8x8
      for (let x = 0; x <= W; x += 8) { c.moveTo(x * zoom + .5, 0); c.lineTo(x * zoom + .5, H * zoom); }
      for (let y = 0; y <= H; y += 8) { c.moveTo(0, y * zoom + .5); c.lineTo(W * zoom, y * zoom + .5); }
      c.stroke();
    }
    const f = frame();
    if (f) { // ancora
      const ax = f.ax * zoom + zoom / 2, ay = f.ay * zoom + zoom / 2;
      c.strokeStyle = "#ff3b3b"; c.lineWidth = 2; c.beginPath(); c.moveTo(ax - 9, ay); c.lineTo(ax + 9, ay); c.moveTo(ax, ay - 9); c.lineTo(ax, ay + 9); c.stroke(); c.lineWidth = 1;
    }
    if (f && f.hand) { // mao / pega
      const hx = f.hand.x * zoom + zoom / 2, hy = f.hand.y * zoom + zoom / 2;
      c.strokeStyle = "#3fd6e0"; c.lineWidth = 2; c.beginPath(); c.arc(hx, hy, Math.max(4, zoom * .8), 0, 7); c.stroke(); c.lineWidth = 1;
    }
    // caixas de colisao
    [["hurt", "rgba(74,168,255,.9)", "rgba(74,168,255,.15)"], ["hit", "rgba(255,74,74,.95)", "rgba(255,74,74,.2)"]].forEach(([k, line, fill]) => {
      const b = stroke && stroke.tool === k ? normR(stroke) : f && f[k];
      if (!b || !vis.box) return;
      c.fillStyle = fill; c.fillRect(b.x * zoom, b.y * zoom, b.w * zoom, b.h * zoom);
      c.strokeStyle = line; c.lineWidth = 2; c.strokeRect(b.x * zoom + 1, b.y * zoom + 1, b.w * zoom - 2, b.h * zoom - 2); c.lineWidth = 1;
    });
    if (rareKey >= 0) {   // cor rara: contorno piscando nos pixels dela
      const d = work.getContext("2d").getImageData(0, 0, W, H).data; c.strokeStyle = (Date.now() >> 8) & 1 ? "#00ff66" : "#ff00aa"; c.lineWidth = 2;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (d[i + 3] > 127 && MD.key(d[i], d[i + 1], d[i + 2]) === rareKey) c.strokeRect(x * zoom + 1, y * zoom + 1, zoom - 2, zoom - 2); }
      c.lineWidth = 1;
    }
    if (flt) {   // pixels flutuando: desenho por cima e caixa (com alcas na transformacao)
      c.drawImage(flt.c, flt.x * zoom, flt.y * zoom, flt.w * zoom, flt.h * zoom);
      c.strokeStyle = flt.tf ? "#ffcf3a" : "#fff"; c.setLineDash([4, 3]); c.strokeRect(flt.x * zoom + .5, flt.y * zoom + .5, flt.w * zoom, flt.h * zoom); c.setLineDash([]);
      if (flt.tf) { c.fillStyle = "#ffcf3a"; tfCorners().forEach(([x, y]) => c.fillRect(x * zoom - 4, y * zoom - 4, 8, 8)); }
    }
    const r = flt ? null : selRect || (stroke && (stroke.tool === "rect" || stroke.tool === "rectfill" || stroke.tool === "select") ? normR(stroke) : null);
    if (r) { c.strokeStyle = "#fff"; c.setLineDash([4, 3]); c.strokeRect(r.x * zoom + .5, r.y * zoom + .5, r.w * zoom, r.h * zoom); c.setLineDash([]); }
    if (!f) { c.fillStyle = "#ccc"; c.font = "13px system-ui"; c.fillText("Sem frames: importe imagens", 6, 20); }
  }
  function renderFrames() {
    const box = el("ae-frames"); box.innerHTML = "";
    if (!anim) return;
    anim.frames.forEach((f, i) => {
      const d = document.createElement("div"); d.className = "ae-thumb" + (i === fi ? " sel" : "");
      const c = document.createElement("canvas"); const s = Math.min(1, 56 / Math.max(f.w, f.h)) * (f.w < 28 && f.h < 28 ? 2 : 1);
      c.width = Math.max(1, f.w * s); c.height = Math.max(1, f.h * s);
      const cg = c.getContext("2d"); cg.imageSmoothingEnabled = false; if (images[f.img]) cg.drawImage(images[f.img].img, 0, 0, c.width, c.height);
      d.appendChild(c); const n = document.createElement("span"); n.textContent = i + 1; d.appendChild(n);
      d.onclick = () => { if (dragJustEnded) return; fi = i; selRect = null; loadFrame(); renderAll(); };
      d.onmousedown = (e) => { if (e.button === 0) fdrag = { from: i, x0: e.clientX, on: false }; };
      box.appendChild(d);
    });
  }
  /* arrastar quadros: clica, arrasta e solta; a linha dourada mostra onde ele vai entrar */
  let fdrag = null, dragJustEnded = false;
  function dropIndex(x) {
    const th = [...el("ae-frames").querySelectorAll(".ae-thumb")];
    for (let i = 0; i < th.length; i++) { const r = th[i].getBoundingClientRect(); if (x < r.left + r.width / 2) return i; }
    return th.length;
  }
  function showMarker(at) {
    const box = el("ae-frames"); let m = box.querySelector(".ae-drop");
    if (!m) { m = document.createElement("div"); m.className = "ae-drop"; box.appendChild(m); }
    const th = box.querySelectorAll(".ae-thumb"), br = box.getBoundingClientRect();
    const r = th[Math.min(at, th.length - 1)].getBoundingClientRect();
    m.style.left = (at < th.length ? r.left - 3 : r.right + 1) - br.left + box.scrollLeft + "px";
  }
  window.addEventListener("mousemove", (e) => {
    if (!fdrag || !isOpen()) return;
    if (!fdrag.on && Math.abs(e.clientX - fdrag.x0) < 5) return;
    fdrag.on = true; document.body.style.cursor = "grabbing";
    fdrag.at = dropIndex(e.clientX); showMarker(fdrag.at);
  });
  window.addEventListener("mouseup", () => {
    if (!fdrag) return;
    const d = fdrag; fdrag = null; document.body.style.cursor = "";
    const m = root && root.querySelector(".ae-drop"); if (m) m.remove();
    if (!d.on || !anim) return;
    dragJustEnded = true; setTimeout(() => { dragJustEnded = false; }, 0);
    let to = d.at > d.from ? d.at - 1 : d.at;
    if (to === d.from) return;
    const [f] = anim.frames.splice(d.from, 1); anim.frames.splice(to, 0, f);
    fi = to; loadFrame(); changed(); renderAll();
  });
  function renderPal() {
    const box = el("ae-pal"); box.innerHTML = "";
    const t = document.createElement("div"); t.className = "ae-sw" + (color === 0 ? " sel" : ""); t.title = "0: transparente";
    t.style.background = "repeating-conic-gradient(#555 0 25%, #888 0 50%) 50%/8px 8px"; t.onclick = () => { color = 0; renderPal(); }; box.appendChild(t);
    // mostra as cores agrupadas por tom (cinzas, depois por matiz, cada grupo do escuro ao claro); o numero da vaga nao muda
    const tone = (k) => { const c = hsvK(k); return c.s < 0.2 ? -1 : Math.round(c.h / 30) % 12; };
    A.pal.map((k, i) => [k, i]).sort((a, b) => tone(a[0]) - tone(b[0]) || hsvK(a[0]).l - hsvK(b[0]).l).forEach(([k, i]) => {
      const d = document.createElement("div"); d.className = "ae-sw" + (color === i + 1 ? " sel" : "");
      d.style.background = `rgb(${MD.rgbOfKey(k)})`; d.title = `${i + 1}`;
      d.onclick = () => { color = i + 1; tool = tool === "eraser" ? "pencil" : tool; renderPal(); renderTools(); };
      box.appendChild(d);
    });
  }
  /* cores do Mega Drive em rampas (do escuro ao claro de cada tom), por tom ou na grade 8x64 */
  let mdView = "ramp";
  const hsvK = (k) => { const [r, g, b] = MD.rgbOfKey(k).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return { h: (h * 60 + 360) % 360, l: 0.299 * r + 0.587 * g + 0.114 * b, s: mx ? d / mx : 0 }; };
  const MD_ROWS = (() => {
    const fam = [["Cinzas", null], ["Vermelhos", 0], ["Laranjas", 30], ["Amarelos", 55], ["Limões", 85], ["Verdes", 120], ["Turquesas", 160], ["Cianos", 185], ["Azuis céu", 210], ["Azuis", 240], ["Violetas", 270], ["Magentas", 300], ["Rosas", 330]];
    const hue = fam.map(() => []);
    for (let k = 0; k < 512; k++) {
      let fi = 0;
      if (!(((k >> 6) & 7) === ((k >> 3) & 7) && ((k >> 3) & 7) === (k & 7))) { const c = hsvK(k); let bd = 999; fam.forEach(([, h], i) => { if (h === null) return; const dd = Math.min(Math.abs(c.h - h), 360 - Math.abs(c.h - h)); if (dd < bd) { bd = dd; fi = i; } }); }
      hue[fi].push(k);
    }
    hue.forEach((l) => l.sort((a, b) => hsvK(a).l - hsvK(b).l || hsvK(a).s - hsvK(b).s));
    const bases = [[1, 0, 0], [1, .5, 0], [1, 1, 0], [.5, 1, 0], [0, 1, 0], [0, 1, .5], [0, 1, 1], [0, .5, 1], [0, 0, 1], [.5, 0, 1], [1, 0, 1], [1, 0, .5], [1, .5, .5], [.5, 1, .5], [.5, .5, 1], [1, 1, .5], [1, .75, .5], [.75, .5, .25]];
    const names = ["Vermelho", "Laranja", "Amarelo", "Limão", "Verde", "Esmeralda", "Ciano", "Céu", "Azul", "Violeta", "Magenta", "Rosa", "Salmão", "Menta", "Lavanda", "Creme", "Pele", "Marrom"];
    const ramp = [["Cinza", [0, 1, 2, 3, 4, 5, 6, 7].map((v) => (v << 6) | (v << 3) | v)]];
    bases.forEach((bb, i) => { const row = []; for (let st = 1; st <= 14; st++) { const t = st / 7, c = bb.map((x) => (t <= 1 ? x * t : x + (1 - x) * (t - 1)) * 7), k = (Math.round(c[0]) << 6) | (Math.round(c[1]) << 3) | Math.round(c[2]); if (!row.includes(k)) row.push(k); } ramp.push([names[i], row]); });
    return { hue: fam.map(([n], i) => [n, hue[i]]), ramp };
  })();
  function renderMD() {
    const box = el("ae-md"); box.innerHTML = "";
    root.querySelectorAll("[data-mdv]").forEach((b) => { b.classList.toggle("on", b.dataset.mdv === mdView); b.onclick = () => { mdView = b.dataset.mdv; renderMD(); }; });
    const inPal = new Set(A.pal);
    const sw = (k) => {
      const d = document.createElement("div"); d.style.background = `rgb(${MD.rgbOfKey(k)})`;
      if (inPal.has(k)) d.style.boxShadow = "inset 0 0 0 1px #000, inset 0 0 0 2px #fff";   // ja esta na paleta
      d.title = "Adicionar à paleta / usar esta cor";
      d.onclick = () => {
        let i = A.pal.indexOf(k);
        if (i < 0 && A.pal.length >= 15) {   // paleta cheia: a cor escolhida substitui a da vaga selecionada (e os pixels dela em todos os frames)
          if (color < 1) { status("A paleta já tem 15 cores: clique primeiro na vaga da paleta que quer trocar."); return; }
          recolor(A.pal[color - 1], k); A.pal[color - 1] = k; changed(); renderAll(); status("Cor da vaga " + color + " trocada (em todos os frames)."); return;
        }
        if (i < 0) { A.pal.push(k); i = A.pal.length - 1; changed(); }
        color = i + 1; renderPal();
      };
      d.oncontextmenu = d.onclick;
      d.addEventListener("click", (e) => {
        if (!e.shiftKey || color < 1) return;
        e.stopImmediatePropagation();
        if (A.pal.includes(k) && A.pal[color - 1] !== k) { status("Essa cor já está em outra vaga da paleta: trocar juntaria as duas cores para sempre (os tons se perdem). Escolha uma cor que não esteja na paleta."); return; }
        recolor(A.pal[color - 1], k); A.pal[color - 1] = k; changed(); renderAll();
      }, true);
      return d;
    };
    if (mdView === "grid") { box.className = "ae-md"; for (let k = 0; k < 512; k++) box.appendChild(sw(k)); return; }
    box.className = "ae-md ae-md-rows";
    MD_ROWS[mdView].forEach(([n, ks]) => {
      const r = document.createElement("div"); r.className = "ae-mdrow";
      const lb = document.createElement("label"); lb.textContent = n; r.appendChild(lb);
      const s = document.createElement("div"); s.className = "ae-mdsw"; ks.forEach((k) => s.appendChild(sw(k)));
      r.appendChild(s); box.appendChild(r);
    });
  }
  function renderTools() {
    root.querySelectorAll("[data-t]").forEach((b) => b.classList.toggle("on", b.dataset.t === tool));
    el("ae-fa-opt").style.display = tool === "fillall" ? "" : "none";
    el("ae-fill-opt").style.display = tool === "fill" ? "" : "none";
    const l = BOX_TOOLS.includes(tool) ? "box" : tool === "anchor" || tool === "hand" ? layer : "art";
    if (l !== layer) { layer = l; vis[l] = true; renderLayers(); renderCanvas(); }
  }

  /* troca uma cor da paleta em todos os frames */
  async function recolor(fromK, toK) {
    const [r0, g0, b0] = MD.rgbOfKey(fromK), [r1, g1, b1] = MD.rgbOfKey(toK);
    for (const an of A.anims) for (const f of an.frames) {
      const c = images[f.img].img, cg = c.getContext("2d"), d = cg.getImageData(0, 0, c.width, c.height);
      let hit = false;
      for (let i = 0; i < d.data.length; i += 4) if (d.data[i + 3] > 127 && MD.key(d.data[i], d.data[i + 1], d.data[i + 2]) === fromK) { d.data.set([r1, g1, b1], i); hit = true; }   // compara pela cor do Mega Drive (o PNG pode ter variações de 1 no RGB)
      if (!hit) continue;
      const n = document.createElement("canvas"); n.width = c.width; n.height = c.height; n.getContext("2d").putImageData(d, 0, 0);
      const id = uid("img_"); SRC[id] = n.toDataURL(); images[id] = { img: n }; f.img = id;
    }
    loadFrame();
  }

  /* reduz todos os frames do ator a uma paleta unica de 15 cores do Mega Drive */
  /* fresh = frames que acabaram de entrar: as cores deles tem prioridade (ficam exatas se couberem em 15);
   * as animacoes que ja existiam (ex.: as do exemplo) e que se adaptam a paleta nova */
  async function convertAll(transp, fresh) {
    const frames = A.anims.flatMap((an) => an.frames);
    if (!frames.length) return;
    const datas = frames.map((f) => { const c = images[f.img].img; return c.getContext("2d").getImageData(0, 0, c.width, c.height); });
    // junta tudo numa imagem so para contar as cores
    const total = datas.reduce((s, d) => s + d.width * d.height, 0);
    const big = new ImageData(new Uint8ClampedArray(total * 4), total, 1);
    let o = 0; datas.forEach((d) => { big.data.set(d.data, o); o += d.data.length; });
    const conv = MD.convert(big, 15, transp);
    if (fresh && fresh.length) {
      const tk = transp ? MD.key(...transp) : -1, count = (list) => {
        const m = new Map();
        list.forEach((d) => { for (let i = 0; i < d.data.length; i += 4) { if (d.data[i + 3] < 128) continue; const k = MD.key(d.data[i], d.data[i + 1], d.data[i + 2]); if (k !== tk) m.set(k, (m.get(k) || 0) + 1); } });
        return [...m].sort((a, b) => b[1] - a[1]).map(([k]) => k);
      };
      const mine = count(frames.map((f, i) => (fresh.includes(f) ? datas[i] : null)).filter(Boolean));
      // ordem de prioridade das vagas da paleta: 1) o arquivo que acabou de entrar, 2) os desenhos que voce ja tinha importado,
      // 3) os desenhos de exemplo (so ficam com o que sobrar). Assim uma importacao nova nunca troca cores das suas animacoes antigas.
      const mineOld = count(frames.map((f, i) => (!fresh.includes(f) && !isPlaceholderFrame(f) ? datas[i] : null)).filter(Boolean));
      const need = new Set([...mine, ...mineOld]).size;
      if (need > 15) setTimeout(() => status(`Atenção: as suas animações somam ${need} cores e o Mega Drive dá 15 por personagem: as que sobram viram a cor mais parecida. Reduza as cores no SG Pixel.`), 0);
      if (mine.length <= 15) {   // cores do arquivo novo ficam exatas; sobra de vaga vai para as animacoes antigas suas e depois para as de exemplo
        const pal = mine.slice();
        mineOld.forEach((k) => { if (pal.length < 15 && !pal.includes(k)) pal.push(k); });
        count(datas).forEach((k) => { if (pal.length < 15 && !pal.includes(k)) pal.push(k); });
        conv.pal = pal;
        for (let i = 0; i < total; i++) {
          const j = i * 4; if (big.data[j + 3] < 128) { conv.idx[i] = 0; continue; }
          const k = MD.key(big.data[j], big.data[j + 1], big.data[j + 2]);
          conv.idx[i] = k === tk ? 0 : 1 + (pal.indexOf(k) >= 0 ? pal.indexOf(k) : MD.nearest(pal, k));
        }
      }
    }
    A.pal = conv.pal;
    o = 0;
    frames.forEach((f, i) => {
      const d = datas[i], n = d.width * d.height;
      const sub = { pal: conv.pal, idx: conv.idx.subarray(o, o + n), w: d.width, h: d.height };
      o += n;
      const c = MD.toCanvas(sub), id = uid("img_");
      SRC[id] = c.toDataURL(); images[id] = { img: c }; f.img = id;
    });
    loadFrame();
    changed(); renderAll();
    if (!(fresh && fresh.length)) status(`Convertido: ${conv.colors} cores originais → ${conv.pal.length} cores do Mega Drive.`);
  }
  /* tira os desenhos de exemplo (as animacoes ficam, vazias, para voce desenhar) e refaz a paleta so com as suas cores */
  /* recupera as cores de um pack antigo: para cada quadro (mesma animacao, mesma posicao e mesmo tamanho),
   * onde o pixel continua desenhado nos dois, volta a cor antiga. O desenho novo (formas, quadros novos) fica. */
  async function restoreFromPack(file) {
    try {
      const z = await JSZip.loadAsync(file);
      const data = JSON.parse(await z.file("project.json").async("string"));
      const old = Object.values(data.actors || {}).find((x) => x.kind === A.kind && x.name === A.name) || Object.values(data.actors || {}).find((x) => x.kind === A.kind);
      if (!old) { alert("Não achei este personagem no pack escolhido."); return; }
      const load = async (id) => { const zf = z.file(`images/${id}.png`); if (!zf) return null; const im = await loadImage("data:image/png;base64," + await zf.async("base64")); const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; c.getContext("2d").drawImage(im, 0, 0); return c; };
      let nf = 0, np = 0;
      for (const an of A.anims) {
        const oa = (old.anims || []).find((x) => x.name === an.name); if (!oa) continue;
        for (let i = 0; i < an.frames.length; i++) {
          const f = an.frames[i], of = oa.frames[i]; if (!of || !images[f.img]) continue;
          const oc = await load(of.img); if (!oc) continue;
          const c = images[f.img].img, dx = (of.ax || 0) - (f.ax || 0), dy = (of.ay || 0) - (f.ay || 0);   // alinha pela ancora
          const nd = c.getContext("2d").getImageData(0, 0, c.width, c.height), od = oc.getContext("2d").getImageData(0, 0, oc.width, oc.height);
          let hit = 0;
          for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
            const ox = x + dx, oy = y + dy; if (ox < 0 || oy < 0 || ox >= oc.width || oy >= oc.height) continue;
            const a = (y * c.width + x) * 4, b = (oy * oc.width + ox) * 4;
            if (nd.data[a + 3] < 128 || od.data[b + 3] < 128) continue;
            if (nd.data[a] !== od.data[b] || nd.data[a + 1] !== od.data[b + 1] || nd.data[a + 2] !== od.data[b + 2]) { nd.data[a] = od.data[b]; nd.data[a + 1] = od.data[b + 1]; nd.data[a + 2] = od.data[b + 2]; hit++; }
          }
          if (!hit) continue;
          const n = document.createElement("canvas"); n.width = c.width; n.height = c.height; n.getContext("2d").putImageData(nd, 0, 0);
          const id = uid("img_"); SRC[id] = n.toDataURL(); images[id] = { img: n }; f.img = id; nf++; np += hit;
        }
      }
      // paleta: as cores que o desenho usa agora (a antiga tem prioridade na ordem)
      const used = new Set();
      A.anims.forEach((an) => an.frames.forEach((f) => { const c = images[f.img] && images[f.img].img; if (!c) return; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) used.add(MD.key(d[i], d[i + 1], d[i + 2])); }));
      const pal = (old.pal || []).filter((k) => used.has(k)); used.forEach((k) => { if (!pal.includes(k)) pal.push(k); });
      if (pal.length <= 15) A.pal = pal;
      loadFrame(); changed(); renderAll();
      alert(`Cores recuperadas: ${np} pixels em ${nf} quadro(s).` + (pal.length > 15 ? ` Atenção: o desenho agora usa ${pal.length} cores (máx. 15).` : ""));
    } catch (err) { alert("Não consegui ler o pack: " + err.message); }
  }
  /* troca de paleta pelo frame base: guarda o frame como estava, o usuario repinta as cores nele,
   * e a troca (cor antiga -> cor nova, a mais frequente em cada pixel) vale para todos os frames do personagem */
  let palBase = null;
  function palBaseClick() {
    const f = frame(); if (!f) return;
    const btn = el("ae-palbase");
    if (!palBase || palBase.actor !== A.id) {
      const c = images[f.img].img;
      palBase = { actor: A.id, frame: f, anim, index: fi, data: c.getContext("2d").getImageData(0, 0, c.width, c.height) };
      btn.textContent = "Base de cores: aplicar em todos os frames"; btn.classList.add("on");
      status("Frame base marcado. Agora pinte as cores novas neste frame (balde, lápis...) e clique de novo no botão para aplicar em todas as animações.");
      return;
    }
    // o frame base pode ter sido trocado por outro (importado/colado na mesma posicao da animacao): usa o que estiver la agora
    if (palBase.anim && !palBase.anim.frames.includes(palBase.frame) && palBase.anim.frames[palBase.index]) palBase.frame = palBase.anim.frames[palBase.index];
    if (palBase.anim && palBase.anim === anim && anim.frames[fi] && anim.frames[fi] !== palBase.frame && anim.frames[fi].w === palBase.data.width && anim.frames[fi].h === palBase.data.height) palBase.frame = anim.frames[fi];   // aplica no frame que esta aberto (o importado) se for da mesma animacao e do mesmo tamanho
    if (!images[palBase.frame.img]) throw new Error("o frame base não existe mais");
    const cur = images[palBase.frame.img].img, nd = cur.getContext("2d").getImageData(0, 0, cur.width, cur.height), od = palBase.data;
    if (nd.width !== od.width || nd.height !== od.height) { alert(`O frame novo tem ${nd.width}×${nd.height} e o base tinha ${od.width}×${od.height}: precisam ter o mesmo tamanho e o desenho na mesma posição. Marque de novo.`); palBase = null; btn.textContent = "Base de cores: marcar este frame"; btn.classList.remove("on"); return; }
    const votes = new Map();   // cor antiga -> (cor nova -> quantidade)
    for (let i = 0; i < od.data.length; i += 4) {
      if (od.data[i + 3] < 128 || nd.data[i + 3] < 128) continue;
      const a = MD.key(od.data[i], od.data[i + 1], od.data[i + 2]), b = MD.key(nd.data[i], nd.data[i + 1], nd.data[i + 2]);
      if (!votes.has(a)) votes.set(a, new Map()); const m = votes.get(a); m.set(b, (m.get(b) || 0) + 1);
    }
    const map = new Map(); votes.forEach((m, a) => { let best = a, n = -1; m.forEach((c, b) => { if (c > n) { n = c; best = b; } }); if (best !== a) map.set(a, best); });
    if (!map.size) { alert("Nenhuma cor mudou entre o frame base e o frame pintado. Abra (selecione) o frame pintado — da mesma animação e do mesmo tamanho — e clique de novo. Botão direito no botão cancela a base."); return; }
    let nf = 0;
    for (const an of A.anims) for (const f of an.frames) {
      if (f === palBase.frame || !images[f.img]) continue;
      const c = images[f.img].img, d = c.getContext("2d").getImageData(0, 0, c.width, c.height), D = d.data; let hit = false;
      for (let i = 0; i < D.length; i += 4) { if (D[i + 3] < 128) continue; const k = map.get(MD.key(D[i], D[i + 1], D[i + 2])); if (k !== undefined) { const [r, g, b] = MD.rgbOfKey(k); D[i] = r; D[i + 1] = g; D[i + 2] = b; hit = true; } }
      if (!hit) continue;
      const n = document.createElement("canvas"); n.width = c.width; n.height = c.height; n.getContext("2d").putImageData(d, 0, 0);
      const id = uid("img_"); SRC[id] = n.toDataURL(); images[id] = { img: n }; f.img = id; nf++;
    }
    A.pal = A.pal.map((k) => (map.has(k) ? map.get(k) : k)).filter((k, i, arr) => arr.indexOf(k) === i);
    map.forEach((b) => { if (!A.pal.includes(b) && A.pal.length < 15) A.pal.push(b); });
    palBase = null; btn.textContent = "Base de cores: marcar este frame"; btn.classList.remove("on");
    loadFrame(); changed(); renderAll();
    status(`${map.size} cor(es) trocada(s) em ${nf} frame(s).`);
  }
  function clearPlaceholders() {
    const n = A.anims.reduce((s, an) => s + an.frames.filter(isPlaceholderFrame).length, 0);
    if (!n) { status("Não há desenhos de exemplo neste personagem."); return; }
    if (!confirm(`Apagar ${n} quadro(s) de exemplo deste personagem?\n\nAs animações continuam na lista, vazias, para você importar os seus desenhos. Os quadros que você importou não são tocados.`)) return;
    A.anims.forEach((an) => { an.frames = an.frames.filter((f) => !isPlaceholderFrame(f)); });
    const m = new Map();
    A.anims.forEach((an) => an.frames.forEach((f) => { const im = images[f.img]; if (!im) return; const d = im.img.getContext("2d").getImageData(0, 0, im.img.width, im.img.height).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) { const k = MD.key(d[i], d[i + 1], d[i + 2]); m.set(k, (m.get(k) || 0) + 1); } }));
    A.pal = [...m].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 15);
    fi = 0; anim = A.anims.find((x) => x.frames.length) || A.anims[0] || null;
    changed(); renderAll(); status(`${n} quadro(s) de exemplo apagados. Paleta: ${A.pal.length} cor(es) das suas animações.`);
  }

  /* ---------------------------------------------------- previa animada */
  function startPreview() {
    clearInterval(playTimer);
    let i = 0, hold = 0;
    const cv = el("ae-prev"), c = cv.getContext("2d");
    const tick = () => {
      c.fillStyle = "#1b1c20"; c.fillRect(0, 0, cv.width, cv.height);
      if (!anim || !anim.frames.length) return;
      const n = anim.frames.length, m = anim.pingpong && n > 2 ? 2 * n - 2 + (anim.loop ? 0 : 1) : n;
      let f;
      if (anim.loopOn && n > 1) {   // previa: entrada, 3 voltas do loop, saida, e recomeca
        const lf = Math.min(n, anim.loopFrom || 1) - 1, lt = Math.max(lf, Math.min(n, anim.loopTo || n) - 1), seg = [];
        for (let k = lf; k <= lt; k++) seg.push(k);
        const cyc = anim.pingpong ? seg.concat(seg.slice(1, -1).reverse()) : seg, seq = [];
        for (let k = 0; k < lf; k++) seq.push(k);
        for (let r = 0; r < (anim.loop ? 3 : 1); r++) seq.push(...cyc);
        for (let k = lt + 1; k < n; k++) seq.push(k);
        f = anim.frames[seq[i % seq.length]];
      } else { const j = anim.loop ? i % m : Math.min(i, m - 1); f = anim.frames[j < n ? j : 2 * n - 2 - j]; }
      const im = images[f.img];
      // zoom da previa: roda do mouse (duplo clique volta ao automatico)
      const auto = Math.max(1, Math.floor(Math.min((cv.width - 10) / f.w, (cv.height - 20) / f.h)));
      const z = prevZoom || auto, bx = Math.round(cv.width / 2), by = cv.height - 10;
      c.fillStyle = "rgba(0,0,0,.5)"; c.beginPath(); c.ellipse(bx, by, 8 * z, 2 * z, 0, 0, 7); c.fill();
      c.imageSmoothingEnabled = false;
      if (im) c.drawImage(im.img, bx - f.ax * z, by - f.ay * z, f.w * z, f.h * z);
      c.lineWidth = Math.max(1, z >> 1);
      if (f.hurt) { c.strokeStyle = "rgba(74,168,255,.8)"; c.strokeRect(bx + (f.hurt.x - f.ax) * z, by + (f.hurt.y - f.ay) * z, f.hurt.w * z, f.hurt.h * z); }
      if (f.hit) { c.strokeStyle = "rgba(255,74,74,.9)"; c.strokeRect(bx + (f.hit.x - f.ax) * z, by + (f.hit.y - f.ay) * z, f.hit.w * z, f.hit.h * z); }
      c.lineWidth = 1; c.fillStyle = "#8d877c"; c.font = "10px system-ui"; c.fillText(`${z}x${prevZoom ? "" : " auto"}`, 4, 12);
      if (hold++ >= (f.hold || 0)) { hold = 0; i = anim.loop || anim.loopOn ? i + 1 : Math.min(i + 1, m - 1 + 40); if (!anim.loop && !anim.loopOn && i >= m - 1 + 40) i = 0; }
    };
    tick();
    playTimer = setInterval(tick, 1000 / Math.max(1, anim ? anim.speed : 10));
  }

  /* ---------------------------------------------------- desenho */
  function px(e) { const r = el("ae-cv").getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / zoom), y: Math.floor((e.clientY - r.top) / zoom) }; }
  function rgba(i) { if (i === 0) return null; const [r, g, b] = MD.rgbOfKey(A.pal[i - 1]); return [r, g, b]; }
  function setPx(x, y, ci) {
    if (x < 0 || y < 0 || x >= work.width || y >= work.height) return;
    const c = rgba(ci);
    if (!c) wg.clearRect(x, y, 1, 1); else { wg.fillStyle = `rgb(${c})`; wg.fillRect(x, y, 1, 1); }
  }
  function line(x0, y0, x1, y1, ci) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
    for (;;) { setPx(x0, y0, ci); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  function normR(s) { const x = Math.min(s.x0, s.x1), y = Math.min(s.y0, s.y1); return { x, y, w: Math.abs(s.x1 - s.x0) + 1, h: Math.abs(s.y1 - s.y0) + 1 }; }
  function colorIndexAt(x, y) {
    const d = wg.getImageData(x, y, 1, 1).data;
    if (d[3] < 128) return 0;
    const k = MD.key(d[0], d[1], d[2]), i = A.pal.indexOf(k);
    return i < 0 ? 1 + MD.nearest(A.pal, k) : i + 1;
  }
  function flood(x, y, ci) {
    const W = work.width, H = work.height, d = wg.getImageData(0, 0, W, H), D = d.data;
    const at = (i) => (D[i * 4 + 3] < 128 ? -1 : MD.key(D[i * 4], D[i * 4 + 1], D[i * 4 + 2]));   // pela cor do Mega Drive
    const target = at(y * W + x), c = rgba(ci), rep = c ? MD.key(c[0], c[1], c[2]) : -1;
    if (target === rep) return;
    const st = [y * W + x];
    while (st.length) {
      const i = st.pop(); if (at(i) !== target) continue;
      if (c) { D.set([c[0], c[1], c[2], 255], i * 4); } else D[i * 4 + 3] = 0;
      const px_ = i % W, py = (i / W) | 0;
      if (px_ > 0) st.push(i - 1); if (px_ < W - 1) st.push(i + 1); if (py > 0) st.push(i - W); if (py < H - 1) st.push(i + W);
    }
    wg.putImageData(d, 0, 0);
  }

  /* ---------------------------------------------------- mover / transformar */
  function opaqueBox() {
    const d = wg.getImageData(0, 0, work.width, work.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < work.height; y++) for (let x = 0; x < work.width; x++) if (d[(y * work.width + x) * 4 + 3] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  function lift(tf) {   // tira os pixels da selecao (ou do desenho todo) e deixa flutuando
    if (flt) return true;
    const r = selRect || opaqueBox(); if (!r) return false;
    const c = document.createElement("canvas"); c.width = r.w; c.height = r.h; c.getContext("2d").drawImage(work, -r.x, -r.y);
    const back = document.createElement("canvas"); back.width = work.width; back.height = work.height; back.getContext("2d").drawImage(work, 0, 0);
    wg.clearRect(r.x, r.y, r.w, r.h);
    flt = { c, x: r.x, y: r.y, w: r.w, h: r.h, tf, back }; selRect = null; return true;
  }
  function stamp() {   // cola os pixels flutuando no frame
    if (!flt) return;
    wg.imageSmoothingEnabled = false; wg.drawImage(flt.c, flt.x, flt.y, flt.w, flt.h);
    selRect = { x: flt.x, y: flt.y, w: flt.w, h: flt.h }; flt = null; commit();
  }
  function cancelFloat() { if (!flt) return; wg.clearRect(0, 0, work.width, work.height); wg.drawImage(flt.back, 0, 0); selRect = { x: flt.back && flt.x, y: flt.y, w: flt.w, h: flt.h }; flt = null; selRect = null; renderCanvas(); }
  function tfCorners() { return [[flt.x, flt.y], [flt.x + flt.w, flt.y], [flt.x, flt.y + flt.h], [flt.x + flt.w, flt.y + flt.h]]; }
  function tfOp(op) {   // girar / espelhar os pixels flutuando
    if (!flt) return;
    const s = flt.c, rot = op === "r90" || op === "l90", n = document.createElement("canvas");
    n.width = rot ? s.height : s.width; n.height = rot ? s.width : s.height;
    const g = n.getContext("2d"); g.imageSmoothingEnabled = false;
    g.translate(n.width / 2, n.height / 2);
    if (op === "r90") g.rotate(Math.PI / 2); if (op === "l90") g.rotate(-Math.PI / 2); if (op === "180") g.rotate(Math.PI);
    if (op === "fh") g.scale(-1, 1); if (op === "fv") g.scale(1, -1);
    g.drawImage(s, -s.width / 2, -s.height / 2);
    const cx = flt.x + flt.w / 2, cy = flt.y + flt.h / 2;
    if (rot) { const w = flt.h, h = flt.w; flt.w = w; flt.h = h; flt.x = Math.round(cx - w / 2); flt.y = Math.round(cy - h / 2); }
    flt.c = n; renderCanvas();
  }
  function startTransform() { if (layer !== "art" || !frame()) return; if (flt && !flt.tf) stamp(); if (lift(true)) { tool = "move"; renderTools(); renderCanvas(); status("Transformação: arraste para mover, alças para mudar o tamanho, botão direito para girar/espelhar, Enter aplica, Esc cancela."); } }
  function tfMenu(e) {
    document.querySelectorAll(".ae-tfmenu").forEach((m) => m.remove());
    const m = document.createElement("div"); m.className = "ae-tfmenu";
    m.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:9999;background:var(--panel2,#222);border:1px solid var(--line,#444);border-top:2px solid var(--acc,#d1202b);padding:4px 0;min-width:200px;box-shadow:0 8px 24px rgba(0,0,0,.6)`;
    [["Girar 90° horário", "r90"], ["Girar 90° anti-horário", "l90"], ["Girar 180°", "180"], ["Espelhar na horizontal", "fh"], ["Espelhar na vertical", "fv"], ["-"], ["Aplicar (Enter)", "ok"], ["Cancelar (Esc)", "no"]].forEach(([t, k]) => {
      if (t === "-") { const h = document.createElement("hr"); h.style.cssText = "border:0;border-top:1px solid var(--line,#444);margin:3px 0"; m.appendChild(h); return; }
      const d = document.createElement("div"); d.textContent = t; d.style.cssText = "padding:4px 14px;cursor:pointer";
      d.onmouseenter = () => { d.style.background = "var(--acc,#d1202b)"; }; d.onmouseleave = () => { d.style.background = ""; };
      d.onclick = () => { m.remove(); if (k === "ok") stamp(); else if (k === "no") cancelFloat(); else tfOp(k); };
      m.appendChild(d);
    });
    document.body.appendChild(m);
    setTimeout(() => window.addEventListener("mousedown", function off(ev) { if (!m.contains(ev.target)) { m.remove(); window.removeEventListener("mousedown", off); } }), 0);
  }
  /* balde de troca: a cor clicada vira a cor atual em todos os frames (ou so nesta animacao) */
  function fillAll(x, y) {
    const d = wg.getImageData(x, y, 1, 1).data;
    if (d[3] < 128) { status("Balde de troca: clique numa cor do desenho (o transparente não é trocado)."); return; }
    if (color < 1) { status("Balde de troca: escolha na paleta a cor nova (não o transparente)."); return; }
    const k0 = MD.key(d[0], d[1], d[2]), k1 = A.pal[color - 1]; if (k0 === k1) { status("Balde de troca: a cor clicada já é a cor selecionada na paleta."); return; }
    const [r1, g1, b1] = MD.rgbOfKey(k1), all = el("ae-fa-all").checked;
    let n = 0;
    for (const an of (all ? A.anims : [anim])) for (const f of an.frames) {
      const c = images[f.img].img, dd = c.getContext("2d").getImageData(0, 0, c.width, c.height), D = dd.data; let hit = false;
      for (let i = 0; i < D.length; i += 4) if (D[i + 3] > 127 && MD.key(D[i], D[i + 1], D[i + 2]) === k0) { D[i] = r1; D[i + 1] = g1; D[i + 2] = b1; hit = true; }
      if (!hit) continue;
      const nc = document.createElement("canvas"); nc.width = c.width; nc.height = c.height; nc.getContext("2d").putImageData(dd, 0, 0);
      const id = uid("img_"); SRC[id] = nc.toDataURL(); images[id] = { img: nc }; f.img = id; n++;
    }
    loadFrame(); changed(); renderAll();
    status(`Cor trocada em ${n} frame(s) ${all ? "de todas as animações" : "desta animação"}.`);
  }

  function onDown(e) {
    if (!frame()) return;
    const p = px(e);
    if (flt && flt.tf && e.button === 2) { tfMenu(e); return; }
    if (tool === "move" && layer === "art" && e.button === 0) {
      const q = { x: (e.clientX - el("ae-cv").getBoundingClientRect().left) / zoom, y: (e.clientY - el("ae-cv").getBoundingClientRect().top) / zoom };
      if (flt && flt.tf) {
        const hd = tfCorners().findIndex(([cx, cy]) => Math.abs(q.x - cx) * zoom < 7 && Math.abs(q.y - cy) * zoom < 7);
        if (hd >= 0) { fdragT = { kind: "size", hd, sx: flt.x, sy: flt.y, sw: flt.w, sh: flt.h }; return; }
        if (q.x < flt.x || q.y < flt.y || q.x > flt.x + flt.w || q.y > flt.y + flt.h) { stamp(); return; }   // clicou fora: aplica
      } else if (!lift(false)) return;
      fdragT = { kind: "move", mx: p.x, my: p.y, ox: flt.x, oy: flt.y }; renderCanvas(); return;
    }
    if (flt) stamp();
    if (tool === "fillall" && e.button === 0) { fillAll(p.x, p.y); return; }
    const t = e.button === 2 ? "eraser" : tool;
    if (t === "picker") { color = colorIndexAt(p.x, p.y); renderPal(); return; }
    if (t === "anchor") { const f = frame(); f.ax = p.x; f.ay = p.y; changed(); renderAll(); return; }
    if (t === "hand") { const f = frame(); if (f.hand && f.hand.x === p.x && f.hand.y === p.y) delete f.hand; else f.hand = { x: p.x, y: p.y }; changed(); renderAll(); return; }
    if (t === "fill") {
      if (el("ae-fill-cont").checked) flood(p.x, p.y, color);
      else {   // nao contínuo: todos os pixels daquela cor no frame (dentro da selecao, se houver)
        const W = work.width, H = work.height, d = wg.getImageData(0, 0, W, H), D = d.data, o = (p.y * W + p.x) * 4, c = rgba(color), r = selRect;
        if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) return;
        const tA = D[o + 3] < 128, tk = MD.key(D[o], D[o + 1], D[o + 2]);
        for (let i = 0; i < D.length; i += 4) {
          const x = (i / 4) % W, y = ((i / 4) / W) | 0; if (r && (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h)) continue;
          if (tA ? D[i + 3] < 128 : (D[i + 3] >= 128 && MD.key(D[i], D[i + 1], D[i + 2]) === tk)) { if (c) D.set([c[0], c[1], c[2], 255], i); else D[i + 3] = 0; }
        }
        wg.putImageData(d, 0, 0);
      }
      commit(); return;
    }
    stroke = { tool: t, x0: p.x, y0: p.y, x1: p.x, y1: p.y, lx: p.x, ly: p.y };
    if (t === "select") selRect = null;
    if (t === "pencil" || t === "eraser") setPx(p.x, p.y, t === "eraser" ? 0 : color);
    renderCanvas();
  }
  function onMove(e) {
    if (fdragT && flt) {
      const p = px(e);
      if (fdragT.kind === "move") { flt.x = fdragT.ox + p.x - fdragT.mx; flt.y = fdragT.oy + p.y - fdragT.my; }
      else {   // alca: o canto oposto fica parado
        const q = { x: Math.round((e.clientX - el("ae-cv").getBoundingClientRect().left) / zoom), y: Math.round((e.clientY - el("ae-cv").getBoundingClientRect().top) / zoom) };
        const L = fdragT.hd % 2 === 0, T = fdragT.hd < 2, ox = L ? fdragT.sx + fdragT.sw : fdragT.sx, oy = T ? fdragT.sy + fdragT.sh : fdragT.sy;
        let w = Math.max(1, Math.abs(q.x - ox)), h = Math.max(1, Math.abs(q.y - oy));
        if (e.shiftKey) { const k = Math.max(w / fdragT.sw, h / fdragT.sh); w = Math.max(1, Math.round(fdragT.sw * k)); h = Math.max(1, Math.round(fdragT.sh * k)); }
        flt.w = w; flt.h = h; flt.x = L ? ox - w : ox; flt.y = T ? oy - h : oy;
      }
      renderCanvas(); return;
    }
    if (!stroke) return;
    const p = px(e); stroke.x1 = p.x; stroke.y1 = p.y;
    if (stroke.tool === "pencil" || stroke.tool === "eraser") { line(stroke.lx, stroke.ly, p.x, p.y, stroke.tool === "eraser" ? 0 : color); stroke.lx = p.x; stroke.ly = p.y; }
    renderCanvas();
  }
  function onUp() {
    if (fdragT) { fdragT = null; if (flt && !flt.tf) stamp(); return; }   // mover: solta e cola (cada arraste vira um passo do desfazer)
    if (!stroke) return;
    const s = stroke; stroke = null;
    if (s.tool === "rect" || s.tool === "rectfill") {
      const r = normR(s);
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++)
        if (s.tool === "rectfill" || x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1) setPx(x, y, color);
    }
    if (s.tool === "select") { selRect = normR(s); renderCanvas(); return; }
    if (s.tool === "hit" || s.tool === "hurt") { frame()[s.tool] = normR(s); changed(); renderAll(); return; }
    commit();
  }

  /* copia corpo, golpe ou ancora do frame atual para outros frames.
   * Caixas ficam na mesma posicao em relacao a ancora; a ancora, em relacao ao rodape central do frame. */
  function applyFrom(k, anims) {
    const f = frame(); if (!f) return;
    anims.forEach((an) => an.frames.forEach((g) => {
      if (g === f) return;
      if (k === "anchor") {
        const nx = Math.floor(g.w / 2) + f.ax - Math.floor(f.w / 2), ny = g.h + f.ay - f.h;
        shiftBoxes(g, nx - g.ax, ny - g.ay); g.ax = nx; g.ay = ny;
      } else if (f[k]) g[k] = { ...f[k], x: f[k].x - f.ax + g.ax, y: f[k].y - f.ay + g.ay };
      else delete g[k];
    }));
    changed(); renderAll();
    status(`${{ hurt: "Corpo", hit: "Golpe", anchor: "Âncora" }[k]} aplicado em ${anims.length > 1 ? "todas as animações" : "toda a animação"}.`);
  }
  function rel(b, f) { return b && { ...b, x: b.x - f.ax, y: b.y - f.ay }; }
  function abs(b, f) { return b && { ...b, x: b.x + f.ax, y: b.y + f.ay }; }
  function copy() {
    const f = frame(); if (!f) return;
    if (layer === "box") clip = { kind: "box", hurt: rel(f.hurt, f), hit: rel(f.hit, f) };
    else clip = { kind: "art", img: f.img, w: f.w, h: f.h, ax: f.ax, ay: f.ay, hurt: rel(f.hurt, f), hit: rel(f.hit, f) };
    status(layer === "box" ? "Caixas copiadas." : "Sprite copiado.");
  }
  function paste() {
    if (!clip || !anim) return;
    let f = frame();
    if (clip.kind === "art") {
      if (!f) { f = { img: clip.img, w: clip.w, h: clip.h, ax: clip.ax, ay: clip.ay, hold: 0, hurt: abs(clip.hurt, clip), hit: abs(clip.hit, clip) }; anim.frames.push(f); fi = anim.frames.length - 1; }
      else { const hb = rel(f.hurt, f), kb = rel(f.hit, f); Object.assign(f, { img: clip.img, w: clip.w, h: clip.h, ax: clip.ax, ay: clip.ay }); f.hurt = abs(hb, f); f.hit = abs(kb, f); }
      ["hurt", "hit"].forEach((k) => { if (!f[k]) delete f[k]; });
    } else {
      if (!f) return;
      ["hurt", "hit"].forEach((k) => { if (clip[k]) f[k] = abs(clip[k], f); else delete f[k]; });
    }
    loadFrame(); changed(); renderAll();
  }
  function delFrame() { if (!frame()) return; anim.frames.splice(fi, 1); fi = Math.max(0, fi - 1); loadFrame(); changed(); renderAll(); }
  function shiftBoxes(f, dx, dy) { ["hit", "hurt"].forEach((k) => { if (f[k]) { f[k].x += dx; f[k].y += dy; } }); }
  function crop(r) {
    const f = frame(); if (!f || !r) return;
    r = { x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(r.w, work.width - r.x), h: Math.min(r.h, work.height - r.y) };
    const n = document.createElement("canvas"); n.width = r.w; n.height = r.h;
    n.getContext("2d").drawImage(work, -r.x, -r.y);
    work = n; wg = n.getContext("2d");
    f.ax -= r.x; f.ay -= r.y; shiftBoxes(f, -r.x, -r.y);
    selRect = null; commit();
  }
  function resizeFrame(W, H) {
    const f = frame(); if (!f) return;
    // mantem a ancora no mesmo lugar relativo ao rodape central
    const dx = Math.round((W - work.width) / 2), dy = H - work.height;
    const n = document.createElement("canvas"); n.width = W; n.height = H;
    n.getContext("2d").drawImage(work, dx, dy);
    work = n; wg = n.getContext("2d"); f.ax += dx; f.ay += dy; shiftBoxes(f, dx, dy); commit();
  }
  function trimAll() {
    A.anims.forEach((an) => an.frames.forEach((f) => {
      const c = images[f.img].img, d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 127) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      if (x1 < 0) return;
      const n = document.createElement("canvas"); n.width = x1 - x0 + 1; n.height = y1 - y0 + 1;
      n.getContext("2d").drawImage(c, -x0, -y0);
      const id = uid("img_"); SRC[id] = n.toDataURL(); images[id] = { img: n };
      f.img = id; f.w = n.width; f.h = n.height; f.ax -= x0; f.ay -= y0; shiftBoxes(f, -x0, -y0);
    }));
    loadFrame(); changed(); renderAll();
  }

  /* ---------------------------------------------------- importar */
  async function importImages() {
    pickImages(true, async (srcs) => {
      if (!anim) return;
      const fresh = [];
      for (const s of srcs) { const f = await addImageFrame(s); anim.frames.push(f); fresh.push(f); }
      fi = anim.frames.length - 1;
      const transp = await guessTransparent(srcs[0]);
      await convertAll(transp, fresh);
    });
  }
  /* se a imagem nao tem transparencia, o pixel do canto e o fundo (folhas ripadas usam verde/magenta) */
  async function guessTransparent(src) {
    const im = await loadImage(src); const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
    const cg = c.getContext("2d"); cg.drawImage(im, 0, 0); const d = cg.getImageData(0, 0, 1, 1).data;
    return d[3] > 127 ? [d[0], d[1], d[2]] : null;
  }
  function importSheet() {
    pickImages(false, async ([src]) => {
      if (!anim) return;
      const im = await loadImage(src);
      const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
      const cg = c.getContext("2d"); cg.drawImage(im, 0, 0);
      const mode = prompt("Como cortar a folha?\n\n1 = automático (separa cada sprite pelo fundo)\n2 = grade (informe largura x altura do frame, ex.: 64x64)", "1");
      if (!mode) return;
      let boxes = [];
      const corner = cg.getImageData(0, 0, 1, 1).data, bg = corner[3] > 127 ? [corner[0], corner[1], corner[2]] : null;
      if (mode.trim() === "1") boxes = autoBoxes(cg.getImageData(0, 0, im.width, im.height), bg);
      else {
        const m = (mode.trim() === "2" ? prompt("Tamanho do frame (LxA):", "64x64") : mode).match(/(\d+)\s*[x×]\s*(\d+)/);
        if (!m) return;
        const fw = +m[1], fh = +m[2];
        for (let y = 0; y + fh <= im.height; y += fh) for (let x = 0; x + fw <= im.width; x += fw) boxes.push({ x, y, w: fw, h: fh });
      }
      const pick = prompt(`${boxes.length} frames encontrados.\nQuais entram nesta animação? (ex.: 1-6 ou 3,4,9) — vazio = todos`, "");
      let sel = boxes.map((_, i) => i);
      if (pick && pick.trim()) {
        sel = [];
        pick.split(",").forEach((p) => { const r = p.trim().split("-").map(Number); if (r.length === 2) for (let i = r[0]; i <= r[1]; i++) sel.push(i - 1); else if (r[0]) sel.push(r[0] - 1); });
      }
      const fresh = [];
      for (const i of sel) {
        const b = boxes[i]; if (!b) continue;
        const n = document.createElement("canvas"); n.width = b.w; n.height = b.h;
        n.getContext("2d").drawImage(c, -b.x, -b.y);
        const f = await addImageFrame(n.toDataURL()); anim.frames.push(f); fresh.push(f);
      }
      fi = anim.frames.length - 1;
      await convertAll(bg, fresh);
    });
  }
  /* separa sprites de uma folha: pixels diferentes do fundo, agrupados com folga de 2 px */
  function autoBoxes(d, bg) {
    const W = d.width, H = d.height, D = d.data, solid = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const a = D[i * 4 + 3];
      solid[i] = a > 127 && !(bg && Math.abs(D[i * 4] - bg[0]) < 8 && Math.abs(D[i * 4 + 1] - bg[1]) < 8 && Math.abs(D[i * 4 + 2] - bg[2]) < 8) ? 1 : 0;
    }
    const seen = new Uint8Array(W * H), out = [], G = 2;
    for (let s = 0; s < W * H; s++) {
      if (!solid[s] || seen[s]) continue;
      let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0; const st = [s]; seen[s] = 1;
      while (st.length) {
        const i = st.pop(), x = i % W, y = (i / W) | 0; n++;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        for (let dy = -G; dy <= G; dy++) for (let dx = -G; dx <= G; dx++) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx; if (solid[j] && !seen[j]) { seen[j] = 1; st.push(j); }
        }
      }
      if (n > 20) out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
    out.sort((a, b) => (Math.floor(a.y / 40) - Math.floor(b.y / 40)) || a.x - b.x);
    return out;
  }

  /* ---------------------------------------------------- ligacoes */
  function bind() {
    el("ae-close").onclick = close;
    el("ae-rare").onclick = () => {
      if (!work) return;
      const wasOn = rareKey >= 0;
      const d = wg.getImageData(0, 0, work.width, work.height).data, m = new Map();
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) { const k = MD.key(d[i], d[i + 1], d[i + 2]); m.set(k, (m.get(k) || 0) + 1); }
      if (!m.size) return;
      const list = [...m].sort((a, b) => a[1] - b[1]), off = list.filter(([k]) => !A.pal.includes(k));
      // ordem: primeiro as cores fora da paleta, depois da mais rara para a mais comum; cada clique passa para a proxima (depois da ultima, desliga)
      const order = [...off, ...list.filter(([k]) => A.pal.includes(k))];
      const pos = rareKey >= 0 ? order.findIndex(([k]) => k === rareKey) + 1 : 0;
      if (pos >= Math.min(order.length, 6)) { rareKey = -1; el("ae-rare").classList.remove("on"); renderCanvas(); status(""); return; }
      const [k, n] = order[pos];
      const isOff = !A.pal.includes(k);
      rareKey = k; el("ae-rare").classList.add("on");
      const rgb = MD.rgbOfKey(k);
      status(`${pos + 1}/${Math.min(order.length, 6)} · ${isOff ? "Cor FORA da paleta" : "Cor rara"}: R${(k >> 6) & 7} G${(k >> 3) & 7} B${k & 7} (rgb ${rgb.join(",")}) em ${n} pixel(s)` + (list.length > 1 ? ` · próximas: ${list.slice(off.length ? 0 : 1, 4).filter(([q]) => q !== k).map(([q, c]) => `${(q >> 6) & 7}${(q >> 3) & 7}${q & 7}×${c}`).join(", ")}` : ""));
      const blink = () => { if (rareKey < 0 || !isOpen()) return; renderCanvas(); setTimeout(blink, 260); }; if (!wasOn) blink();
    };
    el("ae-bgm").onclick = () => { bgMode = { checker: "green", green: "pink", pink: "checker" }[bgMode]; el("ae-bgm").textContent = { checker: "▦", green: "■", pink: "■" }[bgMode]; el("ae-bgm").style.color = { checker: "", green: "#00ff00", pink: "#ff00ff" }[bgMode]; renderCanvas(); };
    root.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => { if (flt) stamp(); tool = b.dataset.t; renderTools(); });
    const cvs = el("ae-cv");
    cvs.addEventListener("mousedown", onDown);
    cvs.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("mousemove", (e) => isOpen() && onMove(e));
    window.addEventListener("mouseup", () => isOpen() && onUp());
    el("ae-prev").addEventListener("wheel", (e) => { e.preventDefault(); const f = frame(); const auto = f ? Math.max(1, Math.floor(Math.min(210 / f.w, 200 / f.h))) : 1; prevZoom = Math.max(1, Math.min(12, (prevZoom || auto) + (e.deltaY < 0 ? 1 : -1))); }, { passive: false });
    el("ae-prev").addEventListener("dblclick", () => { prevZoom = 0; });
    el("ae-wrap").addEventListener("wheel", (e) => { e.preventDefault(); zoom = Math.max(1, Math.min(24, zoom + (e.deltaY < 0 ? 1 : -1))); renderCanvas(); }, { passive: false });
    el("ae-add-anim").onclick = () => {
      const miss = (A.kind === "weapon" ? ["ground", ...SLOTS] : SLOTS).filter((s) => !A.anims.some((x) => x.name === s));
      const n = prompt(`Nome da animação. As que o motor usa e este ator ainda não tem:\n${miss.join(", ")}\n\njump_fall = queda do pulo · flying_kick = voadora · knockback = arremessado · throw = arremessar · shoot = atirar`, miss[0] || "nova");
      if (!n) return; anim = { id: uid("an_"), name: n, speed: 10, loop: false, frames: [] }; A.anims.push(anim); fi = 0; loadFrame(); changed(); renderAll(); };
    el("ae-crop").onclick = () => selRect ? crop(selRect) : status("Use a ferramenta Seleção (⬚) para marcar a área.");
    el("ae-trim").onclick = trimAll;
    el("ae-box-clear").onclick = () => { const f = frame(); if (!f) return; delete f.hit; delete f.hurt; changed(); renderAll(); };
    el("ae-grid").onclick = () => { showGrid = !showGrid; renderCanvas(); };
    el("ae-resize").onclick = () => resizeFrame(Math.max(1, Math.min(248, +el("ae-w").value)), Math.max(1, Math.min(248, +el("ae-h").value)));
    el("ae-f-new").onclick = () => {
      const f0 = frame(), w = f0 ? f0.w : 48, h = f0 ? f0.h : 64;
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      addImageFrame(c.toDataURL(), f0 ? f0.ax : w >> 1, f0 ? f0.ay : h - 1).then((f) => { const at = anim.frames.length ? fi + 1 : 0; anim.frames.splice(at, 0, f); fi = at; loadFrame(); changed(); renderAll(); });
    };
    el("ae-f-imp").onclick = importImages;
    el("ae-f-sheet").onclick = importSheet;
    el("ae-f-dup").onclick = () => { const f = frame(); if (!f) return; anim.frames.splice(fi + 1, 0, { ...f }); fi = fi + 1; loadFrame(); changed(); renderAll(); };
    el("ae-f-del").onclick = delFrame;
    el("ae-copy").onclick = copy;
    el("ae-paste").onclick = paste;
    el("ae-f-left").onclick = () => { if (fi < 1) return; const fr = anim.frames; [fr[fi - 1], fr[fi]] = [fr[fi], fr[fi - 1]]; fi--; changed(); renderAll(); };
    el("ae-f-right").onclick = () => { const fr = anim.frames; if (fi >= fr.length - 1) return; [fr[fi + 1], fr[fi]] = [fr[fi], fr[fi + 1]]; fi++; changed(); renderAll(); };
    el("ae-conv").onclick = () => convertAll(null);
    el("ae-clear-ph").onclick = clearPlaceholders;
    el("ae-restore").onclick = () => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".zip"; inp.onchange = () => inp.files[0] && restoreFromPack(inp.files[0]); inp.click(); };
    window.addEventListener("keydown", (e) => {
      if (!isOpen() || e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "t") { e.preventDefault(); startTransform(); return; }
      if (flt && flt.tf && e.key === "Enter") { e.preventDefault(); stamp(); return; }
      if (flt && e.key === "Escape") { e.preventDefault(); cancelFloat(); return; }
      if (tool === "move" && layer === "art" && !mod && e.key.startsWith("Arrow") && frame()) {   // setas: move 1 px (Shift: 8 px)
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key], s = e.shiftKey ? 8 : 1;
        e.preventDefault(); const was = flt && flt.tf;
        if (!lift(false)) return; flt.x += d[0] * s; flt.y += d[1] * s; if (was) renderCanvas(); else stamp(); return;
      }
      const k = { b: "pencil", e: "eraser", i: "picker", g: e.shiftKey ? "fillall" : "fill", r: e.shiftKey ? "rectfill" : "rect", m: "select", v: "move", a: "anchor", h: "hurt", k: "hit", j: "hand" }[e.key.toLowerCase()];
      if (k && !mod && flt) stamp();
      if (k && !mod) { tool = k; renderTools(); }
      if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); copy(); }
      if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); paste(); }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (flt) { flt = null; commit(); return; }   // apaga os pixels flutuando
        if (selRect && layer === "art") { wg.clearRect(selRect.x, selRect.y, selRect.w, selRect.h); selRect = null; commit(); }
        else if (layer === "box") { const f = frame(); if (f && (f.hurt || f.hit)) { delete f.hurt; delete f.hit; changed(); renderAll(); } }
        else delFrame();
        return;
      }
      if (tool === "anchor" && e.shiftKey && frame() && e.key.startsWith("Arrow")) {
        const f = frame(), d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        f.ax += d[0]; f.ay += d[1]; e.preventDefault(); changed(); renderAll(); return;
      }
      if (e.key === "Escape") { if (selRect) { selRect = null; renderCanvas(); } else close(); }
      if (e.key === "ArrowLeft" && anim && fi > 0) { fi--; loadFrame(); renderAll(); }
      if (e.key === "ArrowRight" && anim && fi < anim.frames.length - 1) { fi++; loadFrame(); renderAll(); }
    });
    renderTools();
  }

  return { open, close, isOpen, reload };
})();
window.AnimEditor = AnimEditor;

/* ------------------------------------------------------------- drops
 * Cada objeto destrutivel / inimigo tem a sua lista: item marcado + chance.
 * Ao ser destruido sorteia UM numero de 0 a 99: os itens dividem essa faixa,
 * entao a soma das chances vai no maximo a 100 e cai no maximo um item.
 * O que sobra ate 100 e a chance de nao cair nada. */
function dropTotal(src) { return (src.drops || []).reduce((s, d) => s + d.chance, 0); }
function dropEditor(src, box) {
  src.drops = (src.drops || []).filter((d) => P.actors[d.item]);
  const h = document.createElement("h4"); h.textContent = "Drops (o que cai ao destruir)"; box.appendChild(h);
  const items = Object.values(P.actors).filter((x) => x.kind === "item" || x.kind === "weapon");
  if (!items.length) { const d = document.createElement("div"); d.className = "hint"; d.textContent = "Crie um ator do tipo Item primeiro."; box.appendChild(d); return; }
  items.forEach((it) => {
    const dr = src.drops.find((d) => d.item === it.id);
    const row = document.createElement("div"); row.className = "drop-row";
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!dr;
    const name = document.createElement("span"); name.innerHTML = ICON("item", 13) + " " + esc(it.name);
    const pct = document.createElement("input"); pct.type = "number"; pct.min = 1; pct.max = 100; pct.disabled = !dr; pct.value = dr ? dr.chance : "";
    const pc = document.createElement("span"); pc.textContent = "%";
    cb.onchange = () => {
      if (cb.checked) {
        const free = 100 - dropTotal(src);
        if (free <= 0) { alert("As chances já somam 100%. Diminua outro item antes."); cb.checked = false; return; }
        src.drops.push({ item: it.id, chance: Math.min(free, 50) });
      } else src.drops = src.drops.filter((d) => d.item !== it.id);
      changed();
    };
    pct.onchange = () => {
      const d = src.drops.find((x) => x.item === it.id); if (!d) return;
      const others = dropTotal(src) - d.chance;
      let v = Math.round(Number(pct.value) || 1);
      if (v + others > 100) { v = 100 - others; status(`Limitado a ${v}%: a soma das chances não passa de 100%.`); }
      d.chance = Math.max(1, v); changed();
    };
    row.append(cb, name, pct, pc); box.appendChild(row);
  });
  const t = dropTotal(src);
  const sum = document.createElement("div"); sum.className = "hint";
  sum.innerHTML = `Total: <b style="color:${t > 100 ? "var(--bad)" : "var(--text)"}">${t}%</b> · nada cai: ${Math.max(0, 100 - t)}%`;
  box.appendChild(sum);
  const tip = document.createElement("div"); tip.className = "hint";
  tip.textContent = "Cai no máximo um item por vez. Ex.: frango 10% + maçã 30% = 10% frango, 30% maçã, 60% nada.";
  box.appendChild(tip);
}
/* no item: de onde ele pode cair (editado em cada objeto/inimigo) */
function droppedBy(it, box) {
  const list = Object.values(P.actors).filter((s) => DROP_SOURCES.includes(s.kind))
    .flatMap((s) => (s.drops || []).filter((d) => d.item === it.id).map((d) => `${s.name}: ${d.chance}%`));
  const h = document.createElement("h4"); h.textContent = "Cai de"; box.appendChild(h);
  const d = document.createElement("div"); d.className = "hint";
  d.textContent = list.length ? list.join(" · ") : "Nenhum objeto ou inimigo. Marque este item nos drops deles.";
  box.appendChild(d);
}
/* projetos antigos: drops ficavam no item -> passam para as fontes */
function migrateDrops() {
  Object.values(P.actors).forEach((it) => {
    if (it.kind !== "item" || !it.props.drops) return;
    it.props.drops.forEach((d) => {
      const s = P.actors[d.source]; if (!s) return;
      s.drops = s.drops || [];
      if (!s.drops.find((x) => x.item === it.id)) s.drops.push({ item: it.id, chance: Math.min(d.chance, 100 - dropTotal(s)) });
    });
    delete it.props.drops; delete it.props.placement;
  });
}

