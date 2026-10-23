// Pure petty-cash logic. All money is handled as integer cents to avoid
// floating-point drift (e.g. 0.1 + 0.2 !== 0.3).

export const DENOMINATIONS = [
  { id: 'n100', label: '$100 note', cents: 10000, kind: 'note' },
  { id: 'n50', label: '$50 note', cents: 5000, kind: 'note' },
  { id: 'n10', label: '$10 note', cents: 1000, kind: 'note' },
  { id: 'n5', label: '$5 note', cents: 500, kind: 'note' },
  { id: 'n2', label: '$2 note', cents: 200, kind: 'note' },
  { id: 'c100', label: '$1 coin', cents: 100, kind: 'coin' },
  { id: 'c50', label: '50¢ coin', cents: 50, kind: 'coin' },
  { id: 'c20', label: '20¢ coin', cents: 20, kind: 'coin' },
  { id: 'c10', label: '10¢ coin', cents: 10, kind: 'coin' },
  { id: 'c5', label: '5¢ coin', cents: 5, kind: 'coin' },
];

export function emptyCounts() {
  return Object.fromEntries(DENOMINATIONS.map((d) => [d.id, 0]));
}

export function totalCents(counts) {
  return DENOMINATIONS.reduce((sum, d) => sum + (counts[d.id] || 0) * d.cents, 0);
}

// Parses user input like "10.3", "$10.30" or "10" into cents. Returns null if invalid.
export function parseAmount(text) {
  const cleaned = String(text).trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  return Number(whole || 0) * 100 + Number(frac.padEnd(2, '0'));
}

export function formatCents(cents, { sign = false } = {}) {
  const abs = Math.abs(cents);
  const str = `$${Math.floor(abs / 100).toLocaleString('en-SG')}.${String(abs % 100).padStart(2, '0')}`;
  if (cents < 0) return `-${str}`;
  return sign && cents > 0 ? `+${str}` : str;
}

// Compares cash handed over (minus any change received back) against the purchase amount.
export function checkTransaction({ amountCents, paid, change, stash }) {
  const paidCents = totalCents(paid);
  const changeCents = totalCents(change);
  const netCents = paidCents - changeCents;
  const differenceCents = netCents - (amountCents ?? 0);
  const overdrawn = DENOMINATIONS.filter((d) => (paid[d.id] || 0) > (stash[d.id] || 0)).map((d) => d.id);

  let status;
  if (amountCents == null || amountCents <= 0) status = 'no-amount';
  else if (paidCents === 0) status = 'no-cash';
  else if (overdrawn.length) status = 'overdrawn';
  else if (differenceCents > 0) status = 'too-much';
  else if (differenceCents < 0) status = 'too-little';
  else status = 'ok';

  return { paidCents, changeCents, netCents, differenceCents, overdrawn, status, canConfirm: status === 'ok' };
}

export function applyDelta(stash, paid, change, direction = 1) {
  const next = { ...stash };
  for (const d of DENOMINATIONS) {
    next[d.id] = (next[d.id] || 0) - direction * ((paid[d.id] || 0) - (change[d.id] || 0));
  }
  return next;
}

export function lowDenominations(stash, threshold) {
  if (!threshold) return [];
  return DENOMINATIONS.filter((d) => (stash[d.id] || 0) < threshold);
}

