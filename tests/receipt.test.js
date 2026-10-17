import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountOnLine, parseReceiptText, compareWithReceipt } from '../src/receipt.js';
import { DEFAULT_PLATES, DEFAULT_RATES } from '../src/sushiro.js';

test('amountOnLine picks the last money amount and ignores percentages', () => {
  assert.equal(amountOnLine('Svc Chg 10%      2.76'), 276);
  assert.equal(amountOnLine('GST 9%  $2.73'), 273);
  assert.equal(amountOnLine('TOTAL  S$33.09'), 3309);
  assert.equal(amountOnLine('Total 33,09'), 3309);
  assert.equal(amountOnLine('Total 33 . 09'), 3309);
  assert.equal(amountOnLine('Total 3O.10'), 3010);
  assert.equal(amountOnLine('Table 12  Pax 2'), null);
  assert.equal(amountOnLine('Discount -2.30'), -230);
});

test('parses a typical receipt', () => {
  const r = parseReceiptText(`
    SUSHI RESTAURANT
    Table 12   Pax 2
    12 x Red Plate        27.60
    Sub Total             27.60
    Svc Chg 10%            2.76
    GST 9%                 2.73
    TOTAL                 33.09
    VISA                  33.09
  `);
  assert.deepEqual(r, { subtotalCents: 2760, serviceCents: 276, gstCents: 273, totalCents: 3309 });
});

test('handles OCR noise and amounts on the following line', () => {
  const r = parseReceiptText('SubTota1 27.60\nService Charge\n2.76\nG S T 2,73\nGrand Tota1 33.O9\nCash 50.00\nChange 16.91');
  assert.equal(r.subtotalCents, 2760);
  assert.equal(r.serviceCents, 276);
  assert.equal(r.gstCents, 273);
  assert.equal(r.totalCents, 3309);
});

test('adds up the parts when no total line was read', () => {
  const r = parseReceiptText('Subtotal 10.00\nService 1.00\nGST 0.99');
  assert.equal(r.totalCents, 1199);
});

test('compareWithReceipt', () => {
  assert.equal(compareWithReceipt(3309, 3309, DEFAULT_PLATES, DEFAULT_RATES).status, 'match');
  assert.equal(compareWithReceipt(3309, 3310, DEFAULT_PLATES, DEFAULT_RATES).status, 'rounding');
  const missedRed = compareWithReceipt(3309, 3309 + 276, DEFAULT_PLATES, DEFAULT_RATES);
  assert.equal(missedRed.status, 'receipt-higher');
  assert.deepEqual(missedRed.suggestions.map((s) => [s.plate.id, s.count]), [['red', 1]]);
  const extraGold = compareWithReceipt(3309, 3309 - 2 * 468, DEFAULT_PLATES, DEFAULT_RATES);
  assert.equal(extraGold.status, 'receipt-lower');
  assert.ok(extraGold.suggestions.some((s) => s.plate.id === 'gold' && s.count === 2));
  assert.equal(compareWithReceipt(100, null, DEFAULT_PLATES, DEFAULT_RATES).status, 'unknown');
});
