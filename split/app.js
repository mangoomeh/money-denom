import { parseAmount } from '../src/cash.js';
import {
  newId, sharesOf, expenseProblem, balances, settleUp, totalSpent, mergeGroups, encodeGroup, decodeGroup,
  formatMoney, withCharges, summaryText, parsePayNow, payNowPayload,
} from '../src/split.js';

const STORAGE_KEY = 'split-v1';
const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
const $ = (id) => document.getElementById(id);
// Names and descriptions arrive in links from other phones, so always escape them.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---- Persistent state -----------------------------------------------------------------

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.groups)) return saved;
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { groups: [], current: null };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save — your browser is blocking storage.');
  }
}

const state = load();
const group = () => state.groups.find((g) => g.id === state.current) || null;
const liveMembers = (g) => g.members.filter((m) => !m.deleted);
const memberName = (g, id) => g.members.find((m) => m.id === id)?.name ?? '?';
const touch = (record) => { record.updatedAt = Date.now(); return record; };

// ---- Form draft -------------------------------------------------------------------------

let editingId = null;
let draft = null; // { split: 'equal' | 'exact' | 'weights', among: Set, exact: {id: text}, weights: {id: n} }

function resetDraft() {
  const g = group();
  const ids = g ? liveMembers(g).map((m) => m.id) : [];
  editingId = null;
  draft = { split: 'equal', among: new Set(ids), exact: {}, weights: Object.fromEntries(ids.map((id) => [id, 1])) };
  $('desc').value = '';
  $('amount').value = '';
  $('charges').checked = false;
  $('paid-by').innerHTML = '';
  $('paid-to').innerHTML = '';
  document.querySelector('input[name="kind"][value="expense"]').checked = true;
  document.querySelector('input[name="split"][value="equal"]').checked = true;
}

const formKind = () => document.querySelector('input[name="kind"]:checked').value;

function formCents() {
  const typed = parseAmount($('amount').value);
  if (typed == null) return null;
  return formKind() === 'expense' && $('charges').checked ? withCharges(typed) : typed;
}

// Builds the expense the form describes (not yet saved).
function formExpense() {
  const g = group();
  const cents = formCents();
  const kind = formKind();
  let split;
  if (kind === 'payment') split = { type: 'exact', shares: { [$('paid-to').value]: cents ?? 0 } };
  else if (draft.split === 'equal') split = { type: 'equal', among: [...draft.among] };
  else if (draft.split === 'weights') split = { type: 'weights', weights: { ...draft.weights } };
  else {
    const shares = {};
    for (const m of liveMembers(g)) {
      const c = parseAmount(draft.exact[m.id] ?? '');
      if (c) shares[m.id] = c;
    }
    split = { type: 'exact', shares };
  }
  const old = g.expenses.find((e) => e.id === editingId);
  return {
    id: editingId || newId(),
    kind,
    desc: kind === 'payment' ? 'Payment' : $('desc').value.trim() || 'Expense',
    cents: cents ?? 0,
    paidBy: $('paid-by').value,
    split,
    at: old?.at ?? Date.now(),
    updatedAt: Date.now(),
  };
}

function formProblem(e) {
  if (e.kind === 'payment' && Object.keys(e.split.shares)[0] === e.paidBy) return 'Pick two different people.';
  return expenseProblem(e);
}

// ---- Rendering --------------------------------------------------------------------------

function render() {
  const g = group();
  $('view-groups').hidden = !!g;
  $('view-group').hidden = !g;
  $('back').textContent = g ? '‹ Groups' : '‹ Apps';
  if (!g) return renderGroups();
  renderHeader();
  renderForm();
  renderExpenses();
  renderBalances();
  renderPeople();
}

function myLine(g) {
  if (!g.me) return null;
  const c = balances(g)[g.me] ?? 0;
  if (c > 0) return `You're owed ${formatMoney(c)}`;
  if (c < 0) return `You owe ${formatMoney(-c)}`;
  return "You're settled up";
}

function renderGroups() {
  $('eyebrow').textContent = 'Split with friends';
  $('headline').textContent = 'Groups';
  $('subline').textContent = 'Share costs, see who owes whom, settle up';
  $('groups-empty').hidden = state.groups.length > 0;
  $('group-list').innerHTML = state.groups.map((g) => `
    <li class="tap" data-group="${esc(g.id)}">
      <div class="top"><strong>${esc(g.name)}</strong><span class="amt">${formatMoney(totalSpent(g))}</span></div>
      <div class="meta">${liveMembers(g).length} people${myLine(g) ? ` · ${esc(myLine(g))}` : ''}</div>
    </li>`).join('');
}

