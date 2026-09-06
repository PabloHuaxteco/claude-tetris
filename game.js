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

const MAX_START_LEVEL = 15; // nivel inicial máximo seleccionable en el menú de pausa
const RECORDS_KEY = 'tetris-records'; // localStorage: { scores: [...], bestCombo, maxLines }
const MAX_RECORDS = 5;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const overlayRecords = document.getElementById('overlay-records');
const restartBtn = document.getElementById('restart-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const nameEntry = document.getElementById('name-entry');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const startOverlay = document.getElementById('start-overlay');
const startRecords = document.getElementById('start-records');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtnStart = document.getElementById('reset-records-btn-start');
const themeToggleBtn = document.getElementById('theme-toggle');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level-select');

let board, current, next, score, lines, level, combo, maxCombo, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let scoreSaved = false;        // evita guardar dos veces la misma partida
let highlightDate = null;      // marca de tiempo del record recién guardado (para resaltarlo)
let theme = 'dark';
let startLevel = 1; // nivel con el que arranca la próxima partida (elegible en el menú de pausa)

for (let i = 1; i <= MAX_START_LEVEL; i++) {
  const opt = document.createElement('option');
  opt.value = String(i);
  opt.textContent = String(i);
  startLevelSelect.appendChild(opt);
}
startLevelSelect.value = String(startLevel);

// ---- Tabla de records (localStorage) ----
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY)) || {};
    return {
      scores: Array.isArray(data.scores) ? data.scores : [],
      bestCombo: Number(data.bestCombo) || 0,
      maxLines: Number(data.maxLines) || 0,
    };
  } catch {
    return { scores: [], bestCombo: 0, maxLines: 0 };
  }
}

function saveRecords(data) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(data));
  } catch { /* localStorage no disponible: se ignora */ }
}

function qualifiesForTop(sc) {
  if (sc <= 0) return false;
  const { scores } = loadRecords();
  return scores.length < MAX_RECORDS || sc > scores[scores.length - 1].score;
}

function addScore(name, sc, ln, lv) {
  const data = loadRecords();
  const entry = {
    name: (name || '').trim() || 'Anónimo',
    score: sc,
    lines: ln,
    level: lv,
    date: Date.now(),
  };
  data.scores.push(entry);
  data.scores.sort((a, b) => b.score - a.score);
  data.scores = data.scores.slice(0, MAX_RECORDS);
  saveRecords(data);
  return entry;
}

function updateAggregateRecords(bestComboRun, ln) {
  const data = loadRecords();
  let changed = false;
  if (bestComboRun > data.bestCombo) { data.bestCombo = bestComboRun; changed = true; }
  if (ln > data.maxLines) { data.maxLines = ln; changed = true; }
  if (changed) saveRecords(data);
}

function renderRecords(container) {
  const { scores, bestCombo: best, maxLines } = loadRecords();
  let html = '<div class="records-title">TOP 5</div>';
  if (scores.length === 0) {
    html += '<div class="records-empty">Sin records todavía</div>';
  } else {
    html += '<ol class="records-list">';
    for (const s of scores) {
      const hl = highlightDate && s.date === highlightDate ? ' class="hl"' : '';
      html += `<li${hl}><span class="rname">${escapeHtml(s.name)}</span>`
        + `<span class="rscore">${s.score.toLocaleString()}</span></li>`;
    }
    html += '</ol>';
  }
  html += `<div class="records-agg">Mejor combo: <b>${best}</b> &middot; `
    + `Líneas máx: <b>${maxLines}</b></div>`;
  container.innerHTML = html;
}

function renderAllRecords() {
  renderRecords(startRecords);
  renderRecords(overlayRecords);
}

function resetRecords() {
  if (!window.confirm('¿Borrar todos los records?')) return;
  saveRecords({ scores: [], bestCombo: 0, maxLines: 0 });
  highlightDate = null;
  renderAllRecords();
}

