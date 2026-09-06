'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // Tuerca - gris metálico
  '#ff1744', // Bomba - power-up (rojo intenso)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca (reto): anillo 3x3 con hueco central
  [[9]],                                       // Bomba (power-up): 1x1, al bloquear destruye un área 3x3
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const BOMB = 9;              // índice de la pieza bomba en PIECES/COLORS
const BOMB_RADIUS = 1;       // radio de la explosión → área (2*r+1) x (2*r+1) = 3x3
const BOMB_BLOCK_SCORE = 10; // puntos por bloque destruido, multiplicados por level

const GRID_LINE_COLORS = { dark: '#22222e', light: '#d8dae8' };

const START_LEVEL_KEY = 'tetris.startLevel';
const MAX_START_LEVEL = 15;

/* ---------- Skins (temas visuales del canvas) ---------- */

const SKIN_KEY = 'tetris.skin';

// Cada skin aporta: su paleta por índice (1..9, alineada con COLORS), el color de
// la rejilla (función de tema), el color de fondo del canvas (null = transparente,
// lo pinta el CSS) y una función que dibuja el CUERPO del bloque. `drawBlock` añade
// encima la marca de la bomba; el hueco de la tuerca es una celda con índice 0 que
// simplemente no se pinta. Ninguna skin usa formas redondeadas (regla del proyecto).
const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS,
    bg: null,
    grid: t => GRID_LINE_COLORS[t],
    block: blockRetro,
  },
  neon: {
    label: 'Neon',
    colors: [null, '#00e5ff', '#ffea00', '#e040fb', '#00e676', '#ff5252', '#448aff', '#ffab40', '#b0bec5', '#ff1744'],
    bg: '#000000',
    grid: () => 'rgba(0, 229, 255, 0.10)',
    block: blockNeon,
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#a7dde0', '#f7e9a0', '#d9b8ec', '#b6e3c0', '#f2b8bd', '#bcd4f0', '#f3cea8', '#cdd6da', '#f2a1ac'],
    bg: null,
    grid: t => GRID_LINE_COLORS[t],
    block: blockPastel,
  },
  pixel: {
    label: 'Pixel art',
    colors: COLORS,
    bg: null,
    grid: t => GRID_LINE_COLORS[t],
    block: blockPixel,
  },
};

let activeSkin = 'retro';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const themeToggleBtn = document.getElementById('theme-toggle');

const screenStart = document.getElementById('screen-start');
const screenPause = document.getElementById('screen-pause');
const screenGameover = document.getElementById('screen-gameover');
const playBtn = document.getElementById('play-btn');
const resumeBtn = document.getElementById('resume-btn');
const restartBtn = document.getElementById('restart-btn');
const gameoverRestartBtn = document.getElementById('gameover-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsList = document.getElementById('controls-list');
const startLevelSel = document.getElementById('start-level');
const pauseLevelSel = document.getElementById('pause-level');
const startSkinSlot = document.getElementById('start-skin');
let skinSelect = null;

// Estado del juego. `screen` es la máquina de estados de la UI:
// 'start' | 'playing' | 'paused' | 'gameover'. `paused`/`gameOver` se derivan
// de ella para que `loop()` siga funcionando sin cambios.
let board, current, next, score, lines, level, startLevel;
// `gameStartLevel` = nivel inicial fijado al arrancar la partida en curso; `clearLines`
// lo usa para calcular el nivel, de modo que cambiar el selector "próxima partida"
// durante la pausa no altera la velocidad de la partida actual.
let gameStartLevel;
// `combo` (rachas de líneas consecutivas) lo alimenta esta base y lo consume la
// función de records (mejor combo). Sin esa función todavía no se muestra en ningún sitio.
let combo;
let paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let screen = 'start';
let theme = 'dark';

/* ---------- Preferencias persistentes ---------- */

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* localStorage no disponible (modo privado, cuota, etc.) */
  }
}

function applyTheme(t) {
  theme = t === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('light', theme === 'light');
  themeToggleBtn.setAttribute('aria-pressed', String(theme === 'light'));
  themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  themeToggleBtn.title = theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
  themeToggleBtn.setAttribute('aria-label', themeToggleBtn.title);
}

/* ---------- Skin (selector persistente) ---------- */

