import {
  DENOMINATIONS, emptyCounts, totalCents, parseAmount, formatCents,
  checkTransaction, applyDelta, lowDenominations,
} from './src/cash.js';

const STORAGE_KEY = 'petty-cash-v1';
const $ = (id) => document.getElementById(id);

// ---- Persistent state -------------------------------------------------------

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.stash) return { threshold: 2, history: [], ...saved, stash: { ...emptyCounts(), ...saved.stash } };
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { stash: emptyCounts(), threshold: 2, history: [], setupDone: false };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save — your browser is blocking storage.');
  }
}

const state = load();

// ---- Draft (unsaved) state --------------------------------------------------

let draft = { paid: emptyCounts(), change: emptyCounts() };
let stashDraft = null; // non-null while editing inventory counts

// ---- Rendering --------------------------------------------------------------

function stepperRow(d, count, { onChange, canAdd = true, note = '', noteClass = '' }) {
  const li = document.createElement('li');
  li.className = count === 0 ? 'zero' : '';
  li.innerHTML = `
    <div class="label"><strong>${d.label}</strong><small class="${noteClass}">${note}</small></div>
    <div class="stepper">
      <button type="button" aria-label="Remove one ${d.label}" ${count === 0 ? 'disabled' : ''}>−</button>
      <span class="count" aria-live="polite">${count}</span>
      <button type="button" aria-label="Add one ${d.label}" ${canAdd ? '' : 'disabled'}>+</button>
    </div>`;
  const [minus, plus] = li.querySelectorAll('button');
  minus.addEventListener('click', () => onChange(-1));
  plus.addEventListener('click', () => onChange(1));
  return li;
}

function renderBalance() {
  $('balance').textContent = formatCents(totalCents(state.stash));
  const low = lowDenominations(state.stash, state.threshold);
  const warn = $('low-warning');
  warn.hidden = low.length === 0 || !state.setupDone;
  warn.textContent = low.length <= 3
    ? `Running low: ${low.map((d) => d.label).join(', ')}`
    : `Running low on ${low.length} notes and coins — see Cash on hand`;
}

function renderSpend() {
  const amountCents = parseAmount($('amount').value);

  const paidList = $('paid-list');
  paidList.replaceChildren(...DENOMINATIONS.map((d) => {
    const have = state.stash[d.id];
    const used = draft.paid[d.id];
    return stepperRow(d, used, {
      canAdd: used < have,
      note: `${formatCents(d.cents)} each · ${have - used} left in stash`,
      noteClass: used > have ? 'over' : '',
      onChange: (delta) => { draft.paid[d.id] = Math.max(0, used + delta); renderSpend(); },
    });
  }));

  const changeList = $('change-list');
  changeList.replaceChildren(...DENOMINATIONS.map((d) => {
    const got = draft.change[d.id];
    return stepperRow(d, got, {
      note: `${formatCents(d.cents)} each`,
      onChange: (delta) => { draft.change[d.id] = Math.max(0, got + delta); renderSpend(); },
    });
  }));

  const r = checkTransaction({ amountCents, paid: draft.paid, change: draft.change, stash: state.stash });
  $('sum-amount').textContent = formatCents(amountCents ?? 0);
  $('sum-paid').textContent = formatCents(r.paidCents);
  $('sum-change').textContent = `−${formatCents(r.changeCents)}`;
  $('sum-change-row').hidden = r.changeCents === 0;
  $('sum-diff').textContent = formatCents(r.differenceCents, { sign: true });

  const status = $('status');
  const messages = {
    'no-amount': ['neutral', $('amount').value.trim() && amountCents == null
      ? 'That purchase amount doesn’t look right — use a number like 10.30.'
      : 'Enter the purchase amount to get started.'],
    'no-cash': ['neutral', 'Now add the notes and coins you took out of the stash.'],
    overdrawn: ['bad', 'You’ve selected more of a note or coin than you have in the stash.'],
    'too-much': ['warn', `Amount mismatch: you’ve selected ${formatCents(r.differenceCents)} too much cash. Remove some, or add the change you received.`],
    'too-little': ['warn', `Amount mismatch: you’re ${formatCents(-r.differenceCents)} short. Add more cash until the difference is $0.00.`],
    ok: ['ok', 'Amounts tally. Confirm to deduct this from your cash on hand.'],
  };
  const [tone, text] = messages[r.status];
  status.className = `status ${tone}`;
  status.textContent = text;
  $('confirm-tx').disabled = !r.canConfirm;
}

function renderStash() {
  const editing = stashDraft !== null;
  const counts = editing ? stashDraft : state.stash;
  const low = new Set(lowDenominations(state.stash, state.threshold).map((d) => d.id));

  $('stash-list').replaceChildren(...DENOMINATIONS.map((d) => {
    const n = counts[d.id];
    if (editing) {
      return stepperRow(d, n, {
        note: `${formatCents(d.cents)} each · ${formatCents(n * d.cents)}`,
        onChange: (delta) => { stashDraft[d.id] = Math.max(0, n + delta); renderStash(); },
      });
    }
    const li = document.createElement('li');
    li.className = n === 0 ? 'zero' : '';
    const isLow = low.has(d.id) && state.setupDone;
    li.innerHTML = `
      <div class="label"><strong>${d.label}</strong>
        <small class="${isLow ? 'low' : ''}">${formatCents(n * d.cents)}${isLow ? ' · running low' : ''}</small></div>
      <span class="count">${n}</span>`;
    return li;
  }));

  $('edit-stash').hidden = editing;
  $('stash-actions').hidden = !editing;
  const intro = state.setupDone
    ? 'Count what’s physically in the box.'
    : 'Welcome! Start by entering how many of each note and coin you have right now.';
  $('stash-hint').textContent = editing
    ? `${intro} Total: ${formatCents(totalCents(counts))}`
    : 'How many of each note and coin are in the petty cash box.';
  $('threshold').value = state.threshold;
}

