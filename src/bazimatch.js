// Traditional BaZi compatibility between two charts. Each factor scores +2..−2; the total gives an
// overall label. The factors are the ones practitioners usually check first.

import {
  STEMS, BRANCHES, ANIMALS, ANIMALS_ZH, ELEMENTS, TEN_GODS, tenGod, branchPair, stemPair, analyseStrength,
} from './bazi.js';

const dayOf = (c) => c.pillars.find((p) => p.key === 'day');
const yearOf = (c) => c.pillars.find((p) => p.key === 'year');

// Share of `giver`'s element weight that falls in `taker`'s favourable elements.
function supportShare(taker, giver) {
  const fav = analyseStrength(taker).favourable;
  const total = giver.weighted.reduce((a, b) => a + b, 0);
  return fav.reduce((sum, e) => sum + giver.weighted[e], 0) / total;
}

function branchFactor(a, b, what, weight, t) {
  const r = branchPair(a, b);
  const pair = `${BRANCHES[a]}${BRANCHES[b]}`;
  const sep = t(': ', '：');
  const out = [];
  if (r.combo != null) out.push({ score: 2 * weight, head: `${what}${sep}${pair}${t(' combine', '六合')}`, body: t('A six combination: the two pull together and settle each other.', '六合：彼此吸引，能互相安定。') });
  else if (r.trio != null) out.push({ score: weight, head: `${what}${sep}${pair}${t(' in the same harmony group', '同属三合局')}`, body: t(`Part of the same three-harmony (${ELEMENTS[r.trio].en}) group: easy cooperation.`, `同属${ELEMENTS[r.trio].zh}的三合局：容易合作。`) });
  if (r.clash) out.push({ score: -2 * weight, head: `${what}${sep}${pair}${t(' clash', '相冲')}`, body: t('Opposite branches: lively but restless, and differences need talking through.', '地支相冲：相处热闹但不安定，分歧需要多沟通。') });
  if (r.harm) out.push({ score: -weight, head: `${what}${sep}${pair}${t(' harm', '相害')}`, body: t('A “harm” pair: small misunderstandings can build up if left unsaid.', '相害：小误会不说开容易累积。') });
  if (r.punish) out.push({ score: -weight, head: `${what}${sep}${pair}${t(' punishment', '相刑')}`, body: t('A “punishment” pair: friction under stress, so patience matters.', '相刑：压力下容易摩擦，需要耐心。') });
  if (!out.length && a === b) out.push({ score: weight, head: `${what}${sep}${t(`both ${BRANCHES[a]}`, `同为${BRANCHES[a]}`)}`, body: t('The same branch: similar instincts and habits.', '地支相同：本能和习惯相近。') });
  return out;
}

// a and b are computeChart() results; genders come from their inputs. lang 'zh' gives Chinese text.
export function compareCharts(a, b, nameA = 'A', nameB = 'B', lang = 'en') {
  const zh = lang === 'zh';
  const t = (en, cn) => (zh ? cn : en);
  const god = (g) => (zh ? TEN_GODS[g].zh : `${TEN_GODS[g].zh} ${TEN_GODS[g].en}`);
  const factors = [];
  const da = dayOf(a); const db = dayOf(b);

  const sp = stemPair(da.stem, db.stem);
  const dms = `${STEMS[da.stem]}${STEMS[db.stem]}`;
  if (sp.combo != null) factors.push({ score: 2, head: t(`Day masters ${dms} combine`, `日主${dms}相合`), body: t('The classic sign of strong natural attraction between two people.', '两人之间有强烈自然吸引力的经典标志。') });
  if (sp.clash) factors.push({ score: -1, head: t(`Day masters ${dms} clash`, `日主${dms}相冲`), body: t('Different temperaments that can spark disagreement, or balance each other with effort.', '性情不同，容易起分歧，用心经营也能互补。') });

  const godAB = tenGod(da.stem, db.stem); const godBA = tenGod(db.stem, da.stem);
  factors.push({
    score: 0,
    head: t('How you see each other', '彼此在对方命中是什么'),
    body: t(`To ${nameA}, ${nameB}'s day master ${STEMS[db.stem]} is ${god(godAB)}. To ${nameB}, ${nameA}'s ${STEMS[da.stem]} is ${god(godBA)}.`,
      `对${nameA}来说，${nameB}的日主${STEMS[db.stem]}是${god(godAB)}；对${nameB}来说，${nameA}的${STEMS[da.stem]}是${god(godBA)}。`),
  });
  // Spouse stars: Wealth for men, Officer for women.
  const spouseStar = (gender, g) => (gender === 'female' ? g === 6 || g === 7 : g === 4 || g === 5);
  for (const [who, other, gender, g] of [[nameA, nameB, a.input.gender, godAB], [nameB, nameA, b.input.gender, godBA]]) {
    if (spouseStar(gender, g)) {
      factors.push({
        score: 1,
        head: t(`${other} is ${who}'s spouse star`, `${other}是${who}的配偶星`),
        body: t(`${TEN_GODS[g].en} is the traditional partner star for a ${gender === 'female' ? 'woman' : 'man'}.`, `传统上${gender === 'female' ? '女命以官杀' : '男命以财星'}为配偶星，${TEN_GODS[g].zh}正是其中之一。`),
      });
    }
  }

  factors.push(...branchFactor(da.branch, db.branch, t('Spouse palaces (day branches)', '夫妻宫（日支）'), 1, t));
  const ya = yearOf(a); const yb = yearOf(b);
  factors.push(...branchFactor(ya.branch, yb.branch, t(`Zodiac: ${ANIMALS[ya.branch]} and ${ANIMALS[yb.branch]}`, `生肖：${ANIMALS_ZH[ya.branch]}和${ANIMALS_ZH[yb.branch]}`), 0.5, t));

  for (const [taker, giver, tn, gn] of [[a, b, nameA, nameB], [b, a, nameB, nameA]]) {
    const share = supportShare(taker, giver);
    const fav = analyseStrength(taker).favourable.map((e) => (zh ? ELEMENTS[e].zh : ELEMENTS[e].en)).join(t(' and ', '、'));
    const pct = Math.round(share * 100);
    if (share >= 0.5) factors.push({ score: 1, head: t(`${gn} brings ${tn}'s favourable elements`, `${gn}带来${tn}的喜用神`), body: t(`${pct}% of ${gn}'s chart is ${fav}, which ${tn}'s chart needs.`, `${gn}的命盘有${pct}%是${fav}，正是${tn}需要的。`) });
    else if (share <= 0.25) factors.push({ score: -1, head: t(`${gn} brings little of what ${tn} needs`, `${gn}较少带来${tn}需要的五行`), body: t(`Only ${pct}% of ${gn}'s chart is ${fav}, ${tn}'s favourable elements.`, `${gn}的命盘只有${pct}%是${tn}的喜用神（${fav}）。`) });
    else factors.push({ score: 0, head: t(`${gn} brings some of what ${tn} needs`, `${gn}带来部分${tn}需要的五行`), body: t(`${pct}% of ${gn}'s chart is ${fav}, ${tn}'s favourable elements.`, `${gn}的命盘有${pct}%是${tn}的喜用神（${fav}）。`) });
  }

  const total = factors.reduce((s, f) => s + f.score, 0);
  const verdict = total >= 3 ? t('Very supportive', '非常相配') : total >= 1 ? t('Supportive', '相配') : total > -1 ? t('Mixed', '有好有坏')
    : total > -3 ? t('Some friction', '有些摩擦') : t('Challenging', '挑战较多');
  return { total, verdict, factors };
}
