// Pulls the totals out of receipt text (from OCR or pasted from Live Text / Google Lens)
// and compares them with the bill tracked in the app. Money is in integer cents.

import { billLines, computeBill } from './sushiro.js';

// OCR often misreads digits and decimal points; tidy the common cases.
function normaliseLine(line) {
  return line
    .replace(/(?<=\d)[oO](?=\d|\b)/g, '0')
    .replace(/(?<=\d)\s*[.,:]\s*(?=\d{2}\b)/g, '.')
    .replace(/S\$/g, '$');
}

// The last money amount on a line, e.g. "Svc Chg 10%   3.45" -> 345. Percentages are ignored.
export function amountOnLine(line) {
  const matches = [...normaliseLine(line).matchAll(/(-?)\$?\s?(\d{1,5})\.(\d{2})(?!\d|\s*%)/g)];
  if (!matches.length) return null;
  const [, minus, whole, frac] = matches[matches.length - 1];
  return (minus ? -1 : 1) * (Number(whole) * 100 + Number(frac));
}

const LABELS = {
  subtotal: /sub\s*-?\s*tota[l1i]/i,
  service: /serv[il1]ce|svc|s\s*\/\s*c\b|svr\s*chg|serv\s*chg/i,
  gst: /\bg\s*s\s*t\b/i,
  total: /\b(grand\s*)?tota[l1i]\b|amount\s*due|nett\s*amount|balance\s*due/i,
};
const NOT_TOTAL = /sub\s*-?\s*tota[l1i]|qty|item|tendered|cash|change|paid|visa|master|nets|card/i;

export function parseReceiptText(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const found = { subtotalCents: null, serviceCents: null, gstCents: null, totalCents: null };
  let grandTotal = null;

  lines.forEach((line, i) => {
    // An amount can sit on the label's line or, in some OCR output, on the next line.
    const amount = amountOnLine(line) ?? (lines[i + 1] && !/[a-z]{3}/i.test(lines[i + 1]) ? amountOnLine(lines[i + 1]) : null);
    if (amount == null) return;
    if (LABELS.subtotal.test(line)) found.subtotalCents ??= amount;
    else if (LABELS.service.test(line)) found.serviceCents ??= amount;
    else if (LABELS.gst.test(line)) {
      // Skip "GST included in total" style lines that just repeat the total.
      if (!/incl/i.test(line) || found.gstCents == null) found.gstCents ??= amount;
    } else if (LABELS.total.test(line) && !NOT_TOTAL.test(line)) {
      if (/grand/i.test(line)) grandTotal = amount;
      found.totalCents = amount; // the last "Total" line wins
    }
  });
  if (grandTotal != null) found.totalCents = grandTotal;

  // No labelled total: if the parts are there, add them up.
  if (found.totalCents == null && found.subtotalCents != null) {
    found.totalCents = found.subtotalCents + (found.serviceCents ?? 0) + (found.gstCents ?? 0);
  }
  return found;
}

// Compares the tracked bill with the receipt total and, when they differ, suggests
// which plate(s) might explain it (using each plate's price after charges).
export function compareWithReceipt(trackedTotalCents, receiptTotalCents, plates, rates) {
  if (receiptTotalCents == null) return { status: 'unknown' };
  const diffCents = receiptTotalCents - trackedTotalCents;
  if (diffCents === 0) return { status: 'match', diffCents };

  // Allow a cent either way for rounding differences.
  if (Math.abs(diffCents) <= 1) return { status: 'rounding', diffCents };

  const suggestions = [];
  for (const p of plates) {
    const nett = computeBill(billLines([p], { [p.id]: 1 }, []), rates).totalCents;
    for (let n = 1; n <= 5; n++) {
      if (Math.abs(Math.abs(diffCents) - nett * n) <= 1) suggestions.push({ plate: p, count: n });
    }
  }
  return { status: diffCents > 0 ? 'receipt-higher' : 'receipt-lower', diffCents, suggestions };
}
