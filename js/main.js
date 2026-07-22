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

    // Bouton menu (pause simple / retour menu).
    document.getElementById("btn-menu").addEventListener("click", () => {
      if (game.mode === "menu" || game.mode === "end") return;
      game.paused = !game.paused;
      if (game.paused) {
        game.showOverlay(`
          <h1>PAUSE</h1>
          <p>Étage : <b>${game.floorIndex}</b> · Morts : <b>${game.deaths}</b></p>
          <div class="btn-row">
            <button class="btn" id="btn-resume">Reprendre</button>
            <button class="btn ghost" id="btn-quit">Menu</button>
          </div>
        `);
        document.getElementById("btn-resume").onclick = () => { game.paused = false; game.hideOverlay(); };
        document.getElementById("btn-quit").onclick = () => { game.paused = false; game.hideOverlay(); game.startMenu(); };
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
