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

// Paletas alternativas por skin (mismos índices que COLORS)
const NEON_COLORS = [
  null,
  '#00e5ff', // I
  '#ffea00', // O
  '#d500f9', // T
  '#00e676', // S
  '#ff1744', // Z
  '#2979ff', // J
  '#ff9100', // L
  '#b0bec5', // Tuerca
  '#ff1744', // Bomba
];

const PASTEL_COLORS = [
  null,
  '#a0e7e5', // I
  '#f9e79f', // O
  '#d5b8e8', // T
  '#b8e6c1', // S
  '#f5b7b1', // Z
  '#aec7e8', // J
  '#ffd8a8', // L
  '#cfd8dc', // Tuerca
  '#ff8a80', // Bomba
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

// ---- Skins / temas visuales ----------------------------------------------
// Cada skin aporta su paleta, el color de las líneas de la cuadrícula por
// tema (claro/oscuro) y la función que pinta un bloque en el canvas.
// Todos los bloques se dibujan como cuadrados: nada de esquinas redondeadas.

function bombMark(context, x, y, size) {
  const inner = Math.round(size * 0.4);
  const off = Math.round((size - inner) / 2);
  context.fillStyle = 'rgba(0,0,0,0.55)';
  context.fillRect(x * size + off, y * size + off, inner, inner);
}

// Retro: relleno plano + franja de brillo superior (estilo original).
function retroBlock(context, x, y, ci, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = COLORS[ci];
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  if (ci === BOMB) bombMark(context, x, y, size);
  context.globalAlpha = 1;
}

// Neon: fondo oscuro dentro del bloque, borde brillante con glow (shadowBlur)
// y un tinte de color tenue encima.
function neonBlock(context, x, y, ci, size, alpha) {
  const color = NEON_COLORS[ci];
  const a = alpha ?? 1;
  const bx = x * size + 1, by = y * size + 1, s = size - 2;
  context.globalAlpha = a;
  context.fillStyle = 'rgba(0,0,0,0.6)';
  context.fillRect(bx, by, s, s);
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(bx + 1, by + 1, s - 2, s - 2);
  context.shadowBlur = 0;
  context.globalAlpha = a * 0.22;
  context.fillStyle = color;
  context.fillRect(bx, by, s, s);
  context.globalAlpha = a;
  if (ci === BOMB) bombMark(context, x, y, size);
  context.globalAlpha = 1;
}

// Pastel: colores suaves, separación mayor entre bloques y un borde interior
// blanco translúcido para dar sensación mullida (sin redondear esquinas).
function pastelBlock(context, x, y, ci, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  const bx = x * size + 2, by = y * size + 2, s = size - 4;
  context.fillStyle = PASTEL_COLORS[ci];
  context.fillRect(bx, by, s, s);
  context.strokeStyle = 'rgba(255,255,255,0.4)';
  context.lineWidth = 2;
  context.strokeRect(bx + 1, by + 1, s - 2, s - 2);
  if (ci === BOMB) bombMark(context, x, y, size);
  context.globalAlpha = 1;
}

// Patrón fijo de textura para la skin pixel art (rejilla 6x6 de "téxeles";
// 'l' = luz, 'd' = sombra). Fijo para que no parpadee entre frames.
const PIXEL_TEXELS = [
  [0, 0, 'l'], [1, 0, 'l'], [5, 0, 'd'], [4, 1, 'd'],
  [2, 2, 'l'], [5, 3, 'd'], [0, 4, 'd'], [3, 4, 'l'],
  [1, 5, 'd'], [4, 5, 'l'], [5, 5, 'd'], [2, 3, 'd'],
];

function pixelBlock(context, x, y, ci, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  const bx = x * size + 1, by = y * size + 1, s = size - 2;
  context.fillStyle = COLORS[ci];
  context.fillRect(bx, by, s, s);
  const u = s / 6;
  for (const [cx, cy, k] of PIXEL_TEXELS) {
    context.fillStyle = k === 'l' ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.3)';
    context.fillRect(bx + Math.floor(cx * u), by + Math.floor(cy * u), Math.ceil(u), Math.ceil(u));
  }
  // borde tipo sprite
  context.fillStyle = 'rgba(0,0,0,0.35)';
  context.fillRect(bx, by, s, 1);
  context.fillRect(bx, by, 1, s);
  context.fillStyle = 'rgba(255,255,255,0.18)';
  context.fillRect(bx, by + s - 1, s, 1);
  context.fillRect(bx + s - 1, by, 1, s);
  if (ci === BOMB) bombMark(context, x, y, size);
  context.globalAlpha = 1;
}

