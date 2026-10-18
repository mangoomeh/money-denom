import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  run, parse, compileFunction, formatNumber, toFraction, derivative, integrate, findZero, findExtremum, CalcError,
} from '../src/ti84.js';

// Splits a readable string into calculator tokens for testing, e.g. 'sin(30)+2²'.
const TOKS = ['sin⁻¹(', 'cos⁻¹(', 'tan⁻¹(', 'sin(', 'cos(', 'tan(', 'ln(', 'log(', 'e^(', '10^(', '³√(', '√(',
  'abs(', 'round(', 'iPart(', 'fPart(', 'int(', 'min(', 'max(', 'lcm(', 'gcd(', 'randInt(', 'nDeriv(', 'fnInt(',
  '⁻¹', ' nPr ', ' nCr ', 'Ans', 'rand', '▶Frac', '▶Dec', 'ˣ√', 'Y1', 'Y2'];
function tk(s) {
  const out = [];
  while (s) {
    const t = TOKS.find((x) => s.startsWith(x)) ?? s[0];
    out.push(t);
    s = s.slice(t.length);
  }
  return out;
}
const calc = (s, ctx = {}) => run(tk(s), { vars: {}, ...ctx }).value;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const err = (s, kind, ctx) => assert.throws(() => calc(s, ctx), (e) => e instanceof CalcError && e.kind === kind);

test('TI order of operations', () => {
  assert.equal(calc('1+2×3'), 7);
  assert.equal(calc('2^3^2'), 64); // left to right on the TI-84
  assert.equal(calc('⁻2²'), -4);
  assert.equal(calc('2^⁻1'), 0.5);
  assert.equal(calc('6÷2(1+2)'), 9); // implicit × same priority as ÷
  assert.equal(calc('2⁻3'), -6);
  assert.equal(calc('5 nCr 2'), 10);
  assert.equal(calc('5 nPr 2'), 20);
  assert.equal(calc('2×3 nCr 2'), 6); // nCr binds tighter than ×
  assert.equal(calc('4!'), 24);
  assert.equal(calc('3ˣ√8'), 2);
  assert.equal(calc('2⁻¹'), 0.5);
});

test('numbers, ᴇ notation and constants', () => {
  assert.equal(calc('1.5E3'), 1500);
  assert.equal(calc('2E⁻2'), 0.02);
  assert.equal(calc('E2'), 100);
  close(calc('2π'), 2 * Math.PI);
  close(calc('e^(1)'), Math.E);
  assert.equal(calc('10^(3)'), 1000);
});

test('functions and auto-closed brackets', () => {
  assert.equal(calc('√(16'), 4);
  close(calc('sin(π÷2'), 1);
  close(calc('sin(90', { degrees: true }), 1);
  close(calc('sin⁻¹(1', { degrees: true }), 90);
  assert.equal(calc('abs(⁻3)+int(⁻2.5)'), 0);
  assert.equal(calc('round(2.345,2)'), 2.35);
  assert.equal(calc('gcd(12,18)+lcm(4,6)'), 18);
  assert.equal(calc('³√(⁻27'), -3);
  assert.equal(calc('iPart(⁻2.7)+fPart(2.5)'), -1.5);
  assert.equal(calc('max(2,7)'), 7);
});

test('variables, Ans and storing', () => {
  const r = run(tk('5→A'), { vars: {} });
  assert.equal(r.value, 5);
  assert.equal(r.store, 'A');
  assert.equal(calc('2A', { vars: { A: 5 } }), 10);
  assert.equal(calc('Ans+1', { ans: 41 }), 42);
  assert.equal(calc('AB', { vars: { A: 2, B: 3 } }), 6);
});

test('Y-vars and calculus', () => {
  const y1 = compileFunction(tk('X²'), () => ({ vars: {} })).fn;
  assert.equal(calc('Y1(3)', { y: (n) => (n === 'Y1' ? y1 : null) }), 9);
  close(calc('nDeriv(X²,X,3)'), 6);
  close(calc('fnInt(X²,X,0,3)'), 9);
  err('Y2(1)', 'UNDEFINED', { y: () => null });
});

test('TI error types', () => {
  err('1÷0', 'DIVIDE BY 0');
  err('√(⁻1)', 'DOMAIN');
  err('ln(0)', 'DOMAIN');
  err('1+', 'SYNTAX');
  err('2..3', 'SYNTAX');
  err('(1+2))', 'SYNTAX');
  err('10^(200)', 'OVERFLOW');
  err('0^0', 'DOMAIN');
  err('2.5!', 'DOMAIN');
  err('5→', 'SYNTAX');
});

test('graph functions return NaN instead of throwing', () => {
  const f = compileFunction(tk('1÷X'), () => ({ vars: {} })).fn;
  assert.ok(Number.isNaN(f(0)));
  assert.equal(f(2), 0.5);
  assert.equal(compileFunction(tk('2+'), () => ({})).error, 'SYNTAX');
  assert.equal(compileFunction([], () => ({})).fn, null);
});

test('formatNumber matches the TI display', () => {
  assert.equal(formatNumber(0.5), '.5');
  assert.equal(formatNumber(-3), '⁻3');
  assert.equal(formatNumber(1 / 3), '.3333333333');
  assert.equal(formatNumber(0.1 + 0.2), '.3');
  assert.equal(formatNumber(123456789012), '1.23456789ᴇ11');
  assert.equal(formatNumber(0.0001234), '1.234ᴇ⁻4');
  assert.equal(formatNumber(2 / 3, { fix: 2 }), '.67');
  assert.equal(formatNumber(1500, { sci: true }), '1.5ᴇ3');
  assert.equal(formatNumber(-0), '0');
});

test('toFraction', () => {
  assert.deepEqual(toFraction(0.75), { n: 3, d: 4 });
  assert.deepEqual(toFraction(-1 / 3), { n: -1, d: 3 });
  assert.deepEqual(toFraction(355 / 113), { n: 355, d: 113 });
  assert.equal(toFraction(Math.PI), null);
  assert.equal(toFraction(4), null);
});

test('numerical tools', () => {
  close(derivative((x) => x ** 3, 2), 12.000001);
  close(integrate(Math.sin, 0, Math.PI), 2);
  close(findZero((x) => x * x - 2, 0, 3), Math.SQRT2);
  assert.equal(findZero((x) => x * x + 1, -1, 1), null);
  const m = findExtremum((x) => (x - 1) ** 2 + 3, -5, 5);
  assert.ok(Math.abs(m.x - 1) < 1e-6); close(m.y, 3);
  const mx = findExtremum((x) => -((x + 2) ** 2), -5, 5, true);
  assert.ok(Math.abs(mx.x + 2) < 1e-6);
});

test('parse reports ▶Frac conversion', () => {
  assert.equal(parse(tk('.75▶Frac')).convert, '▶Frac');
});
