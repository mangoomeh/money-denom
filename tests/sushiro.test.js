import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PLATES, DEFAULT_RATES, billLines, computeBill, parsePercent, monthSummary } from '../src/sushiro.js';

test('one red plate matches the published nett price', () => {
  const bill = computeBill(billLines(DEFAULT_PLATES, { red: 1 }, []), DEFAULT_RATES);
  assert.equal(bill.serviceCents, 23);
  assert.equal(bill.gstCents, 23); // 9% of 2.53 = 0.2277
  assert.equal(bill.totalCents, 276);
});

test('GST is charged on subtotal plus service charge', () => {
  const bill = computeBill([{ name: 'x', qty: 1, unitCents: 10000, cents: 10000 }], DEFAULT_RATES);
  assert.equal(bill.serviceCents, 1000);
  assert.equal(bill.gstCents, 990);
  assert.equal(bill.totalCents, 11990);
});

test('plates and specials combine; specials do not count as plates', () => {
  const lines = billLines(DEFAULT_PLATES, { red: 3, gold: 2, black: 0 }, [{ name: 'Ramen', cents: 480 }]);
  assert.deepEqual(lines.map((l) => l.cents), [690, 780, 480]);
  const bill = computeBill(lines, DEFAULT_RATES);
  assert.equal(bill.subtotalCents, 1950);
  assert.equal(bill.plateCount, 5);
});

test('charges can be switched off', () => {
  const bill = computeBill(billLines(DEFAULT_PLATES, { silver: 2 }, []), { serviceBp: 0, gstBp: 0 });
  assert.equal(bill.totalCents, 580);
});

test('parsePercent', () => {
  assert.equal(parsePercent('10'), 1000);
  assert.equal(parsePercent('9%'), 900);
  assert.equal(parsePercent('7.5'), 750);
  assert.equal(parsePercent('abc'), null);
});

test('monthSummary only counts the current month', () => {
  const v = (at, totalCents, plateCount) => ({ at, bill: { totalCents, plateCount } });
  const s = monthSummary([v('2026-10-02T12:00:00', 3000, 8), v('2026-10-15T12:00:00', 2000, 5), v('2026-09-30T12:00:00', 9999, 9)], new Date('2026-10-17T12:00:00'));
  assert.deepEqual(s, { visits: 2, totalCents: 5000, plates: 13 });
});