function applyTheme(t) {
  theme = t === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('light', theme === 'light');
  themeToggleBtn.setAttribute('aria-pressed', String(theme === 'light'));
  themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  themeToggleBtn.title = theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
  themeToggleBtn.setAttribute('aria-label', themeToggleBtn.title);
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
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.max(startLevel, Math.floor(lines / 10) + 1);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
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
  comboEl.textContent = combo;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  // marca de bomba: cuadrado interior oscuro (estilo cuadrado, sin formas redondeadas)
  if (colorIndex === BOMB) {
    const inner = Math.round(size * 0.4);
    const off = Math.round((size - inner) / 2);
    context.fillStyle = 'rgba(0,0,0,0.55)';
    context.fillRect(x * size + off, y * size + off, inner, inner);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = GRID_LINE_COLORS[theme];
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

  updateAggregateRecords(maxCombo, lines);
  scoreSaved = false;
  highlightDate = null;

  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()} · Líneas: ${lines} · Combo máx: ${maxCombo}`;
  resetRecordsBtn.classList.remove('hidden');

  const qualifies = qualifiesForTop(score);
  nameEntry.classList.toggle('hidden', !qualifies);
  if (qualifies) playerNameInput.value = '';
  renderRecords(overlayRecords);
  overlay.classList.remove('hidden');
  if (qualifies) playerNameInput.focus();
}

function saveCurrentScore() {
  if (scoreSaved || !qualifiesForTop(score)) return;
  const entry = addScore(playerNameInput.value, score, lines, level);
  highlightDate = entry.date;
  scoreSaved = true;
  nameEntry.classList.add('hidden');
  renderAllRecords();
}

function showStartScreen() {
  highlightDate = null;
  renderRecords(startRecords);
  overlay.classList.add('hidden');
  startOverlay.classList.remove('hidden');
}

function openPauseMenu() {
  pauseControls.classList.add('hidden');
  controlsBtn.setAttribute('aria-expanded', 'false');
  startLevelSelect.value = String(startLevel);
  pauseMenu.classList.remove('hidden');
  resumeBtn.focus();
}

function closePauseMenu() {
  pauseMenu.classList.add('hidden');
}

function pause() {
  if (gameOver || paused) return;
  paused = true;
  cancelAnimationFrame(animId);
  animId = null;
  openPauseMenu();
}

function resume() {
  if (gameOver || !paused) return;
  paused = false;
  closePauseMenu();
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function togglePause() {
  if (gameOver) return;
  if (paused) resume();
  else pause();
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
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  scoreSaved = false;
  highlightDate = null;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  nameEntry.classList.add('hidden');
  startOverlay.classList.add('hidden');
  overlay.classList.add('hidden');
  closePauseMenu();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === themeToggleBtn) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
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
playBtn.addEventListener('click', init);
saveScoreBtn.addEventListener('click', saveCurrentScore);
resetRecordsBtn.addEventListener('click', resetRecords);
resetRecordsBtnStart.addEventListener('click', resetRecords);

playerNameInput.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.code === 'Enter') saveCurrentScore();
});

resumeBtn.addEventListener('click', resume);

pauseRestartBtn.addEventListener('click', () => {
  paused = false;
  init();
});

controlsBtn.addEventListener('click', () => {
  const willShow = pauseControls.classList.contains('hidden');
  pauseControls.classList.toggle('hidden', !willShow);
  controlsBtn.setAttribute('aria-expanded', String(willShow));
});

startLevelSelect.addEventListener('change', () => {
  const v = parseInt(startLevelSelect.value, 10);
  startLevel = Math.min(MAX_START_LEVEL, Math.max(1, Number.isNaN(v) ? 1 : v));
  startLevelSelect.value = String(startLevel);
});

themeToggleBtn.addEventListener('click', () => {
  const newTheme = theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', newTheme);
  applyTheme(newTheme);
});

applyTheme(localStorage.getItem('theme') || 'dark');
showStartScreen();
