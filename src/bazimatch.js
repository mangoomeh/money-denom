// Traditional BaZi compatibility between two charts. Each factor scores +2..−2; the total gives an
// overall label. The factors are the ones practitioners usually check first.

import {
  STEMS, BRANCHES, ANIMALS, ELEMENTS, TEN_GODS, tenGod, branchPair, stemPair, analyseStrength,
} from './bazi.js';

const dayOf = (c) => c.pillars.find((p) => p.key === 'day');
const yearOf = (c) => c.pillars.find((p) => p.key === 'year');

// Share of `giver`'s element weight that falls in `taker`'s favourable elements.
function supportShare(taker, giver) {
  const fav = analyseStrength(taker).favourable;
  const total = giver.weighted.reduce((a, b) => a + b, 0);
  return fav.reduce((sum, e) => sum + giver.weighted[e], 0) / total;
}

function branchFactor(a, b, what, weight) {
  const r = branchPair(a, b);
  const pair = `${BRANCHES[a]}${BRANCHES[b]}`;
  const out = [];
  if (r.combo != null) out.push({ score: 2 * weight, head: `${what}: ${pair} combine`, body: 'A six combination: the two pull together and settle each other.' });
  else if (r.trio != null) out.push({ score: weight, head: `${what}: ${pair} in the same harmony group`, body: `Part of the same three-harmony (${ELEMENTS[r.trio].en}) group: easy cooperation.` });
  if (r.clash) out.push({ score: -2 * weight, head: `${what}: ${pair} clash`, body: 'Opposite branches: lively but restless, and differences need talking through.' });
  if (r.harm) out.push({ score: -weight, head: `${what}: ${pair} harm`, body: 'A “harm” pair: small misunderstandings can build up if left unsaid.' });
  if (r.punish) out.push({ score: -weight, head: `${what}: ${pair} punishment`, body: 'A “punishment” pair: friction under stress, so patience matters.' });
  if (!out.length && a === b) out.push({ score: weight, head: `${what}: both ${BRANCHES[a]}`, body: 'The same branch: similar instincts and habits.' });
  return out;
}

// a and b are computeChart() results; genders come from their inputs.
export function compareCharts(a, b, nameA = 'A', nameB = 'B') {
  const factors = [];
  const da = dayOf(a); const db = dayOf(b);

  const sp = stemPair(da.stem, db.stem);
  if (sp.combo != null) factors.push({ score: 2, head: `Day masters ${STEMS[da.stem]}${STEMS[db.stem]} combine`, body: 'The classic sign of strong natural attraction between two people.' });
  if (sp.clash) factors.push({ score: -1, head: `Day masters ${STEMS[da.stem]}${STEMS[db.stem]} clash`, body: 'Different temperaments that can spark disagreement, or balance each other with effort.' });

  const godAB = tenGod(da.stem, db.stem); const godBA = tenGod(db.stem, da.stem);
  factors.push({
    score: 0,
    head: `How you see each other`,
    body: `To ${nameA}, ${nameB}'s day master ${STEMS[db.stem]} is ${TEN_GODS[godAB].zh} ${TEN_GODS[godAB].en}. To ${nameB}, ${nameA}'s ${STEMS[da.stem]} is ${TEN_GODS[godBA].zh} ${TEN_GODS[godBA].en}.`,
  });
  // Spouse stars: Wealth for men, Officer for women.
  const spouseStar = (gender, god) => (gender === 'female' ? god === 6 || god === 7 : god === 4 || god === 5);
  for (const [who, other, gender, god] of [[nameA, nameB, a.input.gender, godAB], [nameB, nameA, b.input.gender, godBA]]) {
    if (spouseStar(gender, god)) {
      factors.push({ score: 1, head: `${other} is ${who}'s spouse star`, body: `${TEN_GODS[god].en} is the traditional partner star for a ${gender === 'female' ? 'woman' : 'man'}.` });
    }
  }

  factors.push(...branchFactor(da.branch, db.branch, 'Spouse palaces (day branches)', 1));
  const ya = yearOf(a); const yb = yearOf(b);
  factors.push(...branchFactor(ya.branch, yb.branch, `Zodiac: ${ANIMALS[ya.branch]} and ${ANIMALS[yb.branch]}`, 0.5));

  for (const [taker, giver, tn, gn] of [[a, b, nameA, nameB], [b, a, nameB, nameA]]) {
    const share = supportShare(taker, giver);
    const fav = analyseStrength(taker).favourable.map((e) => ELEMENTS[e].en).join(' and ');
    const pct = Math.round(share * 100);
    if (share >= 0.5) factors.push({ score: 1, head: `${gn} brings ${tn}'s favourable elements`, body: `${pct}% of ${gn}'s chart is ${fav}, which ${tn}'s chart needs.` });
    else if (share <= 0.25) factors.push({ score: -1, head: `${gn} brings little of what ${tn} needs`, body: `Only ${pct}% of ${gn}'s chart is ${fav}, ${tn}'s favourable elements.` });
    else factors.push({ score: 0, head: `${gn} brings some of what ${tn} needs`, body: `${pct}% of ${gn}'s chart is ${fav}, ${tn}'s favourable elements.` });
  }

  const total = factors.reduce((s, f) => s + f.score, 0);
  const verdict = total >= 3 ? 'Very supportive' : total >= 1 ? 'Supportive' : total > -1 ? 'Mixed' : total > -3 ? 'Some friction' : 'Challenging';
  return { total, verdict, factors };
}
