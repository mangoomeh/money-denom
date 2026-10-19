// Feng shui calculations: the 24 mountains, Xuan Kong flying stars (玄空飞星), annual and monthly stars,
// the year's afflictions and the Eight Mansions (八宅) Kua number. Years start at 立春, as in BaZi.

import { solarTermMs, BRANCHES } from './bazi.js';

const mod = (n, m) => ((n % m) + m) % m;
const wrap9 = (n) => mod(n - 1, 9) + 1;
const DAY_MS = 86400000;

// Eight palaces clockwise from north; palace i is centred on i × 45°.
export const PALACES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const PALACES_EN = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
export const PALACES_ZH = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
export const TRIGRAMS = ['坎', '艮', '震', '巽', '离', '坤', '兑', '乾'];
export const TRIGRAM_SYMBOLS = ['☵', '☶', '☳', '☴', '☲', '☷', '☱', '☰'];

// The 24 mountains clockwise from 子 (centred on 0°); each spans 15°.
export const MOUNTAINS = ['子', '癸', '丑', '艮', '寅', '甲', '卯', '乙', '辰', '巽', '巳', '丙',
  '午', '丁', '未', '坤', '申', '庚', '酉', '辛', '戌', '乾', '亥', '壬'];
export const MOUNTAIN_PINYIN = ['zǐ', 'guǐ', 'chǒu', 'gèn', 'yín', 'jiǎ', 'mǎo', 'yǐ', 'chén', 'xùn', 'sì', 'bǐng',
  'wǔ', 'dīng', 'wèi', 'kūn', 'shēn', 'gēng', 'yǒu', 'xīn', 'xū', 'qián', 'hài', 'rén'];

export const mountainPalace = (m) => Math.floor(mod(m + 1, 24) / 3);
// 0 = 地元 (earth), 1 = 天元 (heaven), 2 = 人元 (man): the mountain's place within its palace.
export const mountainPos = (m) => mod(m + 1, 3);
export const mountainLabel = (m) => `${PALACES[mountainPalace(m)]}${mountainPos(m) + 1}`;
const cardinal = (palace) => palace % 2 === 0;
// 地元 mountains are yang in the four cardinal palaces; 天元 and 人元 mountains are yang in the corner palaces.
export const mountainYang = (m) => (mountainPos(m) === 0) === cardinal(mountainPalace(m));
const mountainAt = (palace, pos) => mod(palace * 3 - 1 + pos, 24);

export const mountainOf = (deg) => Math.floor(mod(deg + 7.5, 360) / 15);
export const palaceOf = (deg) => Math.floor(mod(deg + 22.5, 360) / 45);
// Degrees from the centre of the mountain, from −7.5 to +7.5 (positive = clockwise).
export const mountainOffset = (deg) => mod(deg + 7.5, 360) % 15 - 7.5;

// Lo Shu: each star's home palace, and the order the stars fly through the palaces after the centre.
export const HOME_PALACE = [null, 0, 5, 2, 3, null, 7, 6, 1, 4];
export const PALACE_STAR = [1, 8, 3, 4, 9, 2, 7, 6];
const FLIGHT = [7, 6, 1, 4, 0, 5, 2, 3];

// Fly `center` through the nine palaces. Returns { center, palaces: [star of N, NE, …, NW] }.
export function fly(center, forward = true) {
  const palaces = new Array(8);
  FLIGHT.forEach((p, i) => { palaces[p] = wrap9(forward ? center + i + 1 : center - i - 1); });
  return { center, forward, palaces };
}

export const STARS = [null,
  { en: '1 White', zh: '一白', name: '贪狼', el: 'water', elZh: '水' },
  { en: '2 Black', zh: '二黑', name: '巨门', el: 'earth', elZh: '土' },
  { en: '3 Jade', zh: '三碧', name: '禄存', el: 'wood', elZh: '木' },
  { en: '4 Green', zh: '四绿', name: '文曲', el: 'wood', elZh: '木' },
  { en: '5 Yellow', zh: '五黄', name: '廉贞', el: 'earth', elZh: '土' },
  { en: '6 White', zh: '六白', name: '武曲', el: 'metal', elZh: '金' },
  { en: '7 Red', zh: '七赤', name: '破军', el: 'metal', elZh: '金' },
  { en: '8 White', zh: '八白', name: '左辅', el: 'earth', elZh: '土' },
  { en: '9 Purple', zh: '九紫', name: '右弼', el: 'fire', elZh: '火' },
];

