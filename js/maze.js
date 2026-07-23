/* ==========================================================================
 * Tower Quest : Curiosity — maze.js
 * Génération procédurale de labyrinthes (recursive backtracker → labyrinthe
 * parfait) puis conversion en grille de tuiles jouable en plateformer.
 *
 * Principes :
 *   - La SORTIE est toujours la cellule la plus ÉLOIGNÉE de l'entrée.
 *   - Échelles MINIMALES : le joueur saute par défaut ; on ne pose une échelle
 *     que là où un saut ne suffit pas (puits hauts, ou pas d'appui pour
 *     atterrir).
 *   - Solvabilité GARANTIE : un modèle de déplacement conservateur (marche +
 *     saut de 2 tuiles + échelles) vérifie que la sortie est atteignable ;
 *     sinon on rajoute des échelles jusqu'à ce qu'elle le soit.
 *   - Entrée SÛRE : aucun piège ni téléporteur près du point de départ.
 * ======================================================================== */
(function (global) {
  "use strict";

  const TILE = { OPEN: 0, WALL: 1, LADDER: 2 };

  const DIRS = [
    { dx: 0, dy: -1, wall: "N", opp: "S" },
    { dx: 1, dy: 0, wall: "E", opp: "W" },
    { dx: 0, dy: 1, wall: "S", opp: "N" },
    { dx: -1, dy: 0, wall: "W", opp: "E" }
  ];

  // Couloirs de 2 tuiles de haut (headroom partout) → atterrissages amples et
  // FIABLES au saut. Un cran vertical = 3 tuiles ; le joueur saute ~3,6 tuiles.
  const CELL_H = 3;     // pas vertical en tuiles (2 ouvertes + 1 mur)
  const JUMP_TILES = 3; // hauteur de saut prise en compte par le modèle

  class Maze {
    constructor(opts) {
      this.rng = new global.TQ.RNG(opts.seed);
      this.cellCols = opts.cols;
      this.cellRows = opts.rows;
      this.hasExit = opts.hasExit !== false;
      this.kind = opts.kind || "maze";
      this.braid = opts.braid != null ? opts.braid : 0.06;

      this._carve();
      this._chooseEntrance(opts);
      this._chooseExit(opts);
      this._buildTiles();
      this._setPortals();
      this._ensureSolvable();
      this._computeDistances();
      this.entities = [];
      this._placeEntities(opts);
    }

    /* ---- 1. Creusage des cellules (recursive backtracker) ---- */
    _carve() {
      const W = this.cellCols, H = this.cellRows;
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

      // Quelques boucles pour casser l'aspect "arbre".
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

    /* ---- 2a. Entrée en bas ---- */
    _chooseEntrance(opts) {
      const W = this.cellCols, H = this.cellRows;
      this.entranceCell = opts.entranceCell || { x: this.rng.int(0, W - 1), y: H - 1 };
    }

    /* ---- 2b. Sortie = cellule la plus éloignée de l'entrée (BFS graphe) ---- */
    _chooseExit(opts) {
      if (opts.exitCell) { this.exitCell = opts.exitCell; return; }
      const W = this.cellCols, H = this.cellRows;
      const dist = Array.from({ length: H }, () => new Array(W).fill(-1));
      const q = [this.entranceCell];
      dist[this.entranceCell.y][this.entranceCell.x] = 0;
      let far = this.entranceCell, farD = 0;
      while (q.length) {
        const cur = q.shift();
        for (const [nx, ny] of this.cells[cur.y][cur.x].links) {
          if (dist[ny][nx] < 0) {
            dist[ny][nx] = dist[cur.y][cur.x] + 1;
            if (dist[ny][nx] > farD) { farD = dist[ny][nx]; far = { x: nx, y: ny }; }
            q.push({ x: nx, y: ny });
          }
        }
      }
      this.exitCell = far;
      this.pathLen = farD;
    }

    /* ---- 3. Conversion cellules -> tuiles (couloirs de 2 tuiles de haut) ---- */
    _buildTiles() {
      const W = this.cellCols, H = this.cellRows;
      const TW = 2 * W + 1, TH = CELL_H * H + 1;
      const t = Array.from({ length: TH }, () => new Array(TW).fill(TILE.WALL));
      for (let cy = 0; cy < H; cy++) {
        for (let cx = 0; cx < W; cx++) {
          const tx = 2 * cx + 1;
          const head = CELL_H * cy + 1, feet = CELL_H * cy + 2; // 2 rangées ouvertes
          t[head][tx] = TILE.OPEN;
          t[feet][tx] = TILE.OPEN;
          const c = this.cells[cy][cx];
          // Couloirs horizontaux : 2 tuiles de haut.
          if (!c.E) { t[head][tx + 1] = TILE.OPEN; t[feet][tx + 1] = TILE.OPEN; }
          if (!c.W) { t[head][tx - 1] = TILE.OPEN; t[feet][tx - 1] = TILE.OPEN; }
          // Liens verticaux : trou dans le plancher/plafond partagé.
          if (!c.N) t[CELL_H * cy][tx] = TILE.OPEN;         // vers cy-1
          if (!c.S) t[CELL_H * (cy + 1)][tx] = TILE.OPEN;   // vers cy+1
        }
      }
      this.tiles = t; this.w = TW; this.h = TH;
      // Aucune échelle au départ : la réparation en ajoutera uniquement là où
      // le saut ne passe pas (voir _ensureSolvable).
    }

    // Pose une échelle sur le lien vertical entre (cx,cy) et (cx,cy-1).
    _ladderLink(cx, cy) {
      const tx = 2 * cx + 1;
      const y0 = CELL_H * (cy - 1) + 1, y1 = CELL_H * cy + 2;
      for (let y = y0; y <= y1; y++)
        if (this.tiles[y][tx] === TILE.OPEN) this.tiles[y][tx] = TILE.LADDER;
    }

    /* ---- Helpers tuiles pour le modèle de déplacement ---- */
    _solidT(x, y) { return !(x >= 0 && x < this.w && y >= 0 && y < this.h) || this.tiles[y][x] === TILE.WALL; }
    _openT(x, y) { return x >= 0 && x < this.w && y >= 0 && y < this.h && this.tiles[y][x] !== TILE.WALL; }
    _ladderT(x, y) { return x >= 0 && x < this.w && y >= 0 && y < this.h && this.tiles[y][x] === TILE.LADDER; }
    _standT(x, y) { return this._openT(x, y) && (this._ladderT(x, y) || this._solidT(x, y + 1)); }

    // Depuis une case ouverte (x,y), chute jusqu'à la première case où l'on tient.
    _landingTile(x, y) {
      if (!this._openT(x, y)) return null;
      let ny = y;
      while (!this._standT(x, ny)) {
        if (ny + 1 < this.h && this._openT(x, ny + 1)) ny++; else break;
      }
      return this._standT(x, ny) ? { x, y: ny } : null;
    }

    /* ---- Portails d'entrée/sortie posés sur des cases où l'on tient ---- */
    _setPortals() {
      const en = this.cellCenterTile(this.entranceCell.x, this.entranceCell.y);
      const ex = this.cellCenterTile(this.exitCell.x, this.exitCell.y);
      const enL = this._landingTile(en.tx, en.ty) || { x: en.tx, y: en.ty };
      const exL = this._landingTile(ex.tx, ex.ty) || { x: ex.tx, y: ex.ty };
      this.entranceTile = { tx: enL.x, ty: enL.y };
      this.exitTile = { tx: exL.x, ty: exL.y };
    }

    // Génère les destinations « standables » atteignables depuis (x,y) par un
    // mouvement atomique (marche, chute, saut horizontal, échelle, saut
    // vertical). `out(nx,ny)` est appelé pour chacune. Modèle CONSERVATEUR :
    // le joueur réel peut au moins tout ça.
    _forEachMove(x, y, out) {
      const land = (px, py) => { const l = this._landingTile(px, py); if (l) out(l.x, l.y); };
      // Marche + chute
      for (const dx of [-1, 1]) if (this._openT(x + dx, y)) land(x + dx, y);
      // Saut horizontal par-dessus un trou (1 ou 2 tuiles), même niveau
      for (const dx of [-1, 1]) {
        if (this._openT(x + dx, y) && !this._standT(x + dx, y) && this._openT(x + dx, y - 1)) {
          if (this._standT(x + 2 * dx, y) && this._openT(x + 2 * dx, y - 1)) out(x + 2 * dx, y);
          else if (this._openT(x + 2 * dx, y) && !this._standT(x + 2 * dx, y) &&
                   this._standT(x + 3 * dx, y) && this._openT(x + 3 * dx, y - 1)) out(x + 3 * dx, y);
        }
      }
      // Échelle : monter / descendre
      if (this._ladderT(x, y)) {
        if (this._ladderT(x, y - 1)) out(x, y - 1); else if (this._openT(x, y - 1)) land(x, y - 1);
        if (this._ladderT(x, y + 1)) out(x, y + 1); else if (this._openT(x, y + 1)) land(x, y + 1);
      }
    }

    /* ---- Ensemble des cases atteignables ---- */
    _reachableStand() {
      const seen = new Set();
      const key = (x, y) => x + "," + y;
      const start = this._landingTile(this.entranceTile.tx, this.entranceTile.ty);
      if (!start) return seen;
      const q = [start]; seen.add(key(start.x, start.y));
      while (q.length) {
        const { x, y } = q.shift();
        this._forEachMove(x, y, (nx, ny) => {
          const k = key(nx, ny); if (!seen.has(k)) { seen.add(k); q.push({ x: nx, y: ny }); }
        });
      }
      return seen;
    }

    // Chemin de cases « standables » de l'entrée à la sortie (pour tests/bots).
    solvePath() {
      const key = (x, y) => x + "," + y;
      const start = this._landingTile(this.entranceTile.tx, this.entranceTile.ty);
      if (!start) return null;
      const goal = key(this.exitTile.tx, this.exitTile.ty);
      const parent = new Map(); parent.set(key(start.x, start.y), null);
      const q = [start];
      while (q.length) {
        const cur = q.shift();
        if (key(cur.x, cur.y) === goal) break;
        this._forEachMove(cur.x, cur.y, (nx, ny) => {
          const k = key(nx, ny); if (!parent.has(k)) { parent.set(k, cur); q.push({ x: nx, y: ny }); }
        });
      }
      if (!parent.has(goal)) return null;
      const path = []; let k = goal;
      while (k) { const [x, y] = k.split(",").map(Number); path.unshift({ x, y }); const p = parent.get(k); k = p ? key(p.x, p.y) : null; }
      return path;
    }

    // Ensemble des cellules dont au moins une case « au sol » est atteignable.
    _reachedCells(reach) {
      const rc = new Set();
      const has = (x, y) => reach.has(x + "," + y);
      for (let cy = 0; cy < this.cellRows; cy++)
        for (let cx = 0; cx < this.cellCols; cx++) {
          const tx = 2 * cx + 1, head = CELL_H * cy + 1, feet = CELL_H * cy + 2;
          if (has(tx, feet) || has(tx, head) ||
              has(tx - 1, feet) || has(tx + 1, feet) ||
              has(tx - 1, head) || has(tx + 1, head))
            rc.add(cx + "," + cy);
        }
      return rc;
    }

    // Lien vertical « frontière » : cellule basse atteignable, haute pas encore.
    _frontierUpLink(rc) {
      for (let cy = this.cellRows - 1; cy >= 1; cy--)
        for (let cx = 0; cx < this.cellCols; cx++) {
          if (this.cells[cy][cx].N) continue; // pas de lien vertical
          if (rc.has(cx + "," + cy) && !rc.has(cx + "," + (cy - 1))) return { cx, cy };
        }
      return null;
    }

    // Réparation : on n'ajoute une échelle QUE là où monter au saut est
    // impossible, jusqu'à ce que tout soit atteignable. Filet de sécurité :
    // échelle sur tous les puits si jamais on ne converge pas.
    _ensureSolvable() {
      for (let iter = 0; iter < 1000; iter++) {
        const reach = this._reachableStand();
        const rc = this._reachedCells(reach);
        const link = this._frontierUpLink(rc);
        if (!link) { this.reach = reach; this._finalizePortals(reach); return; }
        this._ladderLink(link.cx, link.cy);
      }
      this._ladderEverything();
      this.reach = this._reachableStand();
      this._finalizePortals(this.reach);
      this.usedFallback = true;
    }

    // Recale la case de sortie sur une case réellement atteignable de sa cellule.
    _finalizePortals(reach) {
      const t = this._reachedStandTile(this.exitCell, reach);
      if (t) this.exitTile = t;
    }
    _reachedStandTile(cell, reach) {
      const tx = 2 * cell.x + 1, head = CELL_H * cell.y + 1, feet = CELL_H * cell.y + 2;
      const cands = [[tx, feet], [tx - 1, feet], [tx + 1, feet], [tx, head], [tx - 1, head], [tx + 1, head]];
      for (const [x, y] of cands) if (this._standT(x, y) && reach.has(x + "," + y)) return { tx: x, ty: y };
      for (const [x, y] of cands) if (this._standT(x, y)) return { tx: x, ty: y };
      return null;
    }

    _ladderEverything() {
      const t = this.tiles;
      for (let y = 0; y < this.h; y++)
        for (let x = 0; x < this.w; x++) {
          if (t[y][x] !== TILE.OPEN) continue;
          const up = t[y - 1] && t[y - 1][x] !== TILE.WALL;
          const down = t[y + 1] && t[y + 1][x] !== TILE.WALL;
          if (up || down) t[y][x] = TILE.LADDER;
        }
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

    /* ---- 5. Pièges + téléporteurs + lanterne + marqueurs ---- */
    _placeEntities(opts) {
      const ents = this.entities;
      const dTo = (tile, tx, ty) => Math.abs(tile.tx - tx) + Math.abs(tile.ty - ty);
      // Zone de départ TRÈS sûre : rien près de l'entrée.
      const SAFE_ENT = 4, SAFE_EXIT = 2;
      const safe = (tx, ty) =>
        dTo(this.entranceTile, tx, ty) > SAFE_ENT &&
        dTo(this.exitTile, tx, ty) > SAFE_EXIT;

      // -- Pièges : sol de couloir AVEC de la hauteur au-dessus (donc évitables
      //    en sautant), loin de l'entrée/sortie.
      const spikeSpots = [];
      for (let y = 2; y < this.h - 1; y++)
        for (let x = 1; x < this.w - 1; x++)
          if (this.tiles[y][x] === TILE.OPEN &&
              this.tiles[y + 1][x] === TILE.WALL &&
              this._openT(x, y - 1) &&           // hauteur pour sauter par-dessus
              safe(x, y))
            spikeSpots.push({ x, y });
      this.rng.shuffle(spikeSpots);
      const spikeCount = opts.spikes || 0;
      for (let i = 0; i < spikeCount && i < spikeSpots.length; i++)
        ents.push({ type: "spike", tx: spikeSpots[i].x, ty: spikeSpots[i].y });

      // -- Téléporteurs.
      const openSpots = [];
      for (let y = 1; y < this.h - 1; y++)
        for (let x = 1; x < this.w - 1; x++)
          if (this.tiles[y][x] !== TILE.WALL && safe(x, y))
            openSpots.push({ x, y });
      this.rng.shuffle(openSpots);
      const tps = opts.teleporters || [];
      let spotIdx = 0;
      for (let i = 0; i < tps.length && spotIdx < openSpots.length; i++, spotIdx++)
        ents.push({ type: "teleporter", variant: tps[i], tx: openSpots[spotIdx].x, ty: openSpots[spotIdx].y });

      // -- Lanterne : loin de l'entrée.
      if (opts.flash !== false) {
        let best = null, bestD = -1;
        for (let k = spotIdx; k < openSpots.length; k++) {
          const s = openSpots[k];
          const d = dTo(this.entranceTile, s.x, s.y);
          if (d > bestD) { bestD = d; best = s; }
        }
        if (best) ents.push({ type: "flash", tx: best.x, ty: best.y });
      }

      // -- Marqueur de sortie / cul-de-sac.
      ents.push({ type: this.hasExit ? "exit" : "deadend", tx: this.exitTile.tx, ty: this.exitTile.ty });
    }

    /* ---- API publique ---- */
    tileAt(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return TILE.WALL;
      return this.tiles[ty][tx];
    }
    isSolid(tx, ty) { return this.tileAt(tx, ty) === TILE.WALL; }
    isLadder(tx, ty) { return this.tileAt(tx, ty) === TILE.LADDER; }
    // Case « au sol » d'une cellule (rangée des pieds).
    cellCenterTile(cx, cy) { return { tx: 2 * cx + 1, ty: CELL_H * cy + 2 }; }
    // Cellule contenant une tuile donnée.
    cellAtTile(tx, ty) {
      return {
        x: global.TQ.clamp(Math.floor((tx - 1) / 2), 0, this.cellCols - 1),
        y: global.TQ.clamp(Math.floor((ty - 1) / CELL_H), 0, this.cellRows - 1)
      };
    }

    randomOpenCell() {
      const W = this.cellCols, H = this.cellRows;
      return { x: this.rng.int(0, W - 1), y: this.rng.int(0, H - 1) };
    }

    closerCell(fromCell) {
      const curD = this.cellDist[fromCell.y][fromCell.x];
      const cand = [];
      for (let y = 0; y < this.cellRows; y++)
        for (let x = 0; x < this.cellCols; x++)
          if (isFinite(this.cellDist[y][x]) && this.cellDist[y][x] < curD - 1)
            cand.push({ x, y });
      if (!cand.length) return { x: this.exitCell.x, y: this.exitCell.y };
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
