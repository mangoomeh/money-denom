// Calculation engine for the 84-style calculator.
//
// Input is a list of tokens, exactly as the keys insert them ("sin(", "²", "Ans", "7"…),
// so DEL removes a whole token like on the real calculator. Parsing follows TI-84
// rules: ^ is evaluated left to right, negation (⁻) binds looser than ^ so ⁻2²=⁻4,
// implicit multiplication has the same priority as ×, and missing ")" at the end
// of an expression are closed automatically. Nothing is ever passed to eval.

export class CalcError extends Error {
  constructor(kind) { super(kind); this.kind = kind; }
}

export const FUNC_TOKENS = {
  'sin(': 'sin', 'cos(': 'cos', 'tan(': 'tan', 'sin⁻¹(': 'asin', 'cos⁻¹(': 'acos', 'tan⁻¹(': 'atan',
  'ln(': 'ln', 'log(': 'log', 'e^(': 'exp', '10^(': 'tenx', '√(': 'sqrt', '³√(': 'cbrt',
  'abs(': 'abs', 'round(': 'round', 'iPart(': 'ipart', 'fPart(': 'fpart', 'int(': 'int',
  'min(': 'min', 'max(': 'max', 'lcm(': 'lcm', 'gcd(': 'gcd', 'randInt(': 'randint',
  'nDeriv(': 'nderiv', 'fnInt(': 'fnint',
};
export const Y_TOKENS = ['Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8', 'Y9', 'Y0'];
const VAR_RE = /^([A-Z]|θ)$/;
const POSTFIX = new Set(['²', '³', '⁻¹', '!']);
const MAX = 1e100;

// Tokens that start from the previous answer when typed on an empty line, e.g. "+" gives "Ans+"
// and MATH ▶Frac gives "Ans▶Frac", like on the real calculator.
export const ANS_STARTERS = new Set(['+', '-', '×', '÷', '^', '²', '³', '⁻¹', '!', '→', ' nPr ', ' nCr ', '▶Frac', '▶Dec', 'ˣ√']);

const isDigit = (t) => /^[0-9.]$/.test(t);
const startsValue = (t) => t != null && (isDigit(t) || t === '(' || t === '⁻' || t === 'π' || t === 'e' ||
  t === 'Ans' || t === 'rand' || t in FUNC_TOKENS || VAR_RE.test(t) || Y_TOKENS.includes(t));

