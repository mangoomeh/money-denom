// Pure group-expense logic. Money is in integer cents. A group is shared between
// friends' phones by link, so every record carries an id and an updatedAt and two
// copies of a group can be merged in any order and end up the same.

export const newId = () => Math.random().toString(36).slice(2, 10);

// Amount each member owes for one expense, as { memberId: cents }, summing exactly
// to the expense total. Leftover cents from rounding go to the first people in
// member order, so every phone works out the same split.
export function sharesOf(expense, memberIds) {
  const { cents, split } = expense;
  const order = (ids) => memberIds.filter((id) => ids.includes(id));
  if (split.type === 'exact') return { ...split.shares };
  if (split.type === 'weights') {
    const ids = order(Object.keys(split.weights).filter((id) => split.weights[id] > 0));
    const total = ids.reduce((s, id) => s + split.weights[id], 0);
    if (!total) return {};
    const out = {};
    const parts = ids.map((id) => {
      const exact = (cents * split.weights[id]) / total;
      out[id] = Math.floor(exact);
      return { id, frac: exact - out[id] };
    });
    let left = cents - ids.reduce((s, id) => s + out[id], 0);
    for (const p of [...parts].sort((a, b) => b.frac - a.frac)) {
      if (left-- <= 0) break;
      out[p.id] += 1;
    }
    return out;
  }
  const ids = order(split.among);
  if (!ids.length) return {};
  const base = Math.floor(cents / ids.length);
  const extra = cents - base * ids.length;
  return Object.fromEntries(ids.map((id, i) => [id, base + (i < extra ? 1 : 0)]));
}

// What's wrong with an expense before it can be saved, or null if it's fine.
export function expenseProblem(expense) {
  if (!(expense.cents > 0)) return 'Enter an amount.';
  if (!expense.paidBy) return 'Choose who paid.';
  const { split } = expense;
  if (split.type === 'equal' && !split.among.length) return 'Pick at least one person to split with.';
  if (split.type === 'weights' && !Object.values(split.weights).some((w) => w > 0)) return 'Give at least one person a share.';
  if (split.type === 'exact') {
    const sum = Object.values(split.shares).reduce((s, c) => s + c, 0);
    if (sum !== expense.cents) {
      const diff = expense.cents - sum;
      return `The amounts add up to ${formatMoney(sum)}: ${formatMoney(Math.abs(diff))} ${diff > 0 ? 'left to assign' : 'too much'}.`;
    }
  }
  return null;
}

const live = (list) => list.filter((x) => !x.deleted);

// Net balance per member: positive means they are owed money, negative means they owe.
// A payment between friends is stored as an expense the payer "paid" for the receiver.
export function balances(group) {
  const ids = live(group.members).map((m) => m.id);
  const allIds = group.members.map((m) => m.id);
  const net = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const e of live(group.expenses)) {
    net[e.paidBy] = (net[e.paidBy] || 0) + e.cents;
    for (const [id, c] of Object.entries(sharesOf(e, allIds))) net[id] = (net[id] || 0) - c;
  }
  return net;
}

// Fewest-ish payments to settle everyone up: the biggest debtor pays the biggest
// creditor until one of them is square, repeated. Gives at most n − 1 payments.
export function settleUp(net, memberIds = Object.keys(net)) {
  const rank = (id) => memberIds.indexOf(id);
  const side = (pick) => memberIds.filter((id) => pick(net[id] || 0)).map((id) => ({ id, cents: Math.abs(net[id]) }));
  const creditors = side((c) => c > 0);
  const debtors = side((c) => c < 0);
  const byAmount = (a, b) => b.cents - a.cents || rank(a.id) - rank(b.id);
  const out = [];
  while (creditors.length && debtors.length) {
    creditors.sort(byAmount);
    debtors.sort(byAmount);
    const c = creditors[0];
    const d = debtors[0];
    const cents = Math.min(c.cents, d.cents);
    out.push({ from: d.id, to: c.id, cents });
    c.cents -= cents;
    d.cents -= cents;
    if (!c.cents) creditors.shift();
    if (!d.cents) debtors.shift();
  }
  return out;
}

export function totalSpent(group) {
  return live(group.expenses).filter((e) => e.kind !== 'payment').reduce((s, e) => s + e.cents, 0);
}

// ---- Merging copies of a group -------------------------------------------------------