const SKINS = {
  retro:  { block: retroBlock,  grid: { dark: '#22222e', light: '#d8dae8' } },
  neon:   { block: neonBlock,   grid: { dark: '#10233a', light: '#10233a' } },
  pastel: { block: pastelBlock, grid: { dark: '#2e2e3e', light: '#e2e4ee' } },
  pixel:  { block: pixelBlock,  grid: { dark: '#1e1e28', light: '#cfd2e0' } },
};

const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;

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
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const startRecordsEl = document.getElementById('start-records');
const startResetBtn = document.getElementById('start-reset-records-btn');
const nameEntry = document.getElementById('name-entry');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const overlayRecordsEl = document.getElementById('overlay-records');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const toggleControlsBtn = document.getElementById('toggle-controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSel = document.getElementById('start-level');

const MAX_START_LEVEL = 20;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo, pendingScore;
let theme = 'dark';
let skin = 'retro';
let startLevel = clampStartLevel(parseInt(localStorage.getItem('startLevel'), 10));

function clampStartLevel(n) {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_START_LEVEL, Math.max(1, Math.floor(n)));
}

function dropIntervalForLevel(lv) {
  return Math.max(100, 1000 - (lv - 1) * 90);
}

for (let lv = 1; lv <= MAX_START_LEVEL; lv++) {
  const opt = document.createElement('option');
  opt.value = String(lv);
  opt.textContent = String(lv);
  startLevelSel.appendChild(opt);
}
startLevelSel.value = String(startLevel);

/* ---------- Tabla de records (localStorage) ---------- */

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    return {
      scores: Array.isArray(data && data.scores) ? data.scores : [],
      bestCombo: (data && data.bestCombo) || 0,
      maxLines: (data && data.maxLines) || 0,
    };
  } catch {
    return { scores: [], bestCombo: 0, maxLines: 0 };
  }
}

function saveRecords(data) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(data)); } catch {}
}

function qualifiesForTop(s) {
  if (s <= 0) return false;
  const { scores } = loadRecords();
  return scores.length < MAX_RECORDS || s > scores[scores.length - 1].score;
}

function addScore(name, s, l, lvl) {
  const data = loadRecords();
  const entry = { name: name || 'ANÓNIMO', score: s, lines: l, level: lvl, date: Date.now() };
  data.scores.push(entry);
  data.scores.sort((a, b) => b.score - a.score || a.date - b.date);
  data.scores = data.scores.slice(0, MAX_RECORDS);
  saveRecords(data);
  return { data, index: data.scores.indexOf(entry) };
}

function updateAggregateRecords(bestComboRun, totalLines) {
  const data = loadRecords();
  let changed = false;
  if (bestComboRun > data.bestCombo) { data.bestCombo = bestComboRun; changed = true; }
  if (totalLines > data.maxLines) { data.maxLines = totalLines; changed = true; }
  if (changed) saveRecords(data);
}

