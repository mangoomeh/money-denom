import {
  STEMS, STEM_PINYIN, BRANCHES, BRANCH_PINYIN, ANIMALS, ELEMENTS, TEN_GODS, LIFE_STAGES, LIFE_STAGES_EN,
  NAYIN, NAYIN_EN, HIDDEN_STEMS, BRANCH_ELEMENT, stemElement, isYang, computeChart, annualPillar, parseBirth,
} from '../src/bazi.js';

const STORAGE_KEY = 'bazi-v1';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CITIES = [
  ['Singapore', 103.82, 8], ['Kuala Lumpur', 101.69, 8], ['Penang', 100.33, 8], ['Jakarta', 106.85, 7],
  ['Bangkok', 100.5, 7], ['Ho Chi Minh City', 106.66, 7], ['Manila', 120.98, 8], ['Hong Kong', 114.17, 8],
  ['Macau', 113.54, 8], ['Taipei', 121.56, 8], ['Beijing', 116.4, 8], ['Shanghai', 121.47, 8],
  ['Guangzhou', 113.26, 8], ['Shenzhen', 114.06, 8], ['Xiamen', 118.09, 8], ['Chengdu', 104.07, 8],
  ['Ürümqi', 87.62, 8], ['Tokyo', 139.69, 9], ['Seoul', 126.98, 9], ['Sydney', 151.21, 10],
  ['London', -0.13, 0], ['New York', -74.01, -5], ['San Francisco', -122.42, -8],
];

const DM_NOTES = [
  'a tall tree: upright, growing, principled',
  'flowers and vines: flexible, adaptable, persistent',
  'the sun: warm, open, generous',
  'a candle flame: thoughtful, gentle, illuminating',
  'a mountain: steady, reliable, protective',
  'fertile soil: nurturing, accommodating, practical',
  'an axe or raw ore: decisive, direct, tough',
  'jewellery: refined, precise, sensitive',
  'the ocean: bold, resourceful, restless',
  'rain and mist: intuitive, quiet, perceptive',
];
const PILLAR_LABELS = { hour: 'Hour 时', day: 'Day 日', month: 'Month 月', year: 'Year 年' };

// ---- State ---------------------------------------------------------------------------------------

function load() {
  const defaults = { form: { name: '', date: '', time: '', noTime: false, gender: 'male', tz: 8, trueSolar: false, city: 'Singapore', lon: 103.82, ziDay: true }, saved: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.form) return { ...defaults, ...saved, form: { ...defaults.form, ...saved.form } };
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return defaults;
}
const state = load();
const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ } };
let chart = null;
let selectedLuck = null;

// ---- Form ----------------------------------------------------------------------------------------

function fillSelects() {
  const tzSel = $('tz');
  for (let h = -12; h <= 14; h += 0.5) {
    if (!Number.isInteger(h) && ![5.5, 9.5, -3.5, 3.5, 4.5, 6.5, 10.5].includes(h)) continue;
    const sign = h < 0 ? '−' : '+';
    const abs = Math.abs(h);
    tzSel.add(new Option(`UTC${sign}${Math.floor(abs)}${abs % 1 ? ':30' : ''}`, String(h)));
  }
  for (const [name] of CITIES) $('city').add(new Option(name, name));
  $('city').add(new Option('Other (enter longitude)', ''));
}

function writeForm(f) {
  $('name').value = f.name;
  $('date').value = f.date;
  $('time').value = f.time;
  $('no-time').checked = f.noTime;
  $('time').disabled = f.noTime;
  document.querySelector(`input[name="gender"][value="${f.gender}"]`).checked = true;
  $('tz').value = String(f.tz);
  $('true-solar').checked = f.trueSolar;
  $('solar-fields').hidden = !f.trueSolar;
  $('city').value = f.city;
  $('lon').value = f.lon;
  $('zi-day').checked = f.ziDay;
}

function readForm() {
  return {
    name: $('name').value.trim(),
    date: $('date').value,
    time: $('time').value,
    noTime: $('no-time').checked,
    gender: document.querySelector('input[name="gender"]:checked').value,
    tz: Number($('tz').value),
    trueSolar: $('true-solar').checked,
    city: $('city').value,
    lon: $('lon').value === '' ? null : Number($('lon').value),
    ziDay: $('zi-day').checked,
  };
}

