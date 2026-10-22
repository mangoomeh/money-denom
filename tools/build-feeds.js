// Fetches the feeds a web page can't read itself or that are too big for a phone (news sites
// don't allow it, CISA's catalogue is 1.8 MB, a week of NVD CVEs is several MB, OSV is read
// record by record) and writes one JSON file for Security Watch. The Pages workflow
// runs it on every deploy and every few hours: `node tools/build-feeds.js [out.json]`.
// A feed that fails is skipped and marked as failed; it never stops the deploy.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  parseFeed, kevRecent, nvdItems, recentOsvIds, advisoryItem, keepAdvisory, dedupeAdvisories,
} from '../src/security.js';

const OUT = process.argv[2] || new URL('../security/data.json', import.meta.url).pathname;
const KEV_URL = 'https://raw.githubusercontent.com/cisagov/kev-data/main/known_exploited_vulnerabilities.json';
const FEEDS = [
  ['BleepingComputer', 'https://www.bleepingcomputer.com/feed/'],
  ['The Hacker News', 'https://feeds.feedburner.com/TheHackersNews'],
  ['SecurityWeek', 'https://www.securityweek.com/feed/'],
  ['Krebs on Security', 'https://krebsonsecurity.com/feed/'],
  ['Schneier on Security', 'https://www.schneier.com/feed/atom/'],
  ['UK NCSC', 'https://www.ncsc.gov.uk/api/1/services/v1/report-rss-feed.xml'],
  ['CISA advisories', 'https://www.cisa.gov/cybersecurity-advisories/all.xml'],
];
const NEWS_DAYS = 14;
const PER_SOURCE = 30;
const RECENT_DAYS = 7; // for new CVEs and open-source advisories
const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const OSV_BUCKET = 'https://osv-vulnerabilities.storage.googleapis.com';
const OSV_ECOSYSTEMS = ['PyPI', 'npm', 'Go', 'Maven', 'crates.io', 'RubyGems', 'NuGet', 'Packagist'];
// Most-downloaded packages, for telling a hijacked popular package from a typosquat nobody uses.
const POPULAR = {
  PyPI: ['https://hugovk.dev/top-pypi-packages/top-pypi-packages.min.json', (j) => j.rows.slice(0, 5000).map((r) => r.project)],
  npm: ['https://cdn.jsdelivr.net/npm/npm-high-impact@1/lib/top.js', (t) => [...t.matchAll(/'([^']+)'/g)].map((m) => m[1])],
};

async function get(url, as = 'text', timeoutMs = 30000) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; PocketApps-SecurityWatch/1.0; +https://mangoomeh.github.io/pocket-apps/)' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return as === 'json' ? res.json() : res.text();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs `fn` over `items` with at most `n` at a time.
async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]).catch(() => null);
    }
  }));
  return out;
}

const now = new Date();
const recentSince = new Date(now.getTime() - RECENT_DAYS * 86400000);
const sources = [];
let kev = null;
try {
  const catalog = await get(KEV_URL, 'json');
  kev = { version: catalog.catalogVersion, released: catalog.dateReleased, total: catalog.count ?? catalog.vulnerabilities.length, items: kevRecent(catalog, 90, now) };
  sources.push({ name: 'CISA KEV', ok: true, count: kev.items.length });
} catch (e) {
  sources.push({ name: 'CISA KEV', ok: false, error: e.message });
}

const since = new Date(now.getTime() - NEWS_DAYS * 86400000).toISOString();
const news = [];
await Promise.all(FEEDS.map(async ([name, url]) => {
  try {
    const items = parseFeed(await get(url), name).filter((n) => !n.date || n.date >= since).slice(0, PER_SOURCE);
    news.push(...items);
    sources.push({ name, ok: true, count: items.length });
  } catch (e) {
    sources.push({ name, ok: false, error: e.message });
  }
}));
news.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

