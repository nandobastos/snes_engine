/* SG Engine - atores de exemplo (arte original, desenhada por codigo) para testar o editor.
 * Troque pela sua arte quando quiser: abra o ator e importe os seus sprites. */
"use strict";

const Placeholders = (() => {
  /* cores no padrao do Mega Drive (nivel 0..7 por canal) */
  const C = (r, g, b) => `rgb(${MD.show(r)},${MD.show(g)},${MD.show(b)})`;
  const OUT = C(0, 0, 0), SKIN = C(7, 5, 3), SKIN2 = C(5, 3, 2), HAIR = C(2, 1, 0);

  function frameCanvas(w, h, draw) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    draw(g);
    return c;
  }
  function addFrame(c, ax, ay, extra) {
    const id = uid("img_");
    SRC[id] = c.toDataURL("image/png");
    images[id] = { img: c };
    return Object.assign({ img: id, w: c.width, h: c.height, ax, ay, ph: true }, extra || {});
  }
  const R = (g, col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

  /* lutador generico original, 56x56, olhando para a direita, ancora nos pes (x 20, y 55).
   * pose: bob (abaixa o corpo), lf/rf (pes), arm (0 guarda, 1 recolhe, 2 soco, 3 gancho p/ cima, 4 bracos abertos, 5 agarra),
   *       legs ("stand" | "kick" | "tuck" | "knee" | "crouch"), lean (inclina para tras), back (arm tras esticado) */
  function fighter(shirt, shirt2, pants, pose) {
    return frameCanvas(56, 56, (g) => {
      const crouch = pose.legs === "crouch";
      const b = (pose.bob || 0) + (crouch ? 12 : 0), ln = pose.lean || 0;
      const shoe = C(6, 6, 6), glove = C(7, 1, 1);
      // pernas
      const leg = (x, y, h) => { R(g, OUT, x, y, 7, h); R(g, pants, x + 1, y, 5, h - 1); };
      const foot = (x, y) => { R(g, OUT, x, y, 9, 4); R(g, shoe, x + 1, y + 1, 7, 2); };
      if (pose.legs === "kick") {                                   // perna da frente esticada
        leg(13, 34, 20); foot(12, 52);
        R(g, OUT, 20, 33, 30, 7); R(g, pants, 21, 34, 28, 5); R(g, OUT, 49, 31, 6, 10); R(g, shoe, 50, 32, 4, 8);
      } else if (pose.legs === "tuck") {                            // pulo: joelhos dobrados
        R(g, OUT, 12, 34, 9, 12); R(g, pants, 13, 35, 7, 10); R(g, OUT, 21, 34, 9, 10); R(g, pants, 22, 35, 7, 8);
        foot(12, 45); foot(22, 43);
      } else if (pose.legs === "knee") {                            // joelhada
        leg(13, 34, 20); foot(12, 52);
        R(g, OUT, 21, 30, 12, 9); R(g, pants, 22, 31, 10, 7); R(g, OUT, 29, 37, 7, 10); R(g, pants, 30, 38, 5, 8);
      } else if (crouch) {
        R(g, OUT, 10, 46, 22, 9); R(g, pants, 11, 47, 20, 7); foot(8, 52); foot(26, 52);
      } else {
        leg(13 + (pose.lf || 0), 34 + b, 20 - b); leg(21 + (pose.rf || 0), 34 + b, 20 - b);
        foot(12 + (pose.lf || 0), 52); foot(20 + (pose.rf || 0), 52);
      }
      // tronco e cabeca (inclinam com lean)
      R(g, OUT, 12 - ln, 17 + b, 17, 19); R(g, shirt, 13 - ln, 18 + b, 15, 17); R(g, shirt2, 13 - ln, 30 + b, 15, 5);
      R(g, OUT, 12 - ln, 33 + b, 17, 3); R(g, C(4, 3, 1), 13 - ln, 34 + b, 15, 1);
      const hx = 14 - ln * 2;
      R(g, OUT, hx, 4 + b, 13, 14); R(g, SKIN, hx + 1, 5 + b, 11, 12); R(g, HAIR, hx + 1, 4 + b, 11, 4); R(g, HAIR, hx + 1, 4 + b, 3, 8);
      R(g, OUT, hx + 9, 9 + b, 2, 2); R(g, SKIN2, hx + 1, 13 + b, 11, 1);
      // braco de tras
      if (pose.arm === 4 || pose.back) { R(g, OUT, 0, 20 + b, 14, 6); R(g, SKIN2, 1, 21 + b, 12, 4); R(g, glove, 0, 20 + b, 5, 6); }
      else { R(g, OUT, 10 - ln, 19 + b, 5, 12); R(g, SKIN2, 11 - ln, 20 + b, 3, 10); }
      // braco da frente
      const fx = 24 - ln, fy = 19 + b;
      if (pose.arm === 2 || pose.arm === 4) { R(g, OUT, fx, fy + 1, 26, 6); R(g, SKIN, fx + 1, fy + 2, 21, 4); R(g, glove, fx + 20, fy + 1, 6, 6); }
      else if (pose.arm === 3) { R(g, OUT, fx, fy - 16, 7, 22); R(g, SKIN, fx + 1, fy - 12, 5, 17); R(g, glove, fx, fy - 17, 7, 6); }
      else if (pose.arm === 5) { R(g, OUT, fx, fy + 3, 16, 6); R(g, SKIN, fx + 1, fy + 4, 14, 4); R(g, glove, fx + 12, fy + 1, 5, 9); }
      else if (pose.arm === 1) { R(g, OUT, fx - 2, fy + 1, 8, 10); R(g, SKIN, fx - 1, fy + 2, 6, 8); R(g, glove, fx, fy + 7, 6, 5); }
      else { R(g, OUT, fx, fy, 6, 10); R(g, SKIN, fx + 1, fy + 1, 4, 8); R(g, OUT, fx + 1, fy - 2, 8, 7); R(g, glove, fx + 2, fy - 1, 6, 5); }
    });
  }
  /* caido no chao (deitado de costas), 56x56 com o corpo embaixo; levantando = meio sentado */
  function lying(shirt, pants, sitting) {
    return frameCanvas(56, 56, (g) => {
      if (sitting) {
        R(g, OUT, 22, 40, 26, 9); R(g, pants, 23, 41, 24, 7); R(g, OUT, 46, 46, 8, 9); R(g, C(6, 6, 6), 47, 47, 6, 7);
        R(g, OUT, 12, 28, 14, 21); R(g, shirt, 13, 29, 12, 19);
        R(g, OUT, 8, 16, 13, 14); R(g, SKIN, 9, 17, 11, 12); R(g, HAIR, 9, 16, 4, 8);
        R(g, OUT, 22, 36, 12, 6); R(g, SKIN, 23, 37, 10, 4);
      } else {
        R(g, OUT, 0, 44, 13, 12); R(g, SKIN, 1, 45, 11, 10); R(g, HAIR, 1, 45, 4, 10);
        R(g, OUT, 12, 45, 18, 11); R(g, shirt, 13, 46, 16, 9);
        R(g, OUT, 29, 46, 22, 9); R(g, pants, 30, 47, 20, 7); R(g, OUT, 50, 44, 6, 12); R(g, C(6, 6, 6), 51, 45, 4, 10);
      }
    });
  }

  function fighterAnims(shirt, shirt2, pants) {
    // ponto da mao (luva da frente) de cada pose: e onde a arma fica quando o jogador segura uma
    const handOf = (pose) => {
      const b = (pose.bob || 0) + (pose.legs === "crouch" ? 12 : 0), fx = 24 - (pose.lean || 0), fy = 19 + b, a = pose.arm || 0;
      const [dx, dy] = a === 2 || a === 4 ? [23, 4] : a === 3 ? [3, -14] : a === 5 ? [14, 5] : a === 1 ? [3, 9] : [5, 1];
      return { x: fx + dx, y: fy + dy };
    };
    const F = (pose, extra) => addFrame(fighter(shirt, shirt2, pants, pose), 20, 55, { hand: handOf(pose), ...extra });
    const LY = (sit, extra) => addFrame(lying(shirt, pants, sit), 28, 55, extra);
    const hurt = { x: 11, y: 4, w: 19, h: 51 }, low = { x: 9, y: 16, w: 23, h: 39 };
    /* corpo dividido: pernas (abaixo da cintura) e tronco com arma (acima); a "mao" (J) marca a cintura */
    const waistY = (pose) => 34 + (pose.bob || 0) + (pose.legs === "crouch" ? 12 : 0);
    const half = (pose, top, gun) => {
      const c = fighter(shirt, shirt2, pants, pose), g = c.getContext("2d"), wy = waistY(pose);
      if (top) g.clearRect(0, wy, 56, 56 - wy); else g.clearRect(0, 0, 56, wy);
      if (gun) {   // arma desenhada no tronco: frente, para cima ou diagonal
        const hy = 19 + (pose.bob || 0);
        if (gun.dir === "up") { R(g, OUT, 25, hy - 26, 6, 14); R(g, C(1, 1, 1), 26, hy - 25, 4, 12); if (gun.fire) R(g, C(7, 7, 2), 25, hy - 32, 6, 5); }
        else if (gun.dir === "diag") { for (let i = 0; i < 10; i++) { R(g, OUT, 28 + i, hy - 4 - i, 4, 4); R(g, C(1, 1, 1), 29 + i, hy - 3 - i, 2, 2); } if (gun.fire) R(g, C(7, 7, 2), 40, hy - 18, 5, 5); }
        else if (gun.dir === "down") { R(g, OUT, 25, hy + 8, 6, 14); R(g, C(1, 1, 1), 26, hy + 9, 4, 12); if (gun.fire) R(g, C(7, 7, 2), 25, hy + 22, 6, 5); }
        else if (gun.dir === "ddiag") { for (let i = 0; i < 10; i++) { R(g, OUT, 28 + i, hy + 6 + i, 4, 4); R(g, C(1, 1, 1), 29 + i, hy + 7 + i, 2, 2); } if (gun.fire) R(g, C(7, 7, 2), 40, hy + 16, 5, 5); }
        else { R(g, OUT, 40, hy + 1, gun.big ? 16 : 10, 6); R(g, C(1, 1, 1), 41, hy + 2, gun.big ? 14 : 8, 4); if (gun.fire) R(g, C(7, 7, 2), gun.big ? 56 - 4 : 50, hy, 4, 7); }
      }
      return addFrame(c, 20, 55, { hand: { x: 20, y: wy } });
    };
    const LG = (pose) => half(pose, false), TP = (pose, gun) => half(pose, true, gun);
    return {
      idle: [F({ arm: 0 }, { hurt }), F({ bob: 1, arm: 0 }, { hurt })],
      walk: [F({ lf: -3, rf: 3, arm: 0 }, { hurt }), F({ bob: 1, arm: 0 }, { hurt }), F({ lf: 3, rf: -3, arm: 0 }, { hurt }), F({ bob: 1, arm: 0 }, { hurt })],
      jump: [F({ legs: "tuck", arm: 1, bob: -2 }, { hurt })],
      crouch: [F({ legs: "crouch", arm: 0 }, { hurt: low })],
      crouch_attack: [F({ legs: "crouch", arm: 1 }, { hurt: low }), F({ legs: "crouch", arm: 2 }, { hurt: low, hit: { x: 32, y: 32, w: 18, h: 8 } }), F({ legs: "crouch", arm: 1 }, { hurt: low })],
      attack1: [F({ arm: 1, lf: -1, rf: 2 }, { hurt }), F({ arm: 2, lf: -2, rf: 3 }, { hurt, hit: { x: 32, y: 19, w: 18, h: 8 } }), F({ arm: 1, lf: -1, rf: 2 }, { hurt })],
      attack2: [F({ arm: 1, back: true }, { hurt }), F({ legs: "kick", arm: 0, back: true }, { hurt, hit: { x: 34, y: 30, w: 21, h: 11 } }), F({ arm: 0 }, { hurt })],
      attack3: [F({ legs: "crouch", arm: 1 }, { hurt: low }), F({ arm: 3, lf: -1, rf: 2, bob: -2 }, { hurt, hit: { x: 22, y: 0, w: 14, h: 22 } }), F({ arm: 3, bob: -2 }, { hurt }), F({ arm: 0 }, { hurt })],
      jump_attack: [F({ legs: "kick", arm: 1 }, { hurt, hit: { x: 34, y: 30, w: 21, h: 11 } })],
      grab: [F({ arm: 5, lf: -2, rf: 2 }, { hurt })],
      hurt: [F({ arm: 1, lean: 3 }, { hurt }), F({ arm: 1, lean: 2 }, { hurt })],
      hurt_low: [F({ arm: 1, lean: -3, bob: 3 }, { hurt }), F({ arm: 1, lean: -2, bob: 2 }, { hurt })],
      knockback: [F({ arm: 4, lean: 4, legs: "tuck" }), LY(false), LY(false)],
      jump_fall: [F({ legs: "tuck", arm: 0, bob: 0 }, { hurt })],
      jump_knee: [F({ legs: "knee", arm: 1, bob: -2 }, { hurt, hit: { x: 20, y: 30, w: 18, h: 16 } })],
      run: [F({ lf: -5, rf: 4, arm: 1, lean: -2 }, { hurt }), F({ bob: 1, arm: 0, lean: -2 }, { hurt }), F({ lf: 4, rf: -5, arm: 1, lean: -2 }, { hurt }), F({ bob: 1, arm: 0, lean: -2 }, { hurt })],
      run_attack: [F({ legs: "kick", arm: 1, lean: -3 }, { hurt, hit: { x: 32, y: 26, w: 24, h: 14 } }), F({ legs: "kick", arm: 1, lean: -3 }, { hurt, hit: { x: 32, y: 26, w: 24, h: 14 } }), F({ arm: 0 }, { hurt })],
      flying_kick: [F({ legs: "tuck", arm: 1, bob: -2 }, { hurt }), F({ legs: "kick", arm: 0, lean: -2 }, { hurt, hit: { x: 32, y: 28, w: 24, h: 12 } })],
      attack4: [F({ arm: 1, lf: -1, rf: 2 }, { hurt }), F({ arm: 3, lean: -1, lf: -2, rf: 3 }, { hurt, hit: { x: 28, y: 6, w: 18, h: 14 } }), F({ arm: 0 }, { hurt })],
      throw: [F({ arm: 3, back: true }, { hurt }), F({ arm: 2, lf: -1, rf: 2 }, { hurt }), F({ arm: 0 }, { hurt })],
      shoot: [F({ arm: 2 }, { hurt }), F({ arm: 2, lean: 1 }, { hurt }), F({ arm: 2 }, { hurt })],
      block: [F({ arm: 3, lean: 2 }, { hurt })],
      gun_idle: [F({ arm: 2 }, { hurt }), F({ arm: 2, bob: 1 }, { hurt })],
      gun_walk: [F({ lf: -3, rf: 3, arm: 2 }, { hurt }), F({ bob: 1, arm: 2 }, { hurt }), F({ lf: 3, rf: -3, arm: 2 }, { hurt }), F({ bob: 1, arm: 2 }, { hurt })],
      gun_shoot: [F({ arm: 2, lean: 1 }, { hurt }), F({ arm: 2 }, { hurt })],
      grabbed: [F({ arm: 1, lean: 3 }, { hurt }), F({ arm: 1, lean: 2, bob: 1 }, { hurt })],
      down: [LY(false)],
      getup: [LY(true), F({ legs: "crouch", arm: 0 })],
      climb: [F({ arm: 3, lf: -2, rf: 2 }, { hurt }), F({ arm: 3, lf: 2, rf: -2, bob: 1 }, { hurt })],
      climb_top: [F({ legs: "crouch", arm: 3 }, { hurt: low })],
      climb_shoot: [F({ arm: 2 }, { hurt, hit: { x: 32, y: 19, w: 18, h: 8 } }), F({ arm: 1 }, { hurt })],
      hang: [F({ arm: 3, bob: -2 }, { hurt }), F({ arm: 3, bob: -1 }, { hurt })],
      hang_up: [F({ arm: 3, legs: "tuck" }, { hurt }), F({ arm: 1, legs: "knee" }, { hurt })],
      hang_end: [F({ legs: "crouch", arm: 1 }, { hurt: low }), F({ arm: 0 }, { hurt })],
      roll: [F({ legs: "tuck", arm: 1, bob: 4 }, { hurt: low }), F({ legs: "crouch", arm: 1 }, { hurt: low }), F({ legs: "tuck", arm: 1, bob: 4 }, { hurt: low }), F({ legs: "crouch", arm: 0 }, { hurt: low })],
      land: [F({ legs: "crouch", arm: 1 }, { hurt: low }), F({ legs: "crouch", arm: 0 }, { hurt: low })],
      legs_idle: [LG({ arm: 0 }), LG({ bob: 1, arm: 0 })],
      legs_walk: [LG({ lf: -3, rf: 3 }), LG({ bob: 1 }), LG({ lf: 3, rf: -3 }), LG({ bob: 1 })],
      legs_run: [LG({ lf: -5, rf: 4 }), LG({ bob: 1 }), LG({ lf: 4, rf: -5 }), LG({ bob: 1 })],
      legs_jump: [LG({ legs: "tuck" })],
      legs_crouch: [LG({ legs: "crouch" })],
      top_gun: [TP({ arm: 2 }, { dir: "fwd" })], top_shoot: [TP({ arm: 2 }, { dir: "fwd", fire: true }), TP({ arm: 2 }, { dir: "fwd" })],
      top_up: [TP({ arm: 3 }, { dir: "up" })], top_up_shoot: [TP({ arm: 3 }, { dir: "up", fire: true }), TP({ arm: 3 }, { dir: "up" })],
      top_diag: [TP({ arm: 3 }, { dir: "diag" })], top_diag_shoot: [TP({ arm: 3 }, { dir: "diag", fire: true }), TP({ arm: 3 }, { dir: "diag" })],
      top_down: [TP({ arm: 1 }, { dir: "down" })], top_down_shoot: [TP({ arm: 1 }, { dir: "down", fire: true }), TP({ arm: 1 }, { dir: "down" })],
      top_ddiag: [TP({ arm: 1 }, { dir: "ddiag" })], top_ddiag_shoot: [TP({ arm: 1 }, { dir: "ddiag", fire: true }), TP({ arm: 1 }, { dir: "ddiag" })],
      double_jump: [F({ legs: "tuck", arm: 3, bob: -3 }, { hurt }), F({ legs: "tuck", arm: 1, bob: -2 }, { hurt })],
      dash: [F({ lf: -6, rf: 5, arm: 1, lean: -4 }, { hurt }), F({ lf: -6, rf: 5, arm: 0, lean: -4 }, { hurt })],
      attack_up: [F({ arm: 1, bob: 1 }, { hurt }), F({ arm: 3, bob: -2 }, { hurt, hit: { x: 18, y: 0, w: 18, h: 16 } }), F({ arm: 0 }, { hurt })],
      attack_down: [F({ legs: "tuck", arm: 1 }, { hurt }), F({ legs: "knee", arm: 1 }, { hurt, hit: { x: 12, y: 40, w: 24, h: 16 } })],
      rifle_top: [TP({ arm: 2 }, { dir: "fwd", big: true })], rifle_shoot: [TP({ arm: 2 }, { dir: "fwd", big: true, fire: true }), TP({ arm: 2 }, { dir: "fwd", big: true })],
      rifle_up: [TP({ arm: 3 }, { dir: "up" })], rifle_up_shoot: [TP({ arm: 3 }, { dir: "up", fire: true }), TP({ arm: 3 }, { dir: "up" })],
      rifle_diag: [TP({ arm: 3 }, { dir: "diag" })], rifle_diag_shoot: [TP({ arm: 3 }, { dir: "diag", fire: true }), TP({ arm: 3 }, { dir: "diag" })],
      special: [F({ arm: 4, bob: 1 }, { hurt, hit: { x: 0, y: 14, w: 56, h: 16 } }), F({ arm: 4, lean: -2 }, { hurt, hit: { x: 0, y: 14, w: 56, h: 16 } }), F({ arm: 0 }, { hurt })],
    };
  }

  function chicken() {
    return frameCanvas(16, 16, (g) => {
      R(g, OUT, 3, 4, 10, 9); R(g, C(6, 3, 1), 4, 5, 8, 7); R(g, C(7, 5, 2), 5, 5, 4, 3);
      R(g, OUT, 11, 2, 4, 5); R(g, C(7, 7, 6), 12, 3, 2, 3);
      R(g, OUT, 1, 12, 14, 3); R(g, C(6, 6, 7), 2, 13, 12, 1);
    });
  }
  function barrel(broken) {
    return frameCanvas(24, 32, (g) => {
      if (!broken) {
        R(g, OUT, 2, 1, 20, 31); R(g, C(4, 2, 0), 3, 2, 18, 29); R(g, C(5, 3, 1), 6, 2, 5, 29);
        [5, 15, 25].forEach((y) => { R(g, OUT, 2, y, 20, 3); R(g, C(3, 3, 3), 3, y + 1, 18, 1); });
      } else {
        R(g, OUT, 2, 18, 20, 14); R(g, C(4, 2, 0), 3, 19, 18, 12); R(g, OUT, 4, 12, 5, 8); R(g, C(5, 3, 1), 5, 13, 3, 6);
        R(g, OUT, 15, 10, 6, 9); R(g, C(4, 2, 0), 16, 11, 4, 7); R(g, OUT, 2, 25, 20, 3);
      }
    });
  }

  function setAnim(a, name, frames, speed, loop) {
    let an = a.anims.find((x) => x.name === name);
    if (!an) { an = { id: uid("an_"), name, speed, loop, frames: [] }; a.anims.push(an); }
    an.frames = frames; an.speed = speed; an.loop = loop;
  }
  function finish(a) {
    const set = new Set();
    a.anims.forEach((an) => an.frames.forEach((f) => {
      const c = images[f.img].img, d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) set.add(MD.key(d[i], d[i + 1], d[i + 2]));
    }));
    a.pal = [...set].slice(0, 15);
  }

  /* cria jogador, inimigo, item (frango, dropavel pelo barril) e barril, e coloca na fase */
  function create() {
    const pl = newActor("player"); pl.name = isPlat() ? "Herói (exemplo)" : "Lutador (exemplo)";
    let an = fighterAnims(C(1, 3, 7), C(0, 1, 5), C(2, 2, 4));
    const SPD = { idle: [4, true], walk: [8, true], jump: [8, false], crouch: [8, false], crouch_attack: [12, false], attack1: [12, false], attack2: [10, false],
      attack3: [10, false], jump_attack: [8, false], grab: [8, false], hurt: [10, false], hurt_low: [10, false], knockback: [6, false], down: [6, false], getup: [5, false], special: [8, false],
      jump_fall: [8, false], jump_knee: [8, false], run: [12, true], run_attack: [8, false], flying_kick: [8, false], block: [8, false], grabbed: [6, true], gun_idle: [4, true], gun_walk: [8, true], gun_shoot: [14, false], attack4: [10, false], throw: [10, false], shoot: [10, false],
      climb: [8, true], climb_top: [8, false], climb_shoot: [10, false], hang: [4, true], hang_up: [8, true], hang_end: [8, false], roll: [12, false], land: [10, false],
      legs_idle: [4, true], legs_walk: [8, true], legs_run: [12, true], legs_jump: [8, false], legs_crouch: [8, false],
      top_gun: [4, true], top_shoot: [20, false], top_up: [4, true], top_up_shoot: [20, false], top_diag: [4, true], top_diag_shoot: [20, false], rifle_top: [4, true], rifle_shoot: [24, true], rifle_up: [4, true], rifle_up_shoot: [24, true], rifle_diag: [4, true], rifle_diag_shoot: [24, true],
      top_down: [4, true], top_down_shoot: [20, false], top_ddiag: [4, true], top_ddiag_shoot: [20, false], double_jump: [12, false], dash: [12, true], attack_up: [12, false], attack_down: [10, false] };
    const PLAT_SKIP = ["gun_idle", "gun_walk", "gun_shoot", "jump_knee", "rifle_top", "rifle_shoot", "rifle_up", "rifle_up_shoot", "rifle_diag", "rifle_diag_shoot", "dash"];
    const PLAT_ONLY = ["climb", "climb_top", "climb_shoot", "hang", "hang_up", "hang_end", "roll", "land", "legs_idle", "legs_walk", "legs_run", "legs_jump", "legs_crouch",
      "top_gun", "top_shoot", "top_up", "top_up_shoot", "top_diag", "top_diag_shoot", "top_down", "top_down_shoot", "top_ddiag", "top_ddiag_shoot", "double_jump", "dash", "roll", "attack_up", "attack_down", "rifle_top", "rifle_shoot", "rifle_up", "rifle_up_shoot", "rifle_diag", "rifle_diag_shoot"];
    const all = (a, list) => Object.entries(list).forEach(([k, fr]) => { if (k === "crouch" || k === "crouch_attack") { if (hasDepth()) return; } if (PLAT_ONLY.includes(k) && (!isPlat() || a.kind !== "player")) return; if (isPlat() && a.kind === "player" && PLAT_SKIP.includes(k)) return; setAnim(a, k, fr, SPD[k][0], SPD[k][1]); });
    const { throw: _t, shoot: _s, block: _b, ...plAnims } = an;
    { const noSplit = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !/^(legs_|top_|rifle_)/.test(k))); all(pl, isPlat() ? noSplit({ ...plAnims, block: an.block }) : plAnims); }   // sem corpo dividido
    // combo do jogador: Jab → Direto → Gancho; Frente + Ataque depois do Jab sai a Cotovelada
    const atk = (name, anim, damage, knockdown) => ({ id: uid("atk_"), name, anim, damage, type: "hitbox", knockdown });
    pl.attacks = [atk("Jab", "attack1", 6, false), atk("Direto", "attack2", 7, false), atk("Gancho", "attack3", 10, true), atk("Cotovelada", "attack4", 8, false)];
    const [j, d, g, c] = pl.attacks.map((k) => k.id);
    pl.combo = [{ from: j, to: d, chance: 100, cond: "atk" }, { from: d, to: g, chance: 100, cond: "atk" }, { from: j, to: c, chance: 100, cond: "fwd" }, { from: c, to: g, chance: 100, cond: "atk" }];
    if (isPlat()) Object.assign(pl.props, { doubleJump: true, canBlock: true, meleeDir: true });
    finish(pl);

    const en = newActor("enemy"); en.name = isPlat() ? "Inimigo parado (exemplo)" : "Capanga (exemplo)";
    an = fighterAnims(C(6, 1, 1), C(4, 0, 0), C(1, 1, 1));
    const { special: _sp, jump_knee: _jk, run: _r, run_attack: _ra, grabbed: _gb, gun_idle: _g1, gun_walk: _g2, gun_shoot: _g3, ...enAnims } = an;
    all(en, { ...enAnims,
      ...(!hasDepth() ? { crouch: an.crouch, crouch_attack: an.crouch_attack } : {}) });
    en.attacks = [{ id: uid("atk_"), name: "Soco", anim: "attack1", damage: 6, type: "hitbox", knockdown: false },
      { id: uid("atk_"), name: "Cotovelada", anim: "attack4", damage: 7, type: "hitbox", knockdown: false },
      { id: uid("atk_"), name: "Chute", anim: "attack2", damage: 9, type: "hitbox", knockdown: true }];
    finish(en);
    // faca: sprite do projetil que o capanga arremessa
    const kn = newActor("projectile"); kn.name = "Faca (exemplo)";
    kn.props.speed = 3;
    setAnim(kn, "idle", [addFrame(frameCanvas(16, 8, (g) => { R(g, OUT, 0, 2, 16, 4); R(g, C(6, 6, 7), 5, 3, 10, 2); R(g, C(3, 1, 0), 1, 3, 4, 2); }), 8, 7)], 1, true);
    finish(kn);
    en.attacks[2].height = "low";   // o chute pega no estomago (hurt_low)
    en.combo = [{ from: en.attacks[0].id, to: en.attacks[1].id, chance: 50 }, { from: en.attacks[0].id, to: en.attacks[2].id, chance: 30, delay: 24 }, { from: en.attacks[1].id, to: en.attacks[2].id, chance: 60, delay: 12 }];
    en.attacks.push({ id: uid("atk_"), name: "Faca", anim: "throw", damage: 8, type: "projectile", proj: kn.id, knockdown: false });
    en.specials = [{ type: "flykick", on: true, chance: 20, damage: 10, proj: null, speed: 0 }];

    const ob = newActor("object"); ob.name = "Barril (exemplo)";
    setAnim(ob, "idle", [addFrame(barrel(false), 12, 31, { hurt: { x: 2, y: 1, w: 20, h: 31 } })], 1, true);
    setAnim(ob, "broken", [addFrame(barrel(true), 12, 31)], 1, false);
    finish(ob);

    // armas: cano, revolver e metralhadora (jogador tem as animacoes segurando cada uma)
    // arma: idle = desenho na mao (ponto de pega no cabo), ground = no chao
    const wpn = (name, wtype, extra, draw, grip) => {
      const w = newActor("weapon"); w.name = name; Object.assign(w.props, { wtype }, extra);
      setAnim(w, "idle", [addFrame(frameCanvas(24, 8, draw), grip.x, grip.y, { hand: grip })], 1, true);
      setAnim(w, "ground", [addFrame(frameCanvas(24, 8, draw), 12, 7)], 1, true); finish(w); return w;
    };
    const cano = wpn("Cano (exemplo)", "melee", { damage: 12, uses: 8, knockdown: false, reach: 16, hitsToDrop: 3, pickups: 3 }, (g) => { R(g, OUT, 0, 2, 24, 5); R(g, C(4, 4, 5), 1, 3, 22, 3); }, { x: 2, y: 4 });
    const bala = newActor("projectile"); bala.name = "Bala (exemplo)"; bala.props.speed = 7;
    setAnim(bala, "idle", [addFrame(frameCanvas(8, 4, (g) => { R(g, C(7, 7, 3), 0, 1, 8, 2); }), 4, 3)], 1, true); finish(bala);
    const rev = wpn("Revólver (exemplo)", "revolver", { damage: 14, uses: 6, bullet: bala.id, hitsToDrop: 2, pickups: 3 }, (g) => { R(g, OUT, 4, 1, 16, 6); R(g, C(1, 1, 1), 5, 2, 14, 4); R(g, OUT, 6, 6, 4, 2); }, { x: 7, y: 6 });
    const mg = wpn("Metralhadora (exemplo)", "machinegun", { damage: 5, uses: 40, rate: 5, bullet: bala.id, hitsToDrop: 2, pickups: 3 }, (g) => { R(g, OUT, 0, 1, 24, 6); R(g, C(1, 1, 1), 1, 2, 22, 4); R(g, OUT, 8, 6, 4, 2); }, { x: 9, y: 6 });
    const it = newActor("item"); it.name = "Frango (exemplo)";
    it.props.itemType = "heal_big"; it.props.value = 40;
    ob.drops = [{ item: it.id, chance: 60 }];
    setAnim(it, "idle", [addFrame(chicken(), 8, 15)], 1, true);
    finish(it);

    const L0 = P.layouts[0];
    if (isPlat()) {
      // plataforma: por enquanto so o patrulheiro (os outros comportamentos continuam disponiveis no editor de comportamentos)
      en.name = "Patrulheiro (exemplo)";
      en.attacks = en.attacks.filter((k) => k.type !== "projectile"); en.combo = []; en.specials = [];
      patrolCombo(en);
      en.behavior = { arch: "patrol", params: { see: 140 }, mods: { strafe: false, flank: false, friendly: false } };
      delete P.actors[kn.id];
      const pat = en;
      platDemo(L0, { en, it, rev, mg, cano, ob, pat });
      return pl;
    }
    L0.instances = L0.instances || [];
    const y = hasDepth() ? 190 : 200;
    L0.instances.push({ id: uid("in_"), actor: en.id, x: 260, y, flip: true });
    L0.instances.push({ id: uid("in_"), actor: ob.id, x: 180, y: y - 14, flip: false });
    L0.instances.push({ id: uid("in_"), actor: cano.id, x: 110, y: y + 6, flip: false });
    L0.instances.push({ id: uid("in_"), actor: rev.id, x: 400, y: y + 6, flip: false });
    return pl;
  }
  /* fase de exemplo do modo plataforma: cenario desenhado igual a colisao, com todos os tipos de tile */
  function platDemo(L0, A) {
    const W = 1600, H = 448, TW = W / 8, TH = H / 8;
    L0.width = W; L0.height = H; L0.bgColor = "#24246d";
    L0.zones = [{ id: uid("cam_"), name: "Área 1", x: 0, y: 0, w: W, h: H, mode: "follow", lerp: 0.15, delay: 0, lockY: false, lockScroll: false }];
    L0.transitions = []; L0.groups = []; L0.objs = [];
    L0.spawn = { x: 48, y: 410 };
    const d = new Array(TW * TH).fill("0");
    const box = (x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) d[y * TW + x] = String(v); };
    box(0, 52, TW - 1, 55, 1);              // chao
    box(88, 52, 95, 55, 0); box(88, 55, 95, 55, 5);   // abismo
    box(60, 51, 63, 51, 4);                 // espinhos
    box(20, 40, 43, 40, 2); box(29, 40, 31, 51, 3);   // plataforma atravessavel + escada larga (3 tiles)
    box(108, 44, 123, 51, 1); d[44 * TW + 108] = "6"; d[44 * TW + 123] = "6";   // bloco alto com bordas para pendurar
    box(130, 34, 153, 34, 2); box(133, 34, 135, 43, 3);   // plataforma alta + escada larga saindo do bloco
    box(100, 30, 103, 31, 1); box(100, 30, 103, 30, 6);   // bloco solto com borda em cima (agarrar no pulo vindo do bloco)
    box(170, 46, 171, 51, 1);               // parede
    L0.col = { w: TW, h: TH, d: d.join("") };
    // sem imagem de fundo: a engine desenha a colisao sozinha (desenho padrao) sobre a cor de fundo da fase
    L0.backgrounds = []; L0.autoCol = true;
    L0.camSmooth = 6;
    A.rev.props.infiniteAmmo = true; A.mg.props.infiniteAmmo = true;   // por enquanto municao infinita
    const I = (actor, x, y, flip) => ({ id: uid("in_"), actor: actor.id, x, y, flip: !!flip });
    L0.instances = [
      I(A.rev, 110, 414), I(A.cano, 150, 414), I(A.mg, 260, 318),
      I(A.pat, 420, 410, true),                   // patrulheiros por toda a fase
      I(A.ob, 200, 414), I(A.ob, 520, 414), I(A.ob, 1300, 414),   // barris quebraveis (o do meio solta frango)
      I(A.pat, 300, 316, true),                   // patrulheiro na plataforma de cima
      I(A.pat, 960, 350, true),                   // em cima do bloco alto
      I(A.pat, 640, 410, true), I(A.pat, 1120, 270, true), I(A.pat, 1450, 410, true),
      I(A.it, 1150, 270),
    ];
  }
  return { create };
})();