// ---- Years, periods, months -----------------------------------------------------------------------

const liChunMs = (y) => solarTermMs(315, Date.UTC(y, 1, 4));

// The feng shui year (from 立春, Beijing time) that a calendar date falls in.
export function solarYear(y, m, d) {
  const noonBeijing = Date.UTC(y, m - 1, d, 4);
  return noonBeijing < Math.floor((liChunMs(y) + 8 * 3600000) / DAY_MS) * DAY_MS - 8 * 3600000 ? y - 1 : y;
}

// The 20-year period (运) of a feng shui year; Period 1 began in 1864, Period 9 runs 2024–2043.
export const periodOf = (year) => mod(Math.floor((year - 1864) / 20), 9) + 1;
export function periodRange(period, near = 2024) {
  let start = 1864 + (period - 1) * 20;
  while (start + 180 <= near) start += 180;
  return [start, start + 19];
}

export const yearBranch = (year) => mod(year - 4, 12);
export const annualStar = (year) => wrap9(11 - mod(year, 9));

// Month 0 starts at 立春 (寅 month). Returns { month, star, startMs, endMs } for a moment in a feng shui year.
export function monthOf(year, ms) {
  const starts = [];
  for (let i = 0; i <= 12; i++) starts.push(solarTermMs(mod(315 + 30 * i, 360), Date.UTC(year, 1, 4) + i * 30.44 * DAY_MS));
  let month = 0;
  while (month < 11 && ms >= starts[month + 1]) month++;
  return { month, star: monthStar(year, month), startMs: starts[month], endMs: starts[month + 1] };
}
// 子午卯酉 years start the first month at 8, 辰戌丑未 at 5, 寅申巳亥 at 2; each month steps down by one.
export function monthStar(year, month) {
  const first = [8, 5, 2][yearBranch(year) % 3];
  return wrap9(first - month);
}
export const monthStartMs = (year, month) => solarTermMs(mod(315 + 30 * month, 360), Date.UTC(year, 1, 4) + month * 30.44 * DAY_MS);

// The year's main afflictions: Tai Sui and the Year Breaker by mountain, Three Killings by palace,
// and the palaces holding the annual 5 Yellow and 2 Black (null when the star sits in the centre).
export function afflictions(year) {
  const b = yearBranch(year);
  const chart = fly(annualStar(year));
  const palaceOfStar = (s) => { const i = chart.palaces.indexOf(s); return i < 0 ? null : i; };
  return {
    branch: BRANCHES[b],
    taiSui: b * 2,
    yearBreaker: mod(b * 2 + 12, 24),
    threeKillings: [4, 2, 0, 6][b % 4],
    fiveYellow: palaceOfStar(5),
    twoBlack: palaceOfStar(2),
  };
}

// ---- Flying star house chart ----------------------------------------------------------------------

// 替卦 replacement stars: the number each mountain is replaced by when a facing sits off-centre.
const REPLACEMENT = {};
for (const [star, ms] of [[1, '子癸甲申'], [2, '坤壬乙卯未'], [6, '戌乾亥辰巽巳'], [7, '艮丙辛酉丑'], [9, '寅午庚丁']]) {
  for (const ch of ms) REPLACEMENT[ch] = star;
}
export const replacementOf = (m) => REPLACEMENT[MOUNTAINS[m]];

// The star that goes to the centre for a sitting or facing mountain, and which way it flies.
function seed(star, period, mountain, replace) {
  const home = star === 5 ? HOME_PALACE[period] : HOME_PALACE[star];
  // With a 5 in Period 5 there is no home palace to borrow; take the house mountain's own polarity.
  const ref = home == null ? mountain : mountainAt(home, mountainPos(mountain));
  return { star: replace ? replacementOf(ref) : star, forward: mountainYang(ref), ref };
}

