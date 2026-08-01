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
      this.fade = 0;        // fondu de transition d'étage (1 → 0)
      this.revealTimer = 0; // brouillard levé par la lanterne (en frames)
      this.timeMs = 0;      // chrono de la partie
      this.gems = 0;        // gemmes collectées
      this._airFrames = 0;
      this._wasGround = false;
      this.bestMs = parseInt(localStorage.getItem("tq_best") || "0", 10) || 0;
      this._ui = {
        overlay: document.getElementById("overlay"),
        card: document.getElementById("overlay-card"),
        toast: document.getElementById("toast"),
        floor: document.getElementById("floor-label"),
        deaths: document.getElementById("deaths-label"),
        time: document.getElementById("time-label"),
        gems: document.getElementById("gem-label")
      };
      this._toastTimer = null;
    }

    static fmtTime(ms) {
      const s = Math.floor(ms / 1000);
      return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    }
    floorName() { const d = FLOORS[this.floorIndex]; return d ? d.name : "—"; }

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
      if (this._ui.time) this._ui.time.textContent = Game.fmtTime(this.timeMs);
      if (this._ui.gems) this._ui.gems.textContent = "💎 " + this.gems;
    }

    /* ============================ Démarrage ============================ */
    startMenu() {
      this.mode = "menu";
      TQ.Particles.clear();
      TQ.Audio.music("menu");
      const best = this.bestMs ? `<p class="keys">🏆 Meilleur temps : <b>${Game.fmtTime(this.bestMs)}</b></p>` : "";
      this.showOverlay(`
        <h1>TOWER QUEST</h1>
        <h2>Curiosity</h2>
        <p>Gravis la tour labyrinthe. Chaque étage cache plusieurs portes,
           mais peu mènent vraiment plus haut… Méfie-toi des pièges et des
           téléporteurs capricieux.</p>
        <div class="keys">
          <b>PC :</b> Flèches / ZQSD pour bouger · <b>Espace</b> saut ·
          <b>Entrée/E</b> entrer dans une porte · <b>Échap</b> ressortir<br>
          <b>Mobile :</b> glisse pour bouger/grimper · <b>coup de doigt vers le
          haut</b> = saut · 🏮 la lanterne révèle le labyrinthe ~5 s
        </div>
        ${best}
        <button class="btn" id="btn-play">JOUER</button>
      `);
      document.getElementById("btn-play").onclick = () => {
        TQ.Audio.resume(); TQ.Audio.sfx("click");
        this.deaths = 0; this.timeMs = 0; this.gems = 0;
        this.hideOverlay();
        this.goToFloor(0);
      };
    }

    /* ============================ Étages ============================ */
    goToFloor(index) {
      this.floorIndex = index;
      const def = FLOORS[index];
      this.fade = 1; // fondu d'entrée d'étage
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
        braid: 0.04, spikes: 1, gems: 2,
        teleporters: ["closer", "entrance"] // 2 max (rapproche + renvoie à l'entrée)
      });
      this.scene = maze;
      this.mode = "maze";
      this.context = { type: "tutorial" };
      TQ.Audio.music("game");
      this._enterMaze(maze);
      this.toast("Bienvenue ! Atteins le portail brillant ✦", 3200);
      setTimeout(() => {
        if (this.context && this.context.type === "tutorial")
          this.toast("⚠ Pointes = retour au départ. Cercles = téléporteurs.", 3600);
      }, 3600);
    }

    _loadHub(def) {
      const hub = this._buildHub(def.doors, def.name);
      this.hubScene = hub;
      this.scene = hub;
      this.mode = "hub";
      this.context = { type: "hub" };
      // Même ambiance que les labyrinthes de l'étage → pas de coupure musicale
      // en entrant/sortant des portes ; le final a sa propre musique intense.
      TQ.Audio.music(def.kind === "final" ? "final" : "game");

      // Choix (seedé) des portes qui mènent réellement à une sortie.
      const rng = new TQ.RNG(TQ.makeSeed(this.runSeed, this.floorIndex, 7));
      const idxs = [];
      for (let i = 0; i < def.doors; i++) idxs.push(i);
      rng.shuffle(idxs);
      this.exitDoors = new Set(idxs.slice(0, def.exits));

      this.player.spawnAtTile(hub.entranceTile.tx, hub.entranceTile.ty, true);
      this.renderer.snapCam();
      const msg = def.kind === "final"
        ? "L'ultime porte t'attend…"
        : `${def.name} — ${def.doors} portes, ${def.exits} mène${def.exits > 1 ? "nt" : ""} plus haut. Entre : ▲ / E.`;
      this.toast(msg, 3400);
    }

    _buildHub(doorCount, title) {
      const Ht = 9;                       // grande salle (couloir haut)
      const spacing = 4;                  // espacement des portes
      const startX = 3;
      const Wt = startX + (doorCount - 1) * spacing + startX + 1;
      const tiles = Array.from({ length: Ht }, () => new Array(Wt).fill(TILE.WALL));
      // Carve intérieur (air) au-dessus du sol.
      for (let y = 1; y <= Ht - 3; y++)
        for (let x = 1; x <= Wt - 2; x++) tiles[y][x] = TILE.OPEN;
      const scene = Object.assign(Object.create(tileMethods), {
        tiles, w: Wt, h: Ht, entities: [], kind: "hub", title
      });
      const doorTy = Ht - 3;
      for (let i = 0; i < doorCount; i++) {
        const tx = startX + i * spacing;
        scene.entities.push({
          type: "door", tx, ty: doorTy, label: doorCount === 1 ? "★" : (i + 1),
          index: i, explored: false, wasExit: false, near: false
        });
        // Torche au-dessus de chaque porte (ambiance + éclairage).
        scene.entities.push({ type: "torch", tx, ty: 1 });
      }
      // Bannière d'étage au centre, en haut.
      scene.entities.push({ type: "banner", tx: Math.floor(Wt / 2), ty: 0, text: title || "" });
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
          cols: TOWER_WIDTH, rows: 18, seed, hasExit: true, braid: 0.16,
          spikes: 20, gems: 8, patrols: 3,
          teleporters: this._teleMix(rng, 2, true)
        };
      }
      const rows = 5 + f;                     // hauteur croissante → tour qui grandit
      const spikes = 2 + f * 2;
      const nTele = Math.min(2, f);           // plafonné à 2 téléporteurs par labyrinthe
      return {
        cols: TOWER_WIDTH, rows, seed, hasExit,
        braid: 0.05 + f * 0.015,
        spikes, gems: 3 + f, patrols: Math.min(2, Math.max(0, f - 1)),
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
      const isFinal = FLOORS[this.floorIndex].kind === "final";
      const hasExit = this.exitDoors.has(door.index);
      const params = this._mazeParamsForDoor(door.index, hasExit);
      const maze = TQ.generateMaze(params);
      this.scene = maze;
      this.mode = "maze";
      this.context = { type: isFinal ? "final" : "door", door };
      TQ.Audio.sfx("door");
      TQ.Audio.music(isFinal ? "final" : "game");
      this._enterMaze(maze);
      this.toast(hasExit || isFinal
        ? "Trouve le portail vers le haut ✦   (▼ à l'entrée pour ressortir)"
        : "Explore… (▼ à l'entrée pour ressortir)", 3000);
    }

    _enterMaze(maze) {
      this.tpCooldown = 30;
      this.revealTimer = 0; // brouillard réactivé à chaque nouveau labyrinthe
      this.player.spawnAtTile(maze.entranceTile.tx, maze.entranceTile.ty, true);
      this.renderer.snapCam();
    }

    _returnToHub(door) {
      if (door) { door.explored = true; door.wasExit = this.exitDoors.has(door.index); }
      this.scene = this.hubScene;
      this.mode = "hub";
      this.context = { type: "hub" };
      TQ.Audio.sfx("door");
      TQ.Audio.music(FLOORS[this.floorIndex].kind === "final" ? "final" : "game");
      // Replace le joueur devant la porte qu'il vient de quitter.
      const spawnX = door ? door.tx : this.hubScene.entranceTile.tx;
      this.player.spawnAtTile(spawnX, this.hubScene.entranceTile.ty, true);
      this.renderer.snapCam();
    }

    _nextFloor() {
      const next = this.floorIndex + 1;
      if (next >= FLOORS.length) { this._victory(); return; }
      this.flash = 20;
      this.goToFloor(next);
    }

    _victory() {
      this.mode = "end";
      TQ.Audio.music("victory");
      TQ.Audio.sfx("victory");
      const t = this.timeMs;
      let record = "";
      if (!this.bestMs || t < this.bestMs) {
        this.bestMs = t;
        localStorage.setItem("tq_best", String(Math.floor(t)));
        record = `<p class="keys" style="color:var(--accent2)">🏆 Nouveau record !</p>`;
      } else {
        record = `<p class="keys">🏆 Meilleur : ${Game.fmtTime(this.bestMs)}</p>`;
      }
      this.showOverlay(`
        <h1>VICTOIRE !</h1>
        <h2>La tour est vaincue</h2>
        <p>Tu as traversé le labyrinthe géant et percé la Curiosity.</p>
        <p>⏱ Temps : <b>${Game.fmtTime(t)}</b> · ☠ Morts : <b>${this.deaths}</b> · 💎 <b>${this.gems}</b></p>
        ${record}
        <button class="btn" id="btn-again">Rejouer</button>
      `);
      document.getElementById("btn-again").onclick = () => {
        TQ.Audio.sfx("click");
        this.runSeed = (Math.random() * 0xffffffff) >>> 0;
        this.deaths = 0; this.timeMs = 0; this.gems = 0;
        TQ.Particles.clear();
        this.hideOverlay();
        this.goToFloor(0);
      };
    }

    /* ============================ Boucle ============================ */
    update() {
      if (this.paused || this.mode === "menu" || this.mode === "end") return;
      this.timeMs += 1000 / 60;
      if (this.tpCooldown > 0) this.tpCooldown--;
      if (this.flash > 0) this.flash--;
      if (this.fade > 0) this.fade = Math.max(0, this.fade - 0.045);
      if (this.revealTimer > 0) {
        this.revealTimer--;
        if (this.revealTimer === 0) this.toast("🏮 Lanterne éteinte…", 1400);
      }
      TQ.Particles.update();

      const input = TQ.Input;
      this.player.update(this.scene, input);
      this._updatePlayerFx();

      if (this.mode === "hub") this._updateHub(input);
      else if (this.mode === "maze") this._updateMaze(input);

      if ((this.timeMs | 0) % 250 < 17) this.updateHUD();
    }

    // Sons + particules liés aux mouvements du joueur.
    _updatePlayerFx() {
      const p = this.player;
      // Saut détecté par le pic de vitesse verticale (sol ou échelle).
      if (p.vy < -9 && (this._wasVy || 0) > -5) {
        TQ.Audio.sfx("jump"); TQ.Particles.jumpDust(p.cx, p.y + p.h);
      }
      if (!this._wasGround && p.onGround && this._airFrames > 4) {
        TQ.Audio.sfx("land"); TQ.Particles.landDust(p.cx, p.y + p.h);
      }
      this._airFrames = p.onGround ? 0 : this._airFrames + 1;
      if (p.onLadder && Math.abs(p.vy) > 0.5) TQ.Audio.sfx("climb");
      this._wasGround = p.onGround;
      this._wasVy = p.vy;
    }

    _updateHub(input) {
      const p = this.player;
      // Repère la porte la plus proche (pour l'indice « ▲ Entrer »).
      let nearDoor = null, nearDist = Infinity;
      for (const d of this.scene.entities) {
        if (d.type !== "door") continue;
        d.near = false;
        const dist = Math.abs(p.cx - (d.tx + 0.5) * T);
        if (dist < T * 0.9 && dist < nearDist) { nearDist = dist; nearDoor = d; }
      }
      if (nearDoor) nearDoor.near = true;

      // Entrer dans la porte proche : action / haut / tap.
      if (nearDoor && (input.pressed("action") || input.pressed("up") || input.pressed("jump"))) {
        if (Math.abs(p.cy - (nearDoor.ty + 0.5) * T) < T * 1.6) {
          this._enterDoor(nearDoor);
          return;
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
        } else if (e.type === "patrol") {
          // Rôdeur : avance et rebondit sur les murs / bords de plateforme.
          if (e.x == null) { e.x = (e.tx + 0.5) * T; e.dir = 1; }
          const speed = 1.05;
          e.x += e.dir * speed;
          const aheadTx = Math.floor((e.x + e.dir * T * 0.55) / T);
          if (maze.isSolid(aheadTx, e.ty) || maze.isSolid(aheadTx, e.ty - 1) ||
              !maze.isSolid(aheadTx, e.ty + 1)) {
            e.dir *= -1; e.x += e.dir * speed;
          }
          if (Math.abs(p.cx - e.x) < T * 0.55 && Math.abs(p.cy - (e.ty + 0.5) * T) < T * 0.6) {
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
        } else if (e.type === "gem") {
          if (!e.taken && p.overlapsTile(e.tx, e.ty, 2)) {
            e.taken = true;
            this.gems++;
            this.updateHUD();
            TQ.Audio.sfx("gem");
            TQ.Particles.sparkle((e.tx + 0.5) * T, (e.ty + 0.5) * T, "#37e0c8", 12);
          }
        } else if (e.type === "flash") {
          if (!e.taken && p.overlapsTile(e.tx, e.ty, 3)) {
            e.taken = true;              // masquée par le renderer une fois prise
            this.revealTimer = 5 * 60;   // ~5 secondes de révélation, puis fondu
            this.flash = 14;
            TQ.Audio.sfx("lantern");
            TQ.Particles.sparkle((e.tx + 0.5) * T, (e.ty + 0.5) * T, "#ffe08a", 20);
            this.toast("🏮 Lanterne ! Labyrinthe révélé ~5 s.", 2400);
          }
        } else if (e.type === "deadend") {
          if (p.overlapsTile(e.tx, e.ty, 4) && !e.hit) {
            this.toast("✗ Sans issue ! Retourne à l'entrée (▼).", 2600);
            TQ.Audio.sfx("deadend");
            e.hit = true;
          }
        }
      }
    }

    _die() {
      this.deaths++;
      this.updateHUD();
      this.flash = 12;
      TQ.Audio.sfx("death");
      TQ.Particles.deathBurst(this.player.cx, this.player.cy);
      this.renderer.addShake(9);
      this.player.respawn();
      this.toast("☠ Piège ! Retour au départ.", 1600);
    }

    _teleport(e, maze) {
      const p = this.player;
      const curCell = maze.cellAtTile(e.tx, e.ty);
      const col = { closer: "#37e0c8", far: "#ffb347", entrance: "#ff5470" }[e.variant] || "#9b7cff";
      TQ.Audio.sfx("teleport");
      TQ.Particles.sparkle((e.tx + 0.5) * T, (e.ty + 0.5) * T, col, 18);
      let target, msg;
      if (e.variant === "entrance") {
        // Retour direct sur la case d'entrée (où l'on tient).
        p.spawnAtTile(maze.entranceTile.tx, maze.entranceTile.ty, false);
        this.renderer.snapCam();
        TQ.Particles.sparkle(p.cx, p.cy, col, 14);
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
      this.renderer.snapCam();
      TQ.Particles.sparkle(p.cx, p.cy, col, 14);
      this.tpCooldown = 40;
      this.flash = 10;
      this.toast(msg, 1800);
    }

    _reachExit() {
      TQ.Audio.sfx("floorUp");
      TQ.Particles.exitBurst(this.player.cx, this.player.cy);
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
      // Force de révélation 0→1 (plein pendant 4 s, fondu sur la dernière ~0,75 s).
      const reveal = Math.min(1, this.revealTimer / 45);
      const scene = {
        maze: this.scene, player: this.player, floorIndex: this.floorIndex,
        fog, reveal, isHub: this.mode === "hub"
      };
      if (this.mode === "menu" || this.mode === "end") {
        // Fond animé minimal derrière l'overlay (sans brouillard).
        if (this.scene) this.renderer.render({ maze: this.scene, player: this.player, floorIndex: this.floorIndex });
        return;
      }
      this.renderer.render(scene);
      const ctx = this.renderer.ctx;
      if (this.flash > 0 || this.fade > 0) {
        ctx.setTransform(this.renderer.dpr, 0, 0, this.renderer.dpr, 0, 0);
        if (this.flash > 0) {
          ctx.fillStyle = `rgba(255,255,255,${this.flash / 40})`;
          ctx.fillRect(0, 0, this.renderer.vw, this.renderer.vh);
        }
        if (this.fade > 0) {
          ctx.fillStyle = `rgba(6,5,14,${this.fade})`;
          ctx.fillRect(0, 0, this.renderer.vw, this.renderer.vh);
        }
      }
    }
  }

  global.TQ = global.TQ || {};
  global.TQ.Game = Game;
})(window);
