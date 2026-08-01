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
      this.confetti = [];   // confettis de l'écran de victoire
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
        back: document.getElementById("btn-back")
      };
      this._toastTimer = null;
    }

    static fmtTime(ms) {
      const s = Math.floor(ms / 1000);
      return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    }
    floorName() { const d = FLOORS[this.floorIndex]; return d ? d.name : "—"; }

    // Grand titre d'étage animé à l'arrivée.
    _showFloorCard(name) {
      const el = document.getElementById("floor-card");
      if (!el) return;
      el.textContent = name || "";
      el.classList.remove("show");
      void el.offsetWidth; // reflow → relance l'animation
      el.classList.add("show");
    }

    /* ---- Confettis de victoire (espace écran, derrière la carte) ---- */
    _spawnConfetti(n) {
      const cols = ["#7c5cff", "#37e0c8", "#ff5470", "#ffd9a8", "#ffb347", "#9bf7e8"];
      const vw = this.renderer.vw, vh = this.renderer.vh;
      for (let i = 0; i < n; i++)
        this.confetti.push({
          x: Math.random() * vw, y: -20 - Math.random() * vh * 0.5,
          vx: (Math.random() - 0.5) * 2.2, vy: 1 + Math.random() * 3,
          rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
          size: 4 + Math.random() * 5, color: cols[(Math.random() * cols.length) | 0]
        });
    }
    _updateConfetti() {
      const vh = this.renderer.vh;
      for (const c of this.confetti) { c.vy += 0.05; c.x += c.vx; c.y += c.vy; c.rot += c.vr; }
      this.confetti = this.confetti.filter(c => c.y < vh + 20);
      if (this.confetti.length < 30) this._spawnConfetti(30);
    }
    _drawConfetti() {
      const ctx = this.renderer.ctx;
      ctx.setTransform(this.renderer.dpr, 0, 0, this.renderer.dpr, 0, 0);
      for (const c of this.confetti) {
        ctx.save();
        ctx.translate(c.x, c.y); ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
        ctx.restore();
      }
    }
    // Affiche/masque le bouton « ↩ retour aux portes ».
    _showBack(v) { if (this._ui.back) this._ui.back.classList.toggle("hidden", !v); }
    // Ressortir immédiatement vers le hall (bouton HUD).
    bailToHub() {
      if (this.mode === "maze" && (this.context.type === "door" || this.context.type === "final")) {
        TQ.Audio.sfx("door");
        this._returnToHub(this.context.door);
      }
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
      if (this._ui.time) this._ui.time.textContent = Game.fmtTime(this.timeMs);
    }

    /* ============================ Démarrage ============================ */
    startMenu() {
      this.mode = "menu";
      this._showBack(false);
      this.confetti = [];
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
        this.deaths = 0; this.timeMs = 0;
        this.hideOverlay();
        this.goToFloor(0);
      };
    }

    /* ============================ Étages ============================ */
    goToFloor(index) {
      this.floorIndex = index;
      const def = FLOORS[index];
      this.fade = 1; // fondu d'entrée d'étage
      this.confetti = [];
      this._showFloorCard(def.name);
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
        teleporters: 2 // effet aléatoire au passage (1/3 entrée · 1/3 loin · 1/3 près)
      });
      this.scene = maze;
      this.mode = "maze";
      this.context = { type: "tutorial" };
      this._hints = new Set(); // astuces contextuelles (une fois chacune)
      TQ.Audio.music("game");
      this._showBack(false);
      this._enterMaze(maze);
      this.toast("Bienvenue ! Atteins le portail brillant ✦", 3200);
    }

    // Astuces contextuelles du tutoriel (déclenchées par proximité, une fois).
    _tutoHints(p, maze) {
      const H = this._hints || (this._hints = new Set());
      const once = (k, msg) => { if (!H.has(k)) { H.add(k); this.toast(msg, 2800); } };
      if (p.onLadder) once("climb", "🪜 Glisse ▲/▼ pour grimper aux échelles.");
      for (const e of maze.entities) {
        if (Math.abs(p.cx - (e.tx + 0.5) * T) > T * 2.6 || Math.abs(p.cy - (e.ty + 0.5) * T) > T * 2.6) continue;
        if (e.type === "spike") once("spike", "⚠ Les pointes renvoient au départ — saute par-dessus !");
        else if (e.type === "teleporter") once("tele", "✦ Téléporteur : effet aléatoire à chaque passage !");
        else if (e.type === "flash") once("lantern", "🏮 Ramasse la lanterne : elle révèle le labyrinthe ~5 s.");
        else if (e.type === "exit") once("exit", "✦ Le portail de sortie ! Atteins-le pour monter.");
      }
    }

    _loadHub(def) {
      const hub = this._buildHub(def.doors, def.name);
      this.hubScene = hub;
      this.scene = hub;
      this.mode = "hub";
      this.context = { type: "hub" };
      this._showBack(false);
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
      if (def.kind === "final") {
        // Labyrinthe géant ultra dur.
        return {
          cols: TOWER_WIDTH, rows: 18, seed, hasExit: true, braid: 0.16,
          spikes: 20, teleporters: 2
        };
      }
      const rows = 5 + f;                     // hauteur croissante → tour qui grandit
      const spikes = 2 + f * 2;
      const nTele = Math.min(2, f);           // plafonné à 2 téléporteurs par labyrinthe
      return {
        cols: TOWER_WIDTH, rows, seed, hasExit,
        braid: 0.05 + f * 0.015,
        spikes, teleporters: nTele
      };
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
      this._showBack(true);
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
      this.fade = 0.85; // fondu de transition
      this._showBack(false);
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
      this._showBack(false);
      this._spawnConfetti(90);
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
        <p>⏱ Temps : <b>${Game.fmtTime(t)}</b> · ☠ Morts : <b>${this.deaths}</b></p>
        ${record}
        <button class="btn" id="btn-again">Rejouer</button>
      `);
      document.getElementById("btn-again").onclick = () => {
        TQ.Audio.sfx("click");
        this.runSeed = (Math.random() * 0xffffffff) >>> 0;
        this.deaths = 0; this.timeMs = 0;
        TQ.Particles.clear();
        this.hideOverlay();
        this.goToFloor(0);
      };
    }

    /* ============================ Boucle ============================ */
    update() {
      if (this.mode === "end") { this._updateConfetti(); return; }
      if (this.paused || this.mode === "menu") return;
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

      if (this.context.type === "tutorial") this._tutoHints(p, maze);

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
            e.taken = true;              // masquée par le renderer une fois prise
            this.revealTimer = 5 * 60;   // ~5 secondes de révélation, puis fondu
            this.flash = 14;
            TQ.Audio.sfx("lantern");
            TQ.Particles.sparkle((e.tx + 0.5) * T, (e.ty + 0.5) * T, "#ffe08a", 20);
            this.toast("🏮 Lanterne ! Labyrinthe révélé ~5 s.", 2400);
          }
        } else if (e.type === "deadend") {
          if (p.overlapsTile(e.tx, e.ty, 4)) {
            // La croix du cul-de-sac renvoie directement au choix des portes.
            TQ.Audio.sfx("deadend");
            TQ.Particles.sparkle((e.tx + 0.5) * T, (e.ty + 0.5) * T, "#ff5470", 14);
            this.toast("✗ Cul-de-sac ! Retour au choix des portes.", 2200);
            this._returnToHub(this.context.door);
            return;
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
      TQ.Audio.sfx("teleport");
      TQ.Particles.sparkle((e.tx + 0.5) * T, (e.ty + 0.5) * T, "#9b7cff", 18);
      // Effet ALÉATOIRE à chaque passage : 1/3 entrée · 1/3 loin · 1/3 près.
      const roll = Math.random();
      let target, msg, col;
      if (roll < 1 / 3) {
        p.spawnAtTile(maze.entranceTile.tx, maze.entranceTile.ty, false);
        this.renderer.snapCam();
        TQ.Particles.sparkle(p.cx, p.cy, "#ff5470", 14);
        this.tpCooldown = 40; this.flash = 10;
        this.toast("✦ Téléporteur : retour à l'entrée !", 1800);
        return;
      } else if (roll < 2 / 3) {
        target = maze.closerCell(curCell);
        msg = "✦ Téléporteur : plus près de la sortie !"; col = "#37e0c8";
      } else {
        target = maze.farCell();
        msg = "✦ Téléporteur : projeté loin de la sortie !"; col = "#ffb347";
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
        if (this.mode === "end") this._drawConfetti();
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
