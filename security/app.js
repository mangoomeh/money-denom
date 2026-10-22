import {
  kevRecent, nvdItems, nvdUrl, epssMap, epssUrls, formatEpss, hnItems, hnUrl, mergeNews, cvesIn,
  parseKeywords, matchKeywords, parsePackages, osvBatchBody, osvResults, osvSummary, ago,
} from '../src/security.js';
import { $, esc, switchTab, toast } from '../shared/ui.js';

const STORAGE_KEY = 'security-v1'; // the watch list and packages (backed up)
const CACHE_KEY = 'security-cache'; // recent NVD and Hacker News results (not backed up)
const NVD_TTL = 60 * 60000;
const HN_TTL = 30 * 60000;
const KEV_URL = 'https://raw.githubusercontent.com/cisagov/kev-data/main/known_exploited_vulnerabilities.json';

// ---- Persistent state -----------------------------------------------------------------

function load(key, fallback) {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key)) }; } catch { return fallback; }
}
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not remembered */ }
}

const state = load(STORAGE_KEY, { keywords: '', packages: '' });
const cache = load(CACHE_KEY, { nvd: {}, hn: null });
const save = () => store(STORAGE_KEY, state);
const saveCache = () => store(CACHE_KEY, cache);
const keywords = () => parseKeywords(state.keywords);

let data = null; // data.json: { builtAt, kev, news, sources }
let kev = [];
let nvd = [];
let news = [];
const epss = {};

// ---- Loading ----------------------------------------------------------------------------

async function getJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function status(id, text, kind = 'neutral') {
  $(id).hidden = !text;
  $(id).className = `status ${kind}`;
  $(id).textContent = text || '';
}

// The site's own data.json (made every few hours), or CISA's list directly if it's missing.
async function loadData() {
  try {
    data = await getJson('data.json', { cache: 'no-cache' });
  } catch {
    data = null;
  }
  if (data?.kev?.items?.length) {
    kev = data.kev.items;
  } else {
    status('kev-status', 'Getting CISA\'s list…');
    try {
      kev = kevRecent(await getJson(KEV_URL), 90);
    } catch {
      status('kev-status', "Couldn't load CISA's list. Check your connection and reopen the app.", 'bad');
    }
  }
  status('kev-status', '');
  news = mergeNews(data?.news || [], cache.hn?.items || []);
  render();
  loadEpss(kev.map((v) => v.cve));
  loadHn();
}

async function loadEpss(cves) {
  const missing = cves.filter((c) => !(c in epss));
  for (const c of missing) epss[c] = null;
  for (const url of epssUrls(missing)) {
    try {
      Object.assign(epss, epssMap(await getJson(url)));
    } catch { /* scores just won't show */ }
  }
  render();
}

async function loadHn() {
  if (cache.hn && Date.now() - cache.hn.at < HN_TTL) return;
  try {
    cache.hn = { at: Date.now(), items: hnItems(await getJson(hnUrl())) };
    saveCache();
    news = mergeNews(data?.news || [], cache.hn.items);
    renderNews();
  } catch { /* the news sites alone are fine */ }
}

const nvdKey = () => `${radio('nvd-sev')}-${radio('nvd-days')}`;

async function loadNvd(force = false) {
  const key = nvdKey();
  const hit = cache.nvd[key];
  if (hit && !force && Date.now() - hit.at < NVD_TTL) {
    nvd = hit.items;
    renderNvd();
    return loadEpss(nvd.map((v) => v.cve));
  }
  status('nvd-status', 'Getting the latest from the NVD…');
  try {
    const items = nvdItems(await getJson(nvdUrl({ days: Number(radio('nvd-days')), severity: radio('nvd-sev') })));
    // Keep only the latest result for each choice, so the cache stays small.
    cache.nvd = { [key]: { at: Date.now(), items } };
    saveCache();
    if (key !== nvdKey()) return;
    nvd = items;
    status('nvd-status', '');
  } catch {
    nvd = hit?.items || [];
    status('nvd-status', `The NVD didn't answer (it limits how often it can be asked). ${hit ? 'Showing the last results.' : 'Try again in a minute.'}`, 'warn');
  }
  renderNvd();
  loadEpss(nvd.map((v) => v.cve));
}

