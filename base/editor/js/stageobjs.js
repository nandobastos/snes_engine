/* SG Engine - objetos de fase (combate, camera, cenario, armas, interface, logica).
 * Cada tipo e descrito por dados: forma (area ou ponto), cor, valores padrao e campos.
 * Opcoes que dependem do projeto (inimigos, fases, areas...) sao funcoes. */
"use strict";

const optActors = (...kinds) => () => Object.fromEntries(Object.values(P.actors).filter((a) => !kinds.length || kinds.includes(a.kind)).map((a) => [a.id, a.name]));
const optZones = () => Object.fromEntries(L.zones.map((z) => [z.id, z.name]));
const optLayouts = () => Object.fromEntries(P.layouts.map((l) => [l.id, l.name]));
const optImages = () => Object.fromEntries(Object.entries(P.images).map(([id, im]) => [id, im.name]));
const ACT_WHEN = { enter: "Quando o jogador entra / chega", start: "No começo da fase", trigger: "Quando um gatilho mandar" };

const SOBJ = {
  /* ------------------------------------------------------------------ combate */
  spawner: { cat: "Combate", name: "Gerador de inimigos", icon: "enemy", shape: "point", color: "#ff7b7b",
    desc: "Ponto fixo que solta inimigos de tempos em tempos (porta de bar, beco).",
    def: { enemy: "", every: 120, total: 6, onScreen: 2, start: "enter", stop: "count" },
    fields: [["Inimigo", "enemy", "select", optActors("enemy", "boss")], ["A cada (frames)", "every", "number", { min: 10, max: 1200 }],
      ["Total", "total", "number", { min: 1, max: 99 }], ["Máx. na tela", "onScreen", "number", { min: 1, max: 6 }],
      ["Começa", "start", "select", ACT_WHEN], ["Para", "stop", "select", { count: "Quando soltar o total", trigger: "Quando um gatilho mandar", never: "Nunca" }]] },
  ambush: { cat: "Combate", name: "Emboscada", icon: "enemy", shape: "rect", color: "#ff7b7b", w: 96, h: 48,
    desc: "Inimigos parados que acordam quando o jogador entra na área.",
    def: { enemy: "", count: 2, pose: "idle", hp: 100 },
    fields: [["Inimigo", "enemy", "select", optActors("enemy")], ["Quantidade", "count", "number", { min: 1, max: 6 }],
      ["Pose parado", "pose", "select", { idle: "Em guarda", sleep: "Dormindo / sentado", lean: "Encostado na parede", back: "De costas" }],
      ["HP (%)", "hp", "number", { min: 10, max: 500, step: 10 }]] },
  bossarena: { cat: "Combate", name: "Arena do chefe", icon: "boss", shape: "rect", color: "#ff4fd8", w: 320, h: 80,
    desc: "Trava a câmera, mostra a barra do chefe, troca a música e chama reforços.",
    def: { boss: "", music: "", showName: true, reinfAt: 50, reinfEnemy: "", reinfCount: 2 },
    fields: [["Chefe", "boss", "select", optActors("boss")], ["Música", "music", "text"], ["Mostrar nome", "showName", "check"],
      ["Reforços com vida em (%)", "reinfAt", "number", { min: 0, max: 99 }], ["Inimigo de reforço", "reinfEnemy", "select", optActors("enemy")],
      ["Quantos reforços", "reinfCount", "number", { min: 0, max: 6 }]], hint: "Reforços em 0% = sem reforços." },

  /* ------------------------------------------------------------ camera e fluxo */
  camlock: { cat: "Câmera e fluxo", name: "Trava de câmera", icon: "lock", shape: "rect", color: "#39d98a", w: 320, h: 64,
    desc: "Quando a tela chega aqui, a câmera para até a condição acontecer.",
    def: { axis: "x", until: "enemies", time: 600 },
    fields: [["Trava", "axis", "select", { x: "Horizontal", y: "Vertical", both: "Os dois" }],
      ["Até", "until", "select", { enemies: "Todos os inimigos na tela serem derrotados", time: "Passar o tempo", trigger: "Um gatilho mandar" }],
      ["Tempo (frames)", "time", "number", { min: 0, max: 6000 }]] },
  goarrow: { cat: "Câmera e fluxo", name: "Seta GO", icon: "right", shape: "point", color: "#39d98a",
    desc: "Aparece quando a câmera é liberada, indicando para onde seguir.",
    def: { dir: "right", blink: true, sound: "" },
    fields: [["Direção", "dir", "select", { right: "Direita", left: "Esquerda", up: "Cima", down: "Baixo" }], ["Piscando", "blink", "check"], ["Som", "sound", "text"]] },
  autoscroll: { cat: "Câmera e fluxo", name: "Rolagem automática", icon: "transition", shape: "rect", color: "#39d98a", w: 640, h: 224,
    desc: "Dentro desta área a câmera anda sozinha (elevador, veículo).",
    def: { dir: "right", speed: 0.5, stopAtEnd: true },
    fields: [["Direção", "dir", "select", { right: "Direita", left: "Esquerda", up: "Cima", down: "Baixo" }],
      ["Velocidade (px/frame)", "speed", "number", { min: 0.125, max: 4, step: 0.125 }], ["Para no fim da área", "stopAtEnd", "check"]] },
  checkpoint: { cat: "Câmera e fluxo", name: "Checkpoint", icon: "flag", shape: "point", color: "#39d98a",
    desc: "Onde o jogador renasce ao perder uma vida depois de passar por aqui.",
    def: { heal: false }, fields: [["Recupera a vida", "heal", "check"]] },
  exit: { cat: "Câmera e fluxo", name: "Saída da fase", icon: "file", shape: "rect", color: "#39d98a", w: 32, h: 64,
    desc: "Ao entrar aqui o jogador vai para outra fase.",
    def: { to: "", transition: "fade_black", needClear: true },
    fields: [["Vai para", "to", "select", optLayouts], ["Transição", "transition", "select", () => TRANSITIONS], ["Só sem inimigos", "needClear", "check"]] },
  door: { cat: "Câmera e fluxo", name: "Porta / passagem", icon: "transition", shape: "rect", color: "#39d98a", w: 32, h: 48,
    desc: "Leva para outra área de câmera da mesma fase, com transição.",
    def: { to: "", transition: "fade_black", key: "" },
    fields: [["Vai para a área", "to", "select", optZones], ["Transição", "transition", "select", () => TRANSITIONS], ["Precisa da variável", "key", "text"]],
    hint: "Precisa da variável: nome de uma variável que deve ser maior que 0 (ex.: chave). Vazio = livre." },

  /* -------------------------------------------------------------------- cenario */
  platform: { cat: "Cenário", name: "Plataforma móvel", icon: "platform", shape: "rect", color: "#c9a46b", w: 64, h: 16,
    desc: "Chão que se move levando os personagens (elevador, esteira).",
    def: { dx: 0, dy: -64, speed: 0.5, pause: 60, loop: true },
    fields: [["Desloca X (px)", "dx", "number", { step: 8 }], ["Desloca Y (px)", "dy", "number", { step: 8 }],
      ["Velocidade (px/frame)", "speed", "number", { min: 0.125, max: 4, step: 0.125 }], ["Pausa nas pontas", "pause", "number", { min: 0, max: 600 }], ["Vai e volta", "loop", "check"]] },
  hazard: { cat: "Cenário", name: "Perigo", icon: "hit", shape: "rect", color: "#ff9f1a", w: 48, h: 24,
    desc: "Buraco, fogo, piso elétrico, carro que passa, objeto que cai.",
    def: { kind: "fire", damage: 10, knock: true, period: 120, warn: true, enemies: true },
    fields: [["Tipo", "kind", "select", { pit: "Buraco (perde a vida)", fire: "Fogo", electric: "Piso elétrico", car: "Veículo passando", falling: "Objeto caindo" }],
      ["Dano", "damage", "number", { min: 0, max: 999 }], ["Derruba", "knock", "check"], ["Ritmo (frames)", "period", "number", { min: 0, max: 1200 }],
      ["Avisa antes", "warn", "check"], ["Atinge inimigos", "enemies", "check"]], hint: "Ritmo 0 = sempre ativo." },
  wall: { cat: "Cenário", name: "Parede invisível", icon: "rect", shape: "rect", color: "#9aa0aa", w: 64, h: 32,
    desc: "Área onde não se anda.", def: { blocks: "all" },
    fields: [["Bloqueia", "blocks", "select", { all: "Todos", players: "Só jogadores", enemies: "Só inimigos" }]] },
  front: { cat: "Cenário", name: "Camada da frente", icon: "image", shape: "rect", color: "#9aa0aa", w: 64, h: 160,
    desc: "Pedaço de cenário que passa na frente dos personagens (poste, grade).",
    def: { image: "" }, fields: [["Imagem", "image", "select", optImages]], hint: "A imagem vai para o Plano A. Importe-a em Imagens de fundo." },
  decor: { cat: "Cenário", name: "Decoração animada", icon: "image", shape: "point", color: "#9aa0aa",
    desc: "Só visual, sem colisão: placa piscando, fumaça, chuva.",
    def: { actor: "", anim: "idle" }, fields: [["Sprite de", "actor", "select", optActors()], ["Animação", "anim", "text"]] },

  /* --------------------------------------------------------------- armas e itens */
  weapon: { cat: "Armas e itens", name: "Arma", icon: "hit", shape: "point", color: "#7bd7ff",
    desc: "Arma no chão que o jogador pega: cano, faca, bastão, garrafa.",
    def: { kind: "pipe", damage: 12, uses: 6, throwable: true, sprite: "" },
    fields: [["Tipo", "kind", "select", { pipe: "Cano", knife: "Faca", bat: "Bastão", bottle: "Garrafa", sword: "Espada" }],
      ["Dano", "damage", "number", { min: 1, max: 99 }], ["Usos até quebrar", "uses", "number", { min: 0, max: 99 }],
      ["Pode arremessar", "throwable", "check"], ["Sprite (item)", "sprite", "select", optActors("item")]], hint: "Usos 0 = não quebra." },
  itemspawn: { cat: "Armas e itens", name: "Item na fase", icon: "item", shape: "point", color: "#7bd7ff",
    desc: "Um item que aparece aqui no começo da fase ou quando um gatilho mandar.",
    def: { item: "", when: "start" }, fields: [["Item", "item", "select", optActors("item")], ["Aparece", "when", "select", ACT_WHEN]] },

  /* ------------------------------------------------------------------ telas (titulo, opcoes, creditos) */
  screentext: { cat: "Tela", name: "Texto da tela", icon: "file", shape: "point", color: "#ffffff",
    desc: "Texto fixo na tela (título, PRESS START, créditos). Fica alinhado à grade de 8 px do Mega Drive.",
    def: { text: "PRESS START", blink: false, center: true },
    fields: [["Texto", "text", "text"], ["Centralizar na linha", "center", "check"], ["Piscar", "blink", "check"]] },
  mappoint: { cat: "Tela", name: "Ponto do mapa", icon: "flag", shape: "point", color: "#3fb6a8",
    desc: "Uma fase no mapa: o cursor para aqui e START entra nela. A ordem dos pontos é a ordem do caminho.",
    def: { screen: "", label: "FASE 1", open: false },
    fields: [["Fase (tela)", "screen", "select", () => ({ "": "(escolha)", ...Object.fromEntries(((P.screens && P.screens.nodes) || []).filter((x) => isGameScreen(x.type)).map((x) => [x.id, x.name])) })], ["Nome no mapa", "label", "text"], ["Liberada desde o início", "open", "check"]] },
  /* ------------------------------------------------------------------ interface */
  text: { cat: "Interface", name: "Texto / diálogo", icon: "file", shape: "rect", color: "#f3cf72", w: 128, h: 32,
    desc: "Fala ou aviso na tela, com retrato opcional.",
    def: { text: "Olá!", portrait: "", duration: 180, when: "enter", pause: true },
    fields: [["Texto", "text", "text"], ["Retrato de", "portrait", "select", () => ({ "": "(sem retrato)", ...optActors()() })],
      ["Duração (frames)", "duration", "number", { min: 30, max: 1200 }], ["Mostra", "when", "select", ACT_WHEN], ["Pausa a ação", "pause", "check"]] },
  titlecard: { cat: "Interface", name: "Título da fase", icon: "file", shape: "point", color: "#f3cf72",
    desc: "Cartão de abertura da fase (ex.: FASE 1 – A RUA).",
    def: { title: "FASE 1", subtitle: "", duration: 150 },
    fields: [["Título", "title", "text"], ["Subtítulo", "subtitle", "text"], ["Duração (frames)", "duration", "number", { min: 30, max: 600 }]] },
  clock: { cat: "Interface", name: "Cronômetro", icon: "anchor", shape: "point", color: "#f3cf72",
    desc: "Tempo limite da fase, mostrado no HUD.",
    def: { seconds: 99, onZero: "life", resetOnLife: true },
    fields: [["Segundos", "seconds", "number", { min: 10, max: 999 }], ["Ao zerar", "onZero", "select", { life: "Perde uma vida", over: "Fim de jogo", nothing: "Nada" }],
      ["Reinicia ao perder vida", "resetOnLife", "check"]] },
  music: { cat: "Interface", name: "Música / som", icon: "play", shape: "point", color: "#f3cf72",
    desc: "Troca a música ou toca um efeito quando o jogador passa por aqui.",
    def: { action: "play", track: "", fade: 30 },
    fields: [["Ação", "action", "select", { play: "Tocar música", stop: "Parar música", fadeout: "Abaixar até sumir", sfx: "Tocar efeito" }],
      ["Música / efeito", "track", "text"], ["Fade (frames)", "fade", "number", { min: 0, max: 300 }]], hint: "Os arquivos de som entram numa próxima etapa." },

  /* --------------------------------------------------------------------- logica */
  trigger: { cat: "Lógica", name: "Gatilho", icon: "marquee", shape: "rect", color: "#b48cff", w: 64, h: 64,
    desc: "Área invisível que dispara eventos quando alguém entra.",
    def: { who: "player", once: true },
    fields: [["Quem dispara", "who", "select", { player: "Jogador", enemy: "Inimigo", any: "Qualquer um" }], ["Só uma vez", "once", "check"]],
    hint: "Use o nome do gatilho na folha de eventos." },
  variable: { cat: "Lógica", name: "Variável / contador", icon: "grid", shape: "point", color: "#b48cff",
    desc: "Guarda um número para a folha de eventos (chaves, contadores).",
    def: { initial: 0, scope: "layout" }, fields: [["Valor inicial", "initial", "number"], ["Vale para", "scope", "select", { layout: "Esta fase", game: "O jogo todo" }]] },
  timer: { cat: "Lógica", name: "Temporizador", icon: "anchor", shape: "point", color: "#b48cff",
    desc: "Dispara um evento depois de um tempo.",
    def: { frames: 300, repeat: false, start: "start" },
    fields: [["Tempo (frames)", "frames", "number", { min: 1, max: 36000 }], ["Repete", "repeat", "check"], ["Começa", "start", "select", ACT_WHEN]] },
};

