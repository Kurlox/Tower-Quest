/* ==========================================================================
 * Tower Quest : Curiosity — maze.js
 * Génération procédurale de labyrinthes (recursive backtracker → labyrinthe
 * parfait) puis conversion en grille de tuiles jouable en plateformer :
 *   - murs pleins (sol/plafond)
 *   - échelles dans tous les passages verticaux (jamais bloqué)
 *   - placement de pièges, téléporteurs, entrée et sortie
 * ======================================================================== */
(function (global) {
  "use strict";

  const TILE = {
    OPEN: 0,
    WALL: 1,
    LADDER: 2
  };

  // Directions cellulaires : [dx, dy, mur opposé]
  const DIRS = [
    { dx: 0, dy: -1, wall: "N", opp: "S" },
    { dx: 1, dy: 0, wall: "E", opp: "W" },
    { dx: 0, dy: 1, wall: "S", opp: "N" },
    { dx: -1, dy: 0, wall: "W", opp: "E" }
  ];

  class Maze {
    constructor(opts) {
      const rng = new global.TQ.RNG(opts.seed);
      this.rng = rng;
      this.cellCols = opts.cols;
      this.cellRows = opts.rows;
      this.hasExit = opts.hasExit !== false;
      this.kind = opts.kind || "maze";
      this.braid = opts.braid != null ? opts.braid : 0.06;

      this._carve();
      this._chooseEndpoints(opts);
      this._buildTiles();
      this._computeDistances();
      this.entities = [];
      this._placeEntities(opts);
    }

    /* ---- 1. Creusage des cellules (recursive backtracker) ---- */
    _carve() {
      const W = this.cellCols, H = this.cellRows;
      // Chaque cellule : murs présents sur les 4 côtés au départ.
      const cells = [];
      for (let y = 0; y < H; y++) {
        const row = [];
        for (let x = 0; x < W; x++) row.push({ N: true, E: true, S: true, W: true, links: [] });
        cells.push(row);
      }
      const visited = Array.from({ length: H }, () => new Array(W).fill(false));
      const stack = [];
      let cx = this.rng.int(0, W - 1), cy = this.rng.int(0, H - 1);
      visited[cy][cx] = true;
      stack.push([cx, cy]);

      while (stack.length) {
        [cx, cy] = stack[stack.length - 1];
        const dirs = this.rng.shuffle(DIRS.slice());
        let moved = false;
        for (const d of dirs) {
          const nx = cx + d.dx, ny = cy + d.dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || visited[ny][nx]) continue;
          // On abat le mur entre (cx,cy) et (nx,ny).
          cells[cy][cx][d.wall] = false;
          cells[ny][nx][d.opp] = false;
          cells[cy][cx].links.push([nx, ny]);
          cells[ny][nx].links.push([cx, cy]);
          visited[ny][nx] = true;
          stack.push([nx, ny]);
          moved = true;
          break;
        }
        if (!moved) stack.pop();
      }

      // Quelques boucles pour rendre le labyrinthe moins "arbre" (plus dur).
      const extra = Math.floor(W * H * this.braid);
      for (let i = 0; i < extra; i++) {
        const x = this.rng.int(0, W - 1), y = this.rng.int(0, H - 1);
        const d = this.rng.pick(DIRS);
        const nx = x + d.dx, ny = y + d.dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (cells[y][x][d.wall]) {
          cells[y][x][d.wall] = false;
          cells[ny][nx][d.opp] = false;
          cells[y][x].links.push([nx, ny]);
          cells[ny][nx].links.push([x, y]);
        }
      }
      this.cells = cells;
    }

    /* ---- 2. Entrée (bas) et sortie (haut) ---- */
    _chooseEndpoints(opts) {
      const W = this.cellCols, H = this.cellRows;
      this.entranceCell = opts.entranceCell || { x: this.rng.int(0, W - 1), y: H - 1 };
      this.exitCell = opts.exitCell || { x: this.rng.int(0, W - 1), y: 0 };
    }

    /* ---- 3. Conversion cellules -> tuiles ---- */
    _buildTiles() {
      const W = this.cellCols, H = this.cellRows;
      const TW = 2 * W + 1, TH = 2 * H + 1;
      const t = Array.from({ length: TH }, () => new Array(TW).fill(TILE.WALL));

      for (let cy = 0; cy < H; cy++) {
        for (let cx = 0; cx < W; cx++) {
          const tx = 2 * cx + 1, ty = 2 * cy + 1;
          t[ty][tx] = TILE.OPEN; // centre de cellule
          const c = this.cells[cy][cx];
          if (!c.N) t[ty - 1][tx] = TILE.OPEN;
          if (!c.S) t[ty + 1][tx] = TILE.OPEN;
          if (!c.E) t[ty][tx + 1] = TILE.OPEN;
          if (!c.W) t[ty][tx - 1] = TILE.OPEN;
        }
      }

      // Échelles : toute case ouverte reliée verticalement (au-dessus OU en
      // dessous ouverte) devient une échelle → tous les puits sont grimpables.
      for (let y = 0; y < TH; y++) {
        for (let x = 0; x < TW; x++) {
          if (t[y][x] !== TILE.OPEN) continue;
          const up = y > 0 && t[y - 1][x] !== TILE.WALL;
          const down = y < TH - 1 && t[y + 1][x] !== TILE.WALL;
          if (up || down) t[y][x] = TILE.LADDER;
        }
      }

      this.tiles = t;
      this.w = TW;
      this.h = TH;
    }

    /* ---- 4. Distances (BFS depuis la sortie) pour les téléporteurs ---- */
    _computeDistances() {
      const W = this.cellCols, H = this.cellRows;
      const dist = Array.from({ length: H }, () => new Array(W).fill(Infinity));
      const q = [this.exitCell];
      dist[this.exitCell.y][this.exitCell.x] = 0;
      while (q.length) {
        const cur = q.shift();
        for (const [nx, ny] of this.cells[cur.y][cur.x].links) {
          if (dist[ny][nx] === Infinity) {
            dist[ny][nx] = dist[cur.y][cur.x] + 1;
            q.push({ x: nx, y: ny });
          }
        }
      }
      this.cellDist = dist;
      let max = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        if (isFinite(dist[y][x]) && dist[y][x] > max) max = dist[y][x];
      this.maxDist = max;
    }

    /* ---- 5. Pièges + téléporteurs + marqueurs ---- */
    _placeEntities(opts) {
      const ents = this.entities;
      const near = (cx, cy, tx, ty) => {
        const ctx = 2 * cx + 1, cty = 2 * cy + 1;
        return Math.abs(ctx - tx) <= 1 && Math.abs(cty - ty) <= 1;
      };
      const isSafeSpot = (tx, ty) =>
        !near(this.entranceCell.x, this.entranceCell.y, tx, ty) &&
        !near(this.exitCell.x, this.exitCell.y, tx, ty);

      // -- Pièges (pointes) : sur un sol de couloir horizontal.
      const floorSpots = [];
      for (let y = 1; y < this.h - 1; y++) {
        for (let x = 1; x < this.w - 1; x++) {
          if (this.tiles[y][x] === TILE.OPEN &&
              this.tiles[y + 1][x] === TILE.WALL &&
              isSafeSpot(x, y)) {
            floorSpots.push({ x, y });
          }
        }
      }
      this.rng.shuffle(floorSpots);
      const spikeCount = opts.spikes || 0;
      for (let i = 0; i < spikeCount && i < floorSpots.length; i++) {
        ents.push({ type: "spike", tx: floorSpots[i].x, ty: floorSpots[i].y });
      }

      // -- Téléporteurs : liste de types fournie par l'appelant.
      const openSpots = [];
      for (let y = 1; y < this.h - 1; y++)
        for (let x = 1; x < this.w - 1; x++)
          if (this.tiles[y][x] !== TILE.WALL && isSafeSpot(x, y))
            openSpots.push({ x, y });
      this.rng.shuffle(openSpots);
      const tps = opts.teleporters || [];
      let spotIdx = 0;
      for (let i = 0; i < tps.length && spotIdx < openSpots.length; i++, spotIdx++) {
        ents.push({ type: "teleporter", variant: tps[i], tx: openSpots[spotIdx].x, ty: openSpots[spotIdx].y, cooldown: 0 });
      }

      // -- Lanterne (item « Flash ») : révèle tout le labyrinthe. On la place
      // de préférence loin de l'entrée pour que ce soit un vrai choix.
      if (opts.flash !== false) {
        let best = null, bestD = -1;
        const enTxC = 2 * this.entranceCell.x + 1, enTyC = 2 * this.entranceCell.y + 1;
        for (let k = spotIdx; k < openSpots.length; k++) {
          const s = openSpots[k];
          const d = Math.abs(s.x - enTxC) + Math.abs(s.y - enTyC);
          if (d > bestD) { bestD = d; best = s; }
        }
        if (best) ents.push({ type: "flash", tx: best.x, ty: best.y });
      }

      // -- Marqueur de sortie / cul-de-sac.
      const exTx = 2 * this.exitCell.x + 1, exTy = 2 * this.exitCell.y + 1;
      if (this.hasExit) {
        ents.push({ type: "exit", tx: exTx, ty: exTy });
      } else {
        ents.push({ type: "deadend", tx: exTx, ty: exTy });
      }
      // -- Portail de retour à l'entrée (pour ressortir vers le hub).
      const enTx = 2 * this.entranceCell.x + 1, enTy = 2 * this.entranceCell.y + 1;
      this.entranceTile = { tx: enTx, ty: enTy };
      this.exitTile = { tx: exTx, ty: exTy };
    }

    /* ---- Helpers ---- */
    tileAt(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return TILE.WALL;
      return this.tiles[ty][tx];
    }
    isSolid(tx, ty) { return this.tileAt(tx, ty) === TILE.WALL; }
    isLadder(tx, ty) { return this.tileAt(tx, ty) === TILE.LADDER; }

    cellCenterTile(cx, cy) { return { tx: 2 * cx + 1, ty: 2 * cy + 1 }; }

    randomOpenCell() {
      const W = this.cellCols, H = this.cellRows;
      return { x: this.rng.int(0, W - 1), y: this.rng.int(0, H - 1) };
    }

    // Cellule plus proche de la sortie que `fromCell` (téléporteur "rapproche").
    closerCell(fromCell) {
      const curD = this.cellDist[fromCell.y][fromCell.x];
      const cand = [];
      for (let y = 0; y < this.cellRows; y++)
        for (let x = 0; x < this.cellCols; x++)
          if (isFinite(this.cellDist[y][x]) && this.cellDist[y][x] < curD - 1)
            cand.push({ x, y });
      if (!cand.length) return { x: this.exitCell.x, y: this.exitCell.y };
      // On préfère un saut significatif mais pas jusqu'à la sortie.
      cand.sort((a, b) => this.cellDist[b.y][b.x] - this.cellDist[a.y][a.x]);
      const idx = Math.floor(cand.length * 0.4);
      return cand[Math.min(idx, cand.length - 1)];
    }
  }

  function generateMaze(opts) { return new Maze(opts); }

  global.TQ = global.TQ || {};
  global.TQ.TILE = TILE;
  global.TQ.Maze = Maze;
  global.TQ.generateMaze = generateMaze;
})(window);
