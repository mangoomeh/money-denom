import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridCorners, insideGrid, dragGrid, rotateGrid90, fitOutline, nearestSide, screenAngleOf } from '../src/plangrid.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);
const g0 = { cx: 500, cy: 400, w: 600, h: 400, angle: 0 };

test('dragging an edge or corner keeps the opposite side in place', () => {
  const g = dragGrid(g0, 'r', [800, 400], [850, 420]);
  near(g.w, 650); near(g.h, 400); near(g.cx - g.w / 2, 200); near(g.cy, 400);
  const c = dragGrid(g0, 'tl', [200, 200], [250, 150]);
  near(c.cx + c.w / 2, 800); near(c.cy + c.h / 2, 600); near(c.w, 550); near(c.h, 450);
});

test('dragging works in the grid\'s own frame when it is turned', () => {
  const g = { ...g0, angle: 90 };
  // Turned a quarter, the grid's right edge faces down the page: dragging down widens it.
  const d = dragGrid(g, 'r', [500, 700], [500, 750]);
  near(d.w, 650);
  // The left edge, now at the top, stays put.
  const before = gridCorners(g)[0]; const after = gridCorners(d)[0];
  near(before[0], after[0]); near(before[1], after[1]);
});

test('sizes never go below the minimum and moving shifts the centre', () => {
  const g = dragGrid(g0, 'l', [200, 400], [900, 400]);
  near(g.w, 40);
  const m = dragGrid(g0, 'move', [0, 0], [10, -5]);
  near(m.cx, 510); near(m.cy, 395);
});

test('inside test follows the angle', () => {
  assert.ok(insideGrid(g0, [790, 590]));
  assert.ok(!insideGrid(g0, [810, 400]));
  assert.ok(insideGrid({ ...g0, angle: 90 }, [500, 690]));
});

test('turning the plan a quarter keeps the grid on the same spot', () => {
  // A plan 1000 × 500: the point (900, 100) lands at (1000 − 100·2, 900·2) = (800, 1800) in a 1000 × 2000 plan.
  const g = rotateGrid90({ cx: 900, cy: 100, w: 100, h: 50, angle: 10 }, 500);
  near(g.cx, 800); near(g.cy, 1800); near(g.w, 100); near(g.h, 200); near(g.angle, 10);
});

test('outline fit finds the walls, skips labels, and finds the tilt', () => {
  const W = 100; const H = 80;
  const gray = new Array(W * H).fill(255);
  const set = (x, y) => { gray[y * W + x] = 0; };
  for (let x = 20; x <= 80; x++) { set(x, 10); set(x, 70); }
  for (let y = 10; y <= 70; y++) { set(20, y); set(80, y); }
  for (let x = 2; x < 6; x++) set(x, 2); // a stray label
  const o = fitOutline(gray, W, H);
  near(o.angle, 0); near(o.cx, 50.5); near(o.cy, 40.5); near(o.w, 61); near(o.h, 61);
  assert.equal(fitOutline(new Array(W * H).fill(255), W, H), null);

  // The same square turned 10° clockwise.
  const tilted = new Array(200 * 200).fill(255);
  const c = Math.cos(10 * Math.PI / 180); const s = Math.sin(10 * Math.PI / 180);
  const put = (u, v) => { const x = Math.round(100 + u * c - v * s); const y = Math.round(100 + u * s + v * c); tilted[y * 200 + x] = 0; };
  for (let k = -60; k <= 60; k += 0.25) { put(k, -60); put(k, 60); put(-60, k); put(60, k); }
  const f = fitOutline(tilted, 200, 200);
  assert.ok(Math.abs(f.angle - 10) <= 0.5, `angle ${f.angle}`);
  assert.ok(Math.abs(f.w - 121) < 4 && Math.abs(f.h - 121) < 4, `size ${f.w} × ${f.h}`);
});

test('nearest side follows the grid\'s turn', () => {
  assert.equal(nearestSide(g0, [500, 590]), 'bottom');
  assert.equal(nearestSide(g0, [210, 400]), 'left');
  assert.equal(nearestSide({ ...g0, angle: 90 }, [500, 690]), 'right');
});

test('compass on the plan: door at the bottom facing south puts north at the top', () => {
  const mod = (a) => ((a % 360) + 360) % 360;
  assert.equal(mod(screenAngleOf(g0, 'bottom', 180, 0)), 270); // north points up the screen
  assert.equal(mod(screenAngleOf(g0, 'bottom', 180, 90)), 0); // east to the right
  // Door on the right facing north: north points right, east points down.
  assert.equal(mod(screenAngleOf(g0, 'right', 0, 0)), 0);
  assert.equal(mod(screenAngleOf(g0, 'right', 0, 90)), 90);
  // A turned grid turns the compass with it.
  assert.equal(mod(screenAngleOf({ ...g0, angle: 10 }, 'bottom', 180, 0)), 280);
});
