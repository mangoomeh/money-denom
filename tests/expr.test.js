import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, formatNumber, findRoots, tokenize } from '../src/expr.js';

const val = (src, x = 0, opts) => compile(src, opts).fn(x);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('arithmetic and precedence', () => {
  assert.equal(val('1+2*3'), 7);
  assert.equal(val('(1+2)*3'), 9);
  assert.equal(val('2^3^2'), 512); // right-associative
  assert.equal(val('-2^2'), -4);
  assert.equal(val('2^-1'), 0.5);
  assert.equal(val('10/4'), 2.5);
  assert.equal(val('3 − 1 × 2 ÷ 4'), 2.5);
});

test('implicit multiplication', () => {
  assert.equal(val('2x', 3), 6);
  assert.equal(val('(x+1)(x-1)', 3), 8);
  assert.equal(val('2(3)'), 6);
  close(val('2pi'), 2 * Math.PI);
  close(val('3sin(x)', Math.PI / 2), 3);
  assert.equal(val('x2', 3), 6); // reads as x*2
  close(val('xsin x', Math.PI / 2), Math.PI / 2);
  close(val('sin x cos x', 1), Math.sin(1) * Math.cos(1));
});

test('functions, constants and symbols', () => {
  close(val('sin x', Math.PI / 2), 1);
  close(val('sin 2x', Math.PI / 4), 1);
  assert.equal(val('√9'), 3);
  assert.equal(val('sqrt(16)+abs(-2)'), 6);
  close(val('ln e'), 1);
  assert.equal(val('log 1000'), 3);
  close(val('π'), Math.PI);
  assert.equal(val('x²', 4), 16);
  assert.equal(val('max(1, 5, 3)'), 5);
  close(val('exp(1)'), Math.E);
});

test('real cube roots of negatives', () => {
  close(val('x^(1/3)', -8), -2);
  assert.ok(Number.isNaN(val('x^(1/2)', -4)));
});

test('degree mode', () => {
  close(val('sin(90)', 0, { degrees: true }), 1);
  close(val('asin(1)', 0, { degrees: true }), 90);
  close(val('sin(pi/2)'), 1);
});

test('"y =" prefix and x detection', () => {
  assert.equal(compile('y = x^2').usesX, true);
  assert.equal(compile('f(x) = 2x').fn(5), 10);
  assert.equal(compile('3+4').usesX, false);
  assert.equal(compile('  ').empty, true);
});

test('errors are reported, never thrown', () => {
  assert.match(compile('2+').error, /incomplete/);
  assert.match(compile('(1+2').error, /Missing/);
  assert.match(compile('foo(2)').error, /Unknown name/);
  assert.match(compile('2 3').error, /Two numbers/);
  assert.match(compile('2$').error, /Unexpected/);
  assert.match(compile('sin(1, 2)').error, /one value/);
  assert.ok(compile('alert(1)').error);
});

test('tokenizer splits names longest-first', () => {
  assert.deepEqual(tokenize('exp').map((t) => t.value), ['exp']);
  assert.deepEqual(tokenize('ex').filter((t) => t.value).map((t) => t.value), ['e', 'x']);
});

test('formatNumber', () => {
  assert.equal(formatNumber(0.1 + 0.2), '0.3');
  assert.equal(formatNumber(1 / 3), '0.3333333333');
  assert.equal(formatNumber(1e12), '1×10^12');
  assert.equal(formatNumber(NaN), 'undefined');
  assert.equal(formatNumber(1 / 0), '∞');
});

test('findRoots finds zeros and skips asymptotes', () => {
  const roots = findRoots(compile('x^2-4').fn, -5, 5);
  assert.equal(roots.length, 2);
  close(roots[0], -2); close(roots[1], 2);
  const tanRoots = findRoots(compile('tan x').fn, -4, 4);
  assert.equal(tanRoots.length, 3); // -π, 0, π — but not ±π/2
  assert.deepEqual(findRoots(compile('1/x').fn, -1, 1.5), []);
});
