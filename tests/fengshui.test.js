import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mountainOf, palaceOf, mountainOffset, mountainYang, MOUNTAINS, fly, houseChart, annualStar, afflictions, solarYear,
  periodOf, monthStar, monthOf, kuaOf, mansionPalaces, mansionAt, houseKua, comboFor, timeliness,
} from '../src/fengshui.js';

test('degrees map to the 24 mountains and 8 palaces', () => {
  assert.equal(MOUNTAINS[mountainOf(0)], '子');
  assert.equal(MOUNTAINS[mountainOf(352.6)], '子');
  assert.equal(MOUNTAINS[mountainOf(352.4)], '壬');
  assert.equal(MOUNTAINS[mountainOf(180)], '午');
  assert.equal(MOUNTAINS[mountainOf(165)], '丙');
  assert.equal(MOUNTAINS[mountainOf(45)], '艮');
  assert.equal(palaceOf(22.4), 0);
  assert.equal(palaceOf(22.6), 1);
  assert.equal(palaceOf(337.6), 0);
  assert.ok(Math.abs(mountainOffset(185) - 5) < 1e-9);
  assert.ok(Math.abs(mountainOffset(357) + 3) < 1e-9);
});

test('mountain polarity: 天元 子午卯酉 yin, 乾坤艮巽 yang; 地元 甲庚壬丙 yang, 辰戌丑未 yin', () => {
  const yang = (ch) => mountainYang(MOUNTAINS.indexOf(ch));
  for (const ch of '子午卯酉辰戌丑未癸丁乙辛') assert.equal(yang(ch), false, ch);
  for (const ch of '乾坤艮巽甲庚壬丙寅申巳亥') assert.equal(yang(ch), true, ch);
});

test('stars fly through the Lo Shu path', () => {
  assert.deepEqual(fly(5).palaces, [1, 8, 3, 4, 9, 2, 7, 6]);
  assert.deepEqual(fly(9).palaces, [5, 3, 7, 8, 4, 6, 2, 1]);
  assert.deepEqual(fly(5, false).palaces, [9, 2, 7, 6, 1, 8, 3, 4]);
});

test('Period 8 壬山丙向 has both 8s at the sitting; 子山午向 has both at the facing', () => {
  const ren = houseChart(8, 165, 'off');
  assert.equal(ren.mountain.palaces[0], 8);
  assert.equal(ren.water.palaces[0], 8);
  assert.ok(ren.features.includes('doubleAtSitting'));
  const zi = houseChart(8, 180, 'off');
  assert.equal(zi.mountain.center, 4);
  assert.equal(zi.water.center, 3);
  assert.ok(zi.features.includes('doubleAtFacing'));
});

test('Period 9 子山午向: the 5 borrows 午 from period 9 and flies backward', () => {
  const c = houseChart(9, 180, 'off');
  assert.equal(c.mountain.center, 5);
  assert.equal(c.mountain.forward, false);
  assert.equal(c.water.center, 4);
  assert.equal(c.water.forward, true);
  assert.ok(c.features.includes('doubleAtSitting'));
  assert.ok(c.features.includes('fanYinMountain'));
});

test('Period 8 丑山未向 and 未山丑向 are both 旺山旺向', () => {
  assert.ok(houseChart(8, 210, 'off').features.includes('wangShanWangXiang'));
  assert.ok(houseChart(8, 30, 'off').features.includes('wangShanWangXiang'));
});

test('replacement stars apply only when the facing is well off-centre', () => {
  assert.equal(houseChart(8, 182, 'auto').useReplacement, false);
  const r = houseChart(8, 186, 'auto');
  assert.equal(r.useReplacement, true);
  // Mountain seed 4 → 巽 → replaced by 6; facing seed 3 → 卯 → replaced by 2.
  assert.equal(r.mountain.center, 6);
  assert.equal(r.water.center, 2);
  assert.equal(r.replaced, true);
});

test('annual stars and afflictions', () => {
  assert.equal(annualStar(2024), 3);
  assert.equal(annualStar(2025), 2);
  assert.equal(annualStar(2026), 1);
  assert.equal(annualStar(2027), 9);
  const a = afflictions(2026);
  assert.equal(MOUNTAINS[a.taiSui], '午');
  assert.equal(MOUNTAINS[a.yearBreaker], '子');
  assert.equal(a.threeKillings, 0); // North
  assert.equal(a.fiveYellow, 4); // South
  assert.equal(afflictions(2025).threeKillings, 2); // 巳酉丑 years → East
});

test('feng shui years start at 立春', () => {
  assert.equal(solarYear(2026, 2, 3), 2025);
  assert.equal(solarYear(2026, 2, 4), 2026);
  assert.equal(solarYear(2026, 1, 20), 2025);
  assert.equal(periodOf(2023), 8);
  assert.equal(periodOf(2024), 9);
  assert.equal(periodOf(2044), 1);
  assert.equal(periodOf(1990), 7);
});

test('monthly stars', () => {
  assert.equal(monthStar(2026, 0), 8); // 午 year, 寅 month
  assert.equal(monthStar(2024, 0), 5); // 辰 year
  assert.equal(monthStar(2025, 0), 2); // 巳 year
  assert.equal(monthStar(2026, 11), 6);
  const m = monthOf(2026, Date.UTC(2026, 9, 19));
  assert.equal(m.month, 8); // 戌 month, from 寒露 (8 Oct)
  assert.equal(m.star, 9);
});

test('Kua numbers', () => {
  assert.equal(kuaOf(1985, 'male'), 6);
  assert.equal(kuaOf(1985, 'female'), 9);
  assert.equal(kuaOf(1990, 'male'), 1);
  assert.equal(kuaOf(1990, 'female'), 8); // 5 → 8
  assert.equal(kuaOf(2000, 'male'), 9);
  assert.equal(kuaOf(2000, 'female'), 6);
  assert.equal(kuaOf(1986, 'male'), 2); // 5 → 2
});

test('Eight Mansions directions', () => {
  // Kua 1: 生气 SE, 天医 E, 延年 S, 伏位 N; 绝命 SW.
  assert.deepEqual(mansionPalaces(1).slice(0, 4), [3, 2, 4, 0]);
  assert.equal(mansionAt(1, 5), 7);
  // Every Kua uses each palace once, and 伏位 is its own palace.
  for (const k of [1, 2, 3, 4, 6, 7, 8, 9]) {
    assert.deepEqual([...mansionPalaces(k)].sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.equal(houseKua(mansionPalaces(k)[3]), k);
  }
});

test('combinations and timeliness', () => {
  assert.equal(comboFor(5, 2).tone, 'bad');
  assert.equal(comboFor(4, 1).tone, 'good');
  assert.equal(comboFor(9, 9), null);
  assert.equal(timeliness(9, 9), 'prosperous');
  assert.equal(timeliness(1, 9), 'growing');
  assert.equal(timeliness(8, 9), 'retreating');
  assert.equal(timeliness(5, 9), 'harmful');
  assert.equal(timeliness(6, 9), 'dormant');
});