function renderHeader() {
  const g = group();
  $('eyebrow').textContent = g.name;
  $('headline').textContent = formatMoney(totalSpent(g));
  $('subline').textContent = myLine(g) ?? `spent by ${liveMembers(g).length} people · set "Who are you?" under People`;
}

function options(g, selected) {
  return liveMembers(g).map((m) => `<option value="${esc(m.id)}" ${m.id === selected ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
}

function renderForm() {
  const g = group();
  const kind = formKind();
  const isPayment = kind === 'payment';
  const keepPaidBy = $('paid-by').value || g.me || liveMembers(g)[0]?.id;
  $('paid-by').innerHTML = options(g, keepPaidBy);
  const keepPaidTo = $('paid-to').value || liveMembers(g).find((m) => m.id !== $('paid-by').value)?.id;
  $('paid-to').innerHTML = options(g, keepPaidTo);

  $('form-title').textContent = editingId ? (isPayment ? 'Edit payment' : 'Edit expense') : (isPayment ? 'Record a payment' : 'Add an expense');
  $('save-expense').textContent = editingId ? 'Save changes' : 'Add';
  $('cancel-edit').hidden = !editingId;
  $('delete-expense').hidden = !editingId;
  $('desc-field').hidden = isPayment;
  $('charges-row').hidden = isPayment;
  $('split-field').hidden = isPayment;
  $('paid-to-field').hidden = !isPayment;
  $('paid-by-label').textContent = isPayment ? 'Who paid' : 'Paid by';

  const typed = parseAmount($('amount').value);
  $('charges-total').textContent = $('charges').checked && typed ? `= ${formatMoney(withCharges(typed))}` : '';
  renderSplitRows();

  const e = formExpense();
  const problem = $('amount').value.trim() ? formProblem(e) : null;
  $('form-status').hidden = !problem;
  $('form-status').className = 'status warn';
  $('form-status').textContent = problem ?? '';
  $('save-expense').disabled = !!formProblem(e);
}

function renderSplitRows() {
  const g = group();
  const ids = liveMembers(g).map((m) => m.id);
  const e = formExpense();
  const shares = e.kind === 'expense' ? sharesOf(e, ids) : {};
  $('split-rows').innerHTML = liveMembers(g).map((m) => {
    const share = shares[m.id] ? formatMoney(shares[m.id]) : '—';
    let control;
    if (draft.split === 'equal') {
      control = `<input type="checkbox" class="big-check" data-among="${esc(m.id)}" ${draft.among.has(m.id) ? 'checked' : ''} aria-label="Include ${esc(m.name)}">`;
    } else if (draft.split === 'exact') {
      control = `<input class="cents-input" inputmode="decimal" data-exact="${esc(m.id)}" value="${esc(draft.exact[m.id] ?? '')}" placeholder="0.00" aria-label="${esc(m.name)}'s amount">`;
    } else {
      const w = draft.weights[m.id] ?? 0;
      control = `<div class="stepper">
        <button type="button" data-weight="${esc(m.id)}" data-delta="-1" ${w === 0 ? 'disabled' : ''} aria-label="One share fewer for ${esc(m.name)}">−</button>
        <span class="count">${w}</span>
        <button type="button" data-weight="${esc(m.id)}" data-delta="1" aria-label="One share more for ${esc(m.name)}">+</button>
      </div>`;
    }
    const note = draft.split === 'exact' ? '' : `<small>${share}</small>`;
    return `<li class="${shares[m.id] ? '' : 'zero'}"><div class="label"><strong>${esc(m.name)}</strong>${note}</div>${control}</li>`;
  }).join('');
}

function fmtDate(t) {
  return new Date(t).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

function renderExpenses() {
  const g = group();
  const ids = g.members.map((m) => m.id);
  const list = g.expenses.filter((e) => !e.deleted).sort((a, b) => b.at - a.at);
  $('expenses-empty').hidden = list.length > 0;
  $('expense-list').innerHTML = list.map((e) => {
    const shares = sharesOf(e, ids);
    let title;
    let meta;
    if (e.kind === 'payment') {
      const to = Object.keys(e.split.shares)[0];
      title = `💸 ${esc(memberName(g, e.paidBy))} paid ${esc(memberName(g, to))}`;
      meta = fmtDate(e.at);
    } else {
      const n = Object.values(shares).filter((c) => c > 0).length;
      title = esc(e.desc);
      meta = `${esc(memberName(g, e.paidBy))} paid · split ${n} way${n === 1 ? '' : 's'} · ${fmtDate(e.at)}`;
      if (g.me) {
        const mine = (e.paidBy === g.me ? e.cents : 0) - (shares[g.me] || 0);
        if (mine > 0) meta += ` · <span class="pos">you lent ${formatMoney(mine)}</span>`;
        if (mine < 0) meta += ` · <span class="neg">you owe ${formatMoney(-mine)}</span>`;
      }
    }
    return `<li class="tap ${e.id === editingId ? 'editing' : ''}" data-expense="${esc(e.id)}">
      <div class="top"><span>${title}</span><span class="amt">${formatMoney(e.cents)}</span></div>
      <div class="meta">${meta}</div>
    </li>`;
  }).join('');
}

function renderBalances() {
  const g = group();
  const net = balances(g);
  const ids = liveMembers(g).map((m) => m.id);
  $('balance-list').innerHTML = liveMembers(g).map((m) => {
    const c = net[m.id] ?? 0;
    const label = c > 0 ? `gets back ${formatMoney(c)}` : c < 0 ? `owes ${formatMoney(-c)}` : 'settled';
    return `<div><dt>${esc(m.name)}${m.id === g.me ? ' (you)' : ''}</dt><dd class="${c > 0 ? 'pos' : c < 0 ? 'neg' : ''}">${label}</dd></div>`;
  }).join('');

  const transfers = settleUp(net, ids);
  $('settled').hidden = transfers.length > 0;
  $('settle-list').innerHTML = transfers.map((t, i) => {
    const to = g.members.find((m) => m.id === t.to);
    return `<li>
      <div class="top"><span>${esc(memberName(g, t.from))} → ${esc(to?.name ?? '?')}</span><span class="amt">${formatMoney(t.cents)}</span></div>
      <div class="row-btns">
        ${parsePayNow(to?.paynow) ? `<button class="secondary small" data-qr="${i}">PayNow QR</button>` : ''}
        <button class="secondary small" data-paid="${i}">Mark as paid</button>
      </div>
    </li>`;
  }).join('');
}

function renderPeople() {
  const g = group();
  $('me').innerHTML = `<option value="">Choose…</option>${options(g, g.me)}`;
  if (document.activeElement !== $('group-name')) $('group-name').value = g.name;
  const used = new Set(g.expenses.filter((e) => !e.deleted).flatMap((e) => [e.paidBy, ...Object.keys(sharesOf(e, g.members.map((m) => m.id)))]));
  $('member-list').innerHTML = liveMembers(g).map((m) => `
    <li>
      <input class="name" data-member-name="${esc(m.id)}" value="${esc(m.name)}" aria-label="Name">
      <input class="paynow" data-member-paynow="${esc(m.id)}" value="${esc(m.paynow ?? '')}" inputmode="tel" placeholder="PayNow no." aria-label="${esc(m.name)}'s PayNow number">
      <button class="icon-btn" data-remove-member="${esc(m.id)}" ${used.has(m.id) ? 'disabled title="Has expenses"' : ''} aria-label="Remove ${esc(m.name)}">✕</button>
    </li>`).join('');
}

// ---- Actions ----------------------------------------------------------------------------

function openGroup(id) {
  state.current = id;
  save();
  resetDraft();
  switchTab('expenses');
  render();
}

function createGroup() {
  const name = $('new-name').value.trim() || 'Group';
  const names = $('new-members').value.split(',').map((s) => s.trim()).filter(Boolean);
  if (names.length < 2) return toast('Add at least two people.');
  const now = Date.now();
  const members = names.map((n) => ({ id: newId(), name: n, updatedAt: now }));
  const g = { id: newId(), name, updatedAt: now, members, expenses: [], me: members[0].id };
  state.groups.unshift(g);
  $('new-name').value = '';
  $('new-members').value = '';
  openGroup(g.id);
}

function saveExpense() {
  const g = group();
  const e = formExpense();
  if (formProblem(e)) return;
  const i = g.expenses.findIndex((x) => x.id === e.id);
  if (i >= 0) g.expenses[i] = e; else g.expenses.push(e);
  save();
  toast(editingId ? 'Saved.' : `${e.kind === 'payment' ? 'Payment' : formatMoney(e.cents)} added.`);
  resetDraft();
  render();
}

function editExpense(id) {
  const g = group();
  const e = g.expenses.find((x) => x.id === id);
  if (!e) return;
  resetDraft();
  editingId = id;
  document.querySelector(`input[name="kind"][value="${e.kind === 'payment' ? 'payment' : 'expense'}"]`).checked = true;
  $('desc').value = e.kind === 'payment' ? '' : e.desc;
  $('amount').value = (e.cents / 100).toFixed(2);
  $('paid-by').innerHTML = options(g, e.paidBy);
  if (e.kind === 'payment') {
    $('paid-to').innerHTML = options(g, Object.keys(e.split.shares)[0]);
  } else {
    draft.split = e.split.type;
    if (e.split.type === 'equal') draft.among = new Set(e.split.among);
    if (e.split.type === 'weights') draft.weights = { ...e.split.weights };
    if (e.split.type === 'exact') draft.exact = Object.fromEntries(Object.entries(e.split.shares).map(([k, c]) => [k, (c / 100).toFixed(2)]));
    document.querySelector(`input[name="split"][value="${e.split.type}"]`).checked = true;
  }
  render();
  $('expense-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deleteExpense() {
  const g = group();
  const e = g.expenses.find((x) => x.id === editingId);
  if (!e || !confirm(`Delete "${e.desc}"?`)) return;
  e.deleted = true;
  touch(e);
  save();
  toast('Deleted.');
  resetDraft();
  render();
}

function recordPayment(t) {
  const g = group();
  g.expenses.push({ id: newId(), kind: 'payment', desc: 'Payment', cents: t.cents, paidBy: t.from, split: { type: 'exact', shares: { [t.to]: t.cents } }, at: Date.now(), updatedAt: Date.now() });
  save();
  toast(`${memberName(g, t.from)} paid ${memberName(g, t.to)} ${formatMoney(t.cents)}.`);
  render();
}

const currentTransfers = () => {
  const g = group();
  return settleUp(balances(g), liveMembers(g).map((m) => m.id));
};

let qrLib = null;
function loadQrLib() {
  qrLib ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = QR_LIB;
    s.onload = () => resolve(window.qrcode);
    s.onerror = () => { qrLib = null; reject(new Error('offline')); };
    document.head.append(s);
  });
  return qrLib;
}

let qrTransfer = null;
async function showQr(t) {
  const g = group();
  const to = g.members.find((m) => m.id === t.to);
  qrTransfer = t;
  $('qr-title').textContent = `${memberName(g, t.from)} pays ${to.name} ${formatMoney(t.cents)}`;
  $('qr-code').textContent = 'Loading…';
  $('qr-dialog').showModal();
  try {
    const qrcode = await loadQrLib();
    const qr = qrcode(0, 'M');
    qr.addData(payNowPayload({ proxy: parsePayNow(to.paynow), cents: t.cents, name: to.name, ref: g.name }));
    qr.make();
    $('qr-code').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
  } catch {
    $('qr-code').textContent = `Couldn't load the QR maker (are you offline?). Pay ${to.paynow} by PayNow instead.`;
  }
}

