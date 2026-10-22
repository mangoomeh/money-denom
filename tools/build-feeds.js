// Fetches the feeds a web page can't read itself (news sites don't allow it, and the CISA
// catalogue is 1.8 MB) and writes one small JSON file for Security Watch. The Pages workflow
// runs it on every deploy and every few hours: `node tools/build-feeds.js [out.json]`.
// A feed that fails is skipped and marked as failed; it never stops the deploy.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseFeed, kevRecent } from '../src/security.js';

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

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; PocketApps-SecurityWatch/1.0; +https://mangoomeh.github.io/pocket-apps/)' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return as === 'json' ? res.json() : res.text();
}

const now = new Date();
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

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ builtAt: now.toISOString(), kev, news, sources }));
for (const s of sources) console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.name}${s.ok ? `: ${s.count}` : `: ${s.error}`}`);
console.log(`Wrote ${OUT}`);
