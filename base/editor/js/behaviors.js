/* SG Engine - comportamentos plugaveis do inimigo.
 * Um arquetipo (so um por inimigo) + modificadores. Cada peca diz o que precisa (animacoes, golpes)
 * e o editor avisa quando algo nao encaixa. */
"use strict";

const ARCHETYPES = {
  chaser: { code: 0, name: "Perseguidor", icon: "enemy", color: "#d1202b", desc: "Peão básico: rastreia, alinha na profundidade, encurta a distância e ataca. Forma a multidão.", params: [], anims: [] },
  flanker: { code: 1, name: "Flanqueador", icon: "transition", color: "#e07b24", desc: "Bate e corre: não fica alinhado sem a vez, ataca com golpes longos e recua logo depois.",
    params: [["retreat", "Tempo recuando (quadros)", 40, 10, 120]], anims: [] },
  zoner: { code: 2, name: "Atirador", icon: "hit", color: "#d9a441", desc: "Mantém distância: alinha de longe e foge se o jogador chega perto. Precisa de um golpe de Projétil (faca, revólver, chicote).",
    params: [["dist", "Distância que mantém (px)", 100, 40, 250, 2]], anims: [], needsProj: true },
  tank: { code: 3, name: "Tanque", icon: "boss", color: "#8e5bd8", desc: "Lento e resistente: armadura (golpes comuns não o fazem parar) e agarra o jogador.",
    params: [["action", "Ao agarrar", "hold", { hold: "Segura (os outros batem)", punch: "Segura e dá um socão que derruba", suplex: "Dá um balão (joga para trás)" }],
      ["escape", "Apertos de ataque para escapar", 8, 1, 30], ["grab", "Chance de agarrar (%)", 60, 0, 100], ["dmg", "Dano do socão / balão", 10, 0, 99]],
    anims: ["grab"], playerAnims: ["grabbed"] },
  defensive: { code: 4, name: "Defensivo", icon: "object", color: "#3aa0d8", desc: "Quebra combos: bloqueia o 1º golpe com uma chance e contra-ataca; antiaéreo se o jogador pula perto.",
    params: [["block", "Chance de bloquear (%)", 35, 0, 100], ["counter", "Contra-ataque", "", "atk"], ["antiair", "Antiaéreo", "", "atk"]], anims: ["block"] },
  chaotic: { code: 5, name: "Caótico", icon: "flag", color: "#3fbf6a", desc: "Começa calmo; quando apanha fica furioso e joga bombas (ou dinamite) que pegam em todo mundo.",
    params: [["bomb", "Golpe da bomba (Projétil)", "", "proj"]], anims: ["throw"], needsProj: true },
  patrol: { code: 7, platOnly: true, name: "Patrulheiro", icon: "enemy", color: "#c0703a", desc: "Plataforma: anda de um lado para o outro e vira na beirada e na parede. Se vê o jogador no mesmo nível, vai até ele e bate.",
    params: [["see", "Distância que enxerga (px)", 120, 20, 250, 2], ["wait", "Espera depois de um combo (quadros; 60 = 1 s)", 120, 0, 250, 2]], anims: ["walk"] },
  pshooter: { code: 8, platOnly: true, name: "Atirador (se esconde)", icon: "flag", color: "#d9a441", desc: "Plataforma: fica parado e atira quando o jogador está na linha. Entre um tiro e outro se abaixa (usa crouch, se tiver).",
    params: [["range", "Alcance (px)", 200, 40, 250, 2], ["hide", "Tempo abaixado entre tiros (quadros)", 40, 0, 200]], anims: ["crouch"], needsProj: true },
  pchaser: { code: 9, platOnly: true, name: "Perseguidor que pula", icon: "enemy", color: "#d1202b", desc: "Plataforma: corre atrás do jogador, pula parede e buraco, desce quando o jogador está embaixo e pula para alcançar quando ele está em cima.",
    params: [], anims: ["walk", "jump"] },
  turret: { code: 10, platOnly: true, name: "Torreta", icon: "camera", color: "#7a8cff", desc: "Plataforma: não anda; mira no jogador em 8 direções (frente, diagonal, cima, baixo) e atira.",
    params: [["range", "Alcance (px)", 200, 40, 250, 2], ["rate", "Intervalo entre tiros (quadros)", 60, 10, 250]], anims: ["shoot"], needsProj: true },
  flyer: { code: 11, platOnly: true, name: "Voador", icon: "transition", color: "#4fc3a0", desc: "Plataforma: sem gravidade; voa até um ponto acima do jogador, balança e ataca (atira se tiver golpe de Projétil, senão bate de perto). Quando apanha forte, cai.",
    params: [["height", "Altura acima do jogador (px)", 40, 0, 120]], anims: ["walk"] },
  dummy: { code: 6, name: "Parado (saco de pancada)", icon: "enemy", color: "#8a8f99", desc: "Não anda e não ataca: só olha para o jogador e apanha (energia, hurt, hurt_low, derrubada, levantar). Bom para testar golpes, tiros e a distância da queda.", params: [], anims: [] },
};
const MODIFIERS = {
  strafe: { name: "Rodeia (sobe e desce)", desc: "Enquanto espera a vez, anda para cima e para baixo em volta do jogador.", noWith: ["zoner"] },
  flank: { name: "Ataca por trás", desc: "Quando é a vez dele, contorna o jogador para bater nas costas.", noWith: ["zoner", "chaotic"] },
  friendly: { name: "Fogo amigo", desc: "Projéteis e bombas dele também acertam outros inimigos.", needs: "proj" },
  weapons: { name: "Pega armas", desc: "Pega armas do chão (chega na etapa das armas).", soon: true },
};
/* animacoes especiais (aparecem destacadas no editor de animacoes) */
function behaviorAnims(a) {
  const b = a.behavior; if (!b) return {};
  const out = {}, A = ARCHETYPES[b.arch];
  if (A) A.anims.forEach((n) => { out[n] = A.name; });
  return out;
}
function playerBehaviorAnims() {
  const out = {};
  Object.values(P.actors).forEach((e) => { const b = e.behavior, A = b && ARCHETYPES[b.arch]; if (A && A.playerAnims) A.playerAnims.forEach((n) => { out[n] = A.name; }); });
  return out;
}
/* animacoes do jogador segurando cada arma (prefixo_idle, _walk, _attack) */
function playerWeaponAnims() {
  const out = {};
  Object.values(P.actors).filter((w) => w.kind === "weapon").forEach((w) => ["idle", "walk", "attack"].forEach((s) => { out[(w.props.prefix || "arma") + "_" + s] = w.name; }));
  return out;
}
function ensureBehavior(a) {
  if (!a.behavior) a.behavior = { arch: "chaser", params: {}, mods: { strafe: !!a.props.strafe, flank: !!a.props.flank, friendly: false } };
  const b = a.behavior; b.params = b.params || {}; b.mods = b.mods || {};
  const A = ARCHETYPES[b.arch] || ARCHETYPES.chaser;
  A.params.forEach(([k, , d]) => { if (b.params[k] === undefined) b.params[k] = d; });
  a.props.strafe = !!b.mods.strafe; a.props.flank = !!b.mods.flank;
  return b;
}
/* problemas de encaixe */
function behaviorIssues(a) {
  const b = ensureBehavior(a), A = ARCHETYPES[b.arch], out = [];
  const hasProj = (a.attacks || []).some((k) => k.type === "projectile" && P.actors[k.proj]);
  const has = (n) => a.anims.some((x) => x.name === n && x.frames.length);
  if (A.needsProj && !hasProj) out.push(`${A.name} precisa de um golpe do tipo Projétil com projétil escolhido.`);
  A.anims.forEach((n) => { if (!has(n)) out.push(`${A.name}: desenhe a animação "${n}".`); });
  if (A.playerAnims) { const pl = Object.values(P.actors).find((x) => x.kind === "player"); A.playerAnims.forEach((n) => { if (pl && !pl.anims.some((x) => x.name === n && x.frames.length)) out.push(`${A.name}: o jogador precisa da animação "${n}" (sendo agarrado).`); }); }
  Object.entries(b.mods).forEach(([k, on]) => {
    const M = MODIFIERS[k]; if (!on || !M) return;
    if (M.noWith && M.noWith.includes(b.arch)) out.push(`"${M.name}" não combina com ${A.name}.`);
    if (M.needs === "proj" && !hasProj) out.push(`"${M.name}" só faz sentido com golpe de Projétil.`);
  });
  if (b.arch === "defensive") ["counter", "antiair"].forEach((k) => { const v = b.params[k]; if (v && !(a.attacks || []).some((x) => x.id === v)) out.push("Defensivo: escolha de novo o golpe (o anterior foi apagado)."); });
  if (b.arch === "chaotic" && !(a.attacks || []).some((x) => x.id === b.params.bomb && x.type === "projectile")) out.push("Caótico: escolha qual golpe de Projétil é a bomba.");
  return out;
}