function describeCounts(counts) {
  return DENOMINATIONS.filter((d) => counts[d.id]).map((d) => `${counts[d.id]} × ${d.label}`).join(', ');
}

function canUndo(entry) {
  if (entry.undone) return false;
  const reverted = revertedStash(entry);
  return DENOMINATIONS.every((d) => reverted[d.id] >= 0);
}

function revertedStash(entry) {
  if (entry.type === 'adjust') {
    // Undo the change in counts, keeping anything that happened since.
    const next = { ...state.stash };
    for (const d of DENOMINATIONS) next[d.id] += (entry.before[d.id] || 0) - (entry.after[d.id] || 0);
    return next;
  }
  return applyDelta(state.stash, entry.paid, entry.change, -1);
}

function renderHistory() {
  const list = $('history-list');
  $('history-empty').hidden = state.history.length > 0;
  list.replaceChildren(...state.history.map((entry) => {
    const li = document.createElement('li');
    li.className = entry.undone ? 'undone' : '';
    const when = new Date(entry.at).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' });
    let title, amount, detail;
    if (entry.type === 'adjust') {
      const delta = totalCents(entry.after) - totalCents(entry.before);
      title = entry.wasSetUp ? 'Counts adjusted' : 'Opening balance';
      amount = formatCents(delta, { sign: true });
      detail = `New total ${formatCents(totalCents(entry.after))}`;
    } else {
      title = entry.note || 'Purchase';
      amount = `−${formatCents(entry.amountCents)}`;
      detail = `Paid: ${describeCounts(entry.paid)}`
        + (totalCents(entry.change) ? ` · Change: ${describeCounts(entry.change)}` : '');
    }
    li.innerHTML = `
      <div class="top"><strong></strong><span class="amt">${amount}</span></div>
      <div class="meta">${when}${entry.undone ? ' · undone' : ''}</div>
      <div class="denom-detail">${detail}</div>`;
    li.querySelector('strong').textContent = title; // user-entered text
    if (!entry.undone) {
      const btn = document.createElement('button');
      btn.className = 'secondary small undo';
      btn.textContent = 'Undo';
      if (!canUndo(entry)) {
        btn.disabled = true;
        btn.title = 'Can’t undo: some of these notes or coins have since been spent.';
      }
      btn.addEventListener('click', () => undo(entry.id));
      li.append(btn);
    }
    return li;
  }));
}

function render() {
  renderBalance();
  renderSpend();
  renderStash();
  renderHistory();
}

// ---- Actions ----------------------------------------------------------------

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function resetDraft() {
  draft = { paid: emptyCounts(), change: emptyCounts() };
  $('amount').value = '';
  $('note').value = '';
  $('change-card').open = false;
}

function confirmPurchase() {
  const amountCents = parseAmount($('amount').value);
  const r = checkTransaction({ amountCents, paid: draft.paid, change: draft.change, stash: state.stash });
  if (!r.canConfirm) return; // only ever deduct when the amounts tally
  state.stash = applyDelta(state.stash, draft.paid, draft.change);
  state.history.unshift({
    id: newId(), type: 'purchase', at: new Date().toISOString(),
    note: $('note').value.trim(), amountCents, paid: { ...draft.paid }, change: { ...draft.change },
  });
  save();
  resetDraft();
  render();
  toast(`Purchase of ${formatCents(amountCents)} recorded.`);
}

function undo(id) {
  const entry = state.history.find((e) => e.id === id);
  if (!entry || !canUndo(entry)) return;
  if (!confirm('Undo this transaction and put the cash back?')) return;
  state.stash = revertedStash(entry);
  entry.undone = true;
  save();
  render();
  toast('Transaction undone.');
}

function startEditStash() {
  stashDraft = { ...state.stash };
  renderStash();
}

function saveStash() {
  const before = { ...state.stash };
  const changed = DENOMINATIONS.some((d) => before[d.id] !== stashDraft[d.id]);
  if (changed) {
    state.history.unshift({
      id: newId(), type: 'adjust', at: new Date().toISOString(),
      before, after: { ...stashDraft }, wasSetUp: state.setupDone,
    });
    state.stash = stashDraft;
  }
  const firstSetup = !state.setupDone;
  state.setupDone = true;
  stashDraft = null;
  save();
  render();
  if (firstSetup) switchTab('spend');
  toast(changed ? 'Counts saved.' : 'No changes.');
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

// ---- Wiring -----------------------------------------------------------------

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
$('amount').addEventListener('input', renderSpend);
$('reset-tx').addEventListener('click', () => { resetDraft(); renderSpend(); });
$('confirm-tx').addEventListener('click', confirmPurchase);
$('edit-stash').addEventListener('click', startEditStash);
$('cancel-stash').addEventListener('click', () => { stashDraft = null; renderStash(); });
$('save-stash').addEventListener('click', saveStash);
$('threshold').addEventListener('change', (e) => {
  state.threshold = Math.max(0, Math.floor(Number(e.target.value) || 0));
  save();
  render();
});

render();
if (!state.setupDone) {
  // First run: start with the opening balance setup.
  switchTab('stash');
  startEditStash();
}
