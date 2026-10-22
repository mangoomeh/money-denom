import {
  kevRecent, nvdItems, nvdUrl, epssMap, epssUrls, formatEpss, hnItems, hnUrl, mergeNews, cvesIn,
  parseKeywords, matchKeywords, parsePackages, osvBatchBody, osvResults, osvSummary, ago,
  advisoryItem, packageLike, dedupeAdvisories, isFresh,
} from '../src/security.js';
import { $, esc, switchTab, toast } from '../shared/ui.js';

const STORAGE_KEY = 'security-v1'; // the watch list and packages (backed up)
const CACHE_KEY = 'security-cache'; // recent NVD and Hacker News results (not backed up)
const NVD_TTL = 60 * 60000;
const HN_TTL = 30 * 60000;
const WATCH_TTL = 60 * 60000;
const WATCH_DAYS = 30;
const KEV_URL = 'https://raw.githubusercontent.com/cisagov/kev-data/main/known_exploited_vulnerabilities.json';

// ---- Persistent state -----------------------------------------------------------------

function load(key, fallback) {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key)) }; } catch { return fallback; }
}
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not remembered */ }
}

const state = load(STORAGE_KEY, { keywords: '', packages: '' });
const cache = load(CACHE_KEY, { nvd: {}, hn: null, watch: null });
const save = () => store(STORAGE_KEY, state);
const saveCache = () => store(CACHE_KEY, cache);
const keywords = () => parseKeywords(state.keywords);

let data = null; // data.json: { builtAt, kev, cves, advisories, news, sources }
let kev = [];
let nvd = [];
let news = [];
let advisories = []; // open-source advisories from data.json
let watchAdv = []; // OSV advisories for watch-list words that are package names
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
  advisories = data?.advisories?.items || [];
  watchAdv = cache.watch?.items || [];
  render();
  loadEpss(kev.map((v) => v.cve));
  loadHn();
  loadWatchAdvisories();
}

// Asks OSV about each watch-list word as a PyPI and an npm package, keeping advisories
// published or changed in the last 30 days. This is what catches a hijacked release
// (malware in a real package) of something you use, which never gets a CVE.
async function loadWatchAdvisories(force = false) {
  const names = packageLike(keywords()).slice(0, 15);
  const key = names.join(',');
  if (!force && cache.watch?.key === key && Date.now() - cache.watch.at < WATCH_TTL) return;
  if (!names.length) {
    watchAdv = [];
    cache.watch = null;
    saveCache();
    return render();
  }
  const since = new Date(Date.now() - WATCH_DAYS * 86400000).toISOString();
  const found = [];
  await Promise.all(names.flatMap((name) => ['PyPI', 'npm'].map(async (ecosystem) => {
    try {
      const res = await getJson('https://api.osv.dev/v1/query', { method: 'POST', body: JSON.stringify({ package: { name, ecosystem } }) });
      found.push(...(res.vulns || []).filter((v) => (v.modified || '') >= since).map((v) => advisoryItem(v, since)).filter(isFresh));
    } catch { /* that one just isn't checked */ }
  })));
  watchAdv = dedupeAdvisories(found);
  cache.watch = { key, at: Date.now(), items: watchAdv };
  saveCache();
  render();
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
    render();
  } catch { /* the news sites alone are fine */ }
}

const nvdKey = () => `${radio('nvd-sev')}-${radio('nvd-days')}`;

// New CVEs come from data.json, which has every high and critical CVE of the week (by
// CVSS 4.0 or 3.x). Only if it's missing is the NVD asked directly, which can only filter
// by CVSS 3 severity.
async function loadNvd(force = false) {
  if (data?.cves?.items) {
    const days = Number(radio('nvd-days'));
    const from = new Date(Date.now() - days * 86400000).toISOString();
    const sev = radio('nvd-sev').toLowerCase();
    nvd = data.cves.items.filter((c) => c.severity === sev && (c.published || '') >= from);
    status('nvd-status', data.cves.partial ? 'The NVD stopped answering part-way last time, so a few may be missing.' : '', 'warn');
    renderNvd();
    return loadEpss(nvd.slice(0, 200).map((v) => v.cve));
  }
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
  if (!$('oss-list').hidden) renderNew();
}