// ---- Rendering --------------------------------------------------------------------------

const radio = (name) => document.querySelector(`input[name="${name}"]:checked`).value;
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const nvdLink = (cve) => `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve)}`;
// Only web links are ever made clickable, whatever a feed contains.
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');

function chips(cve, matched, extra = '') {
  const e = epss[cve];
  const epssChip = e ? `<span class="pill ${e.epss >= 0.1 ? 'hot' : ''}" title="Chance of exploitation in the next 30 days (EPSS)">EPSS ${formatEpss(e)}</span>` : '';
  const watch = matched.map((k) => `<span class="pill watch">★ ${esc(k)}</span>`).join('');
  return `${extra}${epssChip}${watch}`;
}

function render() {
  renderHeader();
  renderKev();
  renderNews();
  renderWatch();
}

function renderHeader() {
  const week = kev.filter((v) => v.added >= daysAgo(7));
  const kw = keywords();
  const mine = kw.length ? kev.filter((v) => matchKeywords(`${v.vendor} ${v.product} ${v.name}`, kw).length && v.added >= daysAgo(30)).length : 0;
  $('headline').textContent = `${week.length} newly exploited`;
  const parts = ['this week, per CISA'];
  if (kw.length) parts.push(`${mine} on your watch list this month`);
  else parts.push('set a watch list to see what affects you');
  $('subline').textContent = parts.join(' · ');
}

function renderKev() {
  const days = Number(radio('kev-days'));
  const q = $('kev-search').value.trim().toLowerCase();
  const kw = keywords();
  const list = kev.filter((v) => v.added >= daysAgo(days))
    .map((v) => ({ v, matched: matchKeywords(`${v.vendor} ${v.product} ${v.name}`, kw) }))
    .filter(({ v, matched }) => (!q || `${v.cve} ${v.vendor} ${v.product} ${v.name}`.toLowerCase().includes(q)) && (!$('kev-mine').checked || matched.length));
  $('kev-list').innerHTML = list.map(({ v, matched }) => `
    <li class="vuln ${matched.length ? 'mine' : ''}">
      <details>
        <summary>
          <div class="top"><strong>${esc(v.vendor)} ${esc(v.product)}</strong><span class="when">${esc(ago(v.added))}</span></div>
          <div class="sub">${esc(v.cve)} · ${esc(v.name.replace(`${v.vendor} ${v.product} `, ''))}</div>
          <div class="pills">${chips(v.cve, matched, v.ransomware ? '<span class="pill bad">Used in ransomware</span>' : '')}</div>
        </summary>
        <p>${esc(v.summary)}</p>
        <p class="hint"><strong>What to do:</strong> ${esc(v.action.split('. ')[0])}. US federal deadline: ${esc(v.due)}.</p>
        <p class="links"><a href="${nvdLink(v.cve)}" target="_blank" rel="noopener">NVD ↗</a>
          <a href="https://www.cve.org/CVERecord?id=${esc(v.cve)}" target="_blank" rel="noopener">CVE.org ↗</a>
          <a href="https://www.google.com/search?q=${encodeURIComponent(`${v.cve} ${v.vendor} patch`)}" target="_blank" rel="noopener">Search ↗</a></p>
      </details>
    </li>`).join('') || `<li class="empty">${$('kev-mine').checked ? 'Nothing on your watch list' : 'Nothing'} added in the last ${days} days.</li>`;
}

