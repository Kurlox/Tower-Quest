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

Sur mobile, **aucun bouton à l'écran** : on **glisse le doigt** n'importe où
pour se déplacer (droite = à droite, haut/bas = grimper), un **tap** saute, et
un **2ᵉ doigt** permet de sauter tout en dirigeant (sauts en diagonale).

| Action                 | PC                          | Mobile                        |
|------------------------|-----------------------------|-------------------------------|
| Se déplacer            | Flèches / ZQSD              | glisser ◀ ▶                   |
| Grimper aux échelles   | Haut / Bas                  | glisser ▲ ▼                   |
| Sauter                 | Espace                      | tap · ou 2ᵉ doigt en bougeant |
| Entrer dans une porte  | Entrée / E (ou Haut)        | glisser vers le haut / tap    |
| Ressortir d'un couloir | Échap (ou Bas à l'entrée)   | glisser vers le bas à l'entrée |

Un **saut plus indulgent** (coyote time + tampon d'appui) rend le platforming
confortable au tactile.

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

### 🔦 Brouillard & lanterne

Dans les labyrinthes, on ne voit qu'une **petite zone autour du personnage**
(comme dans les vieux Pokémon sans Flash) : le reste est plongé dans le noir.
Chaque labyrinthe cache une **🏮 lanterne** ; la ramasser **révèle tout le
labyrinthe pendant ~5 secondes** (puis le brouillard revient) — de quoi repérer
la sortie ou vérifier si la porte est une impasse.

## 🎵 Son & finitions

- **Musique d'ambiance** et **bruitages** entièrement générés par code
  (WebAudio, aucun fichier son). Bouton 🔊/🔇 pour couper (mémorisé).
- **Particules** (poussière de saut, éclats, étincelles), léger screen-shake.
- **Chrono** et **meilleur temps** sauvegardés (localStorage).
- **PWA installable** : « Ajouter à l'écran d'accueil » pour jouer en plein
  écran comme une appli.

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
index.html            page + HUD + overlays
manifest.webmanifest  PWA (installable) · icon.svg
css/style.css         styles responsive (thème sombre)
js/utils.js           RNG seedé (mulberry32) + helpers
js/input.js           entrées unifiées clavier + tactile (glissement, 2 doigts)
js/audio.js           musique + bruitages générés (WebAudio)
js/maze.js            génération procédurale + solvabilité garantie
js/particles.js       particules (poussière, éclats, étincelles)
js/renderer.js        rendu pixel-art (caméra, brouillard, screen-shake)
js/player.js          physique du personnage (gravité, saut, échelles, coyote)
js/game.js            étages, hall à portes, pièges, téléporteurs, audio, chrono
js/main.js            initialisation + boucle de jeu
```

---
*Tower Quest : Curiosity — premier volet de la saga Tower Quest.*
