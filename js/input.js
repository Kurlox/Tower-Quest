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

  // ---- Tactile ----
  function bindTouch() {
    const btns = document.querySelectorAll(".tbtn");
    btns.forEach((btn) => {
      const key = btn.dataset.key;
      const on = (ev) => { ev.preventDefault(); set(key, true); btn.classList.add("active"); };
      const off = (ev) => { ev.preventDefault(); set(key, false); btn.classList.remove("active"); };
      btn.addEventListener("touchstart", on, { passive: false });
      btn.addEventListener("touchend", off, { passive: false });
      btn.addEventListener("touchcancel", off, { passive: false });
      // Support souris (tests desktop des boutons tactiles).
      btn.addEventListener("mousedown", on);
      btn.addEventListener("mouseup", off);
      btn.addEventListener("mouseleave", (ev) => { if (state[key]) off(ev); });
    });
  }

  // Empêche le scroll / zoom parasite sur mobile.
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("touchmove", (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });

  function clearAll() {
    for (const k in state) state[k] = false;
    for (const k in edge) edge[k] = false;
  }

  global.TQ = global.TQ || {};
  global.TQ.Input = { state, pressed, bindTouch, clearAll };
})(window);