// Every CVE the NVD published this week, keeping high and critical by their best score
// (CVSS 4.0 or 3.x). The NVD's own severity filter only knows CVSS 3, so it misses CVEs
// scored only with 4.0. Without a key the NVD allows 5 requests in 30 seconds.
let cves = null;
{
  const fmt = (d) => d.toISOString().replace(/\.\d+Z$/, '.000Z');
  const PAGE = 200; // the NVD often drops big responses part-way, so pages are small
  const pageAt = async (start) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await get(`${NVD_URL}?pubStartDate=${fmt(recentSince)}&pubEndDate=${fmt(now)}&resultsPerPage=${PAGE}&startIndex=${start}`, 'json', 60000);
      } catch (e) {
        if (attempt === 3) throw e;
        await sleep(6500 * attempt);
      }
    }
  };
  // Pages are started 6.5 s apart without waiting for the one before, which keeps to the
  // NVD's limit while several slow pages arrive at once.
  const all = [];
  let total = null;
  let error = null;
  try {
    const first = await pageAt(0);
    total = first.totalResults;
    all.push(...nvdItems(first));
    const starts = [];
    for (let s = PAGE; s < total; s += PAGE) starts.push(s);
    const pages = await Promise.all(starts.map((start, i) => sleep(6500 * (i + 1)).then(() => pageAt(start)).catch((e) => { error ??= e.message; return null; })));
    for (const page of pages) if (page) all.push(...nvdItems(page));
  } catch (e) {
    error = e.message;
  }
  if (all.length) {
    const items = all.filter((c) => c.score >= 7).map((c) => ({ ...c, summary: c.summary.length > 240 ? `${c.summary.slice(0, 239)}…` : c.summary }))
      .sort((a, b) => b.score - a.score || (b.published || '').localeCompare(a.published || ''));
    // If the NVD gave up part-way, keep what arrived and say so.
    cves = { days: RECENT_DAYS, total, fetched: all.length, partial: Boolean(error), items };
  }
  sources.push(error && !all.length ? { name: 'NVD', ok: false, error } : { name: 'NVD', ok: true, count: cves.items.length, partial: Boolean(error) });
}

// Open-source advisories OSV published or changed this week: GitHub-reviewed and other
// vulnerabilities in packages, and malware found in popular packages.
let advisories = null;
try {
  const popular = new Set();
  for (const [eco, [url, names]] of Object.entries(POPULAR)) {
    try {
      const body = await get(url, url.endsWith('.json') ? 'json' : 'text');
      for (const n of names(body)) popular.add(`${eco}:${n.toLowerCase()}`);
    } catch { /* without the list, that ecosystem's malware reports are left out */ }
  }
  const since = recentSince.toISOString();
  const items = [];
  await Promise.all(OSV_ECOSYSTEMS.map(async (eco) => {
    try {
      let ids = recentOsvIds(await get(`${OSV_BUCKET}/${encodeURIComponent(eco)}/modified_id.csv`), since);
      // Malware reports only matter for the ecosystems with a popular-package list.
      if (!POPULAR[eco]) ids = ids.filter((id) => !id.startsWith('MAL-'));
      const records = await pool(ids, 24, (id) => get(`${OSV_BUCKET}/${encodeURIComponent(eco)}/${id}.json`, 'json'));
      items.push(...records.filter(Boolean).map((r) => advisoryItem(r, since)).filter((it) => keepAdvisory(it, popular)));
    } catch { /* skip this ecosystem */ }
  }));
  advisories = { days: RECENT_DAYS, items: dedupeAdvisories(items) };
  sources.push({ name: 'OSV advisories', ok: true, count: advisories.items.length });
} catch (e) {
  sources.push({ name: 'OSV advisories', ok: false, error: e.message });
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ builtAt: now.toISOString(), kev, cves, advisories, news, sources }));
for (const s of sources) console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.name}${s.ok ? `: ${s.count}${s.partial ? ' (partial)' : ''}` : `: ${s.error}`}`);
console.log(`Wrote ${OUT}`);
