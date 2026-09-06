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

/* ---- Temas visuales / skins ----
 * Cada skin define su paleta (mismo orden que COLORS: índice 1..9), un estilo
 * de dibujo para drawBlock() y, opcionalmente, un fondo de canvas y color de
 * rejilla propios. El cambio se aplica sin recargar reasignando `activeSkin` y
 * volviendo a dibujar. La preferencia se guarda en localStorage('skin').
 * Nota: todos los bloques siguen siendo cuadrados; el skin "pastel" solo simula
 * suavidad con un biselado claro, sin esquinas redondeadas. */
const SKINS = {
  retro: {
    label: 'Retro',
    style: 'flat',
    colors: COLORS,
  },
  neon: {
    label: 'Neon',
    style: 'neon',
    bg: '#000000',
    grid: { dark: '#101018', light: '#101018' },
    colors: [
      null,
      '#00f0ff', '#ffe600', '#d400ff', '#00ff85',
      '#ff003c', '#2979ff', '#ff9100', '#c0d0e0', '#ff1744',
    ],
  },
  pastel: {
    label: 'Pastel',
    style: 'pastel',
    bg: { dark: '#20202c', light: '#f4f1fa' },
    colors: [
      null,
      '#a0e7e5', '#fdffb6', '#d8b4f8', '#b9fbc0',
      '#ffadad', '#a3c4f3', '#ffd6a5', '#cfd8dc', '#ff8fa3',
    ],
  },
  pixel: {
    label: 'Pixel art',
    style: 'pixel',
    colors: [
      null,
      '#3fb8c7', '#e6c14a', '#a860b8', '#6fb573',
      '#cf6060', '#7fabd8', '#e0a24d', '#9aa6ad', '#e6304a',
    ],
  },
};

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
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let theme = 'dark';
let activeSkin = 'retro';

function resolveThemed(value) {
  if (value && typeof value === 'object') return value[theme];
  return value;
}

function applySkin(name) {
  activeSkin = SKINS[name] ? name : 'retro';
  const skin = SKINS[activeSkin];
  const bg = resolveThemed(skin.bg) || '';
  canvas.style.background = bg;
  nextCanvas.style.background = bg;
  document.body.dataset.skin = activeSkin;
  if (skinSelect) skinSelect.value = activeSkin;
  if (board) draw();
  if (next) drawNext();
}

function applyTheme(t) {
  theme = t === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('light', theme === 'light');
  themeToggleBtn.setAttribute('aria-pressed', String(theme === 'light'));
  themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  themeToggleBtn.title = theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
  themeToggleBtn.setAttribute('aria-label', themeToggleBtn.title);
  // Algunos skins (p. ej. pastel) tienen fondo dependiente del tema.
  if (SKINS[activeSkin]) applySkin(activeSkin);
}

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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[activeSkin] || SKINS.retro;
  const color = skin.colors[colorIndex];
  const px = x * size;
  const py = y * size;
  context.save();
  context.globalAlpha = alpha ?? 1;

  if (skin.style === 'neon') {
    context.shadowColor = color;
    context.shadowBlur = size * 0.55;
    context.fillStyle = color;
    context.fillRect(px + 2, py + 2, size - 4, size - 4);
    context.shadowBlur = 0;
    context.fillStyle = 'rgba(0,0,0,0.45)';
    context.fillRect(px + size * 0.3, py + size * 0.3, size * 0.4, size * 0.4);
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.strokeRect(px + 3, py + 3, size - 6, size - 6);
  } else if (skin.style === 'pastel') {
    // Bloque cuadrado con biselado claro que simula suavidad (sin esquinas redondeadas).
    context.fillStyle = color;
    context.fillRect(px + 2, py + 2, size - 4, size - 4);
    context.fillStyle = 'rgba(255,255,255,0.4)';
    context.fillRect(px + 2, py + 2, size - 4, 3);
    context.fillRect(px + 2, py + 2, 3, size - 4);
    context.fillStyle = 'rgba(0,0,0,0.08)';
    context.fillRect(px + 2, py + size - 5, size - 4, 3);
    context.fillRect(px + size - 5, py + 2, 3, size - 4);
  } else if (skin.style === 'pixel') {
    context.fillStyle = color;
    context.fillRect(px + 1, py + 1, size - 2, size - 2);
    const n = 4;
    const cell = (size - 2) / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        context.fillStyle = (i + j) % 2 === 0
          ? 'rgba(255,255,255,0.12)'
          : 'rgba(0,0,0,0.14)';
        context.fillRect(
          px + 1 + i * cell,
          py + 1 + j * cell,
          Math.ceil(cell),
          Math.ceil(cell),
        );
      }
    }
    context.strokeStyle = 'rgba(0,0,0,0.35)';
    context.lineWidth = 1;
    context.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
  } else {
    // retro / flat (estilo original)
    context.fillStyle = color;
    context.fillRect(px + 1, py + 1, size - 2, size - 2);
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(px + 1, py + 1, size - 2, 4);
  }

  // marca de bomba: cuadrado interior oscuro (común a todos los skins)
  if (colorIndex === BOMB) {
    const inner = Math.round(size * 0.4);
    const off = Math.round((size - inner) / 2);
    context.fillStyle = 'rgba(0,0,0,0.55)';
    context.fillRect(px + off, py + off, inner, inner);
  }

  context.restore();
}

function drawGrid() {
  const skinGrid = (SKINS[activeSkin] || SKINS.retro).grid;
  ctx.strokeStyle = (skinGrid && skinGrid[theme]) || GRID_LINE_COLORS[theme];
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

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  animId = null;
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
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

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === themeToggleBtn) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
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

restartBtn.addEventListener('click', init);

themeToggleBtn.addEventListener('click', () => {
  const newTheme = theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', newTheme);
  applyTheme(newTheme);
});

if (skinSelect) {
  skinSelect.addEventListener('change', () => {
    localStorage.setItem('skin', skinSelect.value);
    applySkin(skinSelect.value);
  });
  skinSelect.addEventListener('keydown', e => e.stopPropagation());
}

applySkin(localStorage.getItem('skin') || 'retro');
applyTheme(localStorage.getItem('theme') || 'dark');
init();
