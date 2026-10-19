// Geometry for the 3×3 grid laid over a floor plan. Units are the plan's viewBox: 1000 across, and the
// image's height scaled to match. A grid is { cx, cy, w, h, angle } with angle in degrees clockwise.

const RAD = Math.PI / 180;
const rot = ([x, y], deg) => {
  const c = Math.cos(deg * RAD); const s = Math.sin(deg * RAD);
  return [x * c - y * s, x * s + y * c];
};

// The grid's corners in plan units, clockwise from the top left.
export function gridCorners(g) {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const [x, y] = rot([sx * g.w / 2, sy * g.h / 2], g.angle);
    return [g.cx + x, g.cy + y];
  });
}

// Whether a point is inside the grid.
export function insideGrid(g, [px, py]) {
  const [x, y] = rot([px - g.cx, py - g.cy], -g.angle);
  return Math.abs(x) <= g.w / 2 && Math.abs(y) <= g.h / 2;
}

// Drag a handle ('move', an edge 't' 'r' 'b' 'l', or a corner 'tl' 'tr' 'br' 'bl') from `from` to `to`.
// Edges and corners move only their own sides; the opposite side stays where it was.
export function dragGrid(g, handle, from, to, min = 40) {
  const d = [to[0] - from[0], to[1] - from[1]];
  if (handle === 'move') return { ...g, cx: g.cx + d[0], cy: g.cy + d[1] };
  const [dx, dy] = rot(d, -g.angle); // the drag in the grid's own frame
  let l = -g.w / 2; let r = g.w / 2; let t = -g.h / 2; let b = g.h / 2;
  if (handle.includes('l')) l = Math.min(l + dx, r - min);
  if (handle.includes('r')) r = Math.max(r + dx, l + min);
  if (handle.includes('t')) t = Math.min(t + dy, b - min);
  if (handle.includes('b')) b = Math.max(b + dy, t + min);
  const [ox, oy] = rot([(l + r) / 2, (t + b) / 2], g.angle);
  return { ...g, cx: g.cx + ox, cy: g.cy + oy, w: r - l, h: b - t };
}

// The same grid after the plan image is turned a quarter turn clockwise. `height` is the plan's height
// in units before turning (its width is 1000).
export function rotateGrid90(g, height) {
  const k = 1000 / height;
  return { cx: 1000 - g.cy * k, cy: g.cx * k, w: g.h * k, h: g.w * k, angle: g.angle };
}

// A first guess at the grid: the walls are the largest connected patch of dark pixels (labels and titles
// are small separate patches). The angle is the one that lines the most wall pixels up into rows and
// columns, and the grid is that patch's box at that angle. `gray` is a width × height array of 0–255
// brightness. Returns { cx, cy, w, h, angle } in pixels of `gray`, or null.
export function fitOutline(gray, width, height) {
  const label = new Int32Array(width * height).fill(-1);
  let best = [];
  for (let start = 0; start < gray.length; start++) {
    if (gray[start] >= 110 || label[start] >= 0) continue;
    const patch = [start];
    label[start] = start;
    for (let k = 0; k < patch.length; k++) {
      const i = patch[k]; const x = i % width; const y = (i - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx; const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (gray[j] < 110 && label[j] < 0) { label[j] = start; patch.push(j); }
        }
      }
    }
    if (patch.length > best.length) best = patch;
  }
  if (best.length < 20) return null;
  const pts = best.map((i) => [i % width, Math.floor(i / width)]);
  const cx0 = width / 2; const cy0 = height / 2;
  const sharpness = (deg) => {
    const rows = new Map(); const cols = new Map();
    for (const [x, y] of pts) {
      const [u, v] = rot([x - cx0, y - cy0], -deg);
      const r = Math.round(v); const c = Math.round(u);
      rows.set(r, (rows.get(r) || 0) + 1);
      cols.set(c, (cols.get(c) || 0) + 1);
    }
    let sum = 0;
    for (const n of rows.values()) sum += n * n;
    for (const n of cols.values()) sum += n * n;
    return sum;
  };
  let angle = 0; let top = sharpness(0);
  for (let deg = -30; deg <= 30; deg += 0.5) {
    const sc = sharpness(deg);
    if (sc > top * 1.0001) { top = sc; angle = deg; }
  }
  let l = Infinity; let r = -Infinity; let t = Infinity; let b = -Infinity;
  for (const [x, y] of pts) {
    const [u, v] = rot([x - cx0, y - cy0], -angle);
    l = Math.min(l, u); r = Math.max(r, u + 1); t = Math.min(t, v); b = Math.max(b, v + 1);
  }
  if (r - l < width * 0.2 || b - t < height * 0.2) return null;
  const [ox, oy] = rot([(l + r) / 2, (t + b) / 2], angle);
  return { cx: cx0 + ox, cy: cy0 + oy, w: r - l, h: b - t, angle };
}

// The grid side ('top', 'right', 'bottom' or 'left' in the grid's own frame) nearest a point, such as
// where the main door was tapped.
export function nearestSide(g, [px, py]) {
  const [x, y] = rot([px - g.cx, py - g.cy], -g.angle);
  const d = { top: Math.abs(y + g.h / 2), bottom: Math.abs(y - g.h / 2), left: Math.abs(x + g.w / 2), right: Math.abs(x - g.w / 2) };
  return Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a));
}

// The on-screen angle (degrees clockwise from pointing right) of a compass bearing on the plan. The
// door side points out along the facing bearing, and a plan seen from above turns the same way as
// the compass.
const SIDE_ANGLE = { right: 0, bottom: 90, left: 180, top: 270 };
export const screenAngleOf = (g, side, facingDeg, bearing) => SIDE_ANGLE[side] + g.angle + bearing - facingDeg;
