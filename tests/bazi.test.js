import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sunLongitude, solarTermMs, computeChart, tenGod, lifeStage, voidBranches, pillarOf, interactions,
  annualPillar, equationOfTime, parseBirth, nayin, nayinEn, LIFE_STAGES_EN, STEMS, BRANCHES,
} from '../src/bazi.js';

const names = (c) => c.pillars.map((p) => (p.missing ? null : p.name));
const cst = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h - 8, mi);
const MIN = 60000;

test('sun longitude matches Meeus example 25.b', () => {
  assert.ok(Math.abs(sunLongitude(2448908.5) - 199.90606) < 0.0003);
});

test('solar terms land within a minute of published times (Beijing time)', () => {
  const cases = [
    [315, cst(2024, 2, 4, 16, 27)], // 立春
    [0, cst(2024, 3, 20, 11, 6)], // 春分
    [90, cst(2024, 6, 21, 4, 51)], // 夏至
    [270, cst(2023, 12, 22, 11, 27)], // 冬至
    [270, cst(2024, 12, 21, 17, 21)],
  ];
  for (const [deg, expected] of cases) {
    const got = solarTermMs(deg, expected + 3 * 86400000);
    assert.ok(Math.abs(got - expected) < 1.5 * MIN, `${deg}°: off by ${(got - expected) / MIN} min`);
  }
});

test('a well-known chart: 26 Dec 1893, 辰 hour', () => {
  const c = computeChart({ year: 1893, month: 12, day: 26, hour: 8, minute: 0, tzOffset: 8, gender: 'male' });
  assert.deepEqual(names(c), ['甲辰', '丁酉', '甲子', '癸巳']);
  assert.equal(c.luck.forward, false); // yin year, male
  assert.equal(c.luck.pillars[0].name, '癸亥');
});

test('the year and month change at 立春, not on 1 January', () => {
  const before = computeChart({ year: 2024, month: 2, day: 4, hour: 16, minute: 0, tzOffset: 8 });
  const after = computeChart({ year: 2024, month: 2, day: 4, hour: 17, minute: 0, tzOffset: 8 });
  assert.deepEqual(names(before).slice(1), ['戊戌', '乙丑', '癸卯']);
  assert.deepEqual(names(after).slice(1), ['戊戌', '丙寅', '甲辰']);
  assert.equal(after.animal, 'Dragon');
  const jan = computeChart({ year: 2000, month: 1, day: 1, hour: 0, minute: 30, tzOffset: 8 });
  assert.deepEqual(names(jan), ['壬子', '戊午', '丙子', '己卯']);
});

test('23:00 starts the next day unless the late-Zi option is chosen', () => {
  const base = { year: 2000, month: 1, day: 1, hour: 23, minute: 30, tzOffset: 8 };
  assert.deepEqual(names(computeChart(base)).slice(0, 2), ['甲子', '己未']);
  assert.deepEqual(names(computeChart({ ...base, ziStartsDay: false })).slice(0, 2), ['甲子', '戊午']);
});

test('true solar time moves the hour in Singapore back by about an hour', () => {
  const sg = computeChart({ year: 1990, month: 6, day: 15, hour: 7, minute: 30, tzOffset: 8 });
  const solar = computeChart({ year: 1990, month: 6, day: 15, hour: 7, minute: 30, tzOffset: 8, longitude: 103.82, trueSolar: true });
  assert.equal(sg.pillars[0].name.slice(1), '辰');
  assert.equal(solar.pillars[0].name.slice(1), '卯'); // about 06:25 solar time
  assert.equal(solar.solarTime.hour, 6);
});

test('unknown birth time leaves out the hour pillar', () => {
  const c = computeChart({ year: 1985, month: 7, day: 3, timeKnown: false, tzOffset: 8 });
  assert.equal(c.pillars[0].missing, true);
  assert.equal(c.counts.reduce((a, b) => a + b, 0), 6);
});

