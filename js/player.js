/* ==========================================================================
 * Tower Quest : Curiosity — player.js
 * Physique du personnage : marche + saut (gravité) dans les couloirs,
 * escalade libre sur les échelles (puits verticaux du labyrinthe).
 * Toutes les unités sont en pixels-monde. TILE = taille d'une tuile.
 * ======================================================================== */
(function (global) {
  "use strict";

  const TILE = global.TQ.TILEPX = 24; // taille d'une tuile en pixels-monde

  const GRAVITY = 0.9;
  const MAX_FALL = 12;
  const MOVE_SPEED = 3.1;
  const CLIMB_SPEED = 2.6;
  const JUMP_VEL = -9.2;

  class Player {
    constructor() {
      this.w = TILE * 0.56;
      this.h = TILE * 0.82;
      this.x = 0; this.y = 0;
      this.vx = 0; this.vy = 0;
      this.onGround = false;
      this.onLadder = false;
      this.facing = 1;
      this.animT = 0;
      this.walking = false;
      this.spawnX = 0; this.spawnY = 0;
    }

    // Place le joueur centré sur une tuile (tx,ty), pieds posés dedans.
    spawnAtTile(tx, ty, remember = true) {
      this.x = tx * TILE + (TILE - this.w) / 2;
      this.y = ty * TILE + (TILE - this.h);
      this.vx = 0; this.vy = 0;
      this.onGround = false;
      if (remember) { this.spawnX = this.x; this.spawnY = this.y; }
    }

    respawn() {
      this.x = this.spawnX; this.y = this.spawnY;
      this.vx = 0; this.vy = 0;
    }

    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
    tileX() { return Math.floor(this.cx / TILE); }
    tileY() { return Math.floor(this.cy / TILE); }

    update(maze, input) {
      const st = input.state;
      const dir = (st.right ? 1 : 0) - (st.left ? 1 : 0);
      if (dir !== 0) this.facing = dir;

      // Sommes-nous sur une échelle ? (centre du joueur sur une tuile échelle)
      const midTx = Math.floor(this.cx / TILE);
      const midTy = Math.floor(this.cy / TILE);
      // On teste le centre et les pieds pour des transitions fluides.
      const onLadderTile = maze.isLadder(midTx, midTy) ||
        maze.isLadder(midTx, Math.floor((this.y + this.h - 2) / TILE));

      // --- Mouvement horizontal (direct, pour un contrôle net en labyrinthe) ---
      this.vx = dir * MOVE_SPEED;

      // Échelle style « Lode Runner » : dès qu'on est sur une tuile échelle,
      // la gravité est suspendue (on flotte), ce qui rend TOUT puits et
      // carrefour traversable sans jamais rester bloqué. Le saut décroche.
      this.onLadder = onLadderTile;

      if (this.onLadder) {
        const vdir = (st.down ? 1 : 0) - (st.up ? 1 : 0);
        this.vy = vdir * CLIMB_SPEED;
        if (st.jump) { this.onLadder = false; this.vy = JUMP_VEL; }
      } else {
        // --- Mode plateforme : gravité ---
        this.vy += GRAVITY;
        if (this.vy > MAX_FALL) this.vy = MAX_FALL;
        if (st.jump && this.onGround) {
          this.vy = JUMP_VEL;
          this.onGround = false;
        }
      }

      this._moveAndCollide(maze);

      // Anim de marche
      this.walking = this.onGround && Math.abs(this.vx) > 0.1;
      if (this.walking || this.onLadder) this.animT += 0.25; else this.animT = 0;
    }

    _moveAndCollide(maze) {
      const T = TILE;
      // --- Axe X ---
      this.x += this.vx;
      if (this.vx !== 0) {
        const top = Math.floor(this.y / T);
        const bot = Math.floor((this.y + this.h - 1) / T);
        if (this.vx > 0) {
          const col = Math.floor((this.x + this.w) / T);
          for (let ty = top; ty <= bot; ty++) {
            if (maze.isSolid(col, ty)) { this.x = col * T - this.w - 0.001; this.vx = 0; break; }
          }
        } else {
          const col = Math.floor(this.x / T);
          for (let ty = top; ty <= bot; ty++) {
            if (maze.isSolid(col, ty)) { this.x = (col + 1) * T + 0.001; this.vx = 0; break; }
          }
        }
      }

      // --- Axe Y ---
      this.y += this.vy;
      this.onGround = false;
      if (this.vy !== 0) {
        const left = Math.floor(this.x / T);
        const right = Math.floor((this.x + this.w - 1) / T);
        if (this.vy > 0) {
          const row = Math.floor((this.y + this.h) / T);
          for (let tx = left; tx <= right; tx++) {
            if (maze.isSolid(tx, row)) { this.y = row * T - this.h - 0.001; this.vy = 0; this.onGround = true; break; }
          }
        } else {
          const row = Math.floor(this.y / T);
          for (let tx = left; tx <= right; tx++) {
            if (maze.isSolid(tx, row)) { this.y = (row + 1) * T + 0.001; this.vy = 0; break; }
          }
        }
      }
    }

    // AABB de collision avec une tuile (tx,ty).
    overlapsTile(tx, ty, shrink = 0) {
      const T = TILE;
      return this.x + shrink < (tx + 1) * T &&
        this.x + this.w - shrink > tx * T &&
        this.y + shrink < (ty + 1) * T &&
        this.y + this.h - shrink > ty * T;
    }
  }

  global.TQ = global.TQ || {};
  global.TQ.Player = Player;
})(window);
