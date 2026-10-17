// Pure Sushiro bill logic. Money is in integer cents; rates are in basis points
// (1000 = 10%) so every calculation stays in whole numbers.

export const DEFAULT_PLATES = [
  { id: 'red', name: 'Red', color: '#d62e2e', cents: 230 },
  { id: 'silver', name: 'Silver', color: '#a7adb5', cents: 290 },
  { id: 'gold', name: 'Gold', color: '#d4a92a', cents: 390 },
  { id: 'black', name: 'Black', color: '#222222', cents: 490 },
];

export const DEFAULT_RATES = { serviceBp: 1000, gstBp: 900 };

const applyRate = (cents, bp) => Math.round((cents * bp) / 10000);

// Parses a percentage like "10" or "9.5" into basis points. Returns null if invalid.
export function parsePercent(text) {
  const s = String(text).trim().replace(/%$/, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

// Turns plate counts and specials into bill lines, priced at the given tiers.
export function billLines(plates, counts, specials) {
  const lines = plates
    .filter((p) => counts[p.id] > 0)
    .map((p) => ({ name: `${p.name} plate`, qty: counts[p.id], unitCents: p.cents, cents: counts[p.id] * p.cents, color: p.color }));
  for (const s of specials) lines.push({ name: s.name || 'Special', qty: 1, unitCents: s.cents, cents: s.cents });
  return lines;
}

// Service charge is applied to the subtotal, then GST to subtotal + service charge
// (as required in Singapore). Each charge is rounded to the cent, as on a receipt.
export function computeBill(lines, { serviceBp, gstBp }) {
  const subtotalCents = lines.reduce((sum, l) => sum + l.cents, 0);
  const serviceCents = applyRate(subtotalCents, serviceBp);
  const gstCents = applyRate(subtotalCents + serviceCents, gstBp);
  const plateCount = lines.filter((l) => l.color).reduce((n, l) => n + l.qty, 0);
  return { subtotalCents, serviceCents, gstCents, totalCents: subtotalCents + serviceCents + gstCents, plateCount };
}

// Spending summary for visits whose date falls in the same calendar month as `now`.
export function monthSummary(visits, now = new Date()) {
  const inMonth = visits.filter((v) => {
    const d = new Date(v.at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  return {
    visits: inMonth.length,
    totalCents: inMonth.reduce((sum, v) => sum + v.bill.totalCents, 0),
    plates: inMonth.reduce((sum, v) => sum + v.bill.plateCount, 0),
  };
}
