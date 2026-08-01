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
      this.shakeAmt = 0;      // secousse d'écran (décroît)
      this.visionTiles = 3.4; // rayon de vision (en tuiles) sous le brouillard
      this.resize();
      window.addEventListener("resize", () => this.resize());
    }

    addShake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

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

    centerOn(px, py, maze, player) {
      const viewW = this.vw / this.scale;
      const viewH = this.vh / this.scale;
      // Anticipation : on regarde un peu devant/vers le mouvement du joueur.
      const lookX = player ? player.facing * T * 1.6 : 0;
      let cx = px + lookX - viewW / 2;
      let cy = py - viewH / 2;
      const worldW = maze.w * T, worldH = maze.h * T;
      if (worldW > viewW) cx = global.TQ.clamp(cx, 0, worldW - viewW);
      else cx = (worldW - viewW) / 2;
      if (worldH > viewH) cy = global.TQ.clamp(cy, 0, worldH - viewH);
      else cy = (worldH - viewH) / 2;
      // Suivi en douceur (lerp) ; on colle net si la cible saute loin
      // (changement de scène / téléportation).
      if (this._camInit && Math.hypot(cx - this.cam.x, cy - this.cam.y) < Math.max(viewW, viewH)) {
        this.cam.x += (cx - this.cam.x) * 0.16;
        this.cam.y += (cy - this.cam.y) * 0.16;
      } else {
        this.cam.x = cx; this.cam.y = cy; this._camInit = true;
      }
    }
    snapCam() { this._camInit = false; }

    render(scene) {
      const { ctx } = this;
      this.time += 1;
      const maze = scene.maze, player = scene.player;
      this.centerOn(player.cx, player.cy, maze, player);

      // Secousse d'écran.
      let shx = 0, shy = 0;
      if (this.shakeAmt > 0.2) {
        shx = (Math.random() - 0.5) * this.shakeAmt;
        shy = (Math.random() - 0.5) * this.shakeAmt;
        this.shakeAmt *= 0.85;
      } else this.shakeAmt = 0;

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this._background(scene);

      ctx.save();
      ctx.scale(this.scale, this.scale);
      ctx.translate(-this.cam.x + shx, -this.cam.y + shy);

      this._drawTiles(maze);
      this._drawEntities(scene);
      this._drawPlayer(player);
      if (global.TQ.Particles) global.TQ.Particles.draw(ctx);

      ctx.restore();

      // Brouillard « à la Pokémon » : tout est noir sauf un halo autour du
      // joueur. La lanterne le lève temporairement (scene.reveal 1→0 = fondu).
      if (scene.fog && (scene.reveal || 0) < 1) this._fog(player, scene.reveal || 0);
    }

    _fog(player, reveal) {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.save();
      ctx.globalAlpha = 1 - reveal; // fondu quand la lanterne est active
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
      ctx.restore();
    }

    _background(scene) {
      const { ctx } = this;
      const floor = scene.floorIndex || 0;
      if (scene.isHub) { this._hallBackground(floor); return; }
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

      // Tours lointaines (2 couches de parallaxe) → profondeur.
      this._distantTowers(0.10, `hsl(${hue1}, 35%, 8%)`, 0.62);
      this._distantTowers(0.22, `hsl(${hue1 + 8}, 32%, 11%)`, 0.72);

      // Poussières lumineuses qui dérivent.
      ctx.fillStyle = `hsla(${hue1 + 40}, 70%, 75%, 0.5)`;
      for (let i = 0; i < 22; i++) {
        const px = this.cam.x * 0.4;
        const dx = (i * 137.5 - px + this.time * 0.25 * ((i % 3) + 1)) % this.vw;
        const sx = (dx % this.vw + this.vw) % this.vw;
        const sy = ((i * 83.1 + Math.sin(this.time * 0.02 + i) * 12) % this.vh + this.vh) % this.vh;
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }
    }

    // Silhouettes de tours crénelées, ancrées en bas de l'écran.
    _distantTowers(parallax, color, baseY) {
      const { ctx } = this;
      ctx.fillStyle = color;
      const camX = this.cam.x * parallax;
      const period = 220, tw = 90, top = this.vh * baseY;
      for (let i = -1; i < this.vw / period + 2; i++) {
        const bx = i * period - (camX % period);
        ctx.fillRect(bx, top, tw, this.vh - top);
        // créneaux
        for (let c = 0; c < 4; c++) ctx.fillRect(bx + c * (tw / 4), top - 8, tw / 4 - 4, 8);
        // fenêtre lueur
        ctx.save();
        ctx.fillStyle = "hsla(45, 80%, 60%, 0.10)";
        ctx.fillRect(bx + tw * 0.35, top + 24, tw * 0.3, 14);
        ctx.restore();
      }
    }

    // Fond de « hall » : pierre sombre + grands piliers en arrière-plan.
    _hallBackground(floor) {
      const { ctx } = this;
      const hue = 260 - floor * 6;
      const g = ctx.createLinearGradient(0, 0, 0, this.vh);
      g.addColorStop(0, `hsl(${hue}, 30%, 8%)`);
      g.addColorStop(0.6, `hsl(${hue}, 28%, 12%)`);
      g.addColorStop(1, `hsl(${hue}, 25%, 6%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.vw, this.vh);
      // Piliers d'arrière-plan (parallax léger).
      const camX = this.cam.x * 0.35;
      const pillarW = 60, gap = 150;
      ctx.fillStyle = `hsla(${hue}, 30%, 16%, 0.55)`;
      for (let i = -1; i < this.vw / gap + 2; i++) {
        const px = i * gap - (camX % gap);
        ctx.fillRect(px, 0, pillarW, this.vh);
        ctx.fillStyle = `hsla(${hue}, 30%, 20%, 0.4)`;
        ctx.fillRect(px, 0, 6, this.vh);
        ctx.fillStyle = `hsla(${hue}, 30%, 16%, 0.55)`;
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
        const px = (e.type === "patrol" && e.x != null) ? e.x - T / 2 : e.tx * T;
        const py = e.ty * T;
        switch (e.type) {
          case "spike": this._spike(px, py); break;
          case "patrol": this._patrol(px, py, tpx); break;
          case "teleporter": this._teleporter(px, py, e.variant, tpx); break;
          case "exit": this._exit(px, py, tpx); break;
          case "deadend": this._deadend(px, py); break;
          case "flash": this._flash(px, py, tpx); break;
          case "gem": this._gem(px, py, tpx); break;
          case "torch": this._torch(px, py, tpx); break;
          case "banner": this._banner(px, py, e); break;
          case "door": this._door(px, py, e, tpx); break;
        }
      }
    }

    _patrol(px, py, tpx) {
      const { ctx } = this;
      const cx = px + T / 2, cy = py + T / 2, r = T * 0.34;
      const rot = tpx * 0.18;
      // Pointes
      ctx.fillStyle = "#c9c9d6";
      for (let i = 0; i < 8; i++) {
        const a = rot + i * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.lineTo(cx + Math.cos(a + 0.2) * r * 0.6, cy + Math.sin(a + 0.2) * r * 0.6);
        ctx.lineTo(cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r * 1.5);
        ctx.closePath(); ctx.fill();
      }
      // Corps
      ctx.fillStyle = "#3a2030";
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ff5470"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.stroke();
      // Œil menaçant
      ctx.fillStyle = "#ff5470";
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    }

    _gem(px, py, tpx) {
      const { ctx } = this;
      const cx = px + T / 2, cy = py + T / 2 + Math.sin(tpx * 0.1 + px) * 1.5;
      const sw = 0.6 + 0.4 * Math.abs(Math.sin(tpx * 0.08)); // scintillement
      const rw = T * 0.26, rh = T * 0.34;
      // Halo
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, T * 0.7);
      g.addColorStop(0, `rgba(55,224,200,${0.35 * sw})`);
      g.addColorStop(1, "rgba(55,224,200,0)");
      ctx.fillStyle = g;
      ctx.fillRect(px - T * 0.3, py - T * 0.3, T * 1.6, T * 1.6);
      // Diamant
      ctx.fillStyle = "#37e0c8";
      ctx.beginPath();
      ctx.moveTo(cx, cy - rh); ctx.lineTo(cx + rw, cy - rh * 0.2);
      ctx.lineTo(cx, cy + rh); ctx.lineTo(cx - rw, cy - rh * 0.2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#9bf7e8";
      ctx.beginPath();
      ctx.moveTo(cx, cy - rh); ctx.lineTo(cx + rw * 0.5, cy - rh * 0.2);
      ctx.lineTo(cx, cy + rh * 0.3); ctx.lineTo(cx - rw * 0.5, cy - rh * 0.2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#eafffb";
      ctx.fillRect(cx - 1.5, cy - rh * 0.7, 2, 4);
    }

    _torch(px, py, tpx) {
      const { ctx } = this;
      const cx = px + T / 2, cy = py + T * 0.5;
      const flick = 0.75 + 0.25 * Math.sin(tpx * 0.4 + px);
      // Halo chaud
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, T * 2.2 * flick);
      g.addColorStop(0, "rgba(255,200,110,0.5)");
      g.addColorStop(0.5, "rgba(255,150,60,0.14)");
      g.addColorStop(1, "rgba(255,150,60,0)");
      ctx.fillStyle = g;
      ctx.fillRect(px - T * 2, py - T * 2, T * 5, T * 5);
      // Support + flamme
      ctx.fillStyle = "#3a2f22";
      ctx.fillRect(cx - 2, cy, 4, T * 0.5);
      ctx.fillStyle = "#ffdf7a";
      ctx.beginPath();
      ctx.moveTo(cx, cy - T * 0.5 * flick);
      ctx.quadraticCurveTo(cx + 5, cy - 3, cx + 4, cy + 2);
      ctx.quadraticCurveTo(cx, cy + 4, cx - 4, cy + 2);
      ctx.quadraticCurveTo(cx - 5, cy - 3, cx, cy - T * 0.5 * flick);
      ctx.fill();
      ctx.fillStyle = "#ff8a3a";
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    }

    _banner(px, py, e) {
      const { ctx } = this;
      const cx = px + T / 2, y = py + T * 0.3;
      const text = (e.text || "").toUpperCase();
      ctx.font = `bold ${T * 0.85}px "Trebuchet MS", sans-serif`;
      const w = Math.max(ctx.measureText(text).width + T, T * 3);
      // Étoffe suspendue
      ctx.fillStyle = "#5a3fa0";
      ctx.fillRect(cx - w / 2, y, w, T * 1.3);
      ctx.fillStyle = "#7c5cff";
      ctx.fillRect(cx - w / 2, y, w, 4);
      // Pointes du bas
      ctx.fillStyle = "#5a3fa0";
      const n = Math.floor(w / (T * 0.5));
      for (let i = 0; i < n; i++) {
        const bx = cx - w / 2 + i * (w / n);
        ctx.beginPath();
        ctx.moveTo(bx, y + T * 1.3);
        ctx.lineTo(bx + w / n / 2, y + T * 1.6);
        ctx.lineTo(bx + w / n, y + T * 1.3);
        ctx.fill();
      }
      ctx.fillStyle = "#f4e9ff";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, cx, y + T * 0.68);
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
      const cx = px + T / 2;
      // Grande arche posée sur le sol.
      const doorW = T * 1.5, doorH = T * 2.3;
      const dx = cx - doorW / 2;
      const dy = py + T - doorH;
      const pulse = 0.5 + 0.5 * Math.sin(tpx * 0.08 + e.index);

      // Halo (portes non explorées « appellent »).
      if (!e.explored) {
        const g = ctx.createRadialGradient(cx, dy + doorH * 0.5, 4, cx, dy + doorH * 0.5, doorW);
        g.addColorStop(0, `rgba(124,92,255,${0.25 + 0.15 * pulse})`);
        g.addColorStop(1, "rgba(124,92,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(dx - T, dy - T, doorW + T * 2, doorH + T * 2);
      }
      // Cadre en pierre
      ctx.fillStyle = e.explored ? "#2c2740" : "#4a3a86";
      this._roundTop(dx - 3, dy - 3, doorW + 6, doorH + 3, doorW / 2 + 3);
      ctx.fill();
      // Battant
      ctx.fillStyle = e.explored ? "#211d33" : "#5a3fa0";
      this._roundTop(dx, dy, doorW, doorH, doorW / 2);
      ctx.fill();
      ctx.fillStyle = e.explored ? "#181425" : (e.near ? "#8f72ff" : "#3a2a6e");
      this._roundTop(dx + 4, dy + 4, doorW - 8, doorH - 4, (doorW - 8) / 2);
      ctx.fill();
      // Numéro
      ctx.fillStyle = e.explored ? "#6a6488" : "#eaffff";
      ctx.font = `bold ${T * 0.9}px "Trebuchet MS", sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(e.label), cx, dy + doorH * 0.5);

      if (e.explored) {
        // Verdict de la porte déjà tentée.
        ctx.fillStyle = e.wasExit ? "#37e0c8" : "#ff5470";
        ctx.font = `bold ${T * 0.7}px sans-serif`;
        ctx.fillText(e.wasExit ? "✓" : "✗", cx, dy - T * 0.5);
      } else if (e.near) {
        // Indice d'entrée qui flotte au-dessus.
        const by = dy - T * 0.7 + Math.sin(tpx * 0.2) * 3;
        ctx.fillStyle = "#37e0c8";
        ctx.font = `bold ${T * 0.6}px sans-serif`;
        ctx.fillText("▲", cx, by);
        ctx.font = `bold ${T * 0.42}px "Trebuchet MS", sans-serif`;
        ctx.fillText("ENTRER", cx, by - T * 0.6);
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
      const w = p.w, h = p.h;
      const t = p.animT;
      const climbing = p.onLadder;
      const airborne = !p.onGround && !climbing;
      const bob = (p.walking || climbing) ? Math.sin(t) * 1.2 : Math.sin(this.time * 0.08) * 0.6;

      // Ombre (s'atténue en l'air).
      const shA = airborne ? 0.15 : 0.35;
      ctx.fillStyle = `rgba(0,0,0,${shA})`;
      ctx.beginPath();
      ctx.ellipse(p.x + w / 2, p.y + h + 1, w * 0.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(p.x, p.y + bob);

      // Jambes selon l'état.
      ctx.fillStyle = "#2a1a5a";
      if (climbing) {
        const s = Math.sin(t) * h * 0.12;
        ctx.fillRect(w * 0.26, h * 0.78 + s, w * 0.2, h * 0.22);
        ctx.fillRect(w * 0.54, h * 0.78 - s, w * 0.2, h * 0.22);
      } else if (airborne) {
        const tuck = p.vy < 0 ? 0.14 : 0.0; // repliées en montée, tendues en chute
        ctx.fillRect(w * 0.24, h * (0.78 + tuck), w * 0.2, h * (0.22 - tuck));
        ctx.fillRect(w * 0.56, h * (0.78 + tuck), w * 0.2, h * (0.22 - tuck));
      } else {
        const stride = p.walking ? Math.sin(t) * w * 0.2 : 0;
        ctx.fillRect(w * 0.24 + stride, h * 0.8, w * 0.2, h * 0.2);
        ctx.fillRect(w * 0.56 - stride, h * 0.8, w * 0.2, h * 0.2);
      }

      // Cape (flotte en l'air / en marche).
      const capeSway = airborne ? h * 0.12 : (p.walking ? Math.abs(Math.sin(t)) * h * 0.06 : 0);
      ctx.fillStyle = "#37e0c8";
      ctx.beginPath();
      ctx.moveTo(w * 0.16, h * 0.34);
      ctx.lineTo(w * 0.84, h * 0.34);
      ctx.lineTo(w * 0.7, h * 0.86 + capeSway);
      ctx.lineTo(w * 0.3, h * 0.86 + capeSway);
      ctx.closePath();
      ctx.fill();

      // Torse.
      ctx.fillStyle = "#7c5cff";
      ctx.fillRect(w * 0.2, h * 0.35, w * 0.6, h * 0.45);

      // Bras (grimpe = alternés vers le haut ; sinon le long du corps).
      ctx.fillStyle = "#6a4ad0";
      if (climbing) {
        const a = Math.sin(t) * h * 0.1;
        ctx.fillRect(w * 0.1, h * 0.3 - a, w * 0.16, h * 0.24);
        ctx.fillRect(w * 0.74, h * 0.3 + a, w * 0.16, h * 0.24);
      } else if (airborne && p.vy < 0) {
        ctx.fillRect(w * 0.06, h * 0.26, w * 0.16, h * 0.22);
        ctx.fillRect(w * 0.78, h * 0.26, w * 0.16, h * 0.22);
      } else {
        ctx.fillRect(w * 0.12, h * 0.4, w * 0.14, h * 0.28);
        ctx.fillRect(w * 0.74, h * 0.4, w * 0.14, h * 0.28);
      }

      // Tête.
      ctx.fillStyle = "#ffd9a8";
      ctx.fillRect(w * 0.22, h * 0.05, w * 0.56, h * 0.34);
      // Casque / cheveux.
      ctx.fillStyle = "#2a1a5a";
      ctx.fillRect(w * 0.2, h * 0.02, w * 0.6, h * 0.14);
      // Yeux (direction) + clin d'œil occasionnel.
      const blink = (this.time % 200) < 6;
      ctx.fillStyle = "#1a1030";
      const eyeX = p.facing >= 0 ? w * 0.52 : w * 0.32;
      if (blink) ctx.fillRect(eyeX, h * 0.22, 3, 1.5);
      else ctx.fillRect(eyeX, h * 0.19, 2.6, 3.2);

      ctx.restore();
    }
  }

  global.TQ = global.TQ || {};
  global.TQ.Renderer = Renderer;
})(window);
