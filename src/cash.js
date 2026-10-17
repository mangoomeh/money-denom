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
