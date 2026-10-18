// A small, safe maths expression parser for the graphing calculator.
// Expressions are parsed into a tree and compiled into plain JS closures
// (no eval / new Function), so typed input can never run arbitrary code.
//
// Supports: + - * / ^, unary minus, parentheses, implicit multiplication
// (2x, 3sin(x), (x+1)(x-1), 2pi), functions with or without parentheses
// (sin x), constants pi and e, the variable x, and the symbols π √ × ÷ − ².

const FUNCTIONS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  ln: Math.log, log: Math.log10, exp: Math.exp,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
  min: Math.min, max: Math.max,
};
const TRIG_IN = new Set(['sin', 'cos', 'tan']);
const TRIG_OUT = new Set(['asin', 'acos', 'atan']);
const CONSTANTS = { pi: Math.PI, e: Math.E };
const NAMES = [...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS), 'x'].sort((a, b) => b.length - a.length);

export class ExprError extends Error {}

function normalise(src) {
  return src
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3');
}

// Splits a run of letters into known names, longest first: "xsin" -> x, sin; "pix" -> pi, x.
function splitName(word) {
  const out = [];
  let rest = word.toLowerCase();
  while (rest) {
    const name = NAMES.find((n) => rest.startsWith(n));
    if (!name) throw new ExprError(`Unknown name “${word}”`);
    out.push(name);
    rest = rest.slice(name.length);
  }
  return out;
}

export function tokenize(src) {
  const s = normalise(src);
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num && /[\d.]/.test(c)) {
      tokens.push({ type: 'num', value: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    if (/[a-z]/i.test(c)) {
      const word = /^[a-z]+/i.exec(s.slice(i))[0];
      for (const name of splitName(word)) {
        tokens.push({ type: name in FUNCTIONS ? 'func' : name === 'x' ? 'var' : 'const', value: name });
      }
      i += word.length;
      continue;
    }
    if ('+-*/^(),'.includes(c)) {
      tokens.push({ type: c });
      i++;
      continue;
    }
    throw new ExprError(`Unexpected “${c}”`);
  }

  // Insert the multiplication that's implied by juxtaposition, e.g. 2x or (x+1)(x-1).
  const out = [];
  for (const t of tokens) {
    const prev = out[out.length - 1];
    if (prev && ['num', 'var', 'const', ')'].includes(prev.type) && ['num', 'var', 'const', 'func', '('].includes(t.type)) {
      if (prev.type === 'num' && t.type === 'num') throw new ExprError('Two numbers in a row');
      out.push({ type: '*', implicit: true });
    }
    out.push(t);
  }
  return out;
}

export function parse(src) {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const take = (type) => {
    const t = tokens[pos];
    if (!t || (type && t.type !== type)) {
      throw new ExprError(t ? `Unexpected “${t.value ?? t.type}”` : type === ')' ? 'Missing “)”' : 'Expression is incomplete');
    }
    pos++;
    return t;
  };

  function expr() {
    let node = term();
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = take().type;
      node = { op, a: node, b: term() };
    }
    return node;
  }
  function term() {
    let node = unary();
    while (peek() && (peek().type === '*' || peek().type === '/')) {
      const op = take().type;
      node = { op, a: node, b: unary() };
    }
    return node;
  }
  function unary() {
    if (peek()?.type === '-') { take(); return { op: 'neg', a: unary() }; }
    if (peek()?.type === '+') { take(); return unary(); }
    return power();
  }
  function power() {
    const base = primary();
    if (peek()?.type === '^') {
      take();
      return { op: '^', a: base, b: unary() }; // right-associative; allows 2^-1
    }
    return base;
  }
  function primary() {
    const t = take();
    switch (t.type) {
      case 'num': return { op: 'num', value: t.value };
      case 'const': return { op: 'num', value: CONSTANTS[t.value] };
      case 'var': return { op: 'x' };
      case '(': {
        const inner = expr();
        take(')');
        return inner;
      }
      case 'func': {
        if (peek()?.type === '(') {
          take('(');
          const args = [expr()];
          while (peek()?.type === ',') { take(); args.push(expr()); }
          take(')');
          return { op: 'call', name: t.value, args };
        }
        // "sin x" or "sin 2x": the argument runs over implicitly multiplied terms,
        // stopping at the next function, so "sin x cos x" is sin(x)·cos(x).
        let arg = power();
        while (peek()?.implicit && tokens[pos + 1]?.type !== 'func') {
          take();
          arg = { op: '*', a: arg, b: power() };
        }
        return { op: 'call', name: t.value, args: [arg] };
      }
      default:
        throw new ExprError(`Unexpected “${t.type}”`);
    }
  }

  if (!tokens.length) throw new ExprError('Empty');
  const tree = expr();
  if (pos < tokens.length) throw new ExprError(`Unexpected “${tokens[pos].value ?? tokens[pos].type}”`);
  return tree;
}