export function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const atEnd = () => pos >= tokens.length || tokens[pos] === '→' || tokens[pos] === '▶Frac' || tokens[pos] === '▶Dec';
  const syntax = () => { throw new CalcError('SYNTAX'); };
  const close = () => {
    if (peek() === ')') pos++;
    else if (!atEnd() && peek() !== ',') syntax(); // auto-close only at the end
  };

  function number() {
    let s = '';
    while (isDigit(peek())) s += tokens[pos++];
    if (peek() === 'E') {
      if (!s) s = '1'; // ᴇ3 means 1ᴇ3
      pos++;
      s += 'e';
      if (peek() === '⁻') { pos++; s += '-'; }
      if (!isDigit(peek())) syntax();
      while (isDigit(peek())) s += tokens[pos++];
    }
    if (s === '.' || (s.match(/\./g) || []).length > 1 || /^e/.test(s)) syntax();
    return { op: 'num', value: Number(s) };
  }

  function args() {
    const list = [expr()];
    while (peek() === ',') { pos++; list.push(expr()); }
    close();
    return list;
  }

  function primary() {
    const t = peek();
    if (t == null) syntax();
    if (isDigit(t) || t === 'E') return number();
    pos++;
    if (t === '(') { const e = expr(); close(); return e; }
    if (t === 'π') return { op: 'num', value: Math.PI };
    if (t === 'e') return { op: 'num', value: Math.E };
    if (t === 'Ans') return { op: 'ans' };
    if (t === 'rand') return { op: 'rand' };
    if (VAR_RE.test(t)) return { op: 'var', name: t };
    if (Y_TOKENS.includes(t)) {
      if (peek() === '(') { pos++; const a = expr(); close(); return { op: 'y', name: t, arg: a }; }
      return { op: 'y', name: t };
    }
    if (t in FUNC_TOKENS) return { op: 'call', name: FUNC_TOKENS[t], args: args() };
    syntax();
  }

  function postfix() {
    let node = primary();
    while (POSTFIX.has(peek())) node = { op: 'post', name: tokens[pos++], a: node };
    return node;
  }

  // Negation inside an exponent, e.g. 2^⁻1.
  function signed() {
    if (peek() === '⁻') { pos++; return { op: 'neg', a: signed() }; }
    return postfix();
  }

  function power() {
    let node = postfix();
    while (peek() === '^' || peek() === 'ˣ√') {
      const op = tokens[pos++];
      node = { op, a: node, b: signed() }; // left to right, like the TI-84
    }
    return node;
  }

  function negation() {
    if (peek() === '⁻') { pos++; return { op: 'neg', a: negation() }; }
    return power();
  }

  function combination() {
    let node = negation();
    while (peek() === ' nPr ' || peek() === ' nCr ') {
      const op = tokens[pos++].trim();
      node = { op, a: node, b: negation() };
    }
    return node;
  }

  function term() {
    let node = combination();
    for (;;) {
      if (peek() === '×' || peek() === '÷') {
        const op = tokens[pos++];
        node = { op, a: node, b: combination() };
      } else if (startsValue(peek())) {
        node = { op: '×', a: node, b: combination() }; // implicit multiplication
      } else return node;
    }
  }

  function expr() {
    let node = term();
    while (peek() === '+' || peek() === '-') {
      const op = tokens[pos++];
      node = { op, a: node, b: term() };
    }
    return node;
  }

  if (!tokens.length) syntax();
  const tree = expr();
  let store = null, convert = null;
  if (peek() === '▶Frac' || peek() === '▶Dec') convert = tokens[pos++];
  if (peek() === '→') {
    pos++;
    const v = tokens[pos++];
    if (!v || !VAR_RE.test(v)) syntax();
    store = v;
  }
  if (pos < tokens.length) syntax();
  return { tree, store, convert };
}

// ---- Evaluation ----------------------------------------------------------------------
// ctx: { x, vars, ans, degrees, strict, y(name) -> compiled fn, rand() }
// In strict mode (home screen) bad maths throws a CalcError; otherwise (graphing) it
// gives NaN, which leaves a gap in the curve.

function fail(ctx, kind) {
  if (ctx.strict) throw new CalcError(kind);
  return NaN;
}

function check(ctx, v) {
  if (Number.isNaN(v)) return fail(ctx, 'DOMAIN');
  if (Math.abs(v) >= MAX) return fail(ctx, 'OVERFLOW');
  return v;
}

const gcd2 = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };

