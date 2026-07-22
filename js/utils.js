/* ==========================================================================
 * Tower Quest : Curiosity — utils.js
 * Fonctions utilitaires + générateur de nombres pseudo-aléatoires seedé.
 * ======================================================================== */
(function (global) {
  "use strict";

  // Mulberry32 : PRNG rapide et déterministe à partir d'une seed entière.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Petite classe RNG avec des helpers pratiques.
  class RNG {
    constructor(seed) {
      this.next = mulberry32(seed >>> 0);
    }
    float(min = 0, max = 1) { return min + (max - min) * this.next(); }
    int(min, max) { return Math.floor(this.float(min, max + 1)); } // inclusif
    bool(p = 0.5) { return this.next() < p; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
  }

  // Combine plusieurs entiers en une seule seed stable.
  function makeSeed(...parts) {
    let h = 2166136261 >>> 0;
    for (const p of parts) {
      h ^= (p | 0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  // Détection tactile (utilisée pour afficher les contrôles mobiles).
  function isTouchDevice() {
    return ("ontouchstart" in window) ||
      (navigator.maxTouchPoints > 0) ||
      (navigator.msMaxTouchPoints > 0);
  }

  global.TQ = global.TQ || {};
  global.TQ.RNG = RNG;
  global.TQ.makeSeed = makeSeed;
  global.TQ.clamp = clamp;
  global.TQ.lerp = lerp;
  global.TQ.isTouchDevice = isTouchDevice;
})(window);
