import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sharesOf, expenseProblem, balances, settleUp, totalSpent, mergeGroups, encodeGroup, decodeGroup,
  withCharges, summaryText, crc16, parsePayNow, payNowPayload,
} from '../src/split.js';

const IDS = ['a', 'b', 'c'];
const members = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Cat' }];
const exp = (id, paidBy, cents, split, extra = {}) => ({ id, paidBy, cents, split, desc: id, at: 1, updatedAt: 1, ...extra });
const equal = (among = IDS) => ({ type: 'equal', among });
const group = (expenses) => ({ id: 'g', name: 'Trip', updatedAt: 1, members, expenses });

test('equal split hands leftover cents to the first people in member order', () => {
  assert.deepEqual(sharesOf(exp('x', 'a', 1000, equal(['c', 'a', 'b'])), IDS), { a: 334, b: 333, c: 333 });
  assert.deepEqual(sharesOf(exp('x', 'a', 1001, equal(['b', 'c'])), IDS), { b: 501, c: 500 });
});

test('weighted split sums exactly to the total', () => {
  const s = sharesOf(exp('x', 'a', 1000, { type: 'weights', weights: { a: 1, b: 2, c: 0 } }), IDS);
  assert.deepEqual(s, { a: 333, b: 667 });
});

test('exact split is used as given, and must add up', () => {
  const e = exp('x', 'a', 1000, { type: 'exact', shares: { a: 300, b: 700 } });
  assert.deepEqual(sharesOf(e, IDS), { a: 300, b: 700 });
  assert.equal(expenseProblem(e), null);
  assert.match(expenseProblem({ ...e, split: { type: 'exact', shares: { a: 300, b: 600 } } }), /\$1\.00 left to assign/);
  assert.match(expenseProblem({ ...e, cents: 0 }), /amount/);
  assert.match(expenseProblem({ ...e, split: equal([]) }), /at least one/);
});

test('balances, payments and deletions', () => {
  const g = group([
    exp('dinner', 'a', 9000, equal()),
    exp('taxi', 'b', 3000, equal(['b', 'c'])),
    exp('gone', 'c', 99900, equal(), { deleted: true }),
  ]);
  assert.deepEqual(balances(g), { a: 6000, b: -1500, c: -4500 });
  assert.equal(totalSpent(g), 12000);
  g.expenses.push(exp('pay', 'c', 4500, { type: 'exact', shares: { a: 4500 } }, { kind: 'payment' }));
  assert.deepEqual(balances(g), { a: 1500, b: -1500, c: 0 });
  assert.equal(totalSpent(g), 12000, 'payments are not spending');
});

test('settleUp needs at most n − 1 payments and clears every balance', () => {
  const net = { a: 6000, b: -1500, c: -4500, d: 2000, e: -2000 };
  const ids = Object.keys(net);
  const t = settleUp(net, ids);
  assert.ok(t.length <= ids.length - 1);
  const after = { ...net };
  for (const p of t) { after[p.from] += p.cents; after[p.to] -= p.cents; }
  assert.ok(Object.values(after).every((c) => c === 0));
  assert.deepEqual(t[0], { from: 'c', to: 'a', cents: 4500 });
  assert.deepEqual(settleUp({ a: 0, b: 0 }), []);
});

test('merging copies keeps everyone\'s additions, edits and deletions, in either order', () => {
  const base = group([exp('dinner', 'a', 9000, equal())]);
  const mine = { ...base, expenses: [...base.expenses, exp('mine', 'a', 100, equal(), { updatedAt: 5 })] };
  const theirs = {
    ...base,
    name: 'Bangkok trip',
    updatedAt: 3,
    members: [...members, { id: 'd', name: 'Dan', updatedAt: 3 }],
    expenses: [exp('dinner', 'a', 9500, equal(), { updatedAt: 4 }), exp('theirs', 'b', 200, equal(), { updatedAt: 6 })],
  };
  const ab = mergeGroups(mine, theirs);
  const ba = mergeGroups(theirs, mine);
  assert.equal(ab.changed, 2);
  assert.equal(ab.group.name, 'Bangkok trip');
  assert.equal(ab.group.members.length, 4);
  assert.deepEqual(balances(ab.group), balances(ba.group));
  assert.equal(ab.group.expenses.find((e) => e.id === 'dinner').cents, 9500);

  const deleted = { ...mine, expenses: mine.expenses.map((e) => (e.id === 'mine' ? { ...e, deleted: true, updatedAt: 9 } : e)) };
  const m = mergeGroups(mine, deleted).group;
  assert.equal(m.expenses.find((e) => e.id === 'mine').deleted, true);
  assert.equal(mergeGroups(mine, mine).changed, 0);
});

test('a group survives the share link round trip', async () => {
  const g = { ...group([exp('dinner', 'a', 9000, equal(), { desc: 'Jumbo 珍宝海鲜 🦀' })]), me: 'a' };
  const text = await encodeGroup(g);
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  const back = await decodeGroup(text);
  assert.equal(back.expenses[0].desc, 'Jumbo 珍宝海鲜 🦀');
  assert.equal(back.me, undefined, '"me" stays on this phone');
  assert.equal(await decodeGroup('not-a-group'), null);
});

test('service charge then GST', () => {
  assert.equal(withCharges(10000), 11990);
  assert.equal(withCharges(10000, { serviceBp: 0, gstBp: 900 }), 10900);
});

test('summary text for a chat', () => {
  const text = summaryText(group([exp('dinner', 'a', 9000, equal())]), 'https://x/#g=1');
  assert.equal(text, '💸 Trip: $90.00 spent\n• Ben pays Ann $30.00\n• Cat pays Ann $30.00\n\nOpen the group: https://x/#g=1');
});

test('crc16 matches the CCITT-FALSE check value', () => {
  assert.equal(crc16('123456789'), '29B1');
});

test('parsePayNow', () => {
  assert.deepEqual(parsePayNow('9123 4567'), { type: 'mobile', value: '+6591234567' });
  assert.deepEqual(parsePayNow('+65 8123-4567'), { type: 'mobile', value: '+6581234567' });
  assert.deepEqual(parsePayNow('201403121w'), { type: 'uen', value: '201403121W' });
  assert.equal(parsePayNow('6123 4567'), null);
  assert.equal(parsePayNow(''), null);
});

test('PayNow payload is well-formed SGQR with a valid checksum', () => {
  const p = payNowPayload({ proxy: { type: 'mobile', value: '+6591234567' }, cents: 1250, name: 'Ann', ref: 'Trip' });
  assert.ok(p.startsWith('000201010212'));
  assert.ok(p.includes('0009SG.PAYNOW010100211+65912345670301'));
  assert.ok(p.includes('540512.50'));
  assert.ok(p.includes('5802SG5903Ann6009Singapore62080104Trip'));
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
  // Every top-level field's length matches its value.
  let i = 0;
  while (i < p.length) {
    const len = Number(p.slice(i + 2, i + 4));
    i += 4 + len;
  }
  assert.equal(i, p.length);
});