function factorial(ctx, n) {
  if (!Number.isInteger(n) || n < 0) return fail(ctx, 'DOMAIN');
  if (n > 69) return fail(ctx, 'OVERFLOW');
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function pow(ctx, a, b) {
  if (a === 0 && b === 0) return fail(ctx, 'DOMAIN');
  if (a === 0 && b < 0) return fail(ctx, 'DIVIDE BY 0');
  if (a < 0 && !Number.isInteger(b)) {
    // Real odd roots: (⁻8)^(1/3) = ⁻2.
    const inv = 1 / b, r = Math.round(inv);
    if (Math.abs(inv - r) < 1e-10 && r % 2) return -((-a) ** b);
    return fail(ctx, 'DOMAIN');
  }
  return a ** b;
}

export function evaluate(node, ctx) {
  const ev = (n) => evaluate(n, ctx);
  const ang = ctx.degrees ? Math.PI / 180 : 1;
  switch (node.op) {
    case 'num': return node.value;
    case 'ans': return ctx.ans ?? 0;
    case 'rand': return ctx.rand ? ctx.rand() : Math.random();
    case 'var': return node.name === 'X' && ctx.x != null ? ctx.x : (ctx.vars?.[node.name] ?? 0);
    case 'y': {
      const fn = ctx.y?.(node.name);
      if (!fn) return fail(ctx, 'UNDEFINED');
      const x = node.arg ? ev(node.arg) : (ctx.x ?? ctx.vars?.X ?? 0);
      return check(ctx, fn(x));
    }
    case 'neg': return -ev(node.a);
    case '+': return check(ctx, ev(node.a) + ev(node.b));
    case '-': return check(ctx, ev(node.a) - ev(node.b));
    case '×': return check(ctx, ev(node.a) * ev(node.b));
    case '÷': {
      const a = ev(node.a), b = ev(node.b);
      if (b === 0) return fail(ctx, 'DIVIDE BY 0');
      return check(ctx, a / b);
    }
    case '^': return check(ctx, pow(ctx, ev(node.a), ev(node.b)));
    case 'ˣ√': {
      const n = ev(node.a), v = ev(node.b);
      if (n === 0) return fail(ctx, 'DOMAIN');
      return check(ctx, pow(ctx, v, 1 / n));
    }
    case 'nPr': case 'nCr': {
      const n = ev(node.a), r = ev(node.b);
      if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0) return fail(ctx, 'DOMAIN');
      if (r > n) return 0;
      let v = 1;
      for (let i = 0; i < r; i++) v *= (n - i);
      if (node.op === 'nCr') v /= factorial({ strict: false }, r);
      return check(ctx, Math.round(v));
    }
    case 'post': {
      const a = ev(node.a);
      switch (node.name) {
        case '²': return check(ctx, a * a);
        case '³': return check(ctx, a * a * a);
        case '⁻¹': return a === 0 ? fail(ctx, 'DIVIDE BY 0') : check(ctx, 1 / a);
        case '!': return factorial(ctx, a);
      }
      break;
    }
    case 'call': {
      const name = node.name;
      // Calculus functions take an expression and a variable, so they evaluate lazily.
      if (name === 'nderiv' || name === 'fnint') return calculus(node, ctx);
      const a = node.args.map(ev);
      const one = () => { if (a.length !== 1) throw new CalcError('ARGUMENT'); return a[0]; };
      const two = () => { if (a.length !== 2) throw new CalcError('ARGUMENT'); return a; };
      switch (name) {
        case 'sin': return check(ctx, Math.sin(one() * ang));
        case 'cos': return check(ctx, Math.cos(one() * ang));
        case 'tan': {
          const v = one() * ang;
          if (Math.abs(Math.cos(v)) < 1e-15) return fail(ctx, 'DOMAIN');
          return check(ctx, Math.tan(v));
        }
        case 'asin': case 'acos': {
          const v = one();
          if (v < -1 || v > 1) return fail(ctx, 'DOMAIN');
          return (name === 'asin' ? Math.asin(v) : Math.acos(v)) / ang;
        }
        case 'atan': return Math.atan(one()) / ang;
        case 'ln': { const v = one(); return v <= 0 ? fail(ctx, 'DOMAIN') : Math.log(v); }
        case 'log': { const v = one(); return v <= 0 ? fail(ctx, 'DOMAIN') : Math.log10(v); }
        case 'exp': return check(ctx, Math.exp(one()));
        case 'tenx': return check(ctx, 10 ** one());
        case 'sqrt': { const v = one(); return v < 0 ? fail(ctx, 'DOMAIN') : Math.sqrt(v); }
        case 'cbrt': return Math.cbrt(one());
        case 'abs': return Math.abs(one());
        case 'ipart': return Math.trunc(one());
        case 'fpart': { const v = one(); return v - Math.trunc(v); }
        case 'int': return Math.floor(one());
        case 'round': {
          const [v, d = 9] = a.length === 1 ? [a[0]] : two();
          if (!Number.isInteger(d) || d < 0 || d > 9) return fail(ctx, 'DOMAIN');
          return Number(v.toFixed(d));
        }
        case 'min': return Math.min(...two());
        case 'max': return Math.max(...two());
        case 'gcd': case 'lcm': {
          const [x, y] = two();
          if (!Number.isInteger(x) || !Number.isInteger(y)) return fail(ctx, 'DOMAIN');
          const g = gcd2(x, y);
          return name === 'gcd' ? g : (g ? Math.abs(x * y) / g : 0);
        }
        case 'randint': {
          const [lo, hi] = two();
          const r = ctx.rand ? ctx.rand() : Math.random();
          return Math.min(lo, hi) + Math.floor(r * (Math.abs(hi - lo) + 1));
        }
      }
    }
  }
  throw new CalcError('SYNTAX');
}