test('luck pillars start from the days to the solar term, 3 days to a year', () => {
  // 2000-01-01 is a 己 (yin) year: a man counts back to 大雪 on 7 Dec 1999, about 25 days.
  const man = computeChart({ year: 2000, month: 1, day: 1, hour: 12, minute: 0, tzOffset: 8, gender: 'male' });
  assert.equal(man.luck.forward, false);
  assert.ok(Math.abs(man.luck.gapDays - 24.8) < 0.3, String(man.luck.gapDays));
  assert.equal(man.luck.startYears, 8);
  assert.deepEqual(man.luck.pillars.slice(0, 2).map((p) => p.name), ['乙亥', '甲戌']);
  const woman = computeChart({ year: 2000, month: 1, day: 1, hour: 12, minute: 0, tzOffset: 8, gender: 'female' });
  assert.equal(woman.luck.forward, true);
  assert.equal(woman.luck.pillars[0].name, '丁丑');
  assert.equal(woman.luck.startYears, 1); // about 5 days to 小寒
});

test('ten gods', () => {
  const g = (dm, s) => tenGod(STEMS.indexOf(dm), STEMS.indexOf(s));
  assert.equal(g('甲', '甲'), 0); // 比肩
  assert.equal(g('甲', '乙'), 1); // 劫财
  assert.equal(g('甲', '丙'), 2); // 食神
  assert.equal(g('甲', '丁'), 3); // 伤官
  assert.equal(g('甲', '戊'), 4); // 偏财
  assert.equal(g('甲', '己'), 5); // 正财
  assert.equal(g('甲', '庚'), 6); // 七杀
  assert.equal(g('甲', '辛'), 7); // 正官
  assert.equal(g('甲', '壬'), 8); // 偏印
  assert.equal(g('甲', '癸'), 9); // 正印
  assert.equal(g('丁', '壬'), 7);
});

test('life stages, void branches and annual pillars', () => {
  assert.equal(lifeStage(0, BRANCHES.indexOf('亥')), 0); // 甲 长生 in 亥
  assert.equal(lifeStage(0, BRANCHES.indexOf('卯')), 4); // 甲 帝旺 in 卯
  assert.equal(lifeStage(1, BRANCHES.indexOf('午')), 0); // 乙 长生 in 午
  assert.equal(lifeStage(1, BRANCHES.indexOf('巳')), 1); // 乙 沐浴 in 巳
  assert.deepEqual(voidBranches(pillarOf(0)).map((b) => BRANCHES[b]), ['戌', '亥']); // 甲子 week
  assert.deepEqual(voidBranches(pillarOf(54)).map((b) => BRANCHES[b]), ['子', '丑']); // 戊午 is in 甲寅 week
  assert.equal(annualPillar(2024, 0).name, '甲辰');
  assert.equal(annualPillar(1984, 0).name, '甲子');
});

test('interactions between pillars', () => {
  const p = (s, b) => ({ stem: STEMS.indexOf(s), branch: BRANCHES.indexOf(b) });
  const found = interactions([p('甲', '子'), p('己', '午'), p('庚', '辰'), p('丙', '申')]).map((x) => x.text);
  assert.ok(found.includes('甲己 combine'));
  assert.ok(found.includes('甲庚 clash'));
  assert.ok(found.includes('子午 clash'));
  assert.ok(found.includes('申子辰 three harmony'));
});

test('equation of time and date parsing', () => {
  assert.ok(Math.abs(equationOfTime(Date.UTC(2024, 10, 3)) - 16.4) < 0.3);
  assert.ok(Math.abs(equationOfTime(Date.UTC(2024, 1, 11)) + 14.2) < 0.3);
  assert.deepEqual(parseBirth('1990-06-15', '07:05'), { year: 1990, month: 6, day: 15, timeKnown: true, hour: 7, minute: 5 });
  assert.equal(parseBirth('1990-06-15', '').timeKnown, false);
  assert.equal(parseBirth('2023-02-29', '10:00'), null);
  assert.equal(parseBirth('2024-02-29', '10:00').day, 29);
  assert.equal(parseBirth('1990-13-01', ''), null);
});

test('纳音 and life stages have English names', () => {
  assert.equal(nayin(pillarOf(0)), '海中金');
  assert.equal(nayinEn(pillarOf(0)), 'Gold in the Sea');
  assert.equal(nayinEn(pillarOf(59)), 'Great Sea Water');
  assert.equal(LIFE_STAGES_EN.length, 12);
});