async function shareUrl() {
  return `${location.origin}${location.pathname}#g=${await encodeGroup(group())}`;
}

async function shareLink() {
  const g = group();
  const url = await shareUrl();
  if (navigator.share) {
    try { await navigator.share({ title: `${g.name} · Split`, text: `Our expenses for ${g.name}`, url }); return; } catch { /* cancelled: fall back to copying */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    $('share-note').textContent = 'Link copied. Paste it into your group chat.';
  } catch {
    $('share-note').textContent = url;
  }
}

async function copySummary() {
  const text = summaryText(group(), await shareUrl());
  try {
    await navigator.clipboard.writeText(text);
    toast('Summary copied.');
  } catch {
    if (navigator.share) navigator.share({ text }).catch(() => {});
  }
}

function removeMember(id) {
  const g = group();
  const m = g.members.find((x) => x.id === id);
  if (!m || !confirm(`Remove ${m.name}?`)) return;
  m.deleted = true;
  touch(m);
  if (g.me === id) g.me = null;
  draft.among.delete(id);
  save();
  render();
}

function addMember() {
  const g = group();
  const name = $('add-member-name').value.trim();
  if (!name) return;
  const m = touch({ id: newId(), name });
  g.members.push(m);
  draft.among.add(m.id);
  draft.weights[m.id] = 1;
  $('add-member-name').value = '';
  save();
  render();
}

function deleteGroup() {
  const g = group();
  if (!confirm(`Remove "${g.name}" from this phone? Friends keep their copies, and you can open a shared link to get it back.`)) return;
  state.groups = state.groups.filter((x) => x.id !== g.id);
  state.current = null;
  save();
  render();
}

// Opening a share link adds the group, or merges it into the copy already here.
async function importFromHash() {
  const m = location.hash.match(/^#g=([A-Za-z0-9_-]+)/);
  if (!m) return;
  history.replaceState(null, '', location.pathname);
  const incoming = await decodeGroup(m[1]);
  if (!incoming) return toast("That link couldn't be read. Ask for it to be sent again.");
  const existing = state.groups.find((g) => g.id === incoming.id);
  if (existing) {
    const { group: merged, changed } = mergeGroups(existing, incoming);
    Object.assign(existing, merged);
    toast(changed ? `Updated: ${changed} new or changed expense${changed === 1 ? '' : 's'}.` : 'Already up to date.');
  } else {
    state.groups.unshift({ ...incoming, me: null });
    toast(`Added "${incoming.name}". Pick who you are under People.`);
  }
  save();
  openGroup(incoming.id);
  if (!state.groups.find((g) => g.id === incoming.id).me) switchTab('people');
}

function switchTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
}

// ---- Wiring -----------------------------------------------------------------------------

$('back').addEventListener('click', (ev) => {
  if (!group()) return;
  ev.preventDefault();
  state.current = null;
  save();
  render();
});
$('group-list').addEventListener('click', (ev) => {
  const li = ev.target.closest('[data-group]');
  if (li) openGroup(li.dataset.group);
});
$('create-group').addEventListener('click', createGroup);
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

for (const id of ['desc', 'amount']) $(id).addEventListener('input', renderForm);
for (const id of ['charges', 'paid-by', 'paid-to']) $(id).addEventListener('change', renderForm);
document.querySelectorAll('input[name="kind"]').forEach((r) => r.addEventListener('change', renderForm));
document.querySelectorAll('input[name="split"]').forEach((r) => r.addEventListener('change', () => { draft.split = r.value; renderForm(); }));
$('split-rows').addEventListener('change', (ev) => {
  const id = ev.target.dataset.among;
  if (id) { if (ev.target.checked) draft.among.add(id); else draft.among.delete(id); renderForm(); }
});
$('split-rows').addEventListener('input', (ev) => {
  const id = ev.target.dataset.exact;
  if (!id) return;
  draft.exact[id] = ev.target.value;
  // Re-render only the status so the box being typed in keeps focus.
  const e = formExpense();
  const problem = formProblem(e);
  $('form-status').hidden = !problem;
  $('form-status').textContent = problem ?? '';
  $('save-expense').disabled = !!problem;
});
$('split-rows').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-weight]');
  if (!b) return;
  draft.weights[b.dataset.weight] = Math.max(0, (draft.weights[b.dataset.weight] ?? 0) + Number(b.dataset.delta));
  renderForm();
});
$('save-expense').addEventListener('click', saveExpense);
$('cancel-edit').addEventListener('click', () => { resetDraft(); render(); });
$('delete-expense').addEventListener('click', deleteExpense);
$('expense-list').addEventListener('click', (ev) => {
  const li = ev.target.closest('[data-expense]');
  if (li) editExpense(li.dataset.expense);
});