// Everything recent that mentions the watch list, by source. Used for the header and the
// Watch tab, so both always agree.
function watchMatches() {
  const kw = keywords();
  if (!kw.length) return null;
  const hit = (text) => matchKeywords(text, kw).length > 0;
  const week = new Date(Date.now() - 7 * 86400000).toISOString();
  const pkgIds = new Set(watchAdv.map((a) => a.id));
  return {
    exploited: kev.filter((v) => v.added >= daysAgo(30) && hit(`${v.vendor} ${v.product} ${v.name}`)),
    packages: [...watchAdv, ...advisories.filter((a) => !pkgIds.has(a.id) && hit(`${a.package} ${a.summary}`))],
    cves: (data?.cves?.items || nvd).filter((c) => (c.published || '') >= week && hit(c.summary)),
    news: news.filter((n) => (n.date || '') >= week && hit(`${n.title} ${n.summary}`)),
  };
}

function renderHeader() {
  const week = kev.filter((v) => v.added >= daysAgo(7));
  const m = watchMatches();
  $('headline').textContent = `${week.length} newly exploited`;
  const parts = ['this week, per CISA'];
  if (!m) parts.push('set a watch list to see what affects you');
  else {
    const n = m.exploited.length + m.packages.length + m.cves.length + m.news.length;
    const urgent = m.exploited.length + m.packages.filter((a) => a.malicious).length;
    parts.push(n ? `⚠ ${n} recent match${n === 1 ? '' : 'es'} for your watch list${urgent ? `, ${urgent} urgent` : ''}` : 'nothing new for your watch list');
  }
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

function advisoryCard(a, matched = []) {
  const pills = [
    a.malicious ? '<span class="pill bad">Malicious release</span>' : `<span class="pill ${a.severity === 'critical' ? 'bad' : 'hot'}">${esc(a.severity || 'unrated')}</span>`,
    `<span class="pill">${esc(a.ecosystem)}</span>`,
    a.updated ? '<span class="pill">updated</span>' : '',
    ...matched.map((k) => `<span class="pill watch">★ ${esc(k)}</span>`),
  ].join('');
  const versions = a.malicious && a.versions.length ? `Bad versions: ${esc(a.versions.join(', '))}. Don't install them; if you did, rotate any secrets on that machine.`
    : a.fixed.length ? `Fixed in ${esc(a.fixed.join(', '))}.` : '';
  return `<li class="vuln ${matched.length ? 'mine' : ''}">
    <details>
      <summary>
        <div class="top"><strong>${esc(a.package)}</strong><span class="when">${esc(ago(a.modified))}</span></div>
        <div class="sub clamp">${esc(a.summary)}</div>
        <div class="pills">${pills}</div>
      </summary>
      <p>${esc(a.summary)}</p>
      ${versions ? `<p class="hint">${versions}</p>` : ''}
      <p class="links"><a href="https://osv.dev/vulnerability/${encodeURIComponent(a.id)}" target="_blank" rel="noopener">${esc(a.id)} ↗</a>
        ${a.cves.map((c) => `<a href="${nvdLink(c)}" target="_blank" rel="noopener">${esc(c)} ↗</a>`).join('')}</p>
    </details>
  </li>`;
}

// The New tab shows either all CVEs (NVD) or open-source package advisories (OSV).
function renderNew() {
  const oss = radio('new-kind') === 'oss';
  $('nvd-list').hidden = oss;
  $('oss-list').hidden = !oss;
  $('nvd-status').hidden = oss || !$('nvd-status').textContent;
  $('new-hint').innerHTML = oss
    ? 'High and critical advisories for npm, PyPI, Go, Maven, crates.io, RubyGems, NuGet and Packagist from <a href="https://osv.dev" target="_blank" rel="noopener">OSV</a> (GitHub, PyPA and others), plus malware found in popular packages, like a hijacked release.'
    : 'Newly published CVEs from the <a href="https://nvd.nist.gov" target="_blank" rel="noopener">NVD</a>, highest score first. Most are never exploited; the % is the <a href="https://www.first.org/epss/" target="_blank" rel="noopener">EPSS</a> chance it will be in the next 30 days.';
  if (!oss) return renderNvd();
  const kw = keywords();
  const days = Number(radio('nvd-days'));
  const from = new Date(Date.now() - days * 86400000).toISOString();
  const sev = radio('nvd-sev').toLowerCase();
  const list = advisories
    .filter((a) => (a.modified || '') >= from && (sev === 'critical' ? a.malicious || a.severity === 'critical' : a.severity === 'high'))
    .map((a) => ({ a, matched: matchKeywords(`${a.package} ${a.summary}`, kw) }))
    .filter(({ matched }) => !$('nvd-mine').checked || matched.length)
    .sort((x, y) => Number(y.a.malicious) - Number(x.a.malicious));
  $('oss-list').innerHTML = list.slice(0, 200).map(({ a, matched }) => advisoryCard(a, matched)).join('')
    || `<li class="empty">${advisories.length ? 'Nothing here for these choices.' : 'Package advisories aren\'t available right now.'}</li>`;
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
  const m = watchMatches();
  $('match-summary').innerHTML = m ? `
    <div><dt>Exploited (last 30 days)</dt><dd>${m.exploited.length}</dd></div>
    <div><dt>Package advisories</dt><dd>${m.packages.length}${m.packages.some((a) => a.malicious) ? ' <span class="pill bad">malware</span>' : ''}</dd></div>
    <div><dt>New CVEs (7 days)</dt><dd>${m.cves.length}</dd></div>
    <div><dt>News stories (7 days)</dt><dd>${m.news.length}</dd></div>` : '';
  $('watch-adv-card').hidden = !m?.packages.length;
  $('watch-adv').innerHTML = (m?.packages || []).map((a) => advisoryCard(a, matchKeywords(`${a.package} ${a.summary}`, kw))).join('');
  const sources = data?.sources || [];
  $('source-list').innerHTML = [
    ...sources.map((s) => `<li><span class="${s.ok ? 'ok' : 'bad'}">${s.ok ? '✓' : '✕'}</span> ${esc(s.name)} <small>${s.ok ? `${s.count} item${s.count === 1 ? '' : 's'}` : "couldn't be read last time"}</small></li>`),
    `<li><span class="ok">↻</span> EPSS, Hacker News${data?.cves ? '' : ', the NVD'} and OSV for your watch list <small>fetched live by this page</small></li>`,
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
  if (b.dataset.tab === 'cves') { renderNew(); if (!nvd.length) loadNvd(); }
}));
document.querySelectorAll('input[name="kev-days"]').forEach((r) => r.addEventListener('change', renderKev));
$('kev-search').addEventListener('input', renderKev);
$('kev-mine').addEventListener('change', renderKev);
document.querySelectorAll('input[name="nvd-sev"], input[name="nvd-days"]').forEach((r) => r.addEventListener('change', () => (radio('new-kind') === 'oss' ? renderNew() : loadNvd())));
document.querySelectorAll('input[name="new-kind"]').forEach((r) => r.addEventListener('change', () => (radio('new-kind') === 'oss' ? renderNew() : loadNvd())));
$('nvd-mine').addEventListener('change', renderNew);
$('news-source').addEventListener('change', renderNews);
$('news-search').addEventListener('input', renderNews);
$('news-mine').addEventListener('change', renderNews);
$('save-keywords').addEventListener('click', () => {
  state.keywords = $('keywords').value;
  save();
  render();
  renderNew();
  loadWatchAdvisories(true);
  toast(keywords().length ? `Watching ${keywords().length} keyword${keywords().length === 1 ? '' : 's'}.` : 'Watch list cleared.');
});
$('check-packages').addEventListener('click', checkPackages);

loadData();