function resetRecords() {
  saveRecords({ scores: [], bestCombo: 0, maxLines: 0 });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderRecords(container, highlightIndex = -1, provisional = null) {
  const data = loadRecords();
  let scores = data.scores.slice();
  let hi = highlightIndex;

  if (provisional) {
    const entry = { name: '¿?', score: provisional.score, provisional: true, date: Infinity };
    scores.push(entry);
    scores.sort((a, b) => b.score - a.score || a.date - b.date);
    scores = scores.slice(0, MAX_RECORDS);
    hi = scores.indexOf(entry);
  }

  const rows = scores.map((s, i) => `
    <li class="${i === hi ? 'record-highlight' : ''}">
      <span class="record-rank">${i + 1}</span>
      <span class="record-name">${escapeHtml(s.name)}</span>
      <span class="record-score">${s.score.toLocaleString()}</span>
    </li>`).join('');

  container.innerHTML = `
    <ol class="record-list">${rows || '<li class="record-empty">Sin récords todavía</li>'}</ol>
    <div class="record-extra">
      <span>Mejor combo: <strong>${data.bestCombo}</strong></span>
      <span>Líneas máx.: <strong>${data.maxLines}</strong></span>
    </div>`;
}

function commitScore() {
  if (!pendingScore) return;
  const { index } = addScore(
    playerNameInput.value.trim(),
    pendingScore.score, pendingScore.lines, pendingScore.level
  );
  pendingScore = null;
  nameEntry.classList.add('hidden');
  renderRecords(overlayRecordsEl, index);
}

function applyTheme(t) {
  theme = t === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('light', theme === 'light');
  themeToggleBtn.setAttribute('aria-pressed', String(theme === 'light'));
  themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  themeToggleBtn.title = theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
  themeToggleBtn.setAttribute('aria-label', themeToggleBtn.title);
}

function applySkin(name) {
  skin = SKINS[name] ? name : 'retro';
  document.body.classList.remove('skin-retro', 'skin-neon', 'skin-pastel', 'skin-pixel');
  document.body.classList.add('skin-' + skin);
  if (skinSelect) skinSelect.value = skin;
  if (board) draw();
  if (next) drawNext();
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
    level = startLevel + Math.floor(lines / 10);
    dropInterval = dropIntervalForLevel(level);
    updateHUD();
  }
  return cleared;
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
  const cleared = clearLines();
  if (cleared > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
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
  SKINS[skin].block(context, x, y, colorIndex, size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = SKINS[skin].grid[theme];
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
  ctx.shadowBlur = 0;
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
  nextCtx.shadowBlur = 0;
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

  updateAggregateRecords(maxCombo, lines);

  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlayRecordsEl.classList.remove('hidden');
  resetRecordsBtn.classList.remove('hidden');

  if (qualifiesForTop(score)) {
    pendingScore = { score, lines, level };
    playerNameInput.value = '';
    nameEntry.classList.remove('hidden');
    renderRecords(overlayRecordsEl, -1, pendingScore);
    setTimeout(() => playerNameInput.focus(), 50);
  } else {
    pendingScore = null;
    nameEntry.classList.add('hidden');
    renderRecords(overlayRecordsEl);
  }

  overlay.classList.remove('hidden');
}

function openPauseMenu() {
  pauseControls.classList.add('hidden');
  toggleControlsBtn.setAttribute('aria-expanded', 'false');
  startLevelSel.value = String(startLevel);
  pauseMenu.classList.remove('hidden');
  resumeBtn.focus();
}

function closePauseMenu() {
  pauseMenu.classList.add('hidden');
}

function togglePause() {
  if (gameOver || !current) return;
  paused = !paused;
  if (!paused) {
    closePauseMenu();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    openPauseMenu();
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
  level = startLevel;
  paused = false;
  gameOver = false;
  combo = 0;
  maxCombo = 0;
  pendingScore = null;
  dropInterval = dropIntervalForLevel(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  nameEntry.classList.add('hidden');
  overlay.classList.add('hidden');
  closePauseMenu();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === themeToggleBtn) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver || !current) return;
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

restartBtn.addEventListener('click', () => {
  if (pendingScore && !nameEntry.classList.contains('hidden')) commitScore();
  init();
});

startBtn.addEventListener('click', () => {
  startOverlay.classList.add('hidden');
  init();
});

saveScoreBtn.addEventListener('click', commitScore);

playerNameInput.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.code === 'Enter') { e.preventDefault(); commitScore(); }
});

resetRecordsBtn.addEventListener('click', () => {
  resetRecords();
  pendingScore = null;
  nameEntry.classList.add('hidden');
  renderRecords(overlayRecordsEl);
});

startResetBtn.addEventListener('click', () => {
  resetRecords();
  renderRecords(startRecordsEl);
});

resumeBtn.addEventListener('click', () => {
  if (paused) togglePause();
});

pauseRestartBtn.addEventListener('click', init);

toggleControlsBtn.addEventListener('click', () => {
  const willShow = pauseControls.classList.contains('hidden');
  pauseControls.classList.toggle('hidden', !willShow);
  toggleControlsBtn.setAttribute('aria-expanded', String(willShow));
});

startLevelSel.addEventListener('change', () => {
  startLevel = clampStartLevel(parseInt(startLevelSel.value, 10));
  startLevelSel.value = String(startLevel);
  localStorage.setItem('startLevel', String(startLevel));
});

themeToggleBtn.addEventListener('click', () => {
  const newTheme = theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', newTheme);
  applyTheme(newTheme);
});

skinSelect.addEventListener('change', () => {
  localStorage.setItem('skin', skinSelect.value);
  applySkin(skinSelect.value);
});

applyTheme(localStorage.getItem('theme') || 'dark');
applySkin(localStorage.getItem('skin') || 'retro');
renderRecords(startRecordsEl);
startOverlay.classList.remove('hidden');
