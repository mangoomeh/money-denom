import { compile, formatNumber, findRoots } from '../src/expr.js';

const STORAGE_KEY = 'graph-v1';
const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#65a30d'];
const DEFAULT_VIEW = { cx: 0, cy: 0, scale: 40 }; // scale = pixels per unit
const $ = (id) => document.getElementById(id);

// ---- State --------------------------------------------------------------------

function newRow(src = '', color) {
  return { id: Math.random().toString(36).slice(2, 9), src, color: color ?? nextColor(), hidden: false };
}

function nextColor() {
  const used = new Set((state?.rows || []).map((r) => r.color));
  return COLORS.find((c) => !used.has(c)) ?? COLORS[(state?.rows.length || 0) % COLORS.length];
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.rows)) return { degrees: false, keypad: null, ...saved, view: { ...DEFAULT_VIEW, ...saved.view } };
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return null;
}

let state = load();
if (!state) {
  state = { rows: [], view: { ...DEFAULT_VIEW }, degrees: false, keypad: null };
  // One at a time, so each row picks a colour the previous ones haven't used.
  for (const src of ['x^2 - 2', '2sin(x)', '√2 × π']) state.rows.push(newRow(src));
}
// Show the keypad by default on touch screens, where symbols are awkward to type.
if (state.keypad === null) state.keypad = matchMedia('(pointer: coarse)').matches;

let saveTimer;
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* not remembered */ }
}
// Saves are batched while panning or typing, and flushed if the page is closed.
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
addEventListener('pagehide', () => saveTimer && saveNow());
document.addEventListener('visibilitychange', () => document.hidden && saveTimer && saveNow());

const compiled = new Map(); // row id -> compile() result
function recompile(row) {
  compiled.set(row.id, compile(row.src, { degrees: state.degrees }));
}
state.rows.forEach(recompile);

// ---- Expression list -----------------------------------------------------------

let activeId = null; // the row the keypad types into

function renderList() {
  const list = $('expr-list');
  list.replaceChildren(...state.rows.map((row) => {
    const li = document.createElement('li');
    li.className = 'expr';
    li.dataset.id = row.id;
    li.innerHTML = `
      <button type="button" class="swatch" aria-label="Show or hide this graph"></button>
      <div class="expr-body">
        <input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="Expression">
        <div class="expr-out" aria-live="polite"></div>
      </div>
      <button type="button" class="icon-btn" aria-label="Delete expression">✕</button>`;
    const input = li.querySelector('input');
    input.value = row.src;
    input.inputMode = state.keypad ? 'none' : 'text';
    input.addEventListener('input', () => {
      row.src = input.value;
      recompile(row);
      updateRow(li, row);
      save();
      requestDraw();
    });
    input.addEventListener('focus', () => { activeId = row.id; markActive(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); nextRow(row.id); }
    });
    li.querySelector('.swatch').addEventListener('click', () => {
      row.hidden = !row.hidden;
      updateRow(li, row);
      save();
      requestDraw();
    });
    li.querySelector('.icon-btn').addEventListener('click', () => removeRow(row.id));
    updateRow(li, row);
    return li;
  }));
  markActive();
}

function updateRow(li, row) {
  const c = compiled.get(row.id);
  const swatch = li.querySelector('.swatch');
  swatch.style.setProperty('--c', row.color);
  swatch.classList.toggle('off', row.hidden || !c?.usesX);
  swatch.hidden = !c?.usesX;
  const out = li.querySelector('.expr-out');
  out.className = 'expr-out';
  if (c?.error) {
    out.textContent = `⚠ ${c.error}`;
    out.classList.add('err');
  } else if (c?.fn && !c.usesX) {
    out.textContent = `= ${formatNumber(c.fn(0))}`;
    out.classList.add('val');
  } else {
    out.textContent = '';
  }
}

function markActive() {
  document.querySelectorAll('.expr').forEach((li) => li.classList.toggle('active', li.dataset.id === activeId));
}

function inputFor(id) {
  return document.querySelector(`.expr[data-id="${id}"] input`);
}

function addRow(src = '') {
  const row = newRow(src);
  state.rows.push(row);
  recompile(row);
  renderList();
  save();
  focusRow(row.id);
  return row;
}

function nextRow(id) {
  const i = state.rows.findIndex((r) => r.id === id);
  const next = state.rows[i + 1];
  if (next) focusRow(next.id);
  else addRow();
}

