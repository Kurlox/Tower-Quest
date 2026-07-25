/* ==========================================================================
 * Tower Quest : Curiosity — particles.js
 * Petites particules (poussière, éclats, étincelles) dessinées en coordonnées
 * monde. Léger et sans allocation excessive.
 * ======================================================================== */
(function (global) {
  "use strict";

  const T = 24;
  const list = [];

  function add(x, y, vx, vy, life, size, color, grav) {
    list.push({ x, y, vx, vy, life, maxLife: life, size, color, grav: grav == null ? 0.25 : grav });
  }

  function jumpDust(cx, feetY) {
    for (let i = 0; i < 5; i++)
      add(cx + (Math.random() - 0.5) * 8, feetY, (Math.random() - 0.5) * 1.5, -Math.random() * 0.8,
        18 + Math.random() * 8, 2 + Math.random() * 2, "rgba(180,170,220,0.7)", 0.08);
  }
  function landDust(cx, feetY) {
    for (let i = 0; i < 8; i++)
      add(cx + (Math.random() - 0.5) * 12, feetY, (Math.random() - 0.5) * 3, -Math.random() * 1.2,
        16 + Math.random() * 8, 2 + Math.random() * 2, "rgba(160,150,200,0.6)", 0.1);
  }
  function deathBurst(cx, cy) {
    const cols = ["#ff5470", "#ffd9a8", "#ffffff", "#ff8aa0"];
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 4.5;
      add(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp - 1.5, 26 + Math.random() * 16,
        2 + Math.random() * 3, cols[(Math.random() * cols.length) | 0], 0.22);
    }
  }
  function sparkle(cx, cy, color, n) {
    for (let i = 0; i < (n || 14); i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 2.5;
      add(cx + (Math.random() - 0.5) * 10, cy + (Math.random() - 0.5) * 10,
        Math.cos(a) * sp, Math.sin(a) * sp - 1, 24 + Math.random() * 16,
        2 + Math.random() * 2, color, -0.02);
    }
  }
  function exitBurst(cx, cy) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 4;
      add(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp, 30 + Math.random() * 20,
        2 + Math.random() * 3, Math.random() < 0.5 ? "#37e0c8" : "#eaffff", -0.03);
    }
  }

  function update() {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.vy += p.grav;
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.96;
      p.life--;
      if (p.life <= 0) list.splice(i, 1);
    }
  }

  function draw(ctx) {
    for (const p of list) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function clear() { list.length = 0; }

  global.TQ = global.TQ || {};
  global.TQ.Particles = { jumpDust, landDust, deathBurst, sparkle, exitBurst, update, draw, clear, list };
})(window);
