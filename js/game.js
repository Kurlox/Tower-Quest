/* ==========================================================================
 * Tower Quest : Curiosity — game.js
 * Boucle de jeu, progression des étages, hub à portes, pièges,
 * téléporteurs, transitions et overlays.
 *
 * Progression :
 *   Étage 0  : tutoriel (mini-labyrinthe : touches, piège, 3 téléporteurs)
 *   Étage 1  : 5 portes → 2 mènent vers une sortie
 *   Étage 2  : 4 portes → 1 sortie
 *   Étage 3  : 3 portes → 1 sortie
 *   Étage 4  : 2 portes → 1 sortie
 *   Étage 5  : 1 porte ultime → LABYRINTHE GÉANT → victoire
 *
 * La largeur de la tour (colonnes) reste constante ; la hauteur des
 * labyrinthes grandit à chaque étage → la tour « fusionne » et s'agrandit.
 * ======================================================================== */
(function (global) {
  "use strict";

  const TQ = global.TQ;
  const TILE = TQ.TILE;      // {OPEN,WALL,LADDER}
  const T = TQ.TILEPX;       // taille tuile monde
  const TOWER_WIDTH = 7;     // colonnes de cellules — CONSTANT (largeur de tour)

  // Plan des étages.
  const FLOORS = [
    { kind: "tutorial", name: "Tutoriel" },
    { kind: "hub", doors: 5, exits: 2, name: "Étage I" },
    { kind: "hub", doors: 4, exits: 1, name: "Étage II" },
    { kind: "hub", doors: 3, exits: 1, name: "Étage III" },
    { kind: "hub", doors: 2, exits: 1, name: "Étage IV" },
    { kind: "final", doors: 1, exits: 1, name: "Étage Ultime" }
  ];

  // ---- Mixin d'aide "tuiles" partagé par les scènes hub (comme Maze) ----
  const tileMethods = {
    tileAt(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return TILE.WALL;
      return this.tiles[ty][tx];
    },
    isSolid(tx, ty) { return this.tileAt(tx, ty) === TILE.WALL; },
    isLadder(tx, ty) { return this.tileAt(tx, ty) === TILE.LADDER; }
  };

  class Game {
    constructor(renderer) {
      this.renderer = renderer;
      this.player = new TQ.Player();
      this.runSeed = (Math.random() * 0xffffffff) >>> 0;
      this.mode = "menu";        // menu | maze | hub | end
      this.paused = false;
      this.deaths = 0;
      this.floorIndex = 0;
      this.scene = null;         // scène courante (maze ou hub)
      this.context = null;       // { type: 'tutorial'|'door'|'final', ... }
      this.hubScene = null;      // hub persistant de l'étage courant
      this.tpCooldown = 0;
      this.flash = 0;
      this._ui = {
        overlay: document.getElementById("overlay"),
        card: document.getElementById("overlay-card"),
        toast: document.getElementById("toast"),
        floor: document.getElementById("floor-label"),
        deaths: document.getElementById("deaths-label")
      };
      this._toastTimer = null;
    }

    /* ============================ UI helpers ============================ */
    showOverlay(html) {
      this._ui.card.innerHTML = html;
      this._ui.overlay.classList.add("show");
    }
    hideOverlay() { this._ui.overlay.classList.remove("show"); }
    toast(msg, ms = 2200) {
      const el = this._ui.toast;
      el.textContent = msg;
      el.classList.add("show");
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => el.classList.remove("show"), ms);
    }
    updateHUD() {
      const def = FLOORS[this.floorIndex];
      this._ui.floor.textContent = def ? def.name : "—";
      this._ui.deaths.textContent = "☠ " + this.deaths;
    }

    /* ============================ Démarrage ============================ */
    startMenu() {
      this.mode = "menu";
      this.showOverlay(`
        <h1>TOWER QUEST</h1>
        <h2>Curiosity</h2>
        <p>Gravis la tour labyrinthe. Chaque étage cache plusieurs portes,
           mais peu mènent vraiment plus haut… Méfie-toi des pièges et des
           téléporteurs capricieux.</p>
        <div class="keys">
          <b>PC :</b> Flèches / ZQSD pour bouger · <b>Espace</b> saut ·
          <b>Entrée/E</b> entrer dans une porte · <b>Échap</b> ressortir<br>
          <b>Mobile :</b> glisse le doigt pour bouger/grimper · tape pour sauter
          · 🏮 trouve la lanterne pour révéler le labyrinthe
        </div>
        <button class="btn" id="btn-play">JOUER</button>
      `);
      document.getElementById("btn-play").onclick = () => {
        this.hideOverlay();
        this.goToFloor(0);
      };
    }

    /* ============================ Étages ============================ */
    goToFloor(index) {
      this.floorIndex = index;
      const def = FLOORS[index];
      this.updateHUD();
      if (def.kind === "tutorial") {
        this._loadTutorial();
      } else {
        this._loadHub(def);
      }
    }

    _loadTutorial() {
      const seed = TQ.makeSeed(this.runSeed, 999, 1);
      const maze = TQ.generateMaze({
        cols: 7, rows: 5, seed, hasExit: true,
        braid: 0.04, spikes: 1,
        teleporters: ["closer", "entrance"] // 2 max (rapproche + renvoie à l'entrée)
      });
      this.scene = maze;
      this.mode = "maze";
      this.context = { type: "tutorial" };
      this._enterMaze(maze);
      this.toast("Bienvenue ! Atteins le portail brillant ✦", 3200);
      setTimeout(() => {
        if (this.context && this.context.type === "tutorial")
          this.toast("⚠ Pointes = retour au départ. Cercles = téléporteurs.", 3600);
      }, 3600);
    }

    _loadHub(def) {
      const hub = this._buildHub(def.doors);
      this.hubScene = hub;
      this.scene = hub;
      this.mode = "hub";
      this.context = { type: "hub" };

      // Choix (seedé) des portes qui mènent réellement à une sortie.
      const rng = new TQ.RNG(TQ.makeSeed(this.runSeed, this.floorIndex, 7));
      const idxs = [];
      for (let i = 0; i < def.doors; i++) idxs.push(i);
      rng.shuffle(idxs);
      this.exitDoors = new Set(idxs.slice(0, def.exits));

      this.player.spawnAtTile(hub.entranceTile.tx, hub.entranceTile.ty, true);
      const msg = def.kind === "final"
        ? "L'ultime porte t'attend…"
        : `${def.name} — ${def.doors} portes, ${def.exits} mène${def.exits > 1 ? "nt" : ""} plus haut. Entre : ▲ / E.`;
      this.toast(msg, 3400);
    }

    _buildHub(doorCount) {
      const Ht = 8;
      const Wt = doorCount * 3 + 4;
      const tiles = Array.from({ length: Ht }, () => new Array(Wt).fill(TILE.WALL));
      // Carve intérieur (air) au-dessus du sol.
      for (let y = 1; y <= Ht - 3; y++)
        for (let x = 1; x <= Wt - 2; x++) tiles[y][x] = TILE.OPEN;
      const scene = Object.assign(Object.create(tileMethods), {
        tiles, w: Wt, h: Ht, entities: [], kind: "hub"
      });
      const doorTy = Ht - 3;
      for (let i = 0; i < doorCount; i++) {
        const tx = 2 + i * 3;
        scene.entities.push({
          type: "door", tx, ty: doorTy, label: doorCount === 1 ? "★" : (i + 1),
          index: i, explored: false, wasExit: false
        });
      }
      scene.entranceTile = { tx: 1, ty: doorTy };
      return scene;
    }

    /* ---- Paramètres de difficulté d'un labyrinthe de porte ---- */
    _mazeParamsForDoor(doorIndex, hasExit) {
      const f = this.floorIndex;
      const def = FLOORS[f];
      const seed = TQ.makeSeed(this.runSeed, f, doorIndex + 1);
      const rng = new TQ.RNG(seed);
      if (def.kind === "final") {
        // Labyrinthe géant ultra dur (2 téléporteurs max, comme partout).
        return {
          cols: TOWER_WIDTH, rows: 15, seed, hasExit: true, braid: 0.14,
          spikes: 14,
          teleporters: this._teleMix(rng, 2, true)
        };
      }
      const rows = 5 + f;                     // hauteur croissante → tour qui grandit
      const spikes = 2 + f * 2;
      const nTele = Math.min(2, f);           // plafonné à 2 téléporteurs par labyrinthe
      return {
        cols: TOWER_WIDTH, rows, seed, hasExit,
        braid: 0.05 + f * 0.015,
        spikes,
        teleporters: this._teleMix(rng, nTele, false)
      };
    }

    _teleMix(rng, n, hard) {
      const bag = hard
        ? ["far", "far", "entrance", "entrance", "closer"]
        : ["closer", "far", "entrance"];
      const out = [];
      for (let i = 0; i < n; i++) out.push(rng.pick(bag));
      return out;
    }

    /* ============================ Entrer / sortir ============================ */
    _enterDoor(door) {
      const hasExit = this.exitDoors.has(door.index);
      const params = this._mazeParamsForDoor(door.index, hasExit);
      const maze = TQ.generateMaze(params);
      this.scene = maze;
      this.mode = "maze";
      this.context = { type: FLOORS[this.floorIndex].kind === "final" ? "final" : "door", door };
      this._enterMaze(maze);
      this.toast(hasExit || FLOORS[this.floorIndex].kind === "final"
        ? "Trouve le portail vers le haut ✦   (▼ à l'entrée pour ressortir)"
        : "Explore… (▼ à l'entrée pour ressortir)", 3000);
    }

    _enterMaze(maze) {
      this.tpCooldown = 30;
      this.player.spawnAtTile(maze.entranceTile.tx, maze.entranceTile.ty, true);
    }

    _returnToHub(door) {
      if (door) { door.explored = true; door.wasExit = this.exitDoors.has(door.index); }
      this.scene = this.hubScene;
      this.mode = "hub";
      this.context = { type: "hub" };
      // Replace le joueur devant la porte qu'il vient de quitter.
      const spawnX = door ? door.tx : this.hubScene.entranceTile.tx;
      this.player.spawnAtTile(spawnX, this.hubScene.entranceTile.ty, true);
    }

    _nextFloor() {
      const next = this.floorIndex + 1;
      if (next >= FLOORS.length) { this._victory(); return; }
      this.flash = 20;
      this.goToFloor(next);
    }

    _victory() {
      this.mode = "end";
      this.showOverlay(`
        <h1>VICTOIRE !</h1>
        <h2>La tour est vaincue</h2>
        <p>Tu as traversé le labyrinthe géant et percé la Curiosity.</p>
        <p>Morts : <b>${this.deaths}</b></p>
        <button class="btn" id="btn-again">Rejouer</button>
      `);
      document.getElementById("btn-again").onclick = () => {
        this.runSeed = (Math.random() * 0xffffffff) >>> 0;
        this.deaths = 0;
        this.hideOverlay();
        this.goToFloor(0);
      };
    }

    /* ============================ Boucle ============================ */
    update() {
      if (this.paused || this.mode === "menu" || this.mode === "end") return;
      if (this.tpCooldown > 0) this.tpCooldown--;
      if (this.flash > 0) this.flash--;

      const input = TQ.Input;

      // Pause (menu) via Échap dans un hub / touche menu.
      if (this.mode === "hub" && input.pressed("back")) { /* rien : pas de retour */ }

      this.player.update(this.scene, input);

      if (this.mode === "hub") this._updateHub(input);
      else if (this.mode === "maze") this._updateMaze(input);
    }

    _updateHub(input) {
      const p = this.player;
      // Entrer dans une porte : proche + au sol + action/haut.
      if ((input.pressed("action") || input.pressed("up") || input.pressed("jump"))) {
        for (const d of this.scene.entities) {
          if (d.type !== "door") continue;
          const doorCx = (d.tx + 0.5) * T;
          const doorCy = (d.ty + 0.5) * T;
          // Proximité horizontale + verticale (pas de « pieds au sol » requis :
          // un tap déclenche un petit saut, il ne doit pas bloquer l'entrée).
          if (Math.abs(p.cx - doorCx) < T * 0.8 && Math.abs(p.cy - doorCy) < T * 1.4) {
            this._enterDoor(d);
            return;
          }
        }
      }
    }

    _updateMaze(input) {
      const p = this.player, maze = this.scene;
      const ptx = p.tileX(), pty = p.tileY();

      // --- Ressortir vers le hub (labyrinthes de porte uniquement) ---
      if (this.context.type === "door" || this.context.type === "final") {
        const atEntrance = p.overlapsTile(maze.entranceTile.tx, maze.entranceTile.ty, 4);
        if (input.pressed("back") || (atEntrance && input.pressed("down"))) {
          this._returnToHub(this.context.door);
          return;
        }
      }

      // --- Interactions avec les entités ---
      for (const e of maze.entities) {
        if (e.type === "spike") {
          if (p.overlapsTile(e.tx, e.ty, 3) && p.y + p.h > (e.ty + 0.4) * T) {
            this._die();
            return;
          }
        } else if (e.type === "teleporter") {
          if (this.tpCooldown <= 0 && p.tileX() === e.tx && p.tileY() === e.ty) {
            this._teleport(e, maze);
            return;
          }
        } else if (e.type === "exit") {
          if (p.overlapsTile(e.tx, e.ty, 4)) { this._reachExit(); return; }
        } else if (e.type === "flash") {
          if (!e.taken && p.overlapsTile(e.tx, e.ty, 3)) {
            e.taken = true;         // masquée par le renderer une fois prise
            maze.revealed = true;   // le brouillard disparaît
            this.flash = 14;
            this.toast("🏮 Lanterne ! Labyrinthe révélé.", 2400);
          }
        } else if (e.type === "deadend") {
          if (p.overlapsTile(e.tx, e.ty, 4)) {
            this.toast("✗ Sans issue ! Retourne à l'entrée (▼).", 2600);
            e.hit = true;
          }
        }
      }
    }

    _die() {
      this.deaths++;
      this.updateHUD();
      this.flash = 12;
      this.player.respawn();
      this.toast("☠ Piège ! Retour au départ.", 1600);
    }

    _teleport(e, maze) {
      const p = this.player;
      const curCell = maze.cellAtTile(e.tx, e.ty);
      let target, msg;
      if (e.variant === "entrance") {
        // Retour direct sur la case d'entrée (où l'on tient).
        p.spawnAtTile(maze.entranceTile.tx, maze.entranceTile.ty, false);
        this.tpCooldown = 40; this.flash = 10;
        this.toast("✦ Téléporteur : retour à l'entrée !", 1800);
        return;
      } else if (e.variant === "closer") {
        target = maze.closerCell(curCell);
        msg = "✦ Téléporteur : plus près de la sortie !";
      } else { // far
        target = maze.randomOpenCell();
        msg = "✦ Téléporteur : projeté au hasard !";
      }
      const c = maze.cellCenterTile(target.x, target.y);
      p.spawnAtTile(c.tx, c.ty, false);
      this.tpCooldown = 40;
      this.flash = 10;
      this.toast(msg, 1800);
    }

    _reachExit() {
      if (this.context.type === "tutorial") {
        this.toast("Bravo ! Tu maîtrises les bases. En avant !", 2200);
        this.goToFloor(1);
      } else if (this.context.type === "final") {
        this._victory();
      } else {
        // Porte menant vers le haut → étage suivant.
        if (this.context.door) { this.context.door.explored = true; this.context.door.wasExit = true; }
        this._nextFloor();
      }
    }

    /* ============================ Rendu ============================ */
    render() {
      const fog = this.mode === "maze";
      const scene = {
        maze: this.scene, player: this.player, floorIndex: this.floorIndex,
        fog, revealed: this.scene ? this.scene.revealed : false
      };
      if (this.mode === "menu" || this.mode === "end") {
        // Fond animé minimal derrière l'overlay (sans brouillard).
        if (this.scene) this.renderer.render({ maze: this.scene, player: this.player, floorIndex: this.floorIndex });
        return;
      }
      this.renderer.render(scene);
      if (this.flash > 0) {
        const ctx = this.renderer.ctx;
        ctx.setTransform(this.renderer.dpr, 0, 0, this.renderer.dpr, 0, 0);
        ctx.fillStyle = `rgba(255,255,255,${this.flash / 40})`;
        ctx.fillRect(0, 0, this.renderer.vw, this.renderer.vh);
      }
    }
  }

  global.TQ = global.TQ || {};
  global.TQ.Game = Game;
})(window);
