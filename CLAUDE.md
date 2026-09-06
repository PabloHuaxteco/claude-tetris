# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A classic Tetris implementation in vanilla JavaScript (no frameworks, no build step, no dependencies, no `package.json`). Three files: `index.html` (DOM/canvas structure), `style.css` (dark retro-arcade theme), `game.js` (all game logic, ~300 lines).

## Running / testing

There is no build, lint, or test tooling. To run the game, open `index.html` directly in a browser, or serve it with any static server, e.g.:

```bash
python3 -m http.server 8000
# or
npx serve .
```

There are no automated tests; verify changes by playing the game in a browser (spawn pieces, rotate near walls, clear lines, trigger game over/pause).

## Architecture

All logic lives in `game.js` as top-level functions/state (no classes, no modules). Key pieces:

- **Board model**: `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or an index 1–8 into `COLORS`/`PIECES` identifying which tetromino occupies it.
- **Pieces**: `PIECES` are 4x4/3x3/2x2/1x1 matrices of color indices. Rotation is done via matrix transpose (`rotateCW`), not precomputed rotation states. Index 8 is the "tuerca" (nut) — a challenge piece: a 3x3 ring of blocks with a hollow (empty) center cell. It is rotationally symmetric so rotating it is a no-op, and its enclosed center hole can never be filled, so the row through a locked nut's center can never be cleared. Index 9 is the "bomba" (bomb) — a power-up: a single 1x1 cell (`[[9]]`, rotation is a no-op). On lock it destroys every occupied cell in the `BOMB_RADIUS`-radius square around it (3x3), itself included, and adds `destroyed * BOMB_BLOCK_SCORE * level` to the score; blocks above the cleared area do not fall. All pieces are drawn as plain square blocks like every other piece (the nut's hole is just an unpainted cell; the bomb gets a small dark inner square) — no round shapes anywhere in the canvas.
- **Collision** (`collide`): checks a shape against board bounds and already-locked cells.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until one doesn't collide.
- **Game loop** (`loop`): driven by `requestAnimationFrame`; accumulates elapsed time in `dropAccum` and advances the piece one row once `dropInterval` is exceeded.
- **Locking/clearing**: `lockPiece` → capture `bombCells()` → `merge` (bakes piece into `board`) → `explode` (if the piece held any bomb cells, clears the 3x3 area around each and scores it) → `clearLines` (removes full rows bottom-up, unshifts empty rows at top, updates score/level/dropInterval).
- **Scoring/leveling**: line clears use `LINE_SCORES = [0, 100, 300, 500, 800]` × `level`; hard drop adds 2 pts/row, soft drop 1 pt/row; level increments every 10 lines and speeds up drop via `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Ghost piece**: `ghostY` projects the current piece straight down to its landing row; drawn with `globalAlpha = 0.2`.
- **Rendering**: `draw()` redraws the whole board canvas each frame (grid, locked blocks, ghost, current piece); `drawNext()` renders the preview piece on a separate small canvas.
- All DOM/canvas element references and game state (`board`, `current`, `next`, `score`, etc.) are module-level `let`/`const` bindings — there is no encapsulation, so functions freely read/mutate shared state.

Tunable constants are all at the top of `game.js`: `COLS`, `ROWS`, `BLOCK` (canvas cell size in px — must match the `<canvas id="board">` width/height in `index.html`, i.e. `COLS*BLOCK` × `ROWS*BLOCK`), `COLORS`, `LINE_SCORES`, `BOMB` / `BOMB_RADIUS` / `BOMB_BLOCK_SCORE` (bomb power-up), and the initial `dropInterval`. `randomPiece` draws uniformly from the 9 piece indices.

The README (`README.md`) is in Spanish and contains a more detailed walkthrough of the game flow (`init → spawn → loop → keydown handlers`) — consult it for additional context if needed.