function usesX(node) {
  if (node.op === 'x') return true;
  return [node.a, node.b, ...(node.args || [])].some((n) => n && usesX(n));
}

function build(node, deg) {
  const toRad = deg ? Math.PI / 180 : 1;
  switch (node.op) {
    case 'num': { const v = node.value; return () => v; }
    case 'x': return (x) => x;
    case 'neg': { const a = build(node.a, deg); return (x) => -a(x); }
    case '+': { const a = build(node.a, deg), b = build(node.b, deg); return (x) => a(x) + b(x); }
    case '-': { const a = build(node.a, deg), b = build(node.b, deg); return (x) => a(x) - b(x); }
    case '*': { const a = build(node.a, deg), b = build(node.b, deg); return (x) => a(x) * b(x); }
    case '/': { const a = build(node.a, deg), b = build(node.b, deg); return (x) => a(x) / b(x); }
    case '^': {
      const a = build(node.a, deg), b = build(node.b, deg);
      return (x) => {
        const base = a(x), exp = b(x);
        // Real odd roots of negatives, e.g. x^(1/3) at x = -8 gives -2.
        if (base < 0 && !Number.isInteger(exp)) {
          const inv = 1 / exp;
          if (Number.isInteger(Math.round(inv)) && Math.abs(inv - Math.round(inv)) < 1e-9 && Math.round(inv) % 2) return -((-base) ** exp);
        }
        return base ** exp;
      };
    }
    case 'call': {
      const fn = FUNCTIONS[node.name];
      const args = node.args.map((n) => build(n, deg));
      if (node.name !== 'min' && node.name !== 'max' && args.length !== 1) {
        throw new ExprError(`${node.name} takes one value`);
      }
      if (TRIG_IN.has(node.name)) { const a = args[0]; return (x) => fn(a(x) * toRad); }
      if (TRIG_OUT.has(node.name)) { const a = args[0]; return (x) => fn(a(x)) / toRad; }
      if (args.length === 1) { const a = args[0]; return (x) => fn(a(x)); }
      return (x) => fn(...args.map((a) => a(x)));
    }
    default: throw new ExprError('Bad expression');
  }
}

// Compiles source like "y = 2sin(x)" or "3^2+1".
// Returns { fn, usesX } or { error } for incomplete/invalid input.
export function compile(src, { degrees = false } = {}) {
  const body = String(src).replace(/^\s*(y|f\(x\))\s*=/i, '');
  if (!body.trim()) return { empty: true };
  try {
    const tree = parse(body);
    return { fn: build(tree, degrees), usesX: usesX(tree) };
  } catch (err) {
    if (err instanceof ExprError) return { error: err.message };
    throw err;
  }
}

// Formats a number for display: up to 10 significant digits, no float noise.
export function formatNumber(v) {
  if (Number.isNaN(v)) return 'undefined';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e10 || abs < 1e-6) return v.toExponential(6).replace(/\.?0+e/, 'e').replace('e+', '×10^').replace('e-', '×10^-');
  return String(Number(v.toPrecision(10)));
}

// Finds x where f crosses zero between lo and hi, sampling `steps` times then bisecting.
// Sign changes across a jump (e.g. tan's asymptotes) are skipped.
export function findRoots(fn, lo, hi, steps = 400) {
  const roots = [];
  const dx = (hi - lo) / steps;
  let x0 = lo, y0 = fn(lo);
  for (let i = 1; i <= steps; i++) {
    const x1 = lo + i * dx, y1 = fn(x1);
    if (Number.isFinite(y0) && Number.isFinite(y1)) {
      if (y0 === 0) roots.push(x0);
      else if (y0 * y1 < 0) {
        let a = x0, b = x1, fa = y0;
        for (let k = 0; k < 60; k++) {
          const m = (a + b) / 2, fm = fn(m);
          if (!Number.isFinite(fm)) break;
          if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
        }
        const r = (a + b) / 2;
        // A real root has a small value; a pole flips sign with a huge value.
        if (Math.abs(fn(r)) < 1e-6 * Math.max(1, Math.abs(y0), Math.abs(y1))) roots.push(r);
      }
    }
    x0 = x1; y0 = y1;
  }
  return roots;
}