// nDeriv(expr, var, value[, h]) and fnInt(expr, var, lower, upper)
function calculus(node, ctx) {
  const [body, varNode, ...rest] = node.args;
  if (!varNode || varNode.op !== 'var') throw new CalcError('SYNTAX');
  const name = varNode.name;
  const f = (v) => evaluate(body, { ...ctx, strict: false, x: name === 'X' ? v : ctx.x, vars: { ...ctx.vars, [name]: v } });
  const nums = rest.map((n) => evaluate(n, ctx));
  if (node.name === 'nderiv') {
    if (nums.length < 1 || nums.length > 2) throw new CalcError('ARGUMENT');
    const v = derivative(f, nums[0], nums[1] ?? 1e-3);
    return Number.isFinite(v) ? v : fail(ctx, 'DOMAIN');
  }
  if (nums.length !== 2) throw new CalcError('ARGUMENT');
  const v = integrate(f, nums[0], nums[1]);
  return Number.isFinite(v) ? v : fail(ctx, 'DOMAIN');
}

// ---- Compiling for the screens ------------------------------------------------------------

// Returns a function of x for a Y= equation (empty → null). Errors give null + error kind.
export function compileFunction(tokens, env) {
  if (!tokens.length) return { fn: null };
  try {
    const { tree, store, convert } = parse(tokens);
    if (store || convert) throw new CalcError('SYNTAX');
    return { fn: (x) => { try { return evaluate(tree, { ...env(), x, strict: false }); } catch { return NaN; } } };
  } catch (err) {
    if (err instanceof CalcError) return { fn: null, error: err.kind };
    throw err;
  }
}

// Evaluates a home-screen entry. Returns { value, store, convert } or throws CalcError.
export function run(tokens, ctx) {
  const { tree, store, convert } = parse(tokens);
  const value = evaluate(tree, { ...ctx, strict: true });
  if (!Number.isFinite(value)) throw new CalcError(Number.isNaN(value) ? 'DOMAIN' : 'OVERFLOW');
  return { value, store, convert };
}

// ---- Numbers on screen -----------------------------------------------------------------

// TI style: up to 10 significant digits, no leading zero (.5), raised minus (⁻3),
// scientific notation with ᴇ for very large or small values. fix = null for Float.
export function formatNumber(v, { fix = null, sci = false, digits = 10 } = {}) {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'undefined' : 'overflow';
  if (Object.is(v, -0)) v = 0;
  const neg = v < 0;
  const abs = Math.abs(v);
  let s;
  const useSci = sci || (abs !== 0 && (abs >= 1e10 || abs < 1e-3));
  if (useSci && abs !== 0) {
    const [m, e] = abs.toExponential(fix ?? digits - 1).split('e');
    const mant = fix == null ? String(Number(m)) : m;
    s = `${mant}ᴇ${Number(e) < 0 ? '⁻' : ''}${Math.abs(Number(e))}`;
  } else if (fix != null) {
    s = abs.toFixed(fix);
  } else {
    s = String(Number(abs.toPrecision(digits)));
    if (s.includes('e')) return formatNumber(v, { fix, sci: true, digits });
  }
  if (s.startsWith('0.')) s = s.slice(1);
  return (neg && !/^[0.]+$/.test(s.replace(/ᴇ.*/, '')) ? '⁻' : '') + s;
}