test('reading: day master, pillars, themes, balance and timing', async () => {
  const { buildReading, familyCounts } = await import('../src/baziread.js');
  const c = computeChart({ year: 1996, month: 12, day: 10, timeKnown: false, tzOffset: 8, gender: 'male' });
  assert.deepEqual(familyCounts(c), [1, 2, 0, 2, 0]); // 庚 劫财; 癸癸 食神; 丙 and 巳's 丙 正官
  const sections = buildReading(c, new Date(2026, 9, 19));
  assert.deepEqual(sections.map((s) => s.title), ['You: 辛 Yin Metal', 'What each pillar covers', 'Your main themes', 'Strength and favourable elements', 'Now']);
  const text = JSON.stringify(sections);
  assert.ok(text.includes('Missing: Wealth'));
  assert.ok(text.includes('Least: 木 Wood (missing)'));
  assert.ok(text.includes('Day master: weak'));
  assert.ok(text.includes('Useful element: 土 Earth'));
  assert.ok(text.includes('This decade: 癸卯 (from 2025), demanding'));
  assert.ok(text.includes('2026: 丙午, favourable')); // Fire warms a winter chart
  assert.ok(text.includes('Climate (调候): a winter chart needs Fire'));
  assert.ok(text.includes('clashes with your month pillar 子 and year pillar 子'));
  assert.ok(text.includes('Hour pillar: unknown'));
});

test('time zones follow the birthplace history', async () => {
  const { zoneOffset } = await import('../src/bazi.js');
  assert.deepEqual(zoneOffset('Asia/Singapore', 1975, 6, 1, 8, 0), { offset: 7.5, dst: false }); // UTC+7:30 until 1982
  assert.equal(zoneOffset('Asia/Singapore', 1982, 1, 2).offset, 8);
  assert.deepEqual(zoneOffset('Asia/Shanghai', 1988, 7, 1, 8, 0), { offset: 9, dst: true }); // China DST 1986–91
  assert.equal(zoneOffset('Asia/Shanghai', 1988, 12, 1).offset, 8);
  assert.deepEqual(zoneOffset('Asia/Hong_Kong', 1970, 7, 1), { offset: 9, dst: true });
  // the same clock time at UTC+7:30 is half an hour later in real time than at UTC+8
  const real = computeChart({ year: 1975, month: 6, day: 1, hour: 23, minute: 15, tzOffset: 7.5 });
  const naive = computeChart({ year: 1975, month: 6, day: 1, hour: 23, minute: 15, tzOffset: 8 });
  assert.equal(real.utcMs - naive.utcMs, 30 * 60000);
});

test('day master strength and favourable elements', async () => {
  const { analyseStrength, pillarFavour, ELEMENTS: EL } = await import('../src/bazi.js');
  // 辛 metal born in the 子 (water) month, no metal or earth support from the season: weak
  const s = analyseStrength(computeChart({ year: 1996, month: 12, day: 10, timeKnown: false, tzOffset: 8 }));
  assert.equal(s.verdict, 'weak');
  assert.equal(s.checks.season, false);
  assert.equal(s.checks.root, true); // 巳 holds 庚
  assert.equal(EL[s.useful].en, 'Earth'); // drained by water (output): the resource helps
  assert.deepEqual(s.favourable.map((e) => EL[e].en), ['Earth', 'Metal', 'Fire']); // Fire added for a winter birth
  assert.equal(s.season, 'cold');
  assert.equal(pillarFavour(s, 4, 9), 'good'); // 戊酉: earth and metal
  assert.equal(pillarFavour(s, 8, 0), 'hard'); // 壬子: water
  // 26 Dec 1893: 丁 fire in winter, the published reading needs wood
  const m = analyseStrength(computeChart({ year: 1893, month: 12, day: 26, hour: 8, minute: 0, tzOffset: 8 }));
  assert.equal(m.lean, 'weak');
  assert.equal(EL[m.useful].en, 'Wood');
});