// Genera el <select id="skin-select"> dentro de #start-skin (hueco vacío del HTML).
function buildSkinSelect() {
  if (!startSkinSlot || skinSelect) return;
  const field = document.createElement('label');
  field.className = 'menu-field';
  field.textContent = 'Skin';
  skinSelect = document.createElement('select');
  skinSelect.id = 'skin-select';
  skinSelect.className = 'menu-select';
  for (const [key, s] of Object.entries(SKINS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = s.label;
    skinSelect.appendChild(opt);
  }
  field.appendChild(skinSelect);
  startSkinSlot.appendChild(field);
  skinSelect.addEventListener('change', e => {
    saveJSON(SKIN_KEY, e.target.value);
    applySkin(e.target.value);
  });
}

// Aplica la skin y repinta en caliente (sin recargar). Los repintados se protegen
// porque en la pantalla de inicio todavía no hay `board`/`current`/`next`.
function applySkin(name) {
  activeSkin = SKINS[name] ? name : 'retro';
  if (skinSelect) skinSelect.value = activeSkin;
  if (board && current) draw();
  if (next) drawNext();
}

/* ---------- Niveles ---------- */

function clampLevel(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_START_LEVEL, Math.max(1, n));
}

function levelInterval(l) {
  return Math.max(100, 1000 - (l - 1) * 90);
}

function buildLevelSelects() {
  for (const sel of [startLevelSel, pauseLevelSel]) {
    if (!sel || sel.options.length) continue;
    for (let i = 1; i <= MAX_START_LEVEL; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = String(i);
      sel.appendChild(opt);
    }
  }
}

function syncLevelSelects() {
  for (const sel of [startLevelSel, pauseLevelSel]) {
    if (sel) sel.value = String(startLevel);
  }
}

function setStartLevel(v) {
  startLevel = clampLevel(v);
  saveJSON(START_LEVEL_KEY, startLevel);
  syncLevelSelects();
}

/* ---------- Pantallas / overlay ---------- */

function showScreen(name) {
  screen = name;
  paused = name === 'paused';
  gameOver = name === 'gameover';
  const screens = { start: screenStart, paused: screenPause, gameover: screenGameover };
  for (const el of Object.values(screens)) el.classList.add('hidden');
  if (name === 'playing') {
    overlay.classList.add('hidden');
  } else {
    overlay.classList.remove('hidden');
    if (screens[name]) screens[name].classList.remove('hidden');
  }
}

// Hooks ampliados por otras unidades del batch (records). En la base no hacen nada.
function onGameOver() {}
function onStartScreen() {}

/* ---------- Lógica del tablero ---------- */

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 9) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    combo++;
    level = gameStartLevel + Math.floor(lines / 10);
    dropInterval = levelInterval(level);
    updateHUD();
  } else {
    combo = 0;
  }
}

function bombCells() {
  const cells = [];
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c] === BOMB && current.y + r >= 0)
        cells.push({ x: current.x + c, y: current.y + r });
  return cells;
}