function sobjById(id) { return (L.objs || []).find((o) => o.id === id); }
function newSobj(type, x, y) {
  const d = SOBJ[type];
  L.objs = L.objs || [];
  const n = L.objs.filter((o) => o.type === type).length + 1;
  const o = { id: uid("so_"), type, name: d.name + " " + n, x: Math.round(x), y: Math.round(y), ...JSON.parse(JSON.stringify(d.def)) };
  if (d.shape === "rect") { o.w = d.w; o.h = d.h; o.x = snap(x - d.w / 2); o.y = snap(y - d.h / 2); }
  // primeira opcao valida nas listas que dependem do projeto
  d.fields.forEach(([, k, t, ex]) => { if (t === "select" && typeof ex === "function" && !o[k]) { const keys = Object.keys(ex()); if (keys.length && !(k === "portrait")) o[k] = keys[0]; } });
  L.objs.push(o);
  return o;
}
function sobjBox(o) { return SOBJ[o.type].shape === "rect" ? o : { x: o.x - 7, y: o.y - 7, w: 14, h: 14 }; }

function drawSobjs() {
  (L.objs || []).forEach((o) => {
    const d = SOBJ[o.type], sel = isSel("sobj", o.id), Z = ui.zoom;
    if (o.type === "screentext") {   // texto da tela: desenhado como no Mega Drive (letras de 8 px na grade)
      const t = String(o.text || "").toUpperCase(), x = o.center !== false ? Math.floor((40 - t.length) / 2) * 8 : (o.x >> 3) << 3, y = (o.y >> 3) << 3;
      g.font = "bold 8px monospace"; g.textBaseline = "top"; g.fillStyle = "#fff";
      for (let i = 0; i < t.length; i++) g.fillText(t[i], x + i * 8 + 1, y);
      if (sel) { g.strokeStyle = "#f3cf72"; g.lineWidth = 1 / Z; g.strokeRect(x, y, t.length * 8, 8); }
      return;
    }
    g.strokeStyle = d.color; g.fillStyle = d.color;
    if (d.shape === "rect") {
      g.globalAlpha = sel ? .18 : .08; g.fillRect(o.x, o.y, o.w, o.h); g.globalAlpha = 1;
      g.lineWidth = (sel ? 2 : 1) / Z; g.setLineDash([4 / Z, 3 / Z]); g.strokeRect(o.x, o.y, o.w, o.h); g.setLineDash([]);
      if (sel) { handles(o); label(o.name, o.x + 3, o.y + 11, d.color); }
    } else {
      g.lineWidth = (sel ? 2 : 1.2) / Z;
      g.beginPath(); g.moveTo(o.x, o.y - 7); g.lineTo(o.x + 7, o.y); g.lineTo(o.x, o.y + 7); g.lineTo(o.x - 7, o.y); g.closePath();
      g.globalAlpha = .35; g.fill(); g.globalAlpha = 1; g.stroke();
      if (sel) label(o.name, o.x + 9, o.y + 4, d.color);
    }
  });
}
function hitSobj(w) {
  const st = (L.objs || []).find((o) => { if (o.type !== "screentext") return false; const t = String(o.text || ""), x = o.center !== false ? Math.floor((40 - t.length) / 2) * 8 : (o.x >> 3) << 3, y = (o.y >> 3) << 3; return w.x >= x && w.x <= x + t.length * 8 && w.y >= y - 2 && w.y <= y + 10; });
  if (st) return st;
  const os = (L.objs || []).filter((o) => { const b = sobjBox(o); return w.x >= b.x && w.x <= b.x + b.w && w.y >= b.y && w.y <= b.y + b.h; });
  // pontos ganham das areas (sao menores)
  os.sort((a, b) => (SOBJ[a.type].shape === "point" ? 0 : 1) - (SOBJ[b.type].shape === "point" ? 0 : 1));
  return os[0] || null;
}

function sobjProps(o) {
  const d = SOBJ[o.type];
  const f = ["Propriedades do tipo de objeto", ["Nome", o, "name"], textRow("Tipo", d.name), "Comum", pairRow("Posição", o, "x", "y")];
  if (d.shape === "rect") f.push(pairRow("Tamanho", o, "w", "h"));
  f.push(d.name);
  d.fields.forEach(([lab, k, t, ex]) => f.push([lab, o, k, t, typeof ex === "function" ? ex() : ex]));
  f.push("!" + d.desc);
  if (d.hint) f.push("!" + d.hint);
  form(f);
}
