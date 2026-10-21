import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyCounts, totalCents, parseAmount, formatCents, checkTransaction, applyDelta, lowDenominations,
historyCsv } from '../src/cash.js';

const counts = (o) => ({ ...emptyCounts(), ...o });

test('parseAmount handles common inputs', () => {
  assert.equal(parseAmount('10.30'), 1030);
  assert.equal(parseAmount('10.3'), 1030);
  assert.equal(parseAmount('$10'), 1000);
  assert.equal(parseAmount('.5'), 50);
  assert.equal(parseAmount('1,234.05'), 123405);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('1.234'), null);
  assert.equal(parseAmount(''), null);
});

test('formatCents', () => {
  assert.equal(formatCents(18650), '$186.50');
  assert.equal(formatCents(-20), '-$0.20');
  assert.equal(formatCents(20, { sign: true }), '+$0.20');
  assert.equal(formatCents(5), '$0.05');
});

test('totals are exact in cents', () => {
  assert.equal(totalCents(counts({ c10: 3 })), 30);
  assert.equal(totalCents(counts({ n10: 1, c50: 1 })), 1050);
});

test('checkTransaction reports the difference in cents, not mixed units', () => {
  const stash = counts({ n10: 5, c50: 2, c20: 5 });
  const r = checkTransaction({ amountCents: 1030, paid: counts({ n10: 1, c50: 1 }), change: emptyCounts(), stash });
  assert.equal(r.differenceCents, 20);
  assert.equal(r.status, 'too-much');
  assert.equal(r.canConfirm, false);

  const ok = checkTransaction({ amountCents: 1030, paid: counts({ n10: 1, c20: 1, c10: 0 }), change: emptyCounts(), stash: counts({ n10: 1, c20: 1 }) });
  assert.equal(ok.differenceCents, -10);
  assert.equal(ok.status, 'too-little');
});

test('change received counts against cash paid', () => {
  const stash = counts({ n50: 1 });
  const r = checkTransaction({ amountCents: 4570, paid: counts({ n50: 1 }), change: counts({ n2: 2, c20: 1, c10: 1 }), stash });
  assert.equal(r.status, 'ok');
  const next = applyDelta(stash, counts({ n50: 1 }), counts({ n2: 2, c20: 1, c10: 1 }));
  assert.equal(next.n50, 0);
  assert.equal(next.n2, 2);
  assert.equal(totalCents(next), 430);
  assert.deepEqual(applyDelta(next, counts({ n50: 1 }), counts({ n2: 2, c20: 1, c10: 1 }), -1), stash);
});

test('cannot pay with notes you do not have', () => {
  const r = checkTransaction({ amountCents: 1000, paid: counts({ n10: 1 }), change: emptyCounts(), stash: emptyCounts() });
  assert.equal(r.status, 'overdrawn');
  assert.deepEqual(r.overdrawn, ['n10']);
});

test('lowDenominations', () => {
  assert.deepEqual(lowDenominations(counts({}), 0), []);
  assert.equal(lowDenominations(counts({ n10: 5 }), 2).some((d) => d.id === 'n10'), false);
});

test('history CSV is oldest first, escaped, and safe to open in a spreadsheet', () => {
  const counts = (n10) => ({ ...emptyCounts(), n10 });
  const history = [
    { type: 'purchase', at: '2026-10-20T15:30:00', amountCents: 1230, note: 'Snacks, "big" pack', paid: counts(2), change: emptyCounts() },
    { type: 'purchase', at: '2026-10-20T12:00:00', amountCents: 500, note: '=HYPERLINK("x")', paid: counts(1), change: emptyCounts(), undone: true },
    { type: 'adjust', at: '2026-10-19T09:05:00', before: emptyCounts(), after: counts(10), wasSetUp: false },
  ];
  assert.equal(historyCsv(history), [
    'Date,Time,Type,Description,Amount (SGD),Undone',
    '2026-10-19,09:05,Opening balance,Opening balance,100.00,',
    '2026-10-20,12:00,Purchase,"\'=HYPERLINK(""x"")",-5.00,yes',
    '2026-10-20,15:30,Purchase,"Snacks, ""big"" pack",-12.30,',
  ].join('\r\n') + '\r\n');
});