function focusRow(id) {
  activeId = id;
  const input = inputFor(id);
  input?.focus({ preventScroll: true });
  input?.scrollIntoView({ block: 'nearest' });
  markActive();
}

function removeRow(id) {
  state.rows = state.rows.filter((r) => r.id !== id);
  compiled.delete(id);
  if (!state.rows.length) state.rows.push(newRow());
  state.rows.forEach((r) => compiled.has(r.id) || recompile(r));
  if (activeId === id) activeId = null;
  renderList();
  save();
  requestDraw();
}

// ---- Keypad --------------------------------------------------------------------

const KEYS = [
  ['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('], ['ln', 'ln('], ['log', 'log('], ['√', '√('],
  ['x', 'x'], ['x²', '²'], ['xʸ', '^'], ['π', 'π'], ['(', '('], [')', ')'],
  ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '÷'], ['e', 'e'], ['⌫', 'back'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['×', '×'], ['←', 'left'], ['→', 'right'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['−', '−'], ['abs', 'abs('], ['↵', 'enter'],
  ['0', '0'], ['.', '.'], [',', ','], ['+', '+'], ['AC', 'clear'], ['⌨', 'keyboard'],
];

function renderKeypad() {
  const pad = $('keypad');
  pad.replaceChildren(...KEYS.map(([label, action]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (/^\d$|^\.$/.test(label)) b.className = 'digit';
    if (['back', 'left', 'right', 'enter', 'clear', 'keyboard'].includes(action)) b.className = 'fn';
    if (action === 'enter') b.className = 'fn primary-key';
    b.setAttribute('aria-label', { back: 'Backspace', left: 'Move left', right: 'Move right', enter: 'Next expression', clear: 'Clear expression', keyboard: 'Use phone keyboard' }[action] ?? label);
    // Keep focus (and the caret) in the expression while tapping keys.
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('click', () => pressKey(action));
    return b;
  }));
}

function pressKey(action) {
  if (action === 'keyboard') { setKeypad(false); return; }
  if (!activeId || !state.rows.some((r) => r.id === activeId)) activeId = state.rows[state.rows.length - 1].id;
  const input = inputFor(activeId);
  if (action === 'enter') { nextRow(activeId); return; }
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  let value = input.value;
  let caret = start;
  if (action === 'back') {
    if (start !== end) { value = value.slice(0, start) + value.slice(end); }
    else if (start > 0) { value = value.slice(0, start - 1) + value.slice(start); caret = start - 1; }
  } else if (action === 'left') caret = Math.max(0, start - 1);
  else if (action === 'right') caret = Math.min(value.length, end + 1);
  else if (action === 'clear') { value = ''; caret = 0; }
  else {
    value = value.slice(0, start) + action + value.slice(end);
    caret = start + action.length;
  }
  if (value !== input.value) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }
  input.focus({ preventScroll: true });
  input.setSelectionRange(caret, caret);
}

function setKeypad(on) {
  state.keypad = on;
  save();
  $('keypad').hidden = !on;
  document.body.classList.toggle('with-keypad', on);
  $('keypad-toggle').textContent = on ? '⌨ Phone keyboard' : '🔢 Maths keypad';
  document.querySelectorAll('.expr input').forEach((i) => { i.inputMode = on ? 'none' : 'text'; });
  if (!on && activeId) inputFor(activeId)?.focus();
  requestAnimationFrame(resize);
}

// ---- Plotting ------------------------------------------------------------------

const canvas = $('plot');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, dpr = 1;
let trace = null; // { rowId, x, y }
let drawQueued = false;

const toPx = (x) => W / 2 + (x - state.view.cx) * state.view.scale;
const toPy = (y) => H / 2 - (y - state.view.cy) * state.view.scale;
const toX = (px) => state.view.cx + (px - W / 2) / state.view.scale;
const toY = (py) => state.view.cy - (py - H / 2) / state.view.scale;

function resize() {
  const rect = $('plot-wrap').getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  W = rect.width;
  H = rect.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  draw();
}

function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}

// Grid spacing of 1, 2 or 5 × 10^n units, about `px` pixels apart.
function niceStep(px) {
  const raw = px / state.view.scale;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}

const tickLabel = (v) => String(Number(v.toPrecision(12))).replace('-', '−');