const BehaviorEditor = (() => {
  let root = null, A = null;
  function open(id) {
    A = P.actors[id]; ensureBehavior(A);
    if (!root) { root = document.createElement("div"); root.className = "modal"; document.body.appendChild(root); }
    root.classList.remove("hidden"); render();
  }
  function close() { root.classList.add("hidden"); A = null; refresh(); }
  function render() {
    const b = ensureBehavior(A), issues = behaviorIssues(A);
    const card = (k, d, on, kind) => `<div class="bh-card ${on ? "on" : ""} ${d.soon ? "soon" : ""}" draggable="${!d.soon}" data-${kind}="${k}" style="--c:${d.color || "#8d877c"}">
        <div class="bh-t">${d.icon ? ICON(d.icon) : ""}${esc(d.name)}${d.soon ? " <small>(em breve)</small>" : ""}</div><div class="bh-d">${esc(d.desc)}</div></div>`;
    const Arch = ARCHETYPES[b.arch];
    root.innerHTML = `<div class="modal-box bh-box">
      <div class="modal-head"><span>${ICON("enemy")} ${esc(A.name)} — comportamentos</span><button class="x" title="Fechar (Esc)">${ICON("close")}</button></div>
      <div class="bh-wrap">
        <div class="bh-lib">
          <div class="bh-h">Arquétipos <small>(um por inimigo)</small></div>
          ${Object.entries(ARCHETYPES).filter(([, d]) => !d.platOnly || isPlat()).map(([k, d]) => card(k, d, b.arch === k, "arch")).join("")}
          <div class="bh-h">Modificadores</div>
          ${Object.entries(MODIFIERS).map(([k, d]) => card(k, d, !!b.mods[k], "mod")).join("")}
        </div>
        <div class="bh-main">
          <div class="bh-drop" title="Arraste comportamentos para cá">
            <div class="bh-actor"><canvas width="96" height="96"></canvas><b>${esc(A.name)}</b></div>
            <div class="bh-slots">
              <div class="bh-slot arch" style="--c:${Arch.color}"><span>Arquétipo</span><b>${ICON(Arch.icon)} ${esc(Arch.name)}</b></div>
              ${Object.entries(b.mods).filter(([, on]) => on).map(([k]) => `<div class="bh-slot mod"><span>Modificador</span><b>${esc(MODIFIERS[k].name)}</b><button data-unplug="${k}" title="Tirar">×</button></div>`).join("") || `<div class="bh-slot empty">Arraste modificadores para cá</div>`}
            </div>
          </div>
          <div class="bh-issues ${issues.length ? "bad" : "ok"}">${issues.length ? "⚠ " + issues.map(esc).join("<br>⚠ ") : "✓ Tudo encaixado."}</div>
          <div class="bh-params"></div>
          ${Arch.anims.length || Arch.playerAnims ? `<div class="hint">Animações especiais deste comportamento (aparecem em destaque no editor de animações): ${[...Arch.anims.map((n) => `<b class="bh-an">${n}</b>`), ...(Arch.playerAnims || []).map((n) => `<b class="bh-an">${n}</b> (no jogador)`)].join(", ")}</div>` : ""}
        </div>
      </div></div>`;
    root.querySelector(".x").onclick = close;
    // retrato
    const f = actorThumbFrame(A), cv = root.querySelector(".bh-actor canvas");
    if (f && images[f.img]) { const g = cv.getContext("2d"), im = images[f.img].img, s = Math.min(90 / im.width, 90 / im.height, 2); g.imageSmoothingEnabled = false; g.drawImage(im, (96 - im.width * s) / 2, 96 - im.height * s, im.width * s, im.height * s); }
    // plugar: clique ou arraste
    const plugArch = (k) => { b.arch = k; ensureBehavior(A); addAnims(); changed(); render(); };
    const plugMod = (k) => { if (MODIFIERS[k].soon) return; b.mods[k] = !b.mods[k]; ensureBehavior(A); changed(); render(); };
    root.querySelectorAll("[data-arch]").forEach((c) => { c.onclick = () => plugArch(c.dataset.arch); c.ondragstart = (e) => e.dataTransfer.setData("text", "arch:" + c.dataset.arch); });
    root.querySelectorAll("[data-mod]").forEach((c) => { c.onclick = () => plugMod(c.dataset.mod); c.ondragstart = (e) => e.dataTransfer.setData("text", "mod:" + c.dataset.mod); });
    const drop = root.querySelector(".bh-drop");
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); const [t, k] = e.dataTransfer.getData("text").split(":"); if (t === "arch") plugArch(k); else if (t === "mod" && !b.mods[k]) plugMod(k); };
    root.querySelectorAll("[data-unplug]").forEach((x) => x.onclick = () => { b.mods[x.dataset.unplug] = false; ensureBehavior(A); changed(); render(); });
    // parametros do arquetipo
    const box = root.querySelector(".bh-params");
    const atkOpts = (onlyProj) => ({ "": "(nenhum)", ...Object.fromEntries((A.attacks || []).filter((k) => !onlyProj || k.type === "projectile").map((k) => [k.id, k.name])) });
    Arch.params.forEach(([k, label, d, a1, a2]) => {
      let row;
      if (a1 === "atk" || a1 === "proj") row = fieldRow(label, b.params, k, "select", atkOpts(a1 === "proj"));
      else if (typeof a1 === "object") row = fieldRow(label, b.params, k, "select", a1);
      else row = fieldRow(label, b.params, k, "number", { min: a1, max: a2 });
      row.querySelector("select, input").addEventListener("change", () => setTimeout(render, 0));
      box.appendChild(row);
    });
    if (!Arch.params.length) box.innerHTML = `<div class="hint">Sem ajustes: usa velocidade, reação, agressividade e golpes das propriedades.</div>`;
  }
  /* coloca no ator as animacoes que o comportamento usa */
  function addAnims() {
    const Arch = ARCHETYPES[A.behavior.arch];
    Arch.anims.forEach((n) => { if (!A.anims.some((x) => x.name === n)) A.anims.push({ id: uid("an_"), name: n, speed: 10, loop: false, frames: [] }); });
    if (Arch.playerAnims) Object.values(P.actors).filter((x) => x.kind === "player").forEach((pl) => Arch.playerAnims.forEach((n) => { if (!pl.anims.some((x) => x.name === n)) pl.anims.push({ id: uid("an_"), name: n, speed: 8, loop: true, frames: [] }); }));
  }
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && root && !root.classList.contains("hidden")) close(); });
  return { open };
})();