// The history as CSV for a spreadsheet or a reimbursement claim, oldest first. Text that
// starts like a formula is prefixed with ' so spreadsheets don't run it.
export function historyCsv(history) {
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const amount = (cents) => (cents / 100).toFixed(2);
  const rows = [['Date', 'Time', 'Type', 'Description', 'Amount (SGD)', 'Undone']];
  for (const e of [...history].sort((a, b) => new Date(a.at) - new Date(b.at))) {
    const d = new Date(e.at);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (e.type === 'adjust') {
      rows.push([date, time, e.wasSetUp ? 'Adjustment' : 'Opening balance', e.wasSetUp ? 'Counts adjusted' : 'Opening balance',
        amount(totalCents(e.after) - totalCents(e.before)), e.undone ? 'yes' : '']);
    } else {
      rows.push([date, time, 'Purchase', e.note || 'Purchase', amount(-e.amountCents), e.undone ? 'yes' : '']);
    }
  }
  return `${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

// ---- Stats ---------------------------------------------------------------------------------------

const DAY_MS = 86400000;
const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localMonth = (d) => localDay(d).slice(0, 7);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// The date range for a period, and the one before it to compare with:
// '7d' and '30d' end today; 'month' is this month so far, compared with the same days of last
// month; 'all' starts at the first entry and has nothing to compare with.
export function periodRange(period, history, now = new Date()) {
  const today = startOfDay(now);
  const end = new Date(today.getTime() + DAY_MS); // exclusive: the end of today
  if (period === '7d' || period === '30d') {
    const days = period === '7d' ? 7 : 30;
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + 1);
    return { from, to: end, bucket: 'day', prev: { from: new Date(from.getFullYear(), from.getMonth(), from.getDate() - days), to: from } };
  }
  if (period === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const daysLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    const prevTo = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), daysLastMonth) + 1);
    return { from, to: end, bucket: 'day', prev: { from: prevFrom, to: prevTo } };
  }
  const first = history.reduce((m, e) => (e.at < m ? e.at : m), now.toISOString());
  const f = new Date(first);
  return { from: new Date(f.getFullYear(), f.getMonth(), 1), to: end, bucket: 'month', prev: null };
}

const inRange = (e, r) => {
  const t = new Date(e.at).getTime();
  return t >= r.from.getTime() && t < r.to.getTime();
};
const purchasesIn = (history, r) => history.filter((e) => e.type === 'purchase' && !e.undone && inRange(e, r));

// Spending stats for a range from periodRange: totals, per day (or month), by note, which notes
// and coins were handed over, the biggest purchases and top-ups. Undone purchases don't count.
export function spendStats(history, range, { stash = null, now = new Date(), topNotes = 5 } = {}) {
  const buys = purchasesIn(history, range);
  const total = buys.reduce((s, e) => s + e.amountCents, 0);

  // Every day (or month) in the range, including empty ones, so gaps show as gaps.
  const buckets = [];
  const keyOf = range.bucket === 'month' ? localMonth : localDay;
  for (let d = new Date(range.from); d < range.to; d = range.bucket === 'month' ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    buckets.push({ key: keyOf(d), date: new Date(d), cents: 0, count: 0 });
  }
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
  for (const e of buys) {
    const b = byKey[keyOf(new Date(e.at))];
    if (b) { b.cents += e.amountCents; b.count += 1; }
  }

  // By note, case-insensitively, largest first; the tail folds into "Other".
  const notes = new Map();
  for (const e of buys) {
    const label = (e.note || '').trim();
    const k = label.toLowerCase();
    const n = notes.get(k) || { note: label, cents: 0, count: 0 };
    n.cents += e.amountCents;
    n.count += 1;
    notes.set(k, n);
  }
  const sorted = [...notes.values()].sort((a, b) => b.cents - a.cents);
  const byNote = sorted.slice(0, topNotes);
  if (sorted.length > topNotes) {
    const rest = sorted.slice(topNotes);
    byNote.push({ note: null, other: rest.length, cents: rest.reduce((s, n) => s + n.cents, 0), count: rest.reduce((s, n) => s + n.count, 0) });
  }

  const handed = Object.fromEntries(DENOMINATIONS.map((d) => [d.id, 0]));
  for (const e of buys) for (const d of DENOMINATIONS) handed[d.id] += e.paid?.[d.id] || 0;
  const denominations = DENOMINATIONS.map((d) => ({ ...d, count: handed[d.id] })).filter((d) => d.count > 0).sort((a, b) => b.count - a.count);

  const topUps = history.filter((e) => e.type === 'adjust' && !e.undone && inRange(e, range))
    .map((e) => totalCents(e.after) - totalCents(e.before)).filter((c) => c > 0);

  // How long the cash lasts at the last 30 days' rate.
  const last30 = purchasesIn(history, { from: new Date(startOfDay(now).getTime() - 29 * DAY_MS), to: new Date(startOfDay(now).getTime() + DAY_MS) })
    .reduce((s, e) => s + e.amountCents, 0);
  const onHand = stash ? totalCents(stash) : null;
  const lastsDays = onHand != null && last30 > 0 ? Math.floor(onHand / (last30 / 30)) : null;

  const prevTotal = range.prev ? purchasesIn(history, range.prev).reduce((s, e) => s + e.amountCents, 0) : null;
  return {
    total,
    count: buys.length,
    average: buys.length ? Math.round(total / buys.length) : 0,
    prevTotal,
    buckets,
    byNote,
    denominations,
    biggest: [...buys].sort((a, b) => b.amountCents - a.amountCents).slice(0, 3),
    topUps: { count: topUps.length, cents: topUps.reduce((s, c) => s + c, 0) },
    onHand,
    lastsDays,
  };
}
