/* ==========================================================================
 * Tower Quest : Curiosity — input.js
 * Gestion unifiée clavier (PC) + tactile (smartphone).
 *
 * État exposé :
 *   Input.state = { left, right, up, down, jump, action }  (booléens maintenus)
 *   Input.pressed(name)  -> true UNE seule fois par appui (front montant)
 * ======================================================================== */
(function (global) {
  "use strict";

  const state = {
    left: false, right: false, up: false, down: false,
    jump: false, action: false
  };
  // Suivi des fronts montants (appuis) consommables via pressed().
  const edge = {};

  function set(name, value) {
    if (state[name] === value) return;
    state[name] = value;
    if (value) edge[name] = true;
  }

  // Consomme un appui : renvoie true une fois puis se réarme au relâchement.
  function pressed(name) {
    if (edge[name]) { edge[name] = false; return true; }
    return false;
  }

  // ---- Clavier ----
  const keyMap = {
    ArrowLeft: "left", KeyA: "left", KeyQ: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowUp: "up", KeyW: "up", KeyZ: "up",
    ArrowDown: "down", KeyS: "down",
    Space: "jump",
    Enter: "action", KeyE: "action",
    Escape: "back"
  };

  window.addEventListener("keydown", (e) => {
    const n = keyMap[e.code];
    if (!n) return;
    // "up" sert aussi d'action (entrer dans une porte / grimper).
    if (n === "jump" || n === "action") e.preventDefault();
    set(n, true);
    if (n === "back") edge.back = true;
  });
  window.addEventListener("keyup", (e) => {
    const n = keyMap[e.code];
    if (!n) return;
    set(n, false);
  });

  // ---- Tactile : contrôle au glissement du doigt (sans boutons visibles) ----
  // On pose le doigt n'importe où : la direction est donnée par le décalage
  // par rapport au point de départ (glisser à droite → aller à droite, etc.).
  // Un simple tap (sans glissement) = saut.
  const DEAD = 15;        // zone morte en px avant qu'une direction s'active
  const TAP_MS = 220;     // durée max d'un tap
  const TAP_DIST = 14;    // déplacement max d'un tap

  function pulseJump() {
    set("jump", true);
    edge.jump = true;
    // On maintient le saut quelques ms pour que la boucle 60 Hz le capte.
    setTimeout(() => { state.jump = false; }, 130);
  }

  const FLICK_V = 0.9;    // vitesse (px/ms) d'un coup de doigt vers le haut = saut

  function bindDrag(surface) {
    let id = null, sx = 0, sy = 0, startT = 0, moved = false;
    let lx = 0, ly = 0, lt = 0, lastJump = 0, suppressUp = 0;

    const applyDirs = (dx, dy) => {
      const now = Date.now();
      set("left", dx < -DEAD);
      set("right", dx > DEAD);
      set("up", dy < -DEAD && now > suppressUp); // pas de "monter" juste après un flick-saut
      set("down", dy > DEAD);
    };
    const clearDirs = () => {
      set("left", false); set("right", false);
      set("up", false); set("down", false);
    };

    surface.addEventListener("touchstart", (e) => {
      for (const t of e.changedTouches) {
        if (id === null) {
          // 1er doigt = manche de déplacement.
          id = t.identifier; sx = t.clientX; sy = t.clientY;
          startT = Date.now(); moved = false;
          lx = t.clientX; ly = t.clientY; lt = startT;
        } else {
          // 2e doigt (option) = saut.
          pulseJump();
        }
      }
      e.preventDefault();
    }, { passive: false });

    surface.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        const now = Date.now();
        const ddt = Math.max(8, now - lt);
        const vy = (t.clientY - ly) / ddt;   // px/ms, négatif = vers le haut
        const vx = (t.clientX - lx) / ddt;
        lx = t.clientX; ly = t.clientY; lt = now;
        // Coup de doigt rapide vers le haut = SAUT (jouable d'une seule main).
        if (vy < -FLICK_V && Math.abs(vy) > Math.abs(vx) * 0.7 && now - lastJump > 260) {
          pulseJump(); lastJump = now; suppressUp = now + 220;
        }
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.hypot(dx, dy) > TAP_DIST) moved = true;
        applyDirs(dx, dy);
      }
      e.preventDefault();
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        const dur = Date.now() - startT;
        if (!moved && dur < TAP_MS) pulseJump(); // tap = saut / valider
        id = null;
        clearDirs();
      }
    };
    surface.addEventListener("touchend", end, { passive: false });
    surface.addEventListener("touchcancel", end, { passive: false });
  }

  // Empêche le scroll / zoom parasite sur mobile.
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("touchmove", (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });

  function clearAll() {
    for (const k in state) state[k] = false;
    for (const k in edge) edge[k] = false;
  }

  global.TQ = global.TQ || {};
  global.TQ.Input = { state, pressed, bindDrag, clearAll };
})(window);