function chartFrom(f) {
  if (!f.date) return { error: null };
  const birth = parseBirth(f.date, f.noTime ? '' : f.time);
  if (!birth) return { error: 'That date isn’t valid. Enter a date between 1800 and 2200.' };
  if (!f.noTime && !f.time) return { error: 'Enter the birth time, or tick “I don’t know the birth time”.' };
  return {
    chart: computeChart({
      ...birth, tzOffset: f.tz, gender: f.gender, ziStartsDay: f.ziDay,
      trueSolar: f.trueSolar && Number.isFinite(f.lon), longitude: f.lon,
    }),
  };
}

// ---- Rendering -----------------------------------------------------------------------------------

const elClass = (e) => `el-${ELEMENTS[e].id}`;
const branchElement = (b) => BRANCH_ELEMENT[b];
const godShort = (g) => TEN_GODS[g].zh;
const pad = (n) => String(n).padStart(2, '0');
const fmtLocal = (ms, tz) => {
  const d = new Date(ms + tz * 3600000);
  return `${d.getUTCDate()} ${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const ageText = (years) => {
  const y = Math.floor(years + 1e-9);
  const m = Math.round((years - y) * 12);
  return m ? `${y} y ${m} m` : `${y} y`;
};

function render() {
  const f = readForm();
  state.form = f;
  persist();
  const { chart: c, error } = chartFrom(f);
  chart = c || null;
  $('error').hidden = !error;
  $('error').textContent = error || '';
  $('result').hidden = !chart;
  if (!chart) {
    $('headline').textContent = 'Enter a birth date';
    $('subline').textContent = 'Year, month, day and hour pillars';
    renderLuck();
    return;
  }
  const names = chart.pillars.map((p) => (p.missing ? '··' : p.name));
  $('headline').textContent = names.join(' ');
  $('subline').textContent = `${f.name ? `${f.name} · ` : ''}${STEMS[chart.dayMaster]} ${isYang(chart.dayMaster) ? 'Yang' : 'Yin'} ${ELEMENTS[stemElement(chart.dayMaster)].en} day master · Year of the ${chart.animal}`;
  renderPillars();
  $('explain').textContent = 'Tap any label or value to see what it means.';
  renderDayMaster();
  renderElements();
  renderInteractions();
  renderDetails(f);
  selectedLuck = null;
  renderLuck();
}

const ROWS = [
  ['god', '十神', 'Ten god', 'How each stem relates to you, the day master (日主). It depends on whether the stem is your own element, the one you produce (Output), the one you control (Wealth), the one that controls you (Officer) or the one that produces you (Resource). Same or opposite yin/yang picks which of each pair.'],
  ['stem', '天干', 'Stem', 'The heavenly stem: the visible, outward side of the pillar. Its colour shows its element.'],
  ['branch', '地支', 'Branch', 'The earthly branch: the root of the pillar, with its animal. Its colour shows its main element.'],
  ['hidden', '藏干', 'Hidden', 'Hidden stems: the stems stored inside each branch, main one first, each with its ten god. The ten god shown for a branch comes from its main hidden stem.'],
  ['nayin', '纳音', 'Na Yin', 'A poetic element given to each of the 60 stem–branch pairs, such as 海中金 “Gold in the Sea”. It is a secondary reading, mostly used for the year pillar.'],
  ['stage', '长生', 'Stage', 'The twelve life stages (十二长生): how strong your day master is in each branch, on a cycle from Birth through Peak to Tomb and round again. A stage like 死 (Death) only means the day master is weak in that branch. It is not a prediction.'],
];
const GOD_NOTES = [
  'same element and yin/yang as you: peers, siblings, independence.',
  'same element, opposite yin/yang: competitors, boldness, spending.',
  'the element you produce, same yin/yang: creativity, enjoyment, easy-going expression.',
  'the element you produce, opposite yin/yang: talent, outspokenness, breaking rules.',
  'the element you control, same yin/yang: windfalls, business, opportunities.',
  'the element you control, opposite yin/yang: steady income, hard-earned money, thrift.',
  'the element that controls you, same yin/yang: pressure, ambition, courage.',
  'the element that controls you, opposite yin/yang: authority, discipline, reputation.',
  'the element that produces you, same yin/yang: unconventional learning, intuition.',
  'the element that produces you, opposite yin/yang: support, care, study.',
];
const STAGE_STRENGTH = ['strong', 'unsettled', 'growing', 'strong', 'strongest', 'weakening', 'weak', 'weak',
  'stored away', 'weakest', 'beginning again', 'gathering strength'];

function explain(code) {
  const [kind, a] = code.split(':');
  const n = Number(a);
  const dm = chart.dayMaster;
  const dmName = `${STEMS[dm]} (${isYang(dm) ? 'Yang' : 'Yin'} ${ELEMENTS[stemElement(dm)].en})`;
  switch (kind) {
    case 'row': { const r = ROWS.find((x) => x[0] === a); return `<strong>${r[1]} ${r[2]}</strong>: ${r[3]}`; }
    case 'dm': return `<strong>日主 Day master</strong>: the day stem ${dmName} stands for you. Every ten god is worked out relative to it.`;
    case 'god': return `<strong>${TEN_GODS[n].zh} ${TEN_GODS[n].en}</strong>: ${GOD_NOTES[n]} (Relative to your day master ${dmName}.)`;
    case 'stem': return `<strong>${STEMS[n]} ${STEM_PINYIN[n]}</strong>: ${isYang(n) ? 'Yang' : 'Yin'} ${ELEMENTS[stemElement(n)].en}.`;
    case 'branch': return `<strong>${BRANCHES[n]} ${BRANCH_PINYIN[n]}</strong>: the ${ANIMALS[n]}, ${ELEMENTS[branchElement(n)].en}. Hidden stems: ${HIDDEN_STEMS[n].map((h) => STEMS[h]).join(' ')}.`;
    case 'nayin': return `<strong>${NAYIN[n]}</strong>: “${NAYIN_EN[n]}”, the 纳音 element of this pillar.`;
    case 'stage': return `<strong>${LIFE_STAGES[n]} ${LIFE_STAGES_EN[n]}</strong>: stage ${n + 1} of 12. Your day master is ${STAGE_STRENGTH[n]} in this branch.`;
    case 'hour': return '<strong>Hour unknown</strong>: enter a birth time to get the hour pillar.';
    default: return '';
  }
}

function renderPillars() {
  $('chart-note').textContent = chart.input.timeKnown ? '' : '· hour unknown';
  const btn = (code, html, cls = '') => `<button type="button" class="pv ${cls}" data-x="${code}">${html}</button>`;
  const cells = { god: [], stem: [], branch: [], hidden: [], nayin: [], stage: [] };
  const heads = chart.pillars.map((p) => `<div class="pc ph${p.key === 'day' ? ' is-day' : ''}">${PILLAR_LABELS[p.key]}</div>`);
  for (const p of chart.pillars) {
    const day = p.key === 'day' ? ' is-day' : '';
    if (p.missing) {
      for (const k of Object.keys(cells)) cells[k].push(`<div class="pc missing">${btn('hour:', k === 'stem' || k === 'branch' ? '?' : '–', k === 'stem' || k === 'branch' ? 'glyph' : '')}</div>`);
      continue;
    }
    const ni = Math.floor(p.index / 2);
    cells.god.push(`<div class="pc${day}">${p.key === 'day' ? btn('dm:', '<strong>日主</strong>') : btn(`god:${p.stemGod}`, godShort(p.stemGod))}</div>`);
    cells.stem.push(`<div class="pc${day}">${btn(`stem:${p.stem}`, STEMS[p.stem], `glyph ${elClass(stemElement(p.stem))}`)}</div>`);
    cells.branch.push(`<div class="pc${day}">${btn(`branch:${p.branch}`, BRANCHES[p.branch], `glyph ${elClass(branchElement(p.branch))}`)}</div>`);
    cells.hidden.push(`<div class="pc hid${day}">${p.hidden.map((h) => btn(`god:${h.god}`, `<span class="${elClass(stemElement(h.stem))}">${STEMS[h.stem]}</span><small>${godShort(h.god)}</small>`)).join('')}</div>`);
    cells.nayin.push(`<div class="pc sub${day}">${btn(`nayin:${ni}`, NAYIN[ni])}</div>`);
    cells.stage.push(`<div class="pc sub${day}">${btn(`stage:${p.stage}`, LIFE_STAGES[p.stage])}</div>`);
  }
  $('pillars').innerHTML = `<div class="pc"></div>${heads.join('')}`
    + ROWS.map(([k, zh, en]) => `<div class="pc rl">${btn(`row:${k}`, `${zh}<small>${en}</small>`)}</div>${cells[k].join('')}`).join('');
}

function renderDayMaster() {
  const dm = chart.dayMaster;
  const e = stemElement(dm);
  const produces = ELEMENTS[(e + 1) % 5].en; const controls = ELEMENTS[(e + 2) % 5].en;
  const controlledBy = ELEMENTS[(e + 3) % 5].en; const producedBy = ELEMENTS[(e + 4) % 5].en;
  $('dm').innerHTML = `<span class="dm-glyph ${elClass(e)}">${STEMS[dm]}</span>
    <span><strong>${isYang(dm) ? 'Yang' : 'Yin'} ${ELEMENTS[e].en}</strong> (${STEM_PINYIN[dm]}): ${DM_NOTES[dm]}.<br>
    <small>Output: ${produces} · Wealth: ${controls} · Officer: ${controlledBy} · Resource: ${producedBy}</small></span>`;
}

function renderElements() {
  const max = Math.max(...chart.weighted, 1);
  $('elements').innerHTML = ELEMENTS.map((el, i) => `<li>
      <span class="el-name ${elClass(i)}">${el.zh} ${el.en}</span>
      <span class="bar"><span class="${elClass(i)}" style="width:${(chart.weighted[i] / max) * 100}%"></span></span>
      <span class="el-num"><strong>${chart.counts[i]}</strong> <small>${chart.weighted[i].toFixed(1)}</small></span>
    </li>`).join('');
}

function renderInteractions() {
  const short = ['Hour', 'Day', 'Month', 'Year'];
  const items = chart.interactions.map((x) => {
    const where = [...new Set(x.who)].map((i) => short[i]).join(' + ');
    const el = x.element != null ? ` → ${ELEMENTS[x.element].en}` : '';
    return `<li><strong>${esc(x.text)}</strong>${el} <small>(${where})</small></li>`;
  });
  $('interactions').innerHTML = items.length ? items.join('') : '<li>No combinations or clashes between these pillars.</li>';
}

function renderDetails(f) {
  const rows = [];
  const { jie, input } = chart;
  rows.push(['Solar year', `${chart.solarYear} (${chart.pillars[3].name}, ${chart.animal})`]);
  rows.push(['Month began', `${jie.prev.zh} ${jie.prev.en}, ${fmtLocal(jie.prev.ms, input.tzOffset)}`]);
  rows.push(['Next term', `${jie.next.zh} ${jie.next.en}, ${fmtLocal(jie.next.ms, input.tzOffset)}`]);
  if (chart.solarTime && chart.solarTime.longitudeMinutes != null) {
    const s = chart.solarTime;
    const shift = Math.round(s.longitudeMinutes + s.equationMinutes);
    rows.push(['True solar time', `${pad(s.hour)}:${pad(s.minute)} (${shift >= 0 ? '+' : '−'}${Math.abs(shift)} min)`]);
  } else if (f.trueSolar) {
    rows.push(['True solar time', 'Enter a longitude to use it']);
  }
  rows.push(['Void (空亡)', chart.voids.map((b) => BRANCHES[b]).join('')]);
  rows.push(['Luck pillars', `${chart.luck.forward ? 'Forward' : 'Backward'}, from age ${ageText(chart.luck.startYears + chart.luck.startMonthsRem / 12)}`]);
  $('details').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
}

function currentLuckIndex() {
  const now = Date.now();
  if (now < chart.luck.startMs) return -1;
  const yearsIn = (now - chart.luck.startMs) / (365.2422 * 86400000);
  return Math.min(Math.floor(yearsIn / 10), chart.luck.pillars.length - 1);
}

function cell(p, top, bottom, extra = '') {
  return `<span class="lp-top">${top}</span>
    <span class="lp-god">${godShort(p.stemGod)}</span>
    <span class="glyph ${elClass(stemElement(p.stem))}">${STEMS[p.stem]}</span>
    <span class="glyph ${elClass(branchElement(p.branch))}">${BRANCHES[p.branch]}</span>
    <span class="lp-god">${godShort(p.branchGod)}</span>
    <span class="lp-bottom">${bottom}</span>${extra}`;
}

function renderLuck() {
  if (!chart) {
    $('luck-note').textContent = 'Enter a birth date on the Chart tab.';
    $('luck').innerHTML = '';
    $('years-card').hidden = true;
    return;
  }
  const { luck } = chart;
  const now = currentLuckIndex();
  if (selectedLuck == null) selectedLuck = Math.max(now, 0);
  const birthYear = chart.input.year;
  $('luck-note').innerHTML = `${luck.forward ? 'Forward' : 'Backward'} from the month pillar. The first starts at age ${esc(ageText(luck.startYears + luck.startMonthsRem / 12))}`
    + ` (${new Date(luck.startMs).getUTCFullYear()}), from ${luck.gapDays.toFixed(1)} days to the ${luck.forward ? 'next' : 'previous'} solar term.`
    + `${chart.input.timeKnown ? '' : ' Without a birth time the start age is approximate.'} Tap one to see its years.`;
  $('luck').innerHTML = luck.pillars.map((p, i) => `<button type="button" class="lp${i === now ? ' now' : ''}" data-i="${i}" aria-pressed="${i === selectedLuck}">
      ${cell(p, `${Math.floor(p.age)}`, `${p.fromYear}`)}</button>`).join('');
  $('luck').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { selectedLuck = Number(b.dataset.i); renderLuck(); }));

  const lp = luck.pillars[selectedLuck];
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = lp.fromYear; y < lp.fromYear + 10; y++) years.push(annualPillar(y, chart.dayMaster));
  $('years-card').hidden = false;
  $('years-title').innerHTML = `Years in ${lp.name} <small>流年 · age ${Math.floor(lp.age)}–${Math.floor(lp.age) + 9}</small>`;
  $('years').innerHTML = years.map((p) => `<div class="lp${p.year === thisYear ? ' now' : ''}">
      ${cell(p, `${p.year}`, `age ${p.year - birthYear}`)}</div>`).join('');
  for (const row of [$('luck'), $('years')]) {
    const target = row.querySelector('[aria-pressed="true"], .now');
    if (target) row.scrollLeft = Math.max(0, target.offsetLeft - row.offsetLeft - row.clientWidth / 2 + target.offsetWidth / 2);
  }
}

// ---- Saved charts --------------------------------------------------------------------------------

function renderSaved() {
  $('saved-empty').hidden = state.saved.length > 0;
  $('saved').innerHTML = state.saved.map((s, i) => {
    const c = chartFrom(s.form).chart;
    const pillars = c ? c.pillars.map((p) => (p.missing ? '··' : p.name)).join(' ') : '';
    return `<li><span><strong>${esc(s.form.name || 'Unnamed')}</strong><small>${esc(s.form.date)}${s.form.noTime ? '' : ` ${esc(s.form.time)}`} · ${pillars}</small></span>
      <button class="secondary small" data-open="${i}" type="button">Open</button>
      <button class="secondary small" data-del="${i}" type="button" aria-label="Delete">✕</button></li>`;
  }).join('');
  $('saved').querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
    writeForm({ ...state.form, ...state.saved[Number(b.dataset.open)].form });
    render();
    switchTab('chart');
  }));
  $('saved').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    const s = state.saved[Number(b.dataset.del)];
    if (!confirm(`Delete ${s.form.name || 'this chart'}?`)) return;
    state.saved.splice(Number(b.dataset.del), 1);
    persist();
    renderSaved();
  }));
}

function saveChart() {
  if (!chart) return;
  const form = readForm();
  const same = state.saved.findIndex((s) => s.form.name === form.name && s.form.date === form.date && s.form.time === form.time);
  if (same >= 0) state.saved[same] = { form };
  else state.saved.unshift({ form });
  persist();
  renderSaved();
  $('save').textContent = 'Saved ✓';
  setTimeout(() => { $('save').textContent = 'Save chart'; }, 1500);
}

// ---- Start-up ------------------------------------------------------------------------------------

function switchTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  window.scrollTo(0, 0);
}

fillSelects();
writeForm(state.form);
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
document.querySelectorAll('[data-panel="chart"] input, [data-panel="chart"] select').forEach((el) => el.addEventListener('input', () => {
  if (el.id === 'no-time') $('time').disabled = el.checked;
  if (el.id === 'true-solar') $('solar-fields').hidden = !el.checked;
  if (el.id === 'city') {
    const city = CITIES.find(([n]) => n === el.value);
    if (city) { $('lon').value = city[1]; $('tz').value = String(city[2]); }
  }
  if (el.id === 'lon') $('city').value = '';
  render();
}));
$('save').addEventListener('click', saveChart);
$('pillars').addEventListener('click', (e) => {
  const b = e.target.closest('[data-x]');
  if (!b || !chart) return;
  $('pillars').querySelectorAll('.pv.on').forEach((x) => x.classList.remove('on'));
  b.classList.add('on');
  $('explain').innerHTML = explain(b.dataset.x);
});
render();
renderSaved();
