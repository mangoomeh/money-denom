// Pure logic for Security Watch: reading the feeds (CISA KEV, NVD, EPSS, OSV, RSS/Atom news,
// Hacker News) into plain lists, and matching them against the user's watch keywords.

const DAY = 86400000;

// ---- Text ----------------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// HTML or feed markup to one line of plain text, cut to `max` characters at a word.
export function plainText(html, max = 280) {
  const stripTags = (t) => t.replace(/<[^>]*>/g, ' ');
  // Atom's type="html" escapes its markup, so tags are removed again after decoding.
  const text = stripTags(decodeEntities(stripTags(String(html ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')))).replace(/\s+/g, ' ').replace(/ ([.,;:!?])/g, '$1').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > max * 0.6 ? cut.lastIndexOf(' ') : max).replace(/[\s,.;:–—-]+$/, '')}…`;
}

export const CVE_RE = /CVE-\d{4}-\d{4,}/gi;
export const cvesIn = (text) => [...new Set((String(text).match(CVE_RE) || []).map((c) => c.toUpperCase()))];

// ---- RSS and Atom ----------------------------------------------------------------------

const cdata = (s) => (s ?? '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? cdata(m[1]) : '';
}

function atomLink(entry) {
  const links = [...entry.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const pick = links.find((a) => /rel=["']alternate["']/i.test(a)) || links.find((a) => !/rel=/i.test(a)) || links[0] || '';
  return decodeEntities(pick.match(/href=["']([^"']+)["']/i)?.[1] ?? '');
}

const isoDate = (s) => {
  const t = Date.parse(String(s).trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

// Items from an RSS 2.0 or Atom feed: { title, link, date, summary, source }.
export function parseFeed(xml, source) {
  const out = [];
  for (const m of String(xml).matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)) {
    const it = m[0];
    const atom = m[1].toLowerCase() === 'entry';
    const title = plainText(tag(it, 'title'), 200);
    const link = (atom ? atomLink(it) : decodeEntities(tag(it, 'link').trim())) || decodeEntities(tag(it, 'guid').trim());
    const date = isoDate(tag(it, 'pubDate') || tag(it, 'published') || tag(it, 'updated') || tag(it, 'dc:date'));
    const summary = plainText(tag(it, 'description') || tag(it, 'summary') || tag(it, 'content:encoded') || tag(it, 'content'));
    if (title && /^https?:\/\//.test(link)) out.push({ title, link, date, summary, source });
  }
  return out;
}

// ---- Hacker News -------------------------------------------------------------------------

// Security stories are picked from the week's popular ones by their title.
export const SECURITY_RE = /\b(vulnerab\w*|exploit\w*|CVE-\d+|0-?day|zero-day|breach\w*|ransomware|malware|backdoor\w*|phishing|hack(ed|ers?)?|leak(ed|s)?|RCE|security (flaw|bug|hole|update|advisory|alert)|spyware|botnet|supply[- ]chain attack|compromis\w+|infostealer|credential stealer|CVSS|patch(es|ed)? (now|urgently)|CISA)\b/i;

export function hnUrl(now = new Date(), days = 7) {
  const since = Math.floor(now.getTime() / 1000) - days * 86400;
  return `https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=1000&numericFilters=points%3E20,created_at_i%3E${since}`;
}

export function hnItems(json) {
  return (json?.hits || []).filter((h) => h.title && SECURITY_RE.test(h.title)).map((h) => ({
    title: plainText(h.title, 200),
    link: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
    date: h.created_at ? new Date(h.created_at).toISOString() : null,
    summary: '',
    points: h.points ?? 0,
    source: 'Hacker News',
  }));
}

// One list from several sources, newest first, without the same story twice.
export function mergeNews(...lists) {
  const seen = new Set();
  const key = (n) => n.link.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
  return lists.flat()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .filter((n) => {
      const k = key(n);
      const t = n.title.toLowerCase();
      if (seen.has(k) || seen.has(t)) return false;
      seen.add(k);
      seen.add(t);
      return true;
    });
}

// ---- CISA Known Exploited Vulnerabilities ------------------------------------------------

// The vulnerabilities CISA added in the last `days` days, newest first, with only the
// fields the app shows (the full catalogue is about 1.8 MB).
export function kevRecent(catalog, days = 90, now = new Date()) {
  const from = new Date(now.getTime() - days * DAY).toISOString().slice(0, 10);
  return (catalog?.vulnerabilities || [])
    .filter((v) => v.dateAdded >= from)
    .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded) || b.cveID.localeCompare(a.cveID))
    .map((v) => ({
      cve: v.cveID,
      vendor: v.vendorProject,
      product: v.product,
      name: v.vulnerabilityName,
      added: v.dateAdded,
      due: v.dueDate,
      summary: v.shortDescription,
      action: v.requiredAction,
      ransomware: v.knownRansomwareCampaignUse === 'Known',
    }));
}

// ---- NVD -------------------------------------------------------------------------------------

export function severityOf(score) {
  if (score == null) return 'none';
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return score > 0 ? 'low' : 'none';
}

// The headline score for a CVE: CVSS 4.0, then 3.1, 3.0, 2.0, preferring the NVD's own
// ("Primary") rating over the reporter's.
function bestMetric(metrics = {}) {
  for (const k of ['cvssMetricV40', 'cvssMetricV31', 'cvssMetricV30', 'cvssMetricV2']) {
    const list = metrics[k];
    if (!list?.length) continue;
    const m = list.find((x) => x.type === 'Primary') || list[0];
    return { score: m.cvssData?.baseScore ?? null, version: m.cvssData?.version ?? k.replace('cvssMetricV', '').replace(/(\d)(\d)/, '$1.$2') };
  }
  return { score: null, version: null };
}

export function nvdItems(json) {
  return (json?.vulnerabilities || []).map(({ cve }) => {
    const { score, version } = bestMetric(cve.metrics);
    return {
      cve: cve.id,
      published: cve.published ? `${cve.published.replace(/(\.\d+)?Z?$/, '')}Z` : null,
      score,
      cvss: version,
      severity: severityOf(score),
      summary: plainText((cve.descriptions || []).find((d) => d.lang === 'en')?.value ?? '', 400),
      source: cve.sourceIdentifier || '',
    };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.published || '').localeCompare(a.published || ''));
}

// The NVD's date format: 2026-10-22T03:00:00.000Z, at most 120 days apart.
export function nvdUrl({ days = 7, severity = 'CRITICAL', now = new Date() } = {}) {
  const fmt = (d) => d.toISOString().replace(/\.\d+Z$/, '.000Z');
  const q = new URLSearchParams({ pubStartDate: fmt(new Date(now.getTime() - days * DAY)), pubEndDate: fmt(now), cvssV3Severity: severity, resultsPerPage: '200' });
  return `https://services.nvd.nist.gov/rest/json/cves/2.0?${q}`;
}

// ---- EPSS --------------------------------------------------------------------------------------

// { CVE: { epss, percentile } }, both 0–1: the chance it's exploited in the next 30 days.
export function epssMap(json) {
  return Object.fromEntries((json?.data || []).map((d) => [d.cve, { epss: Number(d.epss), percentile: Number(d.percentile) }]));
}

export const epssUrls = (cves, size = 100) => {
  const unique = [...new Set(cves)];
  const urls = [];
  for (let i = 0; i < unique.length; i += size) urls.push(`https://api.first.org/data/v1/epss?cve=${unique.slice(i, i + size).join(',')}`);
  return urls;
};

export const formatEpss = (e) => (e == null ? '' : e.epss >= 0.1 ? `${Math.round(e.epss * 100)}%` : e.epss >= 0.01 ? `${(e.epss * 100).toFixed(1)}%` : '<1%');

// ---- Watch list ------------------------------------------------------------------------------------

export const parseKeywords = (text) => [...new Set(String(text).split(/[,\n]/).map((k) => k.trim().toLowerCase()).filter((k) => k.length >= 2))];

// Which watch keywords appear in a text, as whole words ("ios" doesn't match "kiosk").
export function matchKeywords(text, keywords) {
  const t = String(text).toLowerCase();
  return keywords.filter((k) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(t));
}

// ---- OSV (packages) -----------------------------------------------------------------------------

const ECOSYSTEMS = { npm: 'npm', pypi: 'PyPI', pip: 'PyPI', go: 'Go', maven: 'Maven', cargo: 'crates.io', crates: 'crates.io', nuget: 'NuGet', gem: 'RubyGems', rubygems: 'RubyGems', composer: 'Packagist', packagist: 'Packagist' };

// One package per line: "lodash@4.17.15" (npm), "requests==2.19.0" (PyPI), or
// "pypi django 3.2.1" / "go github.com/x/y 1.2.3" with the ecosystem first.
export function parsePackages(text) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let m;
    if ((m = line.match(/^(\S+)\s+(\S+)\s+v?(\S+)$/)) && ECOSYSTEMS[m[1].toLowerCase()]) out.push({ ecosystem: ECOSYSTEMS[m[1].toLowerCase()], name: m[2], version: m[3] });
    else if ((m = line.match(/^([A-Za-z0-9_.-]+)\s*==\s*v?([\w.+-]+)$/))) out.push({ ecosystem: 'PyPI', name: m[1], version: m[2] });
    else if ((m = line.match(/^(@?[^@\s]+)@v?([\w.+-]+)$/))) out.push({ ecosystem: 'npm', name: m[1], version: m[2] });
    else out.push({ error: line });
  }
  return out;
}

export const osvBatchBody = (pkgs) => ({ queries: pkgs.map((p) => ({ package: { ecosystem: p.ecosystem, name: p.name }, version: p.version })) });

// Pairs each package with the vulnerability ids OSV returned for it.
export const osvResults = (pkgs, json) => pkgs.map((p, i) => ({ ...p, vulns: (json?.results?.[i]?.vulns || []).map((v) => v.id) }));

// A short line for one OSV vulnerability record.
export function osvSummary(v) {
  const fixed = (v.affected || []).flatMap((a) => (a.ranges || []).flatMap((r) => (r.events || []).map((e) => e.fixed).filter(Boolean)));
  return {
    id: v.id,
    aliases: (v.aliases || []).filter((a) => a.startsWith('CVE-')),
    summary: plainText(v.summary || v.details || '', 200),
    severity: v.database_specific?.severity?.toLowerCase() || null,
    fixed: [...new Set(fixed)],
  };
}

// ---- Dates ----------------------------------------------------------------------------------

// "3h ago", "yesterday", "5 Oct": for lists where the exact time matters less than how recent.
export function ago(iso, now = new Date()) {
  if (!iso) return '';
  const t = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  const mins = Math.round((now - t) / 60000);
  if (iso.length === 10) {
    const days = Math.round((new Date(now.toDateString()) - t) / DAY);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
  } else {
    if (mins < 60) return `${Math.max(mins, 1)}m ago`;
    if (mins < 24 * 60) return `${Math.round(mins / 60)}h ago`;
    if (mins < 48 * 60) return 'yesterday';
  }
  return t.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}