function explode(cells) {
  let destroyed = 0;
  for (const { x, y } of cells) {
    for (let r = y - BOMB_RADIUS; r <= y + BOMB_RADIUS; r++) {
      for (let c = x - BOMB_RADIUS; c <= x + BOMB_RADIUS; c++) {
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
        if (board[r][c]) {
          board[r][c] = 0;
          destroyed++;
        }
      }
    }
  }
  if (destroyed) {
    score += destroyed * BOMB_BLOCK_SCORE * level;
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  const bombs = bombCells();
  merge();
  if (bombs.length) explode(bombs);
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

/* ---------- Pintado de bloques por skin ---------- */

// Retro: relleno plano + franja superior translúcida. Produce EXACTAMENTE los
// mismos píxeles que el pintado histórico (px = x*size, py = y*size).
function blockRetro(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

// Neon: bloque con glow vía shadowBlur/shadowColor. Se resetea el shadow al
// terminar para que el brillo no contamine rejilla, ghost ni el resto del frame.
function blockNeon(context, px, py, size, color) {
  context.shadowColor = color;
  context.shadowBlur = Math.round(size * 0.45);
  context.fillStyle = color;
  context.fillRect(px + 2, py + 2, size - 4, size - 4);
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  // núcleo interior más claro (rectangular, sin esquinas redondeadas)
  const inner = Math.round(size * 0.36);
  const off = Math.round((size - inner) / 2);
  context.fillStyle = 'rgba(255,255,255,0.22)';
  context.fillRect(px + off, py + off, inner, inner);
}

// Pastel: color suave + degradado interior claro que da sensación "blanda", más
// un bisel claro arriba/izquierda. Siempre rectángulos: sin arc/roundRect.
function blockPastel(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  const grad = context.createLinearGradient(px, py, px + size, py + size);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(0,0,0,0.10)');
  context.fillStyle = grad;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.40)';
  context.fillRect(px + 2, py + 2, size - 4, 2);
  context.fillRect(px + 2, py + 2, 2, size - 4);
}

// Pixel art: relleno plano + tramado de puntos de 2 px alternando claro/oscuro.
function blockPixel(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  const step = 4;
  const dot = 2;
  for (let oy = 2; oy < size - 2; oy += step) {
    for (let ox = 2; ox < size - 2; ox += step) {
      const dark = ((ox + oy) / step) % 2 === 0;
      context.fillStyle = dark ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.22)';
      context.fillRect(px + ox, py + oy, dot, dot);
    }
  }
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[activeSkin];
  const px = x * size;
  const py = y * size;
  context.globalAlpha = alpha ?? 1;
  skin.block(context, px, py, size, skin.colors[colorIndex]);
  // marca de bomba: cuadrado interior oscuro (estilo cuadrado, sin formas redondeadas)
  if (colorIndex === BOMB) {
    const inner = Math.round(size * 0.4);
    const off = Math.round((size - inner) / 2);
    context.fillStyle = 'rgba(0,0,0,0.55)';
    context.fillRect(px + off, py + off, inner, inner);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = SKINS[activeSkin].grid(theme);
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

// Pinta el fondo del canvas segun la skin: si define `bg` se rellena (Neon lo
// necesita en negro), si no se limpia y el fondo lo aporta el CSS de #board.
function paintBackground(context, w, h) {
  const bg = SKINS[activeSkin].bg;
  if (bg) {
    context.fillStyle = bg;
    context.fillRect(0, 0, w, h);
  } else {
    context.clearRect(0, 0, w, h);
  }
}

function draw() {
  paintBackground(ctx, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  paintBackground(nextCtx, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  cancelAnimationFrame(animId);
  animId = null;
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  showScreen('gameover');
  onGameOver();
}

function togglePause() {
  if (screen === 'playing') {
    cancelAnimationFrame(animId);
    showScreen('paused');
  } else if (screen === 'paused') {
    showScreen('playing');
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      if (gameOver) {
        draw();
        return;
      }
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

// Prepara una partida nueva sin arrancarla ni cambiar de pantalla.
function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  combo = 0;
  gameOver = false;
  paused = false;
  startLevel = clampLevel(loadJSON(START_LEVEL_KEY, 1));
  gameStartLevel = startLevel;
  level = startLevel;
  dropInterval = levelInterval(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  cancelAnimationFrame(animId);
  animId = null;
}

// Arranca una partida nueva desde cualquier pantalla.
function startGame() {
  init();
  // Si el spawn inicial fue imposible, spawn()->endGame() ya puso screen='gameover'
  // y gameOver=true; no arrancamos el bucle. (No debería ocurrir en tablero vacío.)
  if (gameOver) return;
  showScreen('playing');
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

/* ---------- Entrada de teclado ---------- */

document.addEventListener('keydown', e => {
  if (e.target === themeToggleBtn) return;
  // No robar teclas cuando el foco está en un campo del menú.
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (screen === 'playing' || screen === 'paused') {
      e.preventDefault();
      togglePause();
    }
    return;
  }

  if (screen !== 'playing') return;

  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

/* ---------- Botones del menú ---------- */

playBtn.addEventListener('click', startGame);
resumeBtn.addEventListener('click', togglePause);
restartBtn.addEventListener('click', startGame);
gameoverRestartBtn.addEventListener('click', startGame);

controlsBtn.addEventListener('click', () => {
  const hidden = controlsList.classList.toggle('hidden');
  controlsBtn.setAttribute('aria-expanded', String(!hidden));
});

startLevelSel.addEventListener('change', e => setStartLevel(e.target.value));
pauseLevelSel.addEventListener('change', e => setStartLevel(e.target.value));

themeToggleBtn.addEventListener('click', () => {
  const newTheme = theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', newTheme);
  applyTheme(newTheme);
});

/* ---------- Arranque ---------- */

applyTheme(localStorage.getItem('theme') || 'dark');
buildLevelSelects();
startLevel = clampLevel(loadJSON(START_LEVEL_KEY, 1));
syncLevelSelects();
buildSkinSelect();
applySkin(loadJSON(SKIN_KEY, 'retro'));
showScreen('start');
onStartScreen();