$('settle-list').addEventListener('click', (ev) => {
  const t = currentTransfers();
  const paid = ev.target.closest('[data-paid]');
  const qr = ev.target.closest('[data-qr]');
  if (paid) recordPayment(t[paid.dataset.paid]);
  if (qr) showQr(t[qr.dataset.qr]);
});
$('qr-close').addEventListener('click', () => $('qr-dialog').close());
$('qr-paid').addEventListener('click', () => { $('qr-dialog').close(); if (qrTransfer) recordPayment(qrTransfer); });
$('copy-summary').addEventListener('click', copySummary);

$('share-link').addEventListener('click', shareLink);
$('me').addEventListener('change', () => {
  group().me = $('me').value || null;
  if (!editingId) $('paid-by').innerHTML = ''; // so "Paid by" now defaults to you
  save();
  render();
});
$('group-name').addEventListener('change', () => {
  const g = group();
  g.name = $('group-name').value.trim() || g.name;
  touch(g);
  save();
  render();
});
$('member-list').addEventListener('change', (ev) => {
  const g = group();
  const nameId = ev.target.dataset.memberName;
  const payId = ev.target.dataset.memberPaynow;
  const m = g.members.find((x) => x.id === (nameId || payId));
  if (!m) return;
  if (nameId) m.name = ev.target.value.trim() || m.name;
  if (payId) {
    const v = ev.target.value.trim();
    if (v && !parsePayNow(v)) toast('That doesn\'t look like a Singapore mobile number or UEN.');
    m.paynow = v;
  }
  touch(m);
  save();
  render();
});
$('member-list').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-remove-member]');
  if (b) removeMember(b.dataset.removeMember);
});
$('add-member').addEventListener('click', addMember);
$('delete-group').addEventListener('click', deleteGroup);
window.addEventListener('hashchange', importFromHash);

resetDraft();
render();
importFromHash();