// replace: 'auto' uses replacement stars when the facing is more than 4.5° off the centre of its mountain.
export function houseChart(period, facingDeg, replace = 'auto') {
  const facing = mountainOf(facingDeg);
  const sitting = mod(facing + 12, 24);
  const offset = mountainOffset(facingDeg);
  const useReplacement = replace === 'auto' ? Math.abs(offset) > 4.5 : replace === 'on';
  const base = fly(period);
  const fp = mountainPalace(facing);
  const sp = mountainPalace(sitting);
  const mSeed = seed(base.palaces[sp], period, sitting, useReplacement);
  const wSeed = seed(base.palaces[fp], period, facing, useReplacement);
  const mountain = fly(mSeed.star, mSeed.forward);
  const water = fly(wSeed.star, wSeed.forward);
  const plain = useReplacement ? houseChart(period, facingDeg, 'off') : null;
  return {
    period, facingDeg: mod(facingDeg, 360), facing, sitting, facingPalace: fp, sittingPalace: sp, offset,
    replaced: useReplacement && (plain.mountain.center !== mountain.center || plain.water.center !== water.center
      || plain.mountain.forward !== mountain.forward || plain.water.forward !== water.forward),
    useReplacement, base, mountain, water,
    nearPalaceLine: Math.abs(mod(facingDeg + 22.5, 45) - 22.5) > 21, // within 1.5° of a palace boundary
    nearMountainLine: Math.abs(offset) > 6, // within 1.5° of a mountain boundary
    features: chartFeatures(period, base, mountain, water, fp, sp),
  };
}

const groupOf = (n) => mod(n, 3); // {1,4,7} → 1, {2,5,8} → 2, {3,6,9} → 0
function chartFeatures(period, base, mountain, water, fp, sp) {
  const f = [];
  const all = (fn) => [-1, 0, 1, 2, 3, 4, 5, 6, 7].every((p) => (p < 0
    ? fn(base.center, mountain.center, water.center) : fn(base.palaces[p], mountain.palaces[p], water.palaces[p])));
  const mAtSit = mountain.palaces[sp] === period;
  const wAtFace = water.palaces[fp] === period;
  const mAtFace = mountain.palaces[fp] === period;
  const wAtSit = water.palaces[sp] === period;
  if (mAtSit && wAtFace) f.push('wangShanWangXiang');
  else if (mAtFace && wAtSit) f.push('shangShanXiaShui');
  else if (mAtFace && wAtFace) f.push('doubleAtFacing');
  else if (mAtSit && wAtSit) f.push('doubleAtSitting');
  if (all((b, m) => b + m === 10)) f.push('combineTenMountain');
  if (all((b, m, w) => b + w === 10)) f.push('combineTenWater');
  if (all((b, m, w) => groupOf(b) === groupOf(m) && groupOf(m) === groupOf(w))) f.push('parentString');
  if (all((b, m, w) => { const s = [b, m, w].sort((x, y) => x - y); return isRun(s); })) f.push('pearlString');
  if (mountain.center === 5) f.push(mountain.forward ? 'fuYinMountain' : 'fanYinMountain');
  if (water.center === 5) f.push(water.forward ? 'fuYinWater' : 'fanYinWater');
  return f;
}
// Three consecutive stars, counting 9-1 as consecutive (e.g. 8-9-1).
function isRun([a, b, c]) {
  const sets = [[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6], [5, 6, 7], [6, 7, 8], [7, 8, 9], [1, 8, 9], [1, 2, 9]];
  return sets.some((s) => s[0] === a && s[1] === b && s[2] === c);
}

// How a star stands in a period: 'prosperous' (旺), 'growing' (生, next two), 'retreating' (退, previous),
// or 'dormant' (衰/死). 5 is always harmful outside Period 5.
export function timeliness(star, period) {
  if (star === period) return 'prosperous';
  const ahead = mod(star - period, 9);
  if (star === 5) return 'harmful';
  if (ahead === 1 || ahead === 2) return 'growing';
  if (ahead === 8) return 'retreating';
  return 'dormant';
}