/* ======================================================================
 * Habilidades plugaveis do jogador. Cada uma liga um recurso do motor, pede animacoes
 * (que aparecem em destaque) e mostra quanto de memoria essas animacoes gastam. */
const LEGS_LIST = ["legs_idle", "legs_walk", "legs_run", "legs_jump", "legs_crouch"];
const PLAYER_ABILITIES = {
  run: { name: "Correr", prop: "canRun", color: "#e07b24", desc: "Dois toques rápidos na direção e segurar = corre. Atacar correndo = investida, que derruba.",
    anims: ["run", "run_attack"], params: [["runSpeed", "Velocidade correndo (%)", 170, 100, 400], ["runAttackDamage", "Dano da investida", 10, 0, 99]] },
  grab: { name: "Agarrar", prop: "canGrab", color: "#8e5bd8", desc: "Encostar no inimigo andando contra ele agarra. Ataque bate no inimigo preso (grab_attack, quantos você escolher); para trás + ataque arremessa por cima (grab_throw, o balão). Marque o ponto da mão (J) no grab do herói e no \"grabbed\" do inimigo: a mão dele gruda na do herói.",
    anims: ["grab", "grab_attack", "grab_throw"], params: [["grabHits", "Ataques antes de largar o inimigo", 3, 1, 8], ["grabLastKnock", "O último ataque derruba o inimigo", true, "check"], ["grabDmg", "Dano de cada ataque", 4, 1, 99], ["grabHitStop", "Hit stop no golpe (congela um instante; duração em Impacto)", false, "check"]] },
  special: { name: "Especial", prop: "special", color: "#d1202b", desc: "Golpe que acerta em volta e deixa invencível, custando vida.", anims: ["special"], params: [["specialCost", "Custo em vida", 6, 0, 99]] },
  crouch: { name: "Abaixar", prop: "canCrouch", color: "#3aa0d8", desc: "Só no modo lateral: abaixa e tem golpe abaixado.", anims: ["crouch", "crouch_attack", "crouch_hurt"], params: [], sideOnly: true },
  jumpdepth: { name: "Pular em profundidade", prop: "jumpDepth", optIn: true, color: "#3fbf6a", desc: "No pulo, cima/baixo também move na profundidade (pulo na diagonal). Final Fight não tem: sem ela o pulo só vai para frente e para trás.",
    anims: [], params: [], depthOnly: true },
  weakkick: { notPlat: true, name: "Voadora fraca", prop: "weakKick", optIn: true, color: "#c75fd8", desc: "No pulo, baixo + ataque: joelhada para baixo que não derruba. O inimigo fica atordoado e dá para emendar o combo ao cair (como no Final Fight).",
    anims: ["jump_knee"], params: [["weakKickDamage", "Dano", 5, 0, 99]] },
  ladder: { name: "Subir escadas", prop: "canClimb", color: "#e0c040", desc: "Plataforma: cima/baixo na escada (tile de escada da Colisão) engata e sobe/desce. Pulo solta da escada. Ataque na escada usa climb_shoot.",
    anims: ["climb", "climb_start", "climb_end", "climb_down_start", "climb_shoot"], params: [["climbSpeed", "Velocidade na escada (px por quadro)", 1, 0.25, 4], ["climbExit", "Detector de saída: px antes do topo em que climb_end começa (0 = no topo)", 0, -16, 120], ["climbExitArt", "Saída desenhada: o jogo não move o herói durante climb_end e o põe em cima ao terminar", true, "check"], ["climbDownOff", "Descida pelo alto: ajuste da posição final na escada (px; negativo = mais para cima)", 0, -48, 48], ["climbDownStop", "Descida invertida termina no quadro (1 = toca a climb_end inteira ao contrário)", 1, 1, 60], ["climbDownRev", "Para descer pelo alto da escada, tocar climb_end ao contrário (se não houver climb_down_start)", true, "check"]], platOnly: true },
  hang: { name: "Agarrar na borda", prop: "canHang", color: "#4fc3a0", desc: "Plataforma: pulando com cima apertado perto de uma Borda (tile 6 da Colisão), fica pendurado. Cima sobe, baixo ou pulo solta (estilo Prince of Persia). Baixo duas vezes em cima da borda desce pendurado: desenhe hang_down (a descida, mão marcada em cada quadro); sem ela o jogo toca hang_end e hang_up ao contrário.",
    anims: ["hang", "hang_up", "hang_end", "hang_down"], params: [["hangHeight", "Altura do pé até a mão pendurado (px)", 44, 16, 96], ["hangArt", "Subida desenhada: o jogo não move o herói em hang_up e já o põe no topo ao terminar (a mão fica parada em cada quadro)", true, "check"]], platOnly: true },
  roll: { name: "Rolamento ou dash", prop: "canRoll", color: "#7a8cff", desc: "Plataforma: baixo + pulo rola para a frente, invencível (ou faz um dash: rápido, em pé, sem invencibilidade). Em cima de plataforma atravessável, baixo + pulo desce dela.",
    anims: (p) => [p.rollStyle === "dash" ? "dash" : "roll"], params: [["rollSpeed", "Velocidade (px por quadro)", 3, 0.5, 8], ["rollStyle", "Dash em vez de rolamento", false, "dashcheck"]], platOnly: true },
  fall: { name: "Cair e aterrissar", prop: "fallAnims", color: "#9aa4b0", desc: "Plataforma: jump_fall enquanto cai e land ao tocar o chão depois de uma queda alta (agacha um instante).",
    anims: ["jump_fall", "land"], params: [], platOnly: true },
  inv: { name: "Inventário de armas", prop: "invWeapons", color: "#c0a060", desc: "Plataforma: guarda até 4 armas pegas (cada uma com sua munição/usos). Z (controle de 6 botões) ou Start + ←/→ troca; Start sozinho pausa. Sem munição a arma sai do inventário. Não solta a arma ao apanhar.",
    anims: [], params: [], platOnly: true },
  djump: { name: "Pulo duplo", prop: "doubleJump", optIn: true, color: "#6ad0ff", desc: "Plataforma: aperta o pulo de novo no ar para pular mais uma vez.", anims: ["double_jump"], params: [["djumpForce", "Força do pulo duplo (como a Força do pulo; 0 = 7/8 do pulo normal)", 4.5, 0, 20]], platOnly: true },
  block: { name: "Defesa", prop: "canBlock", optIn: true, color: "#8a9bb0", desc: "Plataforma: segurando Y (controle de 6 botões) ou A (3 botões, se o Especial estiver desligado) ele se defende: golpes e tiros pela frente não tiram vida.", anims: ["block"], params: [], platOnly: true },
  mup: { name: "Golpe para cima / para baixo", prop: "meleeDir", optIn: true, color: "#c58a5a", desc: "Plataforma, de mãos vazias ou com arma branca: cima + ataque bate para cima; no pulo, baixo + ataque bate para baixo. Escolha quais quer.",
    anims: (p) => [...(p.meleeUp !== false ? ["attack_up"] : []), ...(p.meleeDown !== false ? ["attack_down"] : [])], params: [["meleeUp", "Para cima", true, "check"], ["meleeDown", "Para baixo (no pulo)", true, "check"], ["meleePogo", "Quica ao acertar para baixo (pogo)", false, "check"]], platOnly: true },
  mirror: { name: "Espelhar ao virar", prop: "mirrorOn", color: "#999", desc: "Todas as animações são desenhadas olhando para a direita e o Mega Drive espelha sozinho para a esquerda (não gasta memória). Desligue só se o personagem não puder virar.", anims: [], params: [] },
  prejump: { name: "Impulso do pulo (pré-pulo)", prop: "preJump", optIn: true, color: "#e0a050", desc: "Ao apertar pular, toca pre_jump com ele ainda no chão (o impulso) e só então sai do chão, como a transição idle → walk. Escolha em qual quadro ele decola; 0 = no fim da animação.",
    anims: ["pre_jump"], params: [["preJumpFrame", "Decola no quadro (0 = no fim da animação)", 0, 0, 60]] },
  melee: { name: "Armas brancas", prop: "pickMelee", color: "#b0b6c0", desc: "Pega cano, faca, taco… A arma vai na mão: marque o ponto da mão (J) nos quadros do jogador.", anims: [], params: [], needsHand: true },
  gun: { name: "Armas de fogo", prop: "pickGun", color: "#d9a441", desc: "Pega revólver e metralhadora. Pode ter animações próprias segurando, andando e atirando.",
    anims: ["gun_idle", "gun_walk", "gun_shoot"], animsProp: "gunAnims", params: [["gunAnims", "Animações próprias (gun_idle, gun_walk, gun_shoot)", true, "check"]], needsHand: true },
};
function abAvail(d) { return !(d.sideOnly && hasDepth()) && !(d.depthOnly && !hasDepth()) && !(d.platOnly && !isPlat()) && !(d.notPlat && isPlat()); }
function abilityOn(a, k) { const d = PLAYER_ABILITIES[k]; return (d.optIn ? a.props[d.prop] === true : a.props[d.prop] !== false) && abAvail(d); }
function abilityAnimList(a, k) {
  const d = PLAYER_ABILITIES[k];
  if (typeof d.anims === "function") return d.anims(a.props);
  return d.animsProp && a.props[d.animsProp] === false ? [] : d.anims;
}
function abilityAnims(a) {
  const out = {};
  Object.keys(PLAYER_ABILITIES).forEach((k) => { if (abilityOn(a, k)) abilityAnimList(a, k).forEach((n) => { out[n] = PLAYER_ABILITIES[k].name; }); });
  return out;
}
/* bytes estimados das animacoes (tiles 4bpp de 32 bytes; quadros vazios contam pouco) */
function animBytes(a, names) {
  let t = 0;
  a.anims.filter((x) => names.includes(x.name)).forEach((an) => an.frames.forEach((f) => { t += Math.ceil(f.w / 8) * Math.ceil(f.h / 8) * 32 + 40; }));
  return t;
}
function abilityIssues(a) {
  const out = [], has = (n) => a.anims.some((x) => x.name === n && x.frames.length);
  Object.entries(PLAYER_ABILITIES).forEach(([k, d]) => {
    if (!abilityOn(a, k)) return;
    abilityAnimList(a, k).forEach((n) => { if (!has(n) && !["run_attack", "crouch_attack", "grab_attack", "grab_throw", "crouch_hurt", "hang_down", "climb_start", "climb_end", "climb_down_start"].includes(n)) out.push(`${d.name}: desenhe a animação "${n}".`); });
    if (d.needsHand && !a.anims.some((an) => an.frames.some((f) => f.hand))) out.push(`${d.name}: marque o ponto da mão (ferramenta Mão, J) nos quadros do jogador.`);
  });
  if (abilityOn(a, "gun") && !abilityOn(a, "melee") && !Object.values(P.actors).some((w) => w.kind === "weapon" && w.props.wtype !== "melee")) out.push("Armas de fogo: ainda não existe nenhuma arma de fogo no projeto.");
  return out;
}

