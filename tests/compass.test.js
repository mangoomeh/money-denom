import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headingFromOrientation } from '../src/compass.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(((a - b + 540) % 360) - 180) < tol, `${a} ≠ ${b}`);

test('lying flat: the heading is 360 − alpha, from the top edge', () => {
  for (const alpha of [0, 30, 90, 180, 270, 350]) {
    const h = headingFromOrientation(alpha, 0, 0);
    near(h.heading, (360 - alpha) % 360);
    assert.equal(h.edge, 'top');
  }
});

test('a little tilt does not change the heading', () => {
  near(headingFromOrientation(90, 30, 0).heading, 270);
  near(headingFromOrientation(90, 0, 25).heading, 270, 1e-6);
});

test('held upright facing you, the back camera direction is used', () => {
  // Upright (beta 90) with alpha 0: the back of the phone looks north.
  const h = headingFromOrientation(0, 90, 0);
  assert.equal(h.edge, 'back');
  near(h.heading, 0);
  // Turned to face east (alpha 270), still upright.
  near(headingFromOrientation(270, 90, 0).heading, 90);
  // Tilted back to 70° it still reads the same way.
  near(headingFromOrientation(270, 70, 0).heading, 90);
});
