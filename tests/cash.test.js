import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyCounts, totalCents, parseAmount, formatCents, checkTransaction, applyDelta, lowDenominations,
  historyCsv, periodRange, spendStats,
} from '../src/cash.js';

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

const buy = (at, amountCents, note = '', paid = {}, extra = {}) => ({ type: 'purchase', at: new Date(at).toISOString(), amountCents, note, paid: { ...emptyCounts(), ...paid }, change: emptyCounts(), ...extra });

test('period ranges: last 7 and 30 days, this month against the same days last month, and all time', () => {
  const now = new Date(2026, 9, 23, 15, 0); // 23 Oct 2026, local time
  const w = periodRange('7d', [], now);
  assert.deepEqual([w.from, w.to, w.prev.from, w.prev.to].map((d) => d.toDateString()), ['Sat Oct 17 2026', 'Sat Oct 24 2026', 'Sat Oct 10 2026', 'Sat Oct 17 2026']);
  const m = periodRange('month', [], now);
  assert.deepEqual([m.from, m.prev.from, m.prev.to].map((d) => d.toDateString()), ['Thu Oct 01 2026', 'Tue Sep 01 2026', 'Thu Sep 24 2026']);
  // On 31 March, "the same days last month" stops at the end of February.
  const march = periodRange('month', [], new Date(2026, 2, 31, 12));
  assert.equal(march.prev.to.toDateString(), 'Sun Mar 01 2026');
  const all = periodRange('all', [buy(new Date(2026, 6, 5), 100)], now);
  assert.deepEqual([all.from.toDateString(), all.bucket, all.prev], ['Wed Jul 01 2026', 'month', null]);
});

test('spending stats: totals, empty days kept, notes grouped, undone purchases ignored', () => {
  const now = new Date(2026, 9, 23, 15, 0);
  const history = [
    buy(new Date(2026, 9, 23, 9), 1230, 'Snacks', { n10: 1, n2: 1, c50: 1 }),
    buy(new Date(2026, 9, 21, 12), 450, 'snacks ', { n5: 1 }),
    buy(new Date(2026, 9, 21, 13), 2000, 'Taxi', { n10: 2 }),
    buy(new Date(2026, 9, 20, 13), 9900, 'Big thing', { n50: 2 }, { undone: true }),
    buy(new Date(2026, 9, 12, 10), 800, 'Coffee', { n10: 1 }), // previous week
    { type: 'adjust', at: new Date(2026, 9, 18).toISOString(), before: emptyCounts(), after: { ...emptyCounts(), n50: 2 }, wasSetUp: true },
  ];
  const s = spendStats(history, periodRange('7d', history, now), { stash: { ...emptyCounts(), n10: 3 }, now });
  assert.equal(s.total, 3680);
  assert.equal(s.count, 3);
  assert.equal(s.average, 1227);
  assert.equal(s.prevTotal, 800);
  assert.equal(s.buckets.length, 7);
  assert.deepEqual(s.buckets.map((b) => b.cents), [0, 0, 0, 0, 2450, 0, 1230]);
  assert.deepEqual(s.byNote.map((n) => [n.note, n.cents, n.count]), [['Taxi', 2000, 1], ['Snacks', 1680, 2]]);
  assert.deepEqual(s.denominations.map((d) => [d.id, d.count]), [['n10', 3], ['n5', 1], ['n2', 1], ['c50', 1]]);
  assert.deepEqual(s.biggest.map((e) => e.amountCents), [2000, 1230, 450]);
  assert.deepEqual(s.topUps, { count: 1, cents: 10000 });
  // $30 on hand at $44.80 per 30 days (36.80 + 8.00) lasts about 20 days.
  assert.equal(s.onHand, 3000);
  assert.equal(s.lastsDays, 20);
});

test('notes past the top few fold into "Other"', () => {
  const now = new Date(2026, 9, 23, 15, 0);
  const history = ['A', 'B', 'C', 'D'].map((n, i) => buy(new Date(2026, 9, 22, 10 + i), (4 - i) * 100, n));
  const s = spendStats(history, periodRange('7d', history, now), { now, topNotes: 2 });
  assert.deepEqual(s.byNote.map((n) => [n.note, n.cents, n.other ?? 0]), [['A', 400, 0], ['B', 300, 0], [null, 300, 2]]);
});

test('all time is by month, and nothing spent gives zeros, not errors', () => {
  const now = new Date(2026, 9, 23, 15, 0);
  const history = [buy(new Date(2026, 7, 30), 500), buy(new Date(2026, 9, 2), 700)];
  const s = spendStats(history, periodRange('all', history, now), { now });
  assert.deepEqual(s.buckets.map((b) => [b.key, b.cents]), [['2026-08', 500], ['2026-09', 0], ['2026-10', 700]]);
  const empty = spendStats([], periodRange('30d', [], now), { stash: emptyCounts(), now });
  assert.deepEqual([empty.total, empty.count, empty.average, empty.lastsDays, empty.buckets.length], [0, 0, 0, null, 30]);
});
