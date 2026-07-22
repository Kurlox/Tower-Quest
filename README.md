# Tower Quest : Curiosity

Un **plateformer 2D en pixel art** à labyrinthes **100 % procéduraux**, jouable
sur **PC et smartphone**, sans installation ni build. Premier volet d'une saga
*Tower Quest* de jeux tous différents.

Tu gravis une tour-labyrinthe. Chaque étage cache plusieurs portes, mais peu
mènent réellement plus haut. Méfie-toi des pièges et des téléporteurs capricieux
jusqu'à l'ultime porte qui ouvre sur un **labyrinthe géant ultra difficile**.

## 🎮 Jouer

Aucune dépendance : ouvre le jeu dans un navigateur.

- **En ligne** : héberge le dossier sur GitHub Pages (Settings → Pages → branche)
  puis ouvre l'URL sur PC ou mobile.
- **En local** : sers le dossier avec un petit serveur puis ouvre `index.html`.
  ```bash
  python3 -m http.server 8000
  # puis http://localhost:8000
  ```

### Contrôles

| Action                 | PC                          | Mobile            |
|------------------------|-----------------------------|-------------------|
| Se déplacer            | Flèches / ZQSD              | ◀ ▶               |
| Grimper aux échelles   | Haut / Bas                  | ▲ ▼               |
| Sauter                 | Espace                      | SAUT              |
| Entrer dans une porte  | Entrée / E (ou Haut)        | ⤒                 |
| Ressortir d'un couloir | Échap (ou Bas à l'entrée)   | ▼ à l'entrée      |

## 🏗️ Structure de la tour

- **Tutoriel** — un mini-labyrinthe pour apprendre : déplacements, échelles,
  **pièges** (retour au départ) et **3 téléporteurs** :
  - 🟢 *rapproche* de la sortie,
  - 🟠 *projette au hasard* dans le labyrinthe,
  - 🔴 *ramène à l'entrée*.
- **Étage I** — 5 portes, **2** mènent à une sortie, les autres sont sans issue.
- **Étage II** — 4 portes, 1 sortie.
- **Étage III** — 3 portes, 1 sortie.
- **Étage IV** — 2 portes, 1 sortie.
- **Étage Ultime** — 1 porte → **labyrinthe géant** → victoire.

La **largeur de la tour reste constante** ; à chaque étage les labyrinthes
« fusionnent » et gagnent en **hauteur**, agrandissant la tour à mesure qu'on
monte.

## 🧩 Aspects techniques

- HTML5 Canvas + JavaScript pur, aucun build, aucun asset externe (le pixel art
  est dessiné par code).
- Génération procédurale par *recursive backtracker* (labyrinthe parfait) avec
  quelques boucles ajoutées pour la difficulté ; **seed déterministe** par
  étage/porte.
- Physique plateformer (gravité + saut) et **échelles** dans tous les puits
  verticaux → chaque labyrinthe est toujours résoluble.
- Contrôles unifiés clavier + tactile, rendu responsive PC/mobile.

## 📁 Organisation

```
index.html          page + HUD + contrôles tactiles + overlays
css/style.css       styles responsive (thème sombre, contrôles mobiles)
js/utils.js         RNG seedé (mulberry32) + helpers
js/input.js         entrées unifiées clavier + tactile
js/maze.js          génération procédurale + conversion en tuiles
js/renderer.js      rendu pixel-art (caméra, tuiles, entités, joueur)
js/player.js        physique du personnage (gravité, saut, échelles)
js/game.js          étages, hub à portes, pièges, téléporteurs, transitions
js/main.js          initialisation + boucle de jeu
```

---
*Tower Quest : Curiosity — premier volet de la saga Tower Quest.*
