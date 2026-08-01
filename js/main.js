/* ==========================================================================
 * Tower Quest : Curiosity — main.js
 * Point d'entrée : initialise le rendu, l'input, la boucle de jeu.
 * ======================================================================== */
(function (global) {
  "use strict";
  const TQ = global.TQ;

  window.addEventListener("load", () => {
    const canvas = document.getElementById("game");
    const renderer = new TQ.Renderer(canvas);
    const game = new TQ.Game(renderer);
    // Poignée de debug (inspection console / tests automatisés).
    window.__TQ_GAME = game;

    // Contrôles tactiles : glissement du doigt sur toute la surface de jeu.
    const isTouch = TQ.isTouchDevice();
    if (isTouch) document.body.classList.add("touch");
    TQ.Input.bindDrag(canvas);

    // Déblocage de l'audio au tout premier geste (exigence navigateurs).
    const unlock = () => { TQ.Audio.resume(); };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    // Bouton son (muet / actif), état mémorisé.
    const soundBtn = document.getElementById("btn-sound");
    soundBtn.textContent = TQ.Audio.isMuted() ? "🔇" : "🔊";
    soundBtn.addEventListener("click", () => {
      const m = TQ.Audio.toggleMuted();
      soundBtn.textContent = m ? "🔇" : "🔊";
      if (!m) TQ.Audio.sfx("click");
    });

    // Bouton menu (pause simple / retour menu).
    document.getElementById("btn-menu").addEventListener("click", () => {
      if (game.mode === "menu" || game.mode === "end") return;
      TQ.Audio.sfx("click");
      game.paused = !game.paused;
      if (game.paused) {
        const best = game.bestMs ? ` · 🏆 ${TQ.Game.fmtTime(game.bestMs)}` : "";
        game.showOverlay(`
          <h1>PAUSE</h1>
          <h2>${game.floorName()}</h2>
          <p>⏱ ${TQ.Game.fmtTime(game.timeMs)} · 💎 ${game.gems} · ☠ ${game.deaths}${best}</p>
          <div class="keys">
            Glisse pour bouger/grimper · coup de doigt vers le haut = saut ·
            🏮 lanterne ~5 s · 💎 gemmes à collecter · évite les rôdeurs
          </div>
          <div class="btn-row">
            <button class="btn" id="btn-resume">Reprendre</button>
            <button class="btn ghost" id="btn-sound2">${TQ.Audio.isMuted() ? "🔇 Son coupé" : "🔊 Son"}</button>
            <button class="btn ghost" id="btn-quit">Menu</button>
          </div>
        `);
        document.getElementById("btn-resume").onclick = () => { TQ.Audio.sfx("click"); game.paused = false; game.hideOverlay(); };
        document.getElementById("btn-sound2").onclick = (ev) => {
          const m = TQ.Audio.toggleMuted();
          soundBtn.textContent = m ? "🔇" : "🔊";
          ev.target.textContent = m ? "🔇 Son coupé" : "🔊 Son";
          if (!m) TQ.Audio.sfx("click");
        };
        document.getElementById("btn-quit").onclick = () => { TQ.Audio.sfx("click"); game.paused = false; game.hideOverlay(); game.startMenu(); };
      } else {
        game.hideOverlay();
      }
    });

    game.startMenu();

    // Boucle principale (rAF), pas de temps fixe simple.
    let last = performance.now();
    let acc = 0;
    const STEP = 1000 / 60;
    function loop(now) {
      acc += Math.min(now - last, 100);
      last = now;
      while (acc >= STEP) {
        game.update();
        acc -= STEP;
      }
      game.render();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  });
})(window);
