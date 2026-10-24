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

async function get(url, as = 'text', timeoutMs = 30000, headers = {}) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; PocketApps-SecurityWatch/1.0; +https://mangoomeh.github.io/pocket-apps/)', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
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

// The four groups run at the same time; each returns its data and its line(s) for `sources`.
async function collectKev() {
  try {
    const catalog = await get(KEV_URL, 'json');
    const kev = { version: catalog.catalogVersion, released: catalog.dateReleased, total: catalog.count ?? catalog.vulnerabilities.length, items: kevRecent(catalog, 90, now) };
    return { kev, sources: [{ name: 'CISA KEV', ok: true, count: kev.items.length }] };
  } catch (e) {
    return { kev: null, sources: [{ name: 'CISA KEV', ok: false, error: e.message }] };
  }
}

async function collectNews() {
  const since = new Date(now.getTime() - NEWS_DAYS * 86400000).toISOString();
  const results = await Promise.all(FEEDS.map(async ([name, url]) => {
    try {
      const items = parseFeed(await get(url), name).filter((n) => !n.date || n.date >= since).slice(0, PER_SOURCE);
      return { items, source: { name, ok: true, count: items.length } };
    } catch (e) {
      return { items: [], source: { name, ok: false, error: e.message } };
    }
  }));
  const news = results.flatMap((r) => r.items).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return { news, sources: results.map((r) => r.source) };
}

// Every CVE the NVD published this week, keeping high and critical by their best score
// (CVSS 4.0 or 3.x). The NVD's own severity filter only knows CVSS 3, so it misses CVEs
// scored only with 4.0. Without a key the NVD allows 5 requests in 30 seconds; with a free
// key (the NVD_API_KEY secret), 50.
async function collectCves() {
  const key = process.env.NVD_API_KEY;
  const headers = key ? { apiKey: key } : {};
  const GAP = key ? 700 : 6500; // ms between requests, to stay under the limit
  const PAGE = 2000; // the most the NVD gives per request, so a week is a few requests
  const SMALL = 200; // if a big page keeps getting cut off part-way, its range is fetched in these
  const fmt = (d) => d.toISOString().replace(/\.\d+Z$/, '.000Z');
  // Every request, retries included, takes the next free slot GAP after the last one.
  let nextSlot = 0;
  const slot = () => {
    const at = Math.max(Date.now(), nextSlot);
    nextSlot = at + GAP;
    return sleep(at - Date.now());
  };
  const pageAt = async (start, size) => {
    for (let attempt = 1; ; attempt++) {
      await slot();
      try {
        return await get(`${NVD_URL}?pubStartDate=${fmt(recentSince)}&pubEndDate=${fmt(now)}&resultsPerPage=${size}&startIndex=${start}`, 'json', 60000, headers);
      } catch (e) {
        if (attempt === 2) throw e;
      }
    }
  };
  // One big page, or if that fails, the same range in small pages (whatever arrives is kept).
  let error = null;
  const range = async (start, size, total) => {
    try {
      return nvdItems(await pageAt(start, size));
    } catch (e) {
      const starts = [];
      for (let s = start; s < Math.min(start + size, total ?? start + SMALL); s += SMALL) starts.push(s);
      const pages = await Promise.all(starts.map((s) => pageAt(s, SMALL).catch((e2) => { error ??= e2.message; return null; })));
      if (pages.every((p) => !p)) error ??= e.message;
      return pages.filter(Boolean).flatMap((p) => nvdItems(p));
    }
  };
  const all = [];
  let total = null;
  try {
    let first;
    try {
      first = await pageAt(0, PAGE);
    } catch {
      first = await pageAt(0, SMALL); // still learn the total, then go small
    }
    total = first.totalResults;
    all.push(...nvdItems(first));
    const got = first.vulnerabilities?.length ?? 0;
    const size = got >= PAGE ? PAGE : SMALL;
    const starts = [];
    for (let s = got; s < total; s += size) starts.push(s);
    for (const items of await Promise.all(starts.map((s) => range(s, size, total)))) all.push(...items);
  } catch (e) {
    error = e.message;
  }
  let cves = null;
  if (all.length) {
    const items = all.filter((c) => c.score >= 7).map((c) => ({ ...c, summary: c.summary.length > 240 ? `${c.summary.slice(0, 239)}…` : c.summary }))
      .sort((a, b) => b.score - a.score || (b.published || '').localeCompare(a.published || ''));
    // If the NVD gave up part-way, keep what arrived and say so.
    cves = { days: RECENT_DAYS, total, fetched: all.length, partial: Boolean(error), items };
  }
  return { cves, sources: [error && !all.length ? { name: 'NVD', ok: false, error } : { name: 'NVD', ok: true, count: cves.items.length, partial: Boolean(error) }] };
}

// Open-source advisories OSV published or changed this week: GitHub-reviewed and other
// vulnerabilities in packages, and malware found in popular packages.
async function collectAdvisories() {
  try {
    const popular = new Set();
    await Promise.all(Object.entries(POPULAR).map(async ([eco, [url, names]]) => {
      try {
        const body = await get(url, url.endsWith('.json') ? 'json' : 'text');
        for (const n of names(body)) popular.add(`${eco}:${n.toLowerCase()}`);
      } catch { /* without the list, that ecosystem's malware reports are left out */ }
    }));
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
    const advisories = { days: RECENT_DAYS, items: dedupeAdvisories(items) };
    return { advisories, sources: [{ name: 'OSV advisories', ok: true, count: advisories.items.length }] };
  } catch (e) {
    return { advisories: null, sources: [{ name: 'OSV advisories', ok: false, error: e.message }] };
  }
}

const started = Date.now();
const [{ kev, sources: s1 }, { news, sources: s2 }, { cves, sources: s3 }, { advisories, sources: s4 }] = await Promise.all([collectKev(), collectNews(), collectCves(), collectAdvisories()]);
const sources = [...s1, ...s2, ...s3, ...s4];

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ builtAt: now.toISOString(), kev, cves, advisories, news, sources }));
for (const s of sources) console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.name}${s.ok ? `: ${s.count}${s.partial ? ' (partial)' : ''}` : `: ${s.error}`}`);
console.log(`Wrote ${OUT} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
