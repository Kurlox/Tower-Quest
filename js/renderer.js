/* ==========================================================================
 * Tower Quest : Curiosity — renderer.js
 * Rendu pixel-art dessiné par code (aucune image externe).
 * Caméra qui suit le joueur, mise à l'échelle responsive PC/mobile.
 * ======================================================================== */
(function (global) {
  "use strict";

  const T = 24; // taille tuile monde (doit matcher player.js TILEPX)
  const TILE = global.TQ.TILE;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.cam = { x: 0, y: 0 };
      this.scale = 2;
      this.time = 0;
      this.visionTiles = 3.4; // rayon de vision (en tuiles) sous le brouillard
      this.resize();
      window.addEventListener("resize", () => this.resize());
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.canvas.style.width = w + "px";
      this.canvas.style.height = h + "px";
      this.vw = w; this.vh = h;
      // On veut ~15 tuiles de haut visibles, borné pour rester lisible.
      const tileScreen = global.TQ.clamp(Math.min(w, h) / 15, 20, 46);
      this.scale = tileScreen / T;
      this.ctx.imageSmoothingEnabled = false;
    }

    centerOn(px, py, maze) {
      const viewW = this.vw / this.scale;
      const viewH = this.vh / this.scale;
      let cx = px - viewW / 2;
      let cy = py - viewH / 2;
      const worldW = maze.w * T, worldH = maze.h * T;
      // Clamp caméra aux bornes du monde (sauf si plus petit que l'écran).
      if (worldW > viewW) cx = global.TQ.clamp(cx, 0, worldW - viewW);
      else cx = (worldW - viewW) / 2;
      if (worldH > viewH) cy = global.TQ.clamp(cy, 0, worldH - viewH);
      else cy = (worldH - viewH) / 2;
      this.cam.x = cx; this.cam.y = cy;
    }

    render(scene) {
      const { ctx } = this;
      this.time += 1;
      const maze = scene.maze, player = scene.player;
      this.centerOn(player.cx, player.cy, maze);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this._background(scene);

      ctx.save();
      ctx.scale(this.scale, this.scale);
      ctx.translate(-this.cam.x, -this.cam.y);

      this._drawTiles(maze);
      this._drawEntities(scene);
      this._drawPlayer(player);

      ctx.restore();

      // Brouillard « à la Pokémon » : tout est noir sauf un halo autour du
      // joueur, sauf si le labyrinthe a été révélé (lanterne ramassée).
      if (scene.fog && !scene.revealed) this._fog(player);
    }

    _fog(player) {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const sx = (player.cx - this.cam.x) * this.scale;
      const sy = (player.cy - this.cam.y) * this.scale;
      const r = this.visionTiles * T * this.scale;
      const flick = 1 + 0.03 * Math.sin(this.time * 0.3); // léger vacillement
      const g = ctx.createRadialGradient(sx, sy, r * 0.32, sx, sy, r * flick);
      g.addColorStop(0, "rgba(4,3,10,0)");
      g.addColorStop(0.62, "rgba(4,3,10,0.35)");
      g.addColorStop(0.85, "rgba(4,3,10,0.82)");
      g.addColorStop(1, "rgba(4,3,10,0.985)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.vw, this.vh);
    }

    _background(scene) {
      const { ctx } = this;
      const floor = scene.floorIndex || 0;
      // Teinte du ciel qui évolue avec l'étage (plus on monte, plus c'est violet/rouge).
      const hue1 = 250 - floor * 8;
      const g = ctx.createLinearGradient(0, 0, 0, this.vh);
      g.addColorStop(0, `hsl(${hue1}, 45%, 10%)`);
      g.addColorStop(1, `hsl(${hue1 + 20}, 40%, 5%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.vw, this.vh);

      // Étoiles parallax discrètes.
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      const camX = this.cam.x * 0.2, camY = this.cam.y * 0.2;
      for (let i = 0; i < 40; i++) {
        const sx = ((i * 97.3 - camX) % this.vw + this.vw) % this.vw;
        const sy = ((i * 61.7 - camY) % this.vh + this.vh) % this.vh;
        const s = (i % 3) + 1;
        ctx.fillRect(sx, sy, s, s);
      }
    }

    _drawTiles(maze) {
      const { ctx } = this;
      const viewW = this.vw / this.scale, viewH = this.vh / this.scale;
      const x0 = Math.max(0, Math.floor(this.cam.x / T) - 1);
      const y0 = Math.max(0, Math.floor(this.cam.y / T) - 1);
      const x1 = Math.min(maze.w - 1, Math.ceil((this.cam.x + viewW) / T) + 1);
      const y1 = Math.min(maze.h - 1, Math.ceil((this.cam.y + viewH) / T) + 1);

      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const type = maze.tiles[ty][tx];
          const px = tx * T, py = ty * T;
          if (type === global.TQ.TILE.WALL) {
            this._wall(px, py, tx, ty, maze);
          } else if (type === global.TQ.TILE.LADDER) {
            this._ladder(px, py);
          }
        }
      }
    }

    _wall(px, py, tx, ty, maze) {
      const { ctx } = this;
      // Bloc de brique deux tons + liseré haut si de l'air au-dessus.
      ctx.fillStyle = "#241a3d";
      ctx.fillRect(px, py, T, T);
      ctx.fillStyle = "#2f2352";
      // motif brique
      const row = ty % 2 === 0 ? 0 : T / 2;
      ctx.fillRect(px + 1, py + 1, T / 2 - 2, T / 2 - 2);
      ctx.fillRect(px + T / 2 + 1, py + 1, T / 2 - 2, T / 2 - 2);
      ctx.fillRect(px + 1, py + T / 2 + 1, T / 2 - 2, T / 2 - 2);
      ctx.fillRect(px + T / 2 + 1, py + T / 2 + 1, T / 2 - 2, T / 2 - 2);
      // liseré supérieur (herbe / rebord) si tuile du dessus non pleine
      if (ty > 0 && maze.tiles[ty - 1][tx] !== global.TQ.TILE.WALL) {
        ctx.fillStyle = "#4a3a86";
        ctx.fillRect(px, py, T, 3);
        ctx.fillStyle = "#6a54c0";
        ctx.fillRect(px, py, T, 1);
      }
    }

    _ladder(px, py) {
      const { ctx } = this;
      ctx.strokeStyle = "#8a6a3a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + 5.5, py); ctx.lineTo(px + 5.5, py + T);
      ctx.moveTo(px + T - 5.5, py); ctx.lineTo(px + T - 5.5, py + T);
      ctx.stroke();
      ctx.strokeStyle = "#b8894f";
      ctx.beginPath();
      for (let r = 4; r < T; r += 7) { ctx.moveTo(px + 4, py + r); ctx.lineTo(px + T - 4, py + r); }
      ctx.stroke();
    }

    _drawEntities(scene) {
      const { ctx } = this;
      const tpx = this.time;
      for (const e of scene.maze.entities) {
        if (e.taken) continue; // lanterne déjà ramassée
        const px = e.tx * T, py = e.ty * T;
        switch (e.type) {
          case "spike": this._spike(px, py); break;
          case "teleporter": this._teleporter(px, py, e.variant, tpx); break;
          case "exit": this._exit(px, py, tpx); break;
          case "deadend": this._deadend(px, py); break;
          case "flash": this._flash(px, py, tpx); break;
          case "door": this._door(px, py, e, tpx); break;
        }
      }
    }

    _spike(px, py) {
      const { ctx } = this;
      ctx.fillStyle = "#c9c9d6";
      const n = 3;
      const w = T / n;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(px + i * w, py + T);
        ctx.lineTo(px + i * w + w / 2, py + T * 0.42);
        ctx.lineTo(px + (i + 1) * w, py + T);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = "#ff5470";
      ctx.fillRect(px, py + T - 2, T, 2);
    }

    _teleporter(px, py, variant, tpx) {
      const { ctx } = this;
      const colors = { closer: "#37e0c8", far: "#ffb347", entrance: "#ff5470" };
      const c = colors[variant] || "#9b7cff";
      const cx = px + T / 2, cy = py + T / 2;
      const pulse = 0.5 + 0.5 * Math.sin(tpx * 0.12);
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.2 * pulse;
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(cx, cy, T * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        const a = tpx * 0.1 + (k * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(cx, cy, T * 0.28 + k, a, a + Math.PI * 1.1);
        ctx.stroke();
      }
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    _exit(px, py, tpx) {
      const { ctx } = this;
      const cx = px + T / 2, cy = py + T / 2;
      const pulse = 0.5 + 0.5 * Math.sin(tpx * 0.08);
      ctx.save();
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, T * 0.7);
      g.addColorStop(0, "#eaffff");
      g.addColorStop(0.5, "#37e0c8");
      g.addColorStop(1, "rgba(55,224,200,0)");
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.7 + 0.3 * pulse;
      ctx.fillRect(px - T * 0.4, py - T * 0.4, T * 1.8, T * 1.8);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#0d0b1a";
      ctx.fillRect(cx - 6, cy - 9, 12, 18);
      ctx.strokeStyle = "#eaffff"; ctx.lineWidth = 2;
      ctx.strokeRect(cx - 6, cy - 9, 12, 18);
      ctx.restore();
    }

    _deadend(px, py) {
      const { ctx } = this;
      const cx = px + T / 2, cy = py + T / 2;
      ctx.strokeStyle = "#ff5470";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 7, cy - 7); ctx.lineTo(cx + 7, cy + 7);
      ctx.moveTo(cx + 7, cy - 7); ctx.lineTo(cx - 7, cy + 7);
      ctx.stroke();
    }

    _flash(px, py, tpx) {
      const { ctx } = this;
      const cx = px + T / 2, cy = py + T / 2;
      const pulse = 0.5 + 0.5 * Math.sin(tpx * 0.14);
      // Halo lumineux (visible même dans le brouillard une fois proche).
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, T * (0.9 + 0.2 * pulse));
      g.addColorStop(0, "rgba(255,240,180,0.9)");
      g.addColorStop(0.5, "rgba(255,210,90,0.35)");
      g.addColorStop(1, "rgba(255,210,90,0)");
      ctx.fillStyle = g;
      ctx.fillRect(px - T, py - T, T * 3, T * 3);
      // Lanterne (petit corps + anse).
      ctx.strokeStyle = "#caa24a"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy - 6, 3, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = "#3a2f14";
      ctx.fillRect(cx - 4, cy - 5, 8, 3);
      ctx.fillStyle = "#ffe08a";
      ctx.fillRect(cx - 4, cy - 2, 8, 8);
      ctx.fillStyle = "#fff4c2";
      ctx.fillRect(cx - 2, cy, 4, 5);
      ctx.fillStyle = "#3a2f14";
      ctx.fillRect(cx - 4, cy + 6, 8, 2);
    }

    _door(px, py, e, tpx) {
      const { ctx } = this;
      // Arche de porte posée sur le sol.
      const doorW = T * 1.2, doorH = T * 1.6;
      const dx = px + T / 2 - doorW / 2;
      const dy = py + T - doorH;
      ctx.fillStyle = e.explored ? "#3a3358" : "#5a3fa0";
      this._roundTop(dx, dy, doorW, doorH, doorW / 2);
      ctx.fill();
      ctx.fillStyle = e.explored ? "#241f38" : "#7c5cff";
      this._roundTop(dx + 3, dy + 3, doorW - 6, doorH - 3, (doorW - 6) / 2);
      ctx.fill();
      // Numéro
      ctx.fillStyle = "#eaffff";
      ctx.font = `bold ${T * 0.7}px "Trebuchet MS", sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(e.label), px + T / 2, dy + doorH * 0.55);
      if (e.explored) {
        ctx.fillStyle = e.wasExit ? "#37e0c8" : "#ff5470";
        ctx.font = `bold ${T * 0.5}px sans-serif`;
        ctx.fillText(e.wasExit ? "✓" : "✗", px + T / 2, dy - 6);
      }
    }

    _roundTop(x, y, w, h, r) {
      const { ctx } = this;
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
    }

    _drawPlayer(p) {
      const { ctx } = this;
      const x = p.x, y = p.y, w = p.w, h = p.h;
      const bob = p.walking ? Math.sin(p.animT) * 1.2 : 0;
      // Ombre
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h + 1, w * 0.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      // Corps (petit·e explorateur·rice)
      ctx.save();
      ctx.translate(x, y + bob);
      // cape
      ctx.fillStyle = "#37e0c8";
      ctx.fillRect(w * 0.12, h * 0.35, w * 0.76, h * 0.5);
      // torse
      ctx.fillStyle = "#7c5cff";
      ctx.fillRect(w * 0.18, h * 0.35, w * 0.64, h * 0.45);
      // tête
      ctx.fillStyle = "#ffd9a8";
      ctx.fillRect(w * 0.22, h * 0.05, w * 0.56, h * 0.34);
      // casque / cheveux
      ctx.fillStyle = "#2a1a5a";
      ctx.fillRect(w * 0.2, h * 0.02, w * 0.6, h * 0.14);
      // yeux (selon direction)
      ctx.fillStyle = "#1a1030";
      const eyeX = p.facing >= 0 ? w * 0.55 : w * 0.3;
      ctx.fillRect(eyeX, h * 0.2, 2.5, 3);
      // jambes animées
      ctx.fillStyle = "#2a1a5a";
      const stride = p.walking ? Math.sin(p.animT) * w * 0.18 : 0;
      ctx.fillRect(w * 0.24 + stride, h * 0.8, w * 0.2, h * 0.2);
      ctx.fillRect(w * 0.56 - stride, h * 0.8, w * 0.2, h * 0.2);
      ctx.restore();
    }
  }

  global.TQ = global.TQ || {};
  global.TQ.Renderer = Renderer;
})(window);