// Pairs of mountain and facing stars with traditional meanings (order doesn't matter).
export const COMBOS = [
  { pair: [1, 4], en: 'Study, writing and romance (文昌)', zh: '一四同宫：利读书、文才、桃花', tone: 'good' },
  { pair: [1, 6], en: 'Career advancement and support from superiors', zh: '一六：升迁、贵人', tone: 'good' },
  { pair: [6, 8], en: 'Wealth with authority', zh: '六八：财官双美', tone: 'good' },
  { pair: [8, 9], en: 'Celebrations, property and wealth', zh: '八九：喜庆、置业', tone: 'good' },
  { pair: [1, 8], en: 'Wealth and fame; can bring friction between siblings', zh: '一八：财名，兄弟或有不和', tone: 'mixed' },
  { pair: [2, 8], en: 'Property and land wealth', zh: '二八：田产之财', tone: 'good' },
  { pair: [4, 9], en: 'Study and recognition (in Period 9 the 9 is strong)', zh: '四九：文名、考试', tone: 'good' },
  { pair: [2, 5], en: 'Illness and misfortune; the most feared combination', zh: '二五交加：病符、损主', tone: 'bad' },
  { pair: [2, 3], en: 'Arguments and legal disputes (斗牛煞)', zh: '二三斗牛煞：口舌官非', tone: 'bad' },
  { pair: [3, 7], en: 'Robbery, injury, betrayal', zh: '三七：劫盗、伤灾', tone: 'bad' },
  { pair: [6, 7], en: 'Conflict and disputes (交剑煞)', zh: '六七交剑煞：争斗', tone: 'bad' },
  { pair: [7, 9], en: 'Fire risk (回禄)', zh: '七九：回禄之灾（火险）', tone: 'bad' },
  { pair: [2, 7], en: 'Fire risk when activated', zh: '二七：先天火，防火', tone: 'bad' },
  { pair: [5, 9], en: 'Accidents and fire; avoid renovation here', zh: '五九：灾祸、火险', tone: 'bad' },
  { pair: [5, 7], en: 'Food poisoning, mouth and throat troubles', zh: '五七：口舌、中毒', tone: 'bad' },
  { pair: [3, 5], en: 'Financial loss', zh: '三五：破财', tone: 'bad' },
];
export function comboFor(a, b) {
  return COMBOS.find(({ pair: [x, y] }) => (x === a && y === b) || (x === b && y === a)) || null;
}

// ---- Eight Mansions ---------------------------------------------------------------------------------

// Kua (命卦) from a feng shui birth year. 5 becomes 2 for males and 8 for females.
export function kuaOf(year, gender) {
  if (gender === 'male') { const k = wrap9(11 - mod(year, 9)); return k === 5 ? 2 : k; }
  const k = wrap9(mod(year, 9) + 4);
  return k === 5 ? 8 : k;
}
export const isEastGroup = (kua) => [1, 3, 4, 9].includes(kua);

// The eight directions, best first: 生气 天医 延年 伏位 then 祸害 五鬼 六煞 绝命.
export const MANSIONS = [
  { key: 'shengQi', zh: '生气', en: 'Sheng Qi', what: 'Success and wealth', whatZh: '财运、成功', good: true },
  { key: 'tianYi', zh: '天医', en: 'Tian Yi', what: 'Health', whatZh: '健康、贵人', good: true },
  { key: 'yanNian', zh: '延年', en: 'Yan Nian', what: 'Relationships', whatZh: '感情、人缘', good: true },
  { key: 'fuWei', zh: '伏位', en: 'Fu Wei', what: 'Stability and growth', whatZh: '稳定、进修', good: true },
  { key: 'huoHai', zh: '祸害', en: 'Huo Hai', what: 'Mishaps and setbacks', whatZh: '口舌、小灾', good: false },
  { key: 'wuGui', zh: '五鬼', en: 'Wu Gui', what: 'Fire, theft and quarrels', whatZh: '火灾、是非', good: false },
  { key: 'liuSha', zh: '六煞', en: 'Liu Sha', what: 'Scandal and legal trouble', whatZh: '桃花劫、官非', good: false },
  { key: 'jueMing', zh: '绝命', en: 'Jue Ming', what: 'Serious loss and illness', whatZh: '大凶、疾病', good: false },
];
// Palace for each mansion, by Kua, in MANSIONS order.
const MANSION_PALACES = {
  1: [3, 2, 4, 0, 6, 1, 7, 5], 2: [1, 6, 7, 5, 2, 3, 4, 0], 3: [4, 0, 3, 2, 5, 7, 1, 6], 4: [0, 4, 2, 3, 7, 5, 6, 1],
  6: [6, 1, 5, 7, 3, 2, 0, 4], 7: [7, 5, 1, 6, 0, 4, 3, 2], 8: [5, 7, 6, 1, 4, 0, 2, 3], 9: [2, 3, 0, 4, 1, 6, 5, 7],
};
export const mansionPalaces = (kua) => MANSION_PALACES[kua];
// The mansion (index into MANSIONS) a palace holds for a Kua.
export const mansionAt = (kua, palace) => MANSION_PALACES[kua].indexOf(palace);
// House Kua (宅卦) from its sitting palace.
export const houseKua = (sittingPalace) => PALACE_STAR[sittingPalace];
