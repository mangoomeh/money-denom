import { parseAmount, formatCents } from '../src/cash.js';
import {
  DEFAULT_PLATES, DEFAULT_RATES, billLines, computeBill, parsePercent, monthSummary,
} from '../src/sushiro.js';

const STORAGE_KEY = 'sushiro-v1';
const $ = (id) => document.getElementById(id);

// ---- Persistent state -------------------------------------------------------

function freshMeal(outlet = '') {
  return { counts: {}, specials: [], outlet };
}

function load() {
  const defaults = {
    plates: DEFAULT_PLATES.map((p) => ({ ...p })),
    rates: { ...DEFAULT_RATES },
    meal: freshMeal(),
    visits: [],
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.plates)) return { ...defaults, ...saved };
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return defaults;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save — your browser is blocking storage.');
  }
}

const state = load();

const pct = (bp) => `${bp / 100}%`;
const currentBill = () => {
  const lines = billLines(state.plates, state.meal.counts, state.meal.specials);
  return { lines, bill: computeBill(lines, state.rates) };
};

// ---- Rendering --------------------------------------------------------------

function renderMeal() {
  const { lines, bill } = currentBill();

  $('header-total').textContent = formatCents(bill.totalCents);
  const extras = state.meal.specials.length ? ` + ${state.meal.specials.length} special${state.meal.specials.length > 1 ? 's' : ''}` : '';
  $('header-sub').textContent = `${bill.plateCount} plate${bill.plateCount === 1 ? '' : 's'}${extras}`;

  $('plate-list').replaceChildren(...state.plates.map((p) => {
    const n = state.meal.counts[p.id] || 0;
    const li = document.createElement('li');
    li.className = n === 0 ? 'zero' : '';
    li.innerHTML = `
      <span class="plate-dot" style="--plate:${p.color}"></span>
      <div class="label"><strong></strong><small>${formatCents(p.cents)} each${n ? ` · ${formatCents(n * p.cents)}` : ''}</small></div>
      <div class="stepper">
        <button type="button" ${n === 0 ? 'disabled' : ''}>−</button>
        <span class="count" aria-live="polite">${n}</span>
        <button type="button">+</button>
      </div>`;
    li.querySelector('strong').textContent = p.name;
    const [minus, plus] = li.querySelectorAll('button');
    minus.setAttribute('aria-label', `Remove one ${p.name} plate`);
    plus.setAttribute('aria-label', `Add one ${p.name} plate`);
    minus.addEventListener('click', () => changeCount(p.id, -1));
    plus.addEventListener('click', () => changeCount(p.id, 1));
    return li;
  }));

  $('special-list').replaceChildren(...state.meal.specials.map((s) => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="label"></div><span class="price">${formatCents(s.cents)}</span>
      <button type="button" class="icon-btn" aria-label="Remove">✕</button>`;
    li.querySelector('.label').textContent = s.name || 'Special';
    li.querySelector('button').addEventListener('click', () => removeSpecial(s.id));
    return li;
  }));

  $('outlet').value = state.meal.outlet;
  $('label-service').textContent = `Service charge (${pct(state.rates.serviceBp)})`;
  $('label-gst').textContent = `GST (${pct(state.rates.gstBp)})`;
  $('row-service').hidden = state.rates.serviceBp === 0;
  $('row-gst').hidden = state.rates.gstBp === 0;
  $('bill-subtotal').textContent = formatCents(bill.subtotalCents);
  $('bill-service').textContent = formatCents(bill.serviceCents);
  $('bill-gst').textContent = formatCents(bill.gstCents);
  $('bill-total').textContent = formatCents(bill.totalCents);
  $('save-visit').disabled = lines.length === 0;
}

function renderVisits() {
  const s = monthSummary(state.visits);
  $('stat-visits').textContent = s.visits;
  $('stat-plates').textContent = s.plates;
  $('stat-spent').textContent = formatCents(s.totalCents);

  $('visits-empty').hidden = state.visits.length > 0;
  $('visit-list').replaceChildren(...state.visits.map((v) => {
    const li = document.createElement('li');
    const when = new Date(v.at).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' });
    li.innerHTML = `
      <details class="visit">
        <summary>
          <div class="top"><strong></strong><span class="amt">${formatCents(v.bill.totalCents)}</span></div>
          <div class="meta">${when} · ${v.bill.plateCount} plate${v.bill.plateCount === 1 ? '' : 's'}</div>
        </summary>
        <ul class="lines"></ul>
        <button class="secondary small undo" type="button">Delete visit</button>
      </details>`;
    li.querySelector('strong').textContent = v.outlet || 'Sushiro';
    const rows = [
      ...v.lines.map((l) => [l.qty > 1 ? `${l.qty} × ${l.name}` : l.name, l.cents]),
      ['Subtotal', v.bill.subtotalCents],
      ...(v.rates.serviceBp ? [[`Service charge (${pct(v.rates.serviceBp)})`, v.bill.serviceCents]] : []),
      ...(v.rates.gstBp ? [[`GST (${pct(v.rates.gstBp)})`, v.bill.gstCents]] : []),
    ];
    li.querySelector('.lines').replaceChildren(...rows.map(([label, cents]) => {
      const row = document.createElement('li');
      row.innerHTML = '<span></span><span></span>';
      row.children[0].textContent = label;
      row.children[1].textContent = formatCents(cents);
      return row;
    }));
    li.querySelector('button').addEventListener('click', () => deleteVisit(v.id));
    return li;
  }));
}

function renderSettings() {
  $('tier-list').replaceChildren(...state.plates.map((p) => {
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.innerHTML = `
      <input type="color" aria-label="Colour">
      <input class="tier-name" aria-label="Name" autocomplete="off">
      <input class="tier-price" aria-label="Price" inputmode="decimal" autocomplete="off">
      <button type="button" class="icon-btn" aria-label="Remove colour">✕</button>`;
    const [color, name, price] = row.querySelectorAll('input');
    color.value = p.color;
    name.value = p.name;
    price.value = (p.cents / 100).toFixed(2);
    color.addEventListener('change', () => updateTier(p.id, { color: color.value }));
    name.addEventListener('change', () => updateTier(p.id, { name: name.value.trim() || p.name }));
    price.addEventListener('change', () => {
      const cents = parseAmount(price.value);
      if (cents == null) {
        toast('Enter a price like 2.30');
        price.value = (p.cents / 100).toFixed(2);
        return;
      }
      updateTier(p.id, { cents });
    });
    row.querySelector('button').addEventListener('click', () => removeTier(p.id));
    return row;
  }));
  $('rate-service').value = state.rates.serviceBp / 100;
  $('rate-gst').value = state.rates.gstBp / 100;
}

function render() {
  renderMeal();
  renderVisits();
  renderSettings();
}

// ---- Actions ----------------------------------------------------------------

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function changeCount(plateId, delta) {
  state.meal.counts[plateId] = Math.max(0, (state.meal.counts[plateId] || 0) + delta);
  save();
  renderMeal();
  if (delta > 0) {
    const i = state.plates.findIndex((p) => p.id === plateId);
    $('plate-list').children[i].querySelector('.count').classList.add('pop');
  }
}

function addSpecial(e) {
  e.preventDefault();
  const cents = parseAmount($('special-price').value);
  if (cents == null || cents <= 0) {
    toast('Enter a price like 4.80');
    return;
  }
  state.meal.specials.push({ id: newId(), name: $('special-name').value.trim(), cents });
  $('special-name').value = '';
  $('special-price').value = '';
  save();
  renderMeal();
}

function removeSpecial(id) {
  state.meal.specials = state.meal.specials.filter((s) => s.id !== id);
  save();
  renderMeal();
}

function clearMeal() {
  if (!currentBill().lines.length) return;
  if (!confirm('Clear all plates and specials from this meal?')) return;
  state.meal = freshMeal(state.meal.outlet);
  save();
  renderMeal();
}

function saveVisit() {
  const { lines, bill } = currentBill();
  if (!lines.length) return;
  // Store a snapshot so later price changes in Settings don't rewrite history.
  state.visits.unshift({
    id: newId(), at: new Date().toISOString(), outlet: state.meal.outlet.trim(),
    lines, bill, rates: { ...state.rates },
  });
  state.meal = freshMeal(state.meal.outlet);
  save();
  render();
  toast(`Visit saved: ${formatCents(bill.totalCents)}`);
}

function deleteVisit(id) {
  if (!confirm('Delete this saved visit?')) return;
  state.visits = state.visits.filter((v) => v.id !== id);
  save();
  renderVisits();
}

function updateTier(id, changes) {
  Object.assign(state.plates.find((p) => p.id === id), changes);
  save();
  renderMeal();
}

function removeTier(id) {
  const tier = state.plates.find((p) => p.id === id);
  if (state.meal.counts[id] && !confirm(`Remove ${tier.name}? Its plates will be taken off this meal.`)) return;
  state.plates = state.plates.filter((p) => p.id !== id);
  delete state.meal.counts[id];
  save();
  render();
}

function addTier() {
  state.plates.push({ id: newId(), name: 'New colour', color: '#3b82f6', cents: 0 });
  save();
  render();
  const names = document.querySelectorAll('.tier-name');
  names[names.length - 1].select();
}

function resetTiers() {
  if (!confirm('Reset plate colours and prices to the defaults? Plates on this meal will be cleared.')) return;
  state.plates = DEFAULT_PLATES.map((p) => ({ ...p }));
  state.meal.counts = {};
  save();
  render();
}

function updateRate(input, key) {
  const bp = parsePercent(input.value);
  if (bp == null) {
    toast('Enter a percentage like 10');
  } else {
    state.rates[key] = bp;
    save();
  }
  render();
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
$('special-form').addEventListener('submit', addSpecial);
$('outlet').addEventListener('input', (e) => { state.meal.outlet = e.target.value; save(); });
$('clear-meal').addEventListener('click', clearMeal);
$('save-visit').addEventListener('click', saveVisit);
$('add-tier').addEventListener('click', addTier);
$('reset-tiers').addEventListener('click', resetTiers);
$('rate-service').addEventListener('change', (e) => updateRate(e.target, 'serviceBp'));
$('rate-gst').addEventListener('change', (e) => updateRate(e.target, 'gstBp'));

render();
