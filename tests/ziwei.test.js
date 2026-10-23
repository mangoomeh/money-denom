import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeZiwei, ziweiBirth, PALACES, MAIN_STARS, starsToRead, decadeAt, nominalAge, yearly, SIHUA } from '../src/ziwei.js';
import { computeChart, BRANCHES, STEMS } from '../src/bazi.js';

const names = (list) => list.map((s) => MAIN_STARS[s.star].zh).join('');

// Lunar 1990-04-23, 辰 hour, male: the same chart as the open-source iztro library gives.
test('a full chart: palaces, stems, bureau, main stars, 四化 and 10-year periods', () => {
  const z = computeZiwei({ year: 1990, month: 4, day: 23, hour: 4, gender: 'male' });
  assert.equal(BRANCHES[z.life], '丑');
  assert.equal(BRANCHES[z.body], '酉');
  assert.equal(z.bureau, 6);
  assert.equal(z.lifeNayin, '霹雳火');
  const row = (b) => {
    const p = z.palaces[BRANCHES.indexOf(b)];
    return `${STEMS[p.stem]}${b} ${PALACES[p.name].zh} ${names(p.main)} ${p.decade.from}`;
  };
  assert.deepEqual(['丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子'].map(row), [
    '己丑 命宫 太阳太阴 6', '戊寅 父母 贪狼 16', '己卯 福德 天机巨门 26', '庚辰 田宅 紫微天相 36',
    '辛巳 官禄 天梁 46', '壬午 交友 七杀 56', '癸未 迁移  66', '甲申 疾厄 廉贞 76',
    '乙酉 财帛  86', '丙戌 子女 破军 96', '丁亥 夫妻 天同 106', '戊子 兄弟 武曲天府 116',
  ]);
  // 庚 year: 太阳 禄, 武曲 权, 太阴 科, 天同 忌.
  const hua = Object.fromEntries(z.palaces.flatMap((p) => [...p.main, ...p.minor]).filter((s) => s.hua != null).map((s) => [s.star, s.hua]));
  assert.deepEqual(hua, { taiyang: 0, wuqu: 1, taiyin: 2, tiantong: 3 });
  // Minor stars, also as iztro places them.
  const minorAt = (b) => z.palaces[BRANCHES.indexOf(b)].minor.map((s) => s.star).sort();
  assert.deepEqual(minorAt('未'), ['dikong', 'lingxing', 'tianyue', 'tuoluo', 'youbi', 'zuofu']);
  assert.deepEqual(minorAt('申'), ['lucun', 'tianma', 'wenqu']);
});

test('紫微 is placed by the bureau and the lunar day, as the classical tables give', () => {
  const ziweiAt = (bureau, day) => {
    // Find a life palace whose 纳音 gives this bureau, then read where 紫微 lands.
    for (let month = 1; month <= 12; month++) {
      for (let hour = 0; hour < 12; hour++) {
        const z = computeZiwei({ year: 1990, month, day, hour });
        if (z.bureau === bureau) return BRANCHES[z.at.ziwei];
      }
    }
    return null;
  };
  // Day 1 for each bureau, and a few more rows of the tables.
  assert.deepEqual([2, 3, 4, 5, 6].map((b) => ziweiAt(b, 1)), ['丑', '辰', '亥', '午', '酉']);
  assert.deepEqual([ziweiAt(2, 2), ziweiAt(3, 3), ziweiAt(4, 4), ziweiAt(5, 5), ziweiAt(6, 6)], ['寅', '寅', '寅', '寅', '寅']);
  assert.deepEqual([ziweiAt(2, 30), ziweiAt(6, 30)], ['辰', '午']);
});

test('天府 mirrors 紫微 across the 寅–申 line, and the two star groups keep their spacing', () => {
  for (let day = 1; day <= 30; day++) {
    const z = computeZiwei({ year: 2000, month: 6, day, hour: 6 });
    const { at } = z;
    assert.equal((at.ziwei + at.tianfu) % 12, 4);
    assert.deepEqual([at.tianji, at.taiyang, at.wuqu, at.tiantong, at.lianzhen].map((p) => (at.ziwei - p + 12) % 12), [1, 3, 4, 5, 8]);
    assert.deepEqual([at.taiyin, at.tanlang, at.jumen, at.tianxiang, at.tianliang, at.qisha, at.pojun].map((p) => (p - at.tianfu + 12) % 12), [1, 2, 3, 4, 5, 6, 10]);
  }
});

test('10-year periods run clockwise for yang-year men and yin-year women', () => {
  const yangMale = computeZiwei({ year: 1990, month: 4, day: 23, hour: 4, gender: 'male' }); // 庚 = yang
  const yangFemale = computeZiwei({ year: 1990, month: 4, day: 23, hour: 4, gender: 'female' });
  const next = (z) => z.palaces.find((p) => p.decade.from === z.bureau + 10).branch;
  assert.equal(yangMale.forward, true);
  assert.equal(next(yangMale), (yangMale.life + 1) % 12);
  assert.equal(next(yangFemale), (yangFemale.life + 11) % 12);
  assert.equal(decadeAt(yangMale, 40).branch, BRANCHES.indexOf('辰'));
  assert.equal(decadeAt(yangMale, 3), null);
  assert.equal(nominalAge(yangMale, 2026), 37);
});

test('an empty palace reads the main stars of the opposite one', () => {
  const z = computeZiwei({ year: 1990, month: 4, day: 23, hour: 4 });
  const travel = z.palaces[BRANCHES.indexOf('未')];
  const r = starsToRead(z, travel);
  assert.equal(r.borrowed, true);
  assert.equal(names(r.stars), '太阳太阴');
});

test('this year: its palace and where its four transformations land', () => {
  const z = computeZiwei({ year: 1990, month: 4, day: 23, hour: 4 });
  const y = yearly(z, 2026); // 丙午
  assert.equal(STEMS[y.stem] + BRANCHES[y.branch], '丙午');
  assert.equal(PALACES[y.palace.name].zh, '交友');
  assert.deepEqual(y.hua.map((h) => h.star), SIHUA[2]);
  assert.equal(PALACES[y.hua[3].palace.name].zh, '疾厄', '廉贞 化忌 sits in 申');
});

test('the birth details come from the BaZi chart: same moment, leap months and the 23:00 rule', () => {
  const base = { year: 1990, month: 5, day: 17, hour: 8, minute: 30, tzOffset: 8, gender: 'male' };
  const b = ziweiBirth(computeChart(base));
  assert.deepEqual([b.year, b.month, b.day, BRANCHES[b.hour]], [1990, 4, 23, '辰']);
  // 23:30 counts as the next day's 子 hour when 23:00 starts the day (the default).
  const late = ziweiBirth(computeChart({ ...base, hour: 23, minute: 30 }));
  assert.deepEqual([late.day, BRANCHES[late.hour]], [24, '子']);
  const sameDay = ziweiBirth(computeChart({ ...base, hour: 23, minute: 30, ziStartsDay: false }));
  assert.deepEqual([sameDay.day, BRANCHES[sameDay.hour]], [23, '子']);
  // 2023 had a leap 2nd month: its 4th day counts as month 2, its 20th as month 3.
  assert.deepEqual([ziweiBirth(computeChart({ ...base, year: 2023, month: 3, day: 25 })).month, ziweiBirth(computeChart({ ...base, year: 2023, month: 4, day: 10 })).month], [2, 3]);
  // No birth time, no Zi Wei chart.
  assert.equal(ziweiBirth(computeChart({ ...base, timeKnown: false })), null);
});