test('compatibility checks day masters, spouse palaces, zodiac and elements', async () => {
  const { compareCharts } = await import('../src/bazimatch.js');
  // 甲子 day and 己丑 day: day masters combine (甲己) and day branches combine (子丑)
  const find = (d) => {
    for (let t = Date.UTC(1990, 0, 1); ; t += 86400000) {
      const x = new Date(t);
      const c = computeChart({ year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate(), hour: 12, minute: 0, tzOffset: 8, gender: 'female' });
      if (c.pillars[1].name === d) return c;
    }
  };
  const he = find('甲子'); const she = find('己丑');
  const r = compareCharts({ ...he, input: { ...he.input, gender: 'male' } }, she, 'He', 'She');
  const heads = r.factors.map((f) => f.head);
  assert.ok(heads.includes('Day masters 甲己 combine'));
  assert.ok(heads.includes('Spouse palaces (day branches): 子丑 combine'));
  assert.ok(heads.includes("She is He's spouse star")); // 己 is 正财 to 甲
  assert.ok(['Very supportive', 'Supportive'].includes(r.verdict));
  const clash = compareCharts(he, find('庚午'), 'X', 'Y');
  assert.ok(clash.factors.some((f) => f.head === 'Day masters 甲庚 clash'));
  assert.ok(clash.factors.some((f) => f.head === 'Spouse palaces (day branches): 子午 clash'));
});

test('lunar calendar matches published dates', async () => {
  const { lunarToSolar, solarToLunar, newMoonMs, lunarYearMonths } = await import('../src/lunar.js');
  const { jdFromMs } = await import('../src/bazi.js');
  // Meeus example 49.a: new moon of Feb 1977 at JDE 2443192.65118 (UT about 48 s earlier)
  assert.ok(Math.abs(jdFromMs(newMoonMs(-283)) - (2443192.65118 - 48 / 86400)) < 0.0005);
  const cny = { 1985: [2, 20], 1996: [2, 19], 2023: [1, 22], 2024: [2, 10], 2025: [1, 29], 2033: [1, 31], 2034: [2, 19] };
  for (const [y, [m, d]] of Object.entries(cny)) assert.deepEqual(lunarToSolar(Number(y), 1, 1), { year: Number(y), month: m, day: d }, `CNY ${y}`);
  assert.deepEqual(lunarToSolar(2020, 4, 1, true), { year: 2020, month: 5, day: 23 }); // 闰四月
  assert.deepEqual(lunarToSolar(2023, 2, 1, true), { year: 2023, month: 3, day: 22 }); // 闰二月
  assert.deepEqual(lunarToSolar(1984, 10, 1, true), { year: 1984, month: 11, day: 23 }); // 闰十月
  assert.deepEqual(lunarToSolar(2033, 11, 1, true), { year: 2033, month: 12, day: 22 }); // the “2033 problem”: 闰十一月
  assert.deepEqual(lunarToSolar(2024, 8, 15), { year: 2024, month: 9, day: 17 }); // Mid-Autumn
  assert.equal(lunarToSolar(2024, 4, 1, true), null); // no leap 4th month in 2024
  assert.deepEqual(solarToLunar(1996, 12, 10), { year: 1996, month: 10, day: 30, leap: false, days: 30 });
  assert.equal(lunarYearMonths(2023).length, 13);
});

test('month and day pillars, and symbolic stars', async () => {
  const { monthPillarsOf, dayPillar, pillarName: name, symbolicStars } = await import('../src/bazi.js');
  const months = monthPillarsOf(2026); // 丙午 year: 寅 month is 庚寅
  assert.equal(name(months[0]), '庚寅');
  assert.equal(name(months[11]), '辛丑');
  assert.equal(name(dayPillar(2000, 1, 1)), '戊午');
  const c = computeChart({ year: 1996, month: 12, day: 10, timeKnown: false, tzOffset: 8 });
  assert.deepEqual(symbolicStars(c).map((x) => [x.zh, x.where]), [['文昌', ['month', 'year']]]); // 辛 → 子
  // 26 Dec 1893: 丁 day master; 亥 and 酉 are its nobleman branches, and 酉 (day) is there
  const m = computeChart({ year: 1893, month: 12, day: 26, hour: 8, minute: 0, tzOffset: 8 });
  assert.ok(symbolicStars(m).some((x) => x.id === 'nobleman' && x.where.includes('day')));
});