function renderNvd() {
  const kw = keywords();
  const list = nvd.map((v) => ({ v, matched: matchKeywords(v.summary, kw) })).filter(({ matched }) => !$('nvd-mine').checked || matched.length);
  $('nvd-list').innerHTML = list.slice(0, 200).map(({ v, matched }) => `
    <li class="vuln ${matched.length ? 'mine' : ''}">
      <details>
        <summary>
          <div class="top"><span><span class="score ${v.severity}">${v.score ?? '–'}</span> <strong>${esc(v.cve)}</strong></span><span class="when">${esc(ago(v.published))}</span></div>
          <div class="sub clamp">${esc(v.summary)}</div>
          <div class="pills">${chips(v.cve, matched)}</div>
        </summary>
        <p>${esc(v.summary)}</p>
        <p class="hint">CVSS ${esc(v.cvss ?? '–')}${v.source ? ` · reported by ${esc(v.source)}` : ''}</p>
        <p class="links"><a href="${nvdLink(v.cve)}" target="_blank" rel="noopener">NVD ↗</a>
          <a href="https://www.cve.org/CVERecord?id=${esc(v.cve)}" target="_blank" rel="noopener">CVE.org ↗</a></p>
      </details>
    </li>`).join('') || `<li class="empty">${nvd.length ? 'Nothing on your watch list here.' : 'No CVEs to show yet.'}</li>`;
}

function renderNews() {
  const sources = [...new Set(news.map((n) => n.source))].sort();
  const sel = $('news-source');
  const keep = sel.value;
  sel.innerHTML = `<option value="">All sources (${news.length})</option>${sources.map((s) => `<option ${s === keep ? 'selected' : ''}>${esc(s)}</option>`).join('')}`;
  const q = $('news-search').value.trim().toLowerCase();
  const kw = keywords();
  const list = news.filter((n) => !sel.value || n.source === sel.value)
    .map((n) => ({ n, matched: matchKeywords(`${n.title} ${n.summary}`, kw) }))
    .filter(({ n, matched }) => (!q || `${n.title} ${n.summary}`.toLowerCase().includes(q)) && (!$('news-mine').checked || matched.length));
  $('news-list').innerHTML = list.slice(0, 150).map(({ n, matched }) => {
    const cves = cvesIn(`${n.title} ${n.summary}`).slice(0, 4);
    return `<li class="${matched.length ? 'mine' : ''}">
      <a class="headline" href="${esc(safeUrl(n.link))}" target="_blank" rel="noopener">${esc(n.title)}</a>
      <div class="meta">${esc(n.source)}${n.date ? ` · ${esc(ago(n.date))}` : ''}${n.discussion ? ` · <a href="${esc(safeUrl(n.discussion))}" target="_blank" rel="noopener">${n.points} points</a>` : ''}</div>
      ${n.summary ? `<p>${esc(n.summary)}</p>` : ''}
      ${cves.length || matched.length ? `<div class="pills">${cves.map((c) => `<a class="pill" href="${nvdLink(c)}" target="_blank" rel="noopener">${c}</a>`).join('')}${matched.map((k) => `<span class="pill watch">★ ${esc(k)}</span>`).join('')}</div>` : ''}
    </li>`;
  }).join('') || `<li class="empty">${news.length ? 'No stories match.' : 'No news loaded yet.'}</li>`;
}

function renderWatch() {
  if (document.activeElement !== $('keywords')) $('keywords').value = state.keywords;
  if (document.activeElement !== $('packages')) $('packages').value = state.packages;
  const kw = keywords();
  const count = (list, text) => list.filter((x) => matchKeywords(text(x), kw).length).length;
  $('match-summary').innerHTML = kw.length ? `
    <div><dt>Exploited (last 30 days)</dt><dd>${count(kev.filter((v) => v.added >= daysAgo(30)), (v) => `${v.vendor} ${v.product} ${v.name}`)}</dd></div>
    <div><dt>New CVEs (as loaded)</dt><dd>${count(nvd, (v) => v.summary)}</dd></div>
    <div><dt>News stories</dt><dd>${count(news, (n) => `${n.title} ${n.summary}`)}</dd></div>` : '';
  const sources = data?.sources || [];
  $('source-list').innerHTML = [
    ...sources.map((s) => `<li><span class="${s.ok ? 'ok' : 'bad'}">${s.ok ? '✓' : '✕'}</span> ${esc(s.name)} <small>${s.ok ? `${s.count} item${s.count === 1 ? '' : 's'}` : "couldn't be read last time"}</small></li>`),
    '<li><span class="ok">↻</span> NVD, EPSS and Hacker News <small>fetched live by this page</small></li>',
  ].join('');
  $('built-at').textContent = data?.builtAt ? `News and the CISA list were collected ${ago(data.builtAt)}; they're refreshed every few hours.` : 'Using CISA\'s list directly (the collected news isn\'t available).';
}

