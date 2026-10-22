import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  plainText, cvesIn, parseFeed, hnItems, mergeNews, kevRecent, nvdItems, nvdUrl, severityOf, epssMap, epssUrls,
  formatEpss, parseKeywords, matchKeywords, parsePackages, osvBatchBody, osvResults, osvSummary, ago,
  recentOsvIds, advisoryItem, keepAdvisory, dedupeAdvisories, packageLike, isFresh,
} from '../src/security.js';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Example</title>
<item>
  <title>Critical &amp; urgent: Acme VPN flaw (CVE-2026-1234) exploited</title>
  <link>https://news.example.com/acme-vpn?utm=rss</link>
  <pubDate>Wed, 21 Oct 2026 18:16:26 -0400</pubDate>
  <description><![CDATA[<p>Acme fixed a <b>critical</b> bug &#8212; patch now.</p><img src="x.png">]]></description>
</item>
<item><title><![CDATA[Second story]]></title><guid>https://news.example.com/2</guid><pubDate>Tue, 20 Oct 2026 09:00:00 GMT</pubDate></item>
<item><title>No link at all</title></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title>
<entry>
  <title type="html"><![CDATA[On passwords]]></title>
  <link rel="replies" href="https://blog.example.com/p/1#comments"/>
  <link rel="alternate" type="text/html" href="https://blog.example.com/p/1"/>
  <published>2026-10-21T11:02:22Z</published>
  <summary type="html">Short &lt;i&gt;summary&lt;/i&gt;.</summary>
</entry></feed>`;

test('RSS items: entities, CDATA, HTML stripped, guid as a fallback link, unusable items skipped', () => {
  const items = parseFeed(RSS, 'Example');
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    title: 'Critical & urgent: Acme VPN flaw (CVE-2026-1234) exploited',
    link: 'https://news.example.com/acme-vpn?utm=rss',
    date: '2026-10-21T22:16:26.000Z',
    summary: 'Acme fixed a critical bug — patch now.',
    source: 'Example',
  });
  assert.equal(items[1].link, 'https://news.example.com/2');
});

test('Atom entries use the alternate link and published date', () => {
  const [e] = parseFeed(ATOM, 'Blog');
  assert.equal(e.link, 'https://blog.example.com/p/1');
  assert.equal(e.date, '2026-10-21T11:02:22.000Z');
  assert.equal(e.summary, 'Short summary.');
});

test('plain text is cut at a word with an ellipsis', () => {
  assert.equal(plainText('one two three four five six', 14), 'one two three…');
  assert.equal(plainText('short', 14), 'short');
});

test('CVE ids are found once each, upper-cased', () => {
  assert.deepEqual(cvesIn('cve-2026-1234 and CVE-2026-1234, CVE-2025-99999'), ['CVE-2026-1234', 'CVE-2025-99999']);
});

test('Hacker News keeps only security stories, linking the discussion when there is no URL', () => {
  const items = hnItems({ hits: [
    { objectID: '1', title: 'PHP2Shell: critical RCE in PHP', url: 'https://x.dev/php', created_at: '2026-10-21T10:00:00Z', points: 400 },
    { objectID: '2', title: 'Show HN: my sourdough timer', url: 'https://y.dev', created_at: '2026-10-21T11:00:00Z', points: 90 },
    { objectID: '3', title: 'LiteLLM compromised on PyPI', created_at: '2026-10-21T12:00:00Z', points: 300 },
  ] });
  assert.deepEqual(items.map((i) => i.link), ['https://x.dev/php', 'https://news.ycombinator.com/item?id=3']);
});

test('merged news is newest first without the same story twice', () => {
  const a = { title: 'Acme VPN exploited', link: 'https://www.news.example.com/a/', date: '2026-10-21T10:00:00Z', source: 'A' };
  const b = { title: 'Something else', link: 'https://other.example.com/b', date: '2026-10-21T12:00:00Z', source: 'B' };
  const dup = { title: 'Acme VPN exploited (HN)', link: 'http://news.example.com/a?ref=hn', date: '2026-10-21T11:00:00Z', source: 'Hacker News' };
  assert.deepEqual(mergeNews([a], [b, dup]).map((n) => n.source), ['B', 'Hacker News']);
});

test('KEV: recent additions only, newest first, trimmed', () => {
  const v = (cveID, dateAdded, ransom = 'Unknown') => ({ cveID, dateAdded, vendorProject: 'Acme', product: 'VPN', vulnerabilityName: 'n', dueDate: '2026-11-10', shortDescription: 's', requiredAction: 'a', knownRansomwareCampaignUse: ransom, notes: 'long' });
  const items = kevRecent({ vulnerabilities: [v('CVE-1', '2026-07-01'), v('CVE-2', '2026-10-20', 'Known'), v('CVE-3', '2026-10-01')] }, 90, new Date('2026-10-22T00:00:00Z'));
  assert.deepEqual(items.map((i) => i.cve), ['CVE-2', 'CVE-3']);
  assert.equal(items[0].ransomware, true);
  assert.equal('notes' in items[0], false);
});

test('NVD: best available score, highest first', () => {
  const cve = (id, metrics, published = '2026-10-15T07:17:57.890') => ({ cve: { id, published, metrics, descriptions: [{ lang: 'en', value: `${id} desc` }] } });
  const items = nvdItems({ vulnerabilities: [
    cve('CVE-A', { cvssMetricV31: [{ type: 'Secondary', cvssData: { baseScore: 7.5, version: '3.1' } }, { type: 'Primary', cvssData: { baseScore: 8.1, version: '3.1' } }] }),
    cve('CVE-B', { cvssMetricV40: [{ type: 'Secondary', cvssData: { baseScore: 9.3, version: '4.0' } }], cvssMetricV31: [{ type: 'Primary', cvssData: { baseScore: 6, version: '3.1' } }] }),
    cve('CVE-D', { cvssMetricV40: [{ type: 'Secondary', cvssData: { baseScore: 9.8, version: '4.0' } }] }),
    cve('CVE-C', {}),
  ] });
  // The NVD's own 6.0 beats the reporter's 9.3; with only a reporter's CVSS 4.0, that's used.
  assert.deepEqual(items.map((i) => [i.cve, i.score, i.severity]), [['CVE-D', 9.8, 'critical'], ['CVE-A', 8.1, 'high'], ['CVE-B', 6, 'medium'], ['CVE-C', null, 'none']]);
  assert.equal(items[0].published, '2026-10-15T07:17:57Z');
  assert.equal(severityOf(4), 'medium');
});

test('NVD URL uses its date format and the chosen range', () => {
  const u = new URL(nvdUrl({ days: 1, severity: 'HIGH', now: new Date('2026-10-22T03:00:00.123Z') }));
  assert.equal(u.searchParams.get('pubStartDate'), '2026-10-21T03:00:00.000Z');
  assert.equal(u.searchParams.get('pubEndDate'), '2026-10-22T03:00:00.000Z');
  assert.equal(u.searchParams.get('cvssV3Severity'), 'HIGH');
});

test('EPSS scores, batched URLs and display', () => {
  assert.deepEqual(epssMap({ data: [{ cve: 'CVE-1', epss: '0.94', percentile: '0.99' }] }), { 'CVE-1': { epss: 0.94, percentile: 0.99 } });
  const urls = epssUrls(Array.from({ length: 150 }, (_, i) => `CVE-2026-${i}`));
  assert.equal(urls.length, 2);
  assert.equal(formatEpss({ epss: 0.94 }), '94%');
  assert.equal(formatEpss({ epss: 0.034 }), '3.4%');
  assert.equal(formatEpss({ epss: 0.0004 }), '<1%');
});

test('watch keywords match whole words only', () => {
  const kw = parseKeywords('Fortinet, iOS,\nchrome, x, chrome');
  assert.deepEqual(kw, ['fortinet', 'ios', 'chrome']);
  assert.deepEqual(matchKeywords('Apple iOS and Google Chrome flaws', kw), ['ios', 'chrome']);
  assert.deepEqual(matchKeywords('Kiosk software for Chromebooks', kw), []);
  assert.deepEqual(matchKeywords('FortiOS by Fortinet', kw), ['fortinet']);
});

test('package lines in npm, pip and "ecosystem name version" forms', () => {
  const pkgs = parsePackages('lodash@4.17.15\n@babel/traverse@7.22.0\nrequests==2.19.0\n# comment\ngo github.com/x/y v1.2.3\nnonsense line here too');
  assert.deepEqual(pkgs.slice(0, 4), [
    { ecosystem: 'npm', name: 'lodash', version: '4.17.15' },
    { ecosystem: 'npm', name: '@babel/traverse', version: '7.22.0' },
    { ecosystem: 'PyPI', name: 'requests', version: '2.19.0' },
    { ecosystem: 'Go', name: 'github.com/x/y', version: '1.2.3' },
  ]);
  assert.deepEqual(pkgs[4], { error: 'nonsense line here too' });
  assert.deepEqual(osvBatchBody(pkgs.slice(0, 1)), { queries: [{ package: { ecosystem: 'npm', name: 'lodash' }, version: '4.17.15' }] });
  assert.deepEqual(osvResults(pkgs.slice(0, 2), { results: [{ vulns: [{ id: 'GHSA-1' }] }, {}] }).map((r) => r.vulns), [['GHSA-1'], []]);
});

test('OSV record summary lists CVE aliases and fixed versions', () => {
  const s = osvSummary({ id: 'GHSA-x', aliases: ['CVE-2020-8203', 'SNYK-1'], summary: 'Prototype pollution', database_specific: { severity: 'HIGH' },
    affected: [{ ranges: [{ events: [{ introduced: '0' }, { fixed: '4.17.19' }] }] }] });
  assert.deepEqual(s, { id: 'GHSA-x', aliases: ['CVE-2020-8203'], summary: 'Prototype pollution', severity: 'high', fixed: ['4.17.19'] });
});

test('ago', () => {
  const now = new Date('2026-10-22T12:00:00');
  assert.equal(ago(new Date('2026-10-22T11:30:00').toISOString(), now), '30m ago');
  assert.equal(ago(new Date('2026-10-22T07:00:00').toISOString(), now), '5h ago');
  assert.equal(ago('2026-10-22', now), 'today');
  assert.equal(ago('2026-10-21', now), 'yesterday');
  assert.equal(ago('2026-10-18', now), '4 days ago');
});

// Shaped like OSV's record for the hijacked LiteLLM release: an old malware report that was
// changed when a new bad version (1.107.0) was found.
const HIJACKED = {
  id: 'MAL-2026-2144', published: '2026-03-24T11:15:14Z', modified: '2026-10-21T22:01:01.88Z', aliases: ['PYSEC-2026-2'],
  summary: 'Malicious code in litellm (PyPI)',
  details: 'litellm 1.107.0, uploaded to PyPI on 2026-10-21, contains a credential stealer and a backdoor.',
  affected: [{ package: { ecosystem: 'PyPI', name: 'litellm' }, versions: ['1.82.7', '1.82.8', '1.107.0'] }],
};
const BUG = {
  id: 'GHSA-332p-7hrc-92wf', published: '2026-10-21T21:28:09Z', modified: '2026-10-21T21:45:08Z', aliases: ['CVE-2026-112393'],
  summary: 'Pillow: Heap buffer overflow when saving TIFF', database_specific: { severity: 'CRITICAL' },
  affected: [{ package: { ecosystem: 'PyPI', name: 'pillow' }, ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '2.0.0' }, { fixed: '13.0.0' }] }] }],
};

test('OSV change index: ids changed since a time, stopping at older ones', () => {
  const csv = '2026-10-22T01:30:07Z,MAL-2026-18168\n2026-10-21T22:01:01Z,MAL-2026-2144\n2026-10-10T00:00:00Z,GHSA-old\n2026-10-21T23:00:00Z,never-reached';
  assert.deepEqual(recentOsvIds(csv, '2026-10-15T00:00:00Z'), ['MAL-2026-18168', 'MAL-2026-2144']);
});

test('a hijacked release of a popular package is kept, a typosquat is not', () => {
  const since = '2026-10-15T00:00:00Z';
  const a = advisoryItem(HIJACKED, since);
  assert.equal(a.malicious, true);
  assert.equal(a.severity, 'critical');
  assert.equal(a.updated, true, 'reported in March, changed this week');
  assert.deepEqual(a.versions, ['1.82.7', '1.82.8', '1.107.0']);
  assert.match(a.summary, /1\.107\.0.*credential stealer/);
  const popular = new Set(['PyPI:litellm']);
  assert.equal(keepAdvisory(a, popular), true);
  assert.equal(keepAdvisory({ ...a, package: 'litelm-utils' }, popular), false);
});

test('a GitHub-reviewed bug keeps its severity, CVE and fixed version', () => {
  const b = advisoryItem(BUG, '2026-10-15T00:00:00Z');
  assert.deepEqual([b.malicious, b.severity, b.cves, b.fixed, b.updated], [false, 'critical', ['CVE-2026-112393'], ['13.0.0'], false]);
  assert.equal(keepAdvisory(b, new Set()), true);
  assert.equal(keepAdvisory({ ...b, severity: 'medium' }, new Set()), false);
  assert.equal(keepAdvisory({ ...b, updated: true }, new Set()), false, 'an old bug report edited this week is not news');
});

test('the same CVE from GitHub and PyPA is shown once, keeping the one with a severity', () => {
  const ghsa = advisoryItem(BUG);
  const pysec = { ...ghsa, id: 'PYSEC-2026-9', severity: null, modified: '2026-10-22T09:00:00Z' };
  const other = { ...ghsa, id: 'GHSA-other', cves: [], modified: '2026-10-22T10:00:00Z' };
  assert.deepEqual(dedupeAdvisories([pysec, ghsa, other]).map((a) => a.id), ['GHSA-other', 'GHSA-332p-7hrc-92wf']);
});

test('a PyPA copy of an old GitHub advisory is not news', () => {
  const copy = advisoryItem({ ...BUG, id: 'PYSEC-2026-4067', aliases: ['CVE-2026-1', 'GHSA-4jcj-7x88-m979'], published: '2026-10-01T16:38:41Z', database_specific: {} }, '2026-09-22T00:00:00Z');
  assert.equal(copy.copyOf, 'GHSA-4jcj-7x88-m979');
  assert.equal(isFresh(copy), false);
  assert.equal(isFresh(advisoryItem(BUG, '2026-10-15T00:00:00Z')), true);
  assert.equal(advisoryItem(HIJACKED).copyOf, null);
});

test('only watch words that could be package names are looked up', () => {
  assert.deepEqual(packageLike(['litellm', '@babel/core', 'microsoft exchange', 'ios']), ['litellm', '@babel/core', 'ios']);
});