// ▶Frac: the closest fraction with a denominator up to 9999, if it matches to 12 digits.
export function toFraction(v) {
  if (Number.isInteger(v)) return null;
  const sign = v < 0 ? -1 : 1;
  let x = Math.abs(v);
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(x);
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    if (k1 > 9999) return null;
    if (Math.abs(h1 / k1 - Math.abs(v)) < 1e-12 * Math.max(1, Math.abs(v))) return { n: sign * h1, d: k1 };
    const frac = x - a;
    if (frac < 1e-15) break;
    x = 1 / frac;
  }
  return null;
}

// ---- Numerical tools for CALC and the calculus functions ----------------------------------

export function derivative(f, x, h = 1e-3) {
  return (f(x + h) - f(x - h)) / (2 * h);
}

// Adaptive Simpson's rule.
export function integrate(f, a, b, eps = 1e-10) {
  if (a === b) return 0;
  const simpson = (l, r, fl, fm, fr) => ((r - l) / 6) * (fl + 4 * fm + fr);
  const rec = (l, r, fl, fm, fr, whole, depth, tol) => {
    const m = (l + r) / 2, lm = (l + m) / 2, rm = (m + r) / 2;
    const flm = f(lm), frm = f(rm);
    const left = simpson(l, m, fl, flm, fm), right = simpson(m, r, fm, frm, fr);
    if (depth <= 0 || Math.abs(left + right - whole) <= 15 * tol) return left + right + (left + right - whole) / 15;
    return rec(l, m, fl, flm, fm, left, depth - 1, tol / 2) + rec(m, r, fm, frm, fr, right, depth - 1, tol / 2);
  };
  const fa = f(a), fb = f(b), fm = f((a + b) / 2);
  return rec(a, b, fa, fm, fb, simpson(a, b, fa, fm, fb), 40, eps);
}

// A zero of f between lo and hi (sign change required), refined by bisection.
export function findZero(f, lo, hi) {
  if (lo > hi) [lo, hi] = [hi, lo];
  let flo = f(lo), fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) {
    // Scan for a finite sign change inside the bounds.
    const n = 200;
    let prevX = lo, prevY = flo, found = false;
    for (let i = 1; i <= n && !found; i++) {
      const x = lo + ((hi - lo) * i) / n, y = f(x);
      if (Number.isFinite(prevY) && Number.isFinite(y) && prevY * y <= 0) { lo = prevX; hi = x; flo = prevY; fhi = y; found = true; }
      prevX = x; prevY = y;
    }
    if (!found) return null;
  }
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2, fm = f(m);
    if (!Number.isFinite(fm)) return null;
    if (fm === 0 || hi - lo < 1e-14 * Math.max(1, Math.abs(m))) return m;
    if (flo * fm < 0) { hi = m; fhi = fm; } else { lo = m; flo = fm; }
  }
  return (lo + hi) / 2;
}

// Minimum (or maximum) of f between lo and hi by golden-section search.
export function findExtremum(f, lo, hi, max = false) {
  const g = max ? (x) => -f(x) : f;
  if (lo > hi) [lo, hi] = [hi, lo];
  // Start from the best of a coarse scan so we find the extremum, not just a local dip.
  let best = lo, bestV = Infinity;
  const n = 400;
  for (let i = 0; i <= n; i++) {
    const x = lo + ((hi - lo) * i) / n, v = g(x);
    if (Number.isFinite(v) && v < bestV) { bestV = v; best = x; }
  }
  if (!Number.isFinite(bestV)) return null;
  let a = Math.max(lo, best - (hi - lo) / n), b = Math.min(hi, best + (hi - lo) / n);
  const r = (Math.sqrt(5) - 1) / 2;
  let c = b - r * (b - a), d = a + r * (b - a);
  for (let i = 0; i < 200 && b - a > 1e-12 * Math.max(1, Math.abs(a)); i++) {
    if (g(c) < g(d)) b = d; else a = c;
    c = b - r * (b - a);
    d = a + r * (b - a);
  }
  const x = (a + b) / 2;
  return { x, y: f(x) };
}