// ---- Packages -----------------------------------------------------------------------------

async function checkPackages() {
  state.packages = $('packages').value;
  save();
  const parsed = parsePackages(state.packages);
  const bad = parsed.filter((p) => p.error);
  const pkgs = parsed.filter((p) => !p.error).slice(0, 100);
  if (!pkgs.length) return status('pkg-status', bad.length ? `Couldn't read: ${bad.map((b) => b.error).join(', ')}` : 'Add some packages first.', 'warn');
  status('pkg-status', `Checking ${pkgs.length} package${pkgs.length === 1 ? '' : 's'}…`);
  $('pkg-list').innerHTML = '';
  try {
    const results = osvResults(pkgs, await getJson('https://api.osv.dev/v1/querybatch', { method: 'POST', body: JSON.stringify(osvBatchBody(pkgs)) }));
    const ids = [...new Set(results.flatMap((r) => r.vulns))].slice(0, 60);
    const details = Object.fromEntries((await Promise.all(ids.map((id) => getJson(`https://api.osv.dev/v1/vulns/${id}`).then(osvSummary).catch(() => ({ id, aliases: [], summary: '', fixed: [] }))))).map((d) => [d.id, d]));
    const affected = results.filter((r) => r.vulns.length).length;
    status('pkg-status', affected ? `${affected} of ${results.length} package${results.length === 1 ? ' has' : 's have'} known vulnerabilities.` : `No known vulnerabilities in these ${results.length} package versions.`, affected ? 'warn' : 'ok');
    if (bad.length) toast(`Skipped ${bad.length} line${bad.length === 1 ? '' : 's'} that couldn't be read.`);
    $('pkg-list').innerHTML = results.map((r) => `
      <li>
        <div class="top"><strong>${esc(r.name)} <small>${esc(r.version)} · ${esc(r.ecosystem)}</small></strong><span class="${r.vulns.length ? 'bad' : 'ok'}">${r.vulns.length ? `${r.vulns.length} issue${r.vulns.length === 1 ? '' : 's'}` : '✓ clean'}</span></div>
        ${r.vulns.map((id) => details[id] || { id, aliases: [], summary: '', fixed: [] }).map((d) => `
          <div class="pkg-vuln">
            <a href="https://osv.dev/vulnerability/${esc(d.id)}" target="_blank" rel="noopener">${esc(d.aliases[0] || d.id)}</a>
            ${d.severity ? `<span class="pill ${d.severity === 'critical' || d.severity === 'high' ? 'bad' : ''}">${esc(d.severity)}</span>` : ''}
            ${d.summary ? `<span>${esc(d.summary)}</span>` : ''}
            ${d.fixed.length ? `<small>Fixed in ${esc(d.fixed.slice(0, 3).join(', '))}</small>` : ''}
          </div>`).join('')}
      </li>`).join('');
  } catch {
    status('pkg-status', "Couldn't reach OSV. Check your connection and try again.", 'bad');
  }
}

// ---- Wiring --------------------------------------------------------------------------------

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  switchTab(b.dataset.tab);
  if (b.dataset.tab === 'cves' && !nvd.length) loadNvd();
}));
document.querySelectorAll('input[name="kev-days"]').forEach((r) => r.addEventListener('change', renderKev));
$('kev-search').addEventListener('input', renderKev);
$('kev-mine').addEventListener('change', renderKev);
document.querySelectorAll('input[name="nvd-sev"], input[name="nvd-days"]').forEach((r) => r.addEventListener('change', () => loadNvd()));
$('nvd-mine').addEventListener('change', renderNvd);
$('news-source').addEventListener('change', renderNews);
$('news-search').addEventListener('input', renderNews);
$('news-mine').addEventListener('change', renderNews);
$('save-keywords').addEventListener('click', () => {
  state.keywords = $('keywords').value;
  save();
  render();
  renderNvd();
  toast(keywords().length ? `Watching ${keywords().length} keyword${keywords().length === 1 ? '' : 's'}.` : 'Watch list cleared.');
});
$('check-packages').addEventListener('click', checkPackages);

loadData();