// The newer record wins. On a tie, the one whose JSON sorts later wins, so both
// phones pick the same one whichever way round they merge.
function newer(a, b) {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

function mergeList(mine, theirs) {
  const out = mine.map((x) => {
    const other = theirs.find((y) => y.id === x.id);
    return other ? newer(x, other) : x;
  });
  for (const y of theirs) if (!mine.some((x) => x.id === y.id)) out.push(y);
  return out;
}

// Merges a received copy of a group into ours. Returns the merged group and how
// many expenses were new or changed, for the "updated" message.
export function mergeGroups(mine, theirs) {
  const head = newer({ updatedAt: mine.updatedAt, name: mine.name }, { updatedAt: theirs.updatedAt, name: theirs.name });
  const expenses = mergeList(mine.expenses, theirs.expenses);
  const changed = expenses.filter((e) => {
    const old = mine.expenses.find((x) => x.id === e.id);
    return !old || JSON.stringify(old) !== JSON.stringify(e);
  }).length;
  return {
    group: { ...mine, name: head.name, updatedAt: head.updatedAt, members: mergeList(mine.members, theirs.members), expenses },
    changed,
  };
}

// ---- Share links ---------------------------------------------------------------------

function toB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

// The group as a compact string for the link's #hash. Only the shared fields are
// included (not who "me" is on this phone).
export async function encodeGroup(group) {
  const { id, name, updatedAt, members, expenses } = group;
  const json = new TextEncoder().encode(JSON.stringify({ v: 1, id, name, updatedAt, members, expenses }));
  return toB64(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeGroup(text) {
  try {
    const json = await pipe(fromB64(text), new DecompressionStream('deflate-raw'));
    const g = JSON.parse(new TextDecoder().decode(json));
    if (g.v !== 1 || !g.id || !Array.isArray(g.members) || !Array.isArray(g.expenses)) return null;
    return { id: g.id, name: String(g.name || 'Group'), updatedAt: g.updatedAt || 0, members: g.members, expenses: g.expenses };
  } catch {
    return null;
  }
}

// ---- Text and money ------------------------------------------------------------------

export function formatMoney(cents) {
  const abs = Math.abs(cents);
  const str = `$${Math.floor(abs / 100).toLocaleString('en-SG')}.${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `-${str}` : str;
}

// Adds Singapore service charge then GST on top (rates in basis points, 1000 = 10%).
export function withCharges(cents, { serviceBp = 1000, gstBp = 900 } = {}) {
  const service = Math.round((cents * serviceBp) / 10000);
  return cents + service + Math.round(((cents + service) * gstBp) / 10000);
}

// A plain-text summary to paste into a chat.
export function summaryText(group, url) {
  const name = (id) => group.members.find((m) => m.id === id)?.name ?? '?';
  const transfers = settleUp(balances(group), group.members.map((m) => m.id));
  const lines = [`💸 ${group.name}: ${formatMoney(totalSpent(group))} spent`];
  if (!transfers.length) lines.push('Everyone is settled up 🎉');
  for (const t of transfers) lines.push(`• ${name(t.from)} pays ${name(t.to)} ${formatMoney(t.cents)}`);
  if (url) lines.push('', `Open the group: ${url}`);
  return lines.join('\n');
}

// ---- PayNow QR -----------------------------------------------------------------------

// CRC-16/CCITT-FALSE, as the SGQR / EMVCo QR spec requires for tag 63.
export function crc16(text) {
  let crc = 0xffff;
  for (const ch of new TextEncoder().encode(text)) {
    crc ^= ch << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const tlv = (tag, value) => `${tag}${String(value.length).padStart(2, '0')}${value}`;

// Normalises a PayNow number: a Singapore mobile (8 digits starting 8 or 9, with or
// without +65) or a UEN. Returns { type: 'mobile' | 'uen', value } or null.
export function parsePayNow(text) {
  const s = String(text || '').replace(/[\s-]/g, '').toUpperCase();
  const mobile = s.match(/^(?:\+?65)?([89]\d{7})$/);
  if (mobile) return { type: 'mobile', value: `+65${mobile[1]}` };
  if (/^(\d{8,9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])$/.test(s)) return { type: 'uen', value: s };
  return null;
}

// The text inside a PayNow QR code that banking apps scan, for a fixed amount.
export function payNowPayload({ proxy, cents, name = 'NA', ref = '' }) {
  const account = tlv('00', 'SG.PAYNOW') + tlv('01', proxy.type === 'uen' ? '2' : '0') + tlv('02', proxy.value) + tlv('03', '0');
  const cleanName = (name.replace(/[^\x20-\x7e]/g, '').trim() || 'NA').slice(0, 25);
  const cleanRef = ref.replace(/[^A-Za-z0-9 -]/g, '').trim().slice(0, 25);
  const body = [
    tlv('00', '01'),
    tlv('01', '12'),
    tlv('26', account),
    tlv('52', '0000'),
    tlv('53', '702'),
    tlv('54', (cents / 100).toFixed(2)),
    tlv('58', 'SG'),
    tlv('59', cleanName),
    tlv('60', 'Singapore'),
    cleanRef ? tlv('62', tlv('01', cleanRef)) : '',
  ].join('') + '6304';
  return body + crc16(body);
}