const AbilityEditor = (() => {
  let root = null, A = null;
  function open(id) {
    A = P.actors[id];
    if (abilityOn(A, "grab")) addAnims("grab");
    if (!root) { root = document.createElement("div"); root.className = "modal"; document.body.appendChild(root); }
    root.classList.remove("hidden"); render();
  }
  function close() { root.classList.add("hidden"); A = null; refresh(); }
  const kb = (n) => (n / 1024).toFixed(1) + " KB";
  function render() {
    const iss = abilityIssues(A), p = A.props;
    const total = animBytes(A, A.anims.map((x) => x.name)), abil = Object.keys(PLAYER_ABILITIES).filter((k) => abilityOn(A, k)).reduce((s, k) => s + animBytes(A, abilityAnimList(A, k)), 0);
    root.innerHTML = `<div class="modal-box bh-box">
      <div class="modal-head"><span>${ICON("player")} ${esc(A.name)} — habilidades</span><button class="x" title="Fechar (Esc)">${ICON("close")}</button></div>
      <div class="bh-wrap">
        <div class="bh-lib">
          <div class="bh-h">Habilidades <small>(clique ou arraste para plugar)</small></div>
          ${Object.entries(PLAYER_ABILITIES).filter(([, d]) => abAvail(d)).map(([k, d]) => `<div class="bh-card ${abilityOn(A, k) ? "on" : ""} ${!abAvail(d) ? "soon" : ""}" draggable="true" data-ab="${k}" style="--c:${d.color}">
            <div class="bh-t">${esc(d.name)}${d.sideOnly && hasDepth() ? " <small>(só no modo lateral)</small>" : ""}${d.depthOnly && !hasDepth() ? " <small>(só com profundidade)</small>" : ""}${d.platOnly && !isPlat() ? " <small>(só no modo plataforma)</small>" : ""}</div><div class="bh-d">${esc(d.desc)}</div></div>`).join("")}
        </div>
        <div class="bh-main">
          <div class="bh-drop">
            <div class="bh-actor"><canvas width="96" height="96"></canvas><b>${esc(A.name)}</b></div>
            <div class="bh-slots">${Object.entries(PLAYER_ABILITIES).filter(([k]) => abilityOn(A, k)).map(([k, d]) =>
              `<div class="bh-slot arch" style="--c:${d.color}"><span>${kb(animBytes(A, abilityAnimList(A, k)))}</span><b>${esc(d.name)}</b><button data-off="${k}" title="Tirar">×</button></div>`).join("") || `<div class="bh-slot empty">Arraste habilidades para cá</div>`}</div>
          </div>
          <div class="bh-issues ${iss.length ? "bad" : "ok"}">${iss.length ? "⚠ " + iss.map(esc).join("<br>⚠ ") : "✓ Tudo encaixado."}</div>
          <div class="hint">Animações do jogador: ${kb(total)} (as das habilidades: ${kb(abil)}). O medidor de memória do Mega Drive fica no topo do editor.</div>
          <div class="bh-params"></div>
        </div>
      </div></div>`;
    root.querySelector(".x").onclick = close;
    const f = actorThumbFrame(A), cv = root.querySelector(".bh-actor canvas");
    if (f && images[f.img]) { const g = cv.getContext("2d"), im = images[f.img].img, sc = Math.min(90 / im.width, 90 / im.height, 2); g.imageSmoothingEnabled = false; g.drawImage(im, (96 - im.width * sc) / 2, 96 - im.height * sc, im.width * sc, im.height * sc); }
    const set = (k, v) => { const d = PLAYER_ABILITIES[k]; if (!abAvail(d)) return; p[d.prop] = v; if (v) addAnims(k); changed(); render(); };
    root.querySelectorAll("[data-ab]").forEach((c) => { c.onclick = () => set(c.dataset.ab, !abilityOn(A, c.dataset.ab)); c.ondragstart = (e) => e.dataTransfer.setData("text", c.dataset.ab); });
    const drop = root.querySelector(".bh-drop");
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); const k = e.dataTransfer.getData("text"); if (PLAYER_ABILITIES[k]) set(k, true); };
    root.querySelectorAll("[data-off]").forEach((x) => x.onclick = () => set(x.dataset.off, false));
    const box = root.querySelector(".bh-params");
    Object.entries(PLAYER_ABILITIES).filter(([k]) => abilityOn(A, k)).forEach(([k, d]) => {
      if (!d.params.length) return;
      const h = document.createElement("div"); h.className = "bh-h"; h.textContent = d.name; box.appendChild(h);
      d.params.forEach(([key, label, def, a1, a2]) => {
        if (a1 === "dashcheck") {   // estilo do rolamento: guarda "roll" ou "dash"
          const tmp = { v: p.rollStyle === "dash" }, row = fieldRow(label, tmp, "v", "check");
          row.querySelector("input").addEventListener("change", () => { p.rollStyle = tmp.v ? "dash" : "roll"; addAnims(k); changed(); setTimeout(render, 0); });
          box.appendChild(row); return;
        }
        if (p[key] === undefined) p[key] = def;
        const row = a1 === "check" ? fieldRow(label, p, key, "check") : fieldRow(label, p, key, "number", { min: a1, max: a2, ...(key === "djumpForce" ? { step: 0.25 } : {}) });
        row.querySelector("input").addEventListener("change", () => { if (key === "gunAnims" && p.gunAnims) addAnims("gun"); addAnims(k); setTimeout(render, 0); });
        box.appendChild(row);
      });
    });
  }
  function addAnims(k) {
    if (k === "grab") Object.values(P.actors).filter((x) => x.kind === "enemy" || x.kind === "boss").forEach((x) => { if (!x.anims.some((an) => an.name === "grabbed")) x.anims.push({ id: uid("an_"), name: "grabbed", speed: 8, loop: true, frames: [] }); });   // o inimigo agarrado tem a animação grabbed (com a mão marcada)
    abilityAnimList(A, k).forEach((n) => { if (!A.anims.some((x) => x.name === n)) A.anims.push({ id: uid("an_"), name: n, speed: n.endsWith("shoot") ? 12 : 8, loop: !/attack|shoot|throw|crouch_hurt|pre_jump|hang_up|hang_end|hang_down|climb_start|climb_end|climb_down_start/.test(n), frames: [] }); }); }
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && root && !root.classList.contains("hidden")) close(); });
  return { open };
})();