function plottable() {
  return state.rows
    .map((row) => ({ row, c: compiled.get(row.id) }))
    .filter(({ row, c }) => !row.hidden && c?.fn && c.usesX);
}

function draw() {
  if (!W || !H) return;
  const css = getComputedStyle(document.body);
  const colors = {
    bg: css.getPropertyValue('--plot-bg').trim(),
    minor: css.getPropertyValue('--plot-minor').trim(),
    major: css.getPropertyValue('--plot-major').trim(),
    axis: css.getPropertyValue('--plot-axis').trim(),
    text: css.getPropertyValue('--muted').trim(),
  };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);

  // Grid: minor lines at a fifth of the labelled spacing.
  const step = niceStep(90);
  const x0 = toX(0), x1 = toX(W), y0 = toY(H), y1 = toY(0);
  for (const [s, color] of [[step / 5, colors.minor], [step, colors.major]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(x0 / s) * s; x <= x1; x += s) { const px = Math.round(toPx(x)) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, H); }
    for (let y = Math.ceil(y0 / s) * s; y <= y1; y += s) { const py = Math.round(toPy(y)) + 0.5; ctx.moveTo(0, py); ctx.lineTo(W, py); }
    ctx.stroke();
  }

  // Axes, and labels that stick to the edge when an axis is off screen.
  const ax = Math.min(Math.max(toPx(0), 0), W);
  const ay = Math.min(Math.max(toPy(0), 0), H);
  ctx.strokeStyle = colors.axis;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, toPy(0)); ctx.lineTo(W, toPy(0));
  ctx.moveTo(toPx(0), 0); ctx.lineTo(toPx(0), H);
  ctx.stroke();

  ctx.fillStyle = colors.text;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelY = Math.min(ay + 4, H - 16);
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    if (Math.abs(x) < step / 2) continue;
    ctx.fillText(tickLabel(x), toPx(x), labelY);
  }
  ctx.textAlign = ax > W - 40 ? 'right' : 'left';
  ctx.textBaseline = 'middle';
  const labelX = ax > W - 40 ? W - 4 : ax + 5;
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    if (Math.abs(y) < step / 2) continue;
    ctx.fillText(tickLabel(y), labelX, toPy(y));
  }
  if (toPx(0) >= 0 && toPx(0) <= W && toPy(0) >= 0 && toPy(0) <= H) {
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('0', toPx(0) + 5, toPy(0) + 4);
  }

  // Curves.
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  for (const { row, c } of plottable()) {
    ctx.strokeStyle = row.color;
    ctx.beginPath();
    let penDown = false, prevY = NaN, prevX = NaN;
    for (let px = 0; px <= W; px += 1) {
      const x = toX(px);
      const y = c.fn(x);
      if (!Number.isFinite(y)) { penDown = false; prevY = NaN; continue; }
      const py = Math.max(-1e5, Math.min(1e5, toPy(y)));
      if (penDown && Math.abs(py - toPy(prevY)) > H) {
        // A big jump: draw through it only if the function is continuous there.
        const mid = c.fn((x + prevX) / 2);
        if (!(Number.isFinite(mid) && mid >= Math.min(prevY, y) && mid <= Math.max(prevY, y))) penDown = false;
      }
      if (penDown) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      penDown = true;
      prevY = y; prevX = x;
    }
    ctx.stroke();

    // x-intercepts.
    const roots = findRoots(c.fn, x0, x1, Math.min(800, Math.ceil(W)));
    if (roots.length <= 40) {
      ctx.fillStyle = colors.bg;
      ctx.lineWidth = 2;
      for (const r of roots) {
        ctx.beginPath();
        ctx.arc(toPx(r), toPy(0), 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.lineWidth = 2.5;
    }
  }

  drawTrace();
}

function drawTrace() {
  const box = $('trace');
  const row = trace && state.rows.find((r) => r.id === trace.rowId);
  const c = row && compiled.get(row.id);
  if (!row || row.hidden || !c?.fn || !c.usesX) { box.hidden = true; trace = null; return; }
  const y = trace.isRoot ? 0 : c.fn(trace.x);
  if (!Number.isFinite(y)) { box.hidden = true; return; }
  const px = toPx(trace.x), py = toPy(y);
  ctx.fillStyle = row.color;
  ctx.beginPath();
  ctx.arc(px, py, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  box.hidden = false;
  box.style.setProperty('--c', row.color);
  box.textContent = `${trace.isRoot ? 'x-intercept ' : ''}(${formatNumber(trace.x)}, ${formatNumber(y)})`;
}

// Tapping picks the curve closest to the tap at that x, snapping to an
// x-intercept when one is within a few pixels.
function traceAt(px, py) {
  let best = null;
  const x = toX(px);
  for (const { row, c } of plottable()) {
    const y = c.fn(x);
    if (!Number.isFinite(y)) continue;
    const d = Math.abs(toPy(y) - py);
    if (d < 36 && (!best || d < best.d)) best = { d, row, c };
  }
  if (!best) { trace = null; requestDraw(); return; }
  const near = findRoots(best.c.fn, toX(px - 10), toX(px + 10), 20)[0];
  trace = near != null && Math.abs(toPy(0) - py) < 36
    ? { rowId: best.row.id, x: near, isRoot: true }
    : { rowId: best.row.id, x, isRoot: false };
  requestDraw();
}

// ---- Pan, zoom and tap -------------------------------------------------------------

const pointers = new Map();
let gesture = null;

function zoomAt(px, py, factor) {
  const { view } = state;
  const x = toX(px), y = toY(py);
  view.scale = Math.min(1e6, Math.max(1e-4, view.scale * factor));
  view.cx = x - (px - W / 2) / view.scale;
  view.cy = y + (py - H / 2) / view.scale;
  save();
  requestDraw();
}

function localPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, localPoint(e));
  const pts = [...pointers.values()];
  if (pts.length === 1) {
    gesture = { type: 'pan', start: pts[0], last: pts[0], moved: false };
  } else if (pts.length === 2) {
    gesture = { type: 'pinch', dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } };
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, localPoint(e));
  const pts = [...pointers.values()];
  if (gesture?.type === 'pan' && pts.length === 1) {
    const p = pts[0];
    if (Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 6) gesture.moved = true;
    if (gesture.moved) {
      state.view.cx -= (p.x - gesture.last.x) / state.view.scale;
      state.view.cy += (p.y - gesture.last.y) / state.view.scale;
      save();
      requestDraw();
    }
    gesture.last = p;
  } else if (gesture?.type === 'pinch' && pts.length === 2) {
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    state.view.cx -= (mid.x - gesture.mid.x) / state.view.scale;
    state.view.cy += (mid.y - gesture.mid.y) / state.view.scale;
    if (gesture.dist > 0) zoomAt(mid.x, mid.y, dist / gesture.dist);
    gesture.dist = dist;
    gesture.mid = mid;
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  const wasTap = gesture?.type === 'pan' && !gesture.moved && pointers.size === 1;
  pointers.delete(e.pointerId);
  if (wasTap && e.type === 'pointerup') traceAt(gesture.start.x, gesture.start.y);
  // Lifting one finger of a pinch continues as a pan with the other.
  const rest = [...pointers.values()];
  gesture = rest.length === 1 ? { type: 'pan', start: rest[0], last: rest[0], moved: true } : null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const p = localPoint(e);
  zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });

$('zoom-in').addEventListener('click', () => zoomAt(W / 2, H / 2, 1.5));
$('zoom-out').addEventListener('click', () => zoomAt(W / 2, H / 2, 1 / 1.5));
$('zoom-reset').addEventListener('click', () => {
  state.view = { ...DEFAULT_VIEW };
  save();
  requestDraw();
});

// ---- Angle mode and setup -----------------------------------------------------------

function renderAngle() {
  $('angle-mode').textContent = state.degrees ? 'DEG' : 'RAD';
  $('angle-mode').setAttribute('aria-label', state.degrees ? 'Angles in degrees. Switch to radians' : 'Angles in radians. Switch to degrees');
}
$('angle-mode').addEventListener('click', () => {
  state.degrees = !state.degrees;
  state.rows.forEach(recompile);
  renderAngle();
  renderList();
  save();
  requestDraw();
});

$('add-expr').addEventListener('click', () => addRow());
$('keypad-toggle').addEventListener('click', () => setKeypad(!state.keypad));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', requestDraw);
new ResizeObserver(resize).observe($('plot-wrap'));

renderAngle();
renderList();
renderKeypad();
setKeypad(state.keypad);
