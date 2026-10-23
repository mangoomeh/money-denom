// Zi Wei Dou Shu (紫微斗数, Purple Star Astrology): the 12 palaces, the 14 main stars, common
// minor stars, the four transformations (四化) and the 10-year periods (大限), as in the
// classical 紫微斗数全书 method that most apps use. It starts from the lunar date of birth
// and the two-hour period, which src/bazi.js already works out (with time zone, true solar
// time and the 23:00 rule), so both charts always describe the same moment.

import { cycleIndex, pillarOf, nayin } from './bazi.js';
import { solarToLunar } from './lunar.js';

const mod = (n, m) => ((n % m) + m) % m;
const YIN = 2; // 寅, where the counting starts

// ---- Names -------------------------------------------------------------------------------

// In order counter-clockwise from the life palace.
export const PALACES = [
  { zh: '命宫', en: 'Life', about: 'who you are: character, looks, how life goes overall', aboutZh: '本人的性格、外貌与一生大势' },
  { zh: '兄弟', en: 'Siblings', about: 'brothers, sisters and close peers', aboutZh: '兄弟姐妹与平辈关系' },
  { zh: '夫妻', en: 'Spouse', about: 'partner and marriage', aboutZh: '配偶与婚姻感情' },
  { zh: '子女', en: 'Children', about: 'children, students and creativity', aboutZh: '子女、晚辈与创造力' },
  { zh: '财帛', en: 'Wealth', about: 'income and how you handle money', aboutZh: '收入与理财方式' },
  { zh: '疾厄', en: 'Health', about: 'body, health and weak spots', aboutZh: '身体健康与易患之处' },
  { zh: '迁移', en: 'Travel', about: 'moving, travel and how others see you outside', aboutZh: '外出、迁动与在外的表现' },
  { zh: '交友', en: 'Friends', about: 'friends, colleagues and helpers', aboutZh: '朋友、同事与部属' },
  { zh: '官禄', en: 'Career', about: 'work, studies and status', aboutZh: '事业、学业与地位' },
  { zh: '田宅', en: 'Property', about: 'home, family base and property', aboutZh: '居所、家庭与不动产' },
  { zh: '福德', en: 'Wellbeing', about: 'inner peace, enjoyment and outlook', aboutZh: '精神享受、心态与福分' },
  { zh: '父母', en: 'Parents', about: 'parents, bosses and documents', aboutZh: '父母、上司与文书' },
];

export const MAIN_STARS = {
  ziwei: { zh: '紫微', en: 'Emperor', about: 'leadership, dignity, wanting to be in charge', aboutZh: '帝星，主尊贵、领导、自尊心强' },
  tianji: { zh: '天机', en: 'Strategist', about: 'quick thinking, planning, change', aboutZh: '智慧机变，善谋划，主变动' },
  taiyang: { zh: '太阳', en: 'Sun', about: 'generosity, energy, public life; tied to men in your life', aboutZh: '博爱热心，主名声与男性亲人' },
  wuqu: { zh: '武曲', en: 'General', about: 'money, decisiveness, hard work', aboutZh: '财星，果断刚毅，重实际' },
  tiantong: { zh: '天同', en: 'Child', about: 'ease, kindness, enjoying life', aboutZh: '福星，温和随缘，懂得享受' },
  lianzhen: { zh: '廉贞', en: 'Judge', about: 'passion, rules, ambition, intensity', aboutZh: '次桃花，主是非与原则，个性强烈' },
  tianfu: { zh: '天府', en: 'Treasurer', about: 'stability, saving, looking after people', aboutZh: '财库之星，稳重保守，善守成' },
  taiyin: { zh: '太阴', en: 'Moon', about: 'gentleness, property, savings; tied to women in your life', aboutZh: '温柔细腻，主田宅财富与女性亲人' },
  tanlang: { zh: '贪狼', en: 'Wolf', about: 'desire, charm, many interests', aboutZh: '桃花之星，多才多欲，善交际' },
  jumen: { zh: '巨门', en: 'Gate', about: 'speech, doubt, debate; good for talking jobs', aboutZh: '暗星，主口舌是非，善言辞' },
  tianxiang: { zh: '天相', en: 'Minister', about: 'helpfulness, fairness, good manners', aboutZh: '印星，主辅佐、公正与礼仪' },
  tianliang: { zh: '天梁', en: 'Elder', about: 'protection, advice, getting through trouble', aboutZh: '荫星，主庇荫、长者风范，逢凶化吉' },
  qisha: { zh: '七杀', en: 'Marshal', about: 'courage, going it alone, big ups and downs', aboutZh: '将星，主冲劲、独立与起伏' },
  pojun: { zh: '破军', en: 'Pioneer', about: 'breaking the old, starting over, restlessness', aboutZh: '耗星，主破旧立新、变动不安' },
};

export const MINOR_STARS = {
  wenchang: { zh: '文昌', en: 'Scholar', good: true, about: 'exams, writing, refinement', aboutZh: '考试、文书、气质' },
  wenqu: { zh: '文曲', en: 'Artist', good: true, about: 'talent, eloquence, the arts', aboutZh: '才艺、口才、艺术' },
  zuofu: { zh: '左辅', en: 'Left Aide', good: true, about: 'help from others, support', aboutZh: '得人相助、支持' },
  youbi: { zh: '右弼', en: 'Right Aide', good: true, about: 'help from others, flexibility', aboutZh: '得人相助、灵活' },
  tiankui: { zh: '天魁', en: 'Noble', good: true, about: 'help from seniors, in the open', aboutZh: '贵人明助，多来自长辈' },
  tianyue: { zh: '天钺', en: 'Noble (hidden)', good: true, about: 'help from seniors, behind the scenes', aboutZh: '贵人暗助，多在幕后' },
  lucun: { zh: '禄存', en: 'Fortune', good: true, about: 'steady income, saving', aboutZh: '稳定收入、积蓄' },
  tianma: { zh: '天马', en: 'Horse', good: true, about: 'travel, movement, busy-ness', aboutZh: '奔波、迁动、出行' },
  qingyang: { zh: '擎羊', en: 'Ram', good: false, about: 'conflict, injury, bluntness', aboutZh: '冲突、损伤、直接' },
  tuoluo: { zh: '陀罗', en: 'Spinner', good: false, about: 'delay, dragging on, worry', aboutZh: '拖延、纠缠、烦恼' },
  huoxing: { zh: '火星', en: 'Fire', good: false, about: 'sudden trouble, temper', aboutZh: '突发之事、脾气急' },
  lingxing: { zh: '铃星', en: 'Bell', good: false, about: 'hidden trouble, nerves', aboutZh: '暗中不顺、心神不宁' },
  dikong: { zh: '地空', en: 'Void', good: false, about: 'loss, unrealistic ideas', aboutZh: '损失、想法不切实际' },
  dijie: { zh: '地劫', en: 'Robbery', good: false, about: 'loss of money or effort', aboutZh: '破财或白费力气' },
  hongluan: { zh: '红鸾', en: 'Romance', good: true, about: 'romance, marriage, celebrations', aboutZh: '恋爱、婚姻、喜庆' },
  tianxi: { zh: '天喜', en: 'Joy', good: true, about: 'happy events, babies', aboutZh: '喜事、添丁' },
};

export const HUA = [
  { zh: '化禄', en: 'Wealth', about: 'brings money, ease and opportunities to its palace', aboutZh: '为所在宫位带来财富、顺利与机会' },
  { zh: '化权', en: 'Power', about: 'brings control, drive and authority', aboutZh: '带来掌控、动力与权威' },
  { zh: '化科', en: 'Fame', about: 'brings reputation, help and good results', aboutZh: '带来名声、助力与好结果' },
  { zh: '化忌', en: 'Trouble', about: 'brings worry, obstacles or debts; the area to watch', aboutZh: '带来烦恼、阻碍或亏欠，是要留意的方面' },
];

// The four transformations by year stem: [禄, 权, 科, 忌]. Schools differ only on 庚 (some
// put 天同 for 科 and 太阴 for 忌); this is the common 全书 version.
export const SIHUA = [
  ['lianzhen', 'pojun', 'wuqu', 'taiyang'], // 甲
  ['tianji', 'tianliang', 'ziwei', 'taiyin'], // 乙
  ['tiantong', 'tianji', 'wenchang', 'lianzhen'], // 丙
  ['taiyin', 'tiantong', 'tianji', 'jumen'], // 丁
  ['tanlang', 'taiyin', 'youbi', 'tianji'], // 戊
  ['wuqu', 'tanlang', 'tianliang', 'wenqu'], // 己
  ['taiyang', 'wuqu', 'taiyin', 'tiantong'], // 庚
  ['jumen', 'taiyang', 'wenqu', 'wenchang'], // 辛
  ['tianliang', 'ziwei', 'zuofu', 'wuqu'], // 壬
  ['pojun', 'jumen', 'taiyin', 'tanlang'], // 癸
];

const BUREAU = { 水: 2, 木: 3, 金: 4, 土: 5, 火: 6 };
export const BUREAU_EN = { 2: 'Water 2', 3: 'Wood 3', 4: 'Metal 4', 5: 'Earth 5', 6: 'Fire 6' };

// ---- From a BaZi chart --------------------------------------------------------------------------

// The lunar birth date and hour for Zi Wei, from a chart made by computeChart. A birth in a
// leap month counts as that month up to the 15th and as the next month from the 16th (the
// common rule). Returns null without a birth time: a Zi Wei chart needs the hour.
export function ziweiBirth(chart) {
  if (chart.hourBranch == null) return null;
  const { year, month, day } = chart.birthDay;
  const l = solarToLunar(year, month, day);
  const nextMonth = l.leap && l.day > 15;
  return {
    lunar: l,
    year: l.year,
    month: nextMonth ? (l.month % 12) + 1 : l.month,
    day: l.day,
    hour: chart.hourBranch,
    gender: chart.input.gender || 'male',
  };
}

// ---- The chart ------------------------------------------------------------------------------------

// input: { year (lunar), month 1–12, day 1–30, hour (branch 0 = 子 … 11 = 亥), gender }
export function computeZiwei({ year, month, day, hour, gender = 'male' }) {
  const yearStem = mod(year - 4, 10);
  const yearBranch = mod(year - 4, 12);
  const monthPos = YIN + month - 1;
  const life = mod(monthPos - hour, 12);
  const body = mod(monthPos + hour, 12);

  // Each palace's stem: 寅 gets 丙, 戊, 庚, 壬 or 甲 by the year stem (五虎遁), then onward.
  const yinStem = mod(yearStem * 2 + 2, 10);
  const stemOf = (b) => mod(yinStem + mod(b - YIN, 12), 10);

  // The element pattern (五行局) is the 纳音 of the life palace's stem and branch.
  const lifeNayin = nayin(pillarOf(cycleIndex(stemOf(life), life)));
  const bureau = BUREAU[lifeNayin.slice(-1)];

  // 紫微: the smallest x making (day + x) divisible by the bureau; count the quotient from
  // 寅, then step back x palaces if x is odd, forward if even.
  let x = 0;
  while ((day + x) % bureau) x++;
  const q = (day + x) / bureau;
  const ziwei = mod(YIN + q - 1 + (x % 2 ? -x : x), 12);
  const tianfu = mod(4 - ziwei, 12); // mirrored across the 寅–申 line

  const at = {
    ziwei, tianji: ziwei - 1, taiyang: ziwei - 3, wuqu: ziwei - 4, tiantong: ziwei - 5, lianzhen: ziwei - 8,
    tianfu, taiyin: tianfu + 1, tanlang: tianfu + 2, jumen: tianfu + 3, tianxiang: tianfu + 4,
    tianliang: tianfu + 5, qisha: tianfu + 6, pojun: tianfu + 10,
  };

  // Minor stars.
  const lucun = [2, 3, 5, 6, 5, 6, 8, 9, 11, 0][yearStem];
  const [kui, yue] = [[1, 7], [0, 8], [11, 9], [11, 9], [1, 7], [0, 8], [1, 7], [6, 2], [3, 5], [3, 5]][yearStem];
  const group = yearBranch % 4; // 0 申子辰, 1 巳酉丑, 2 寅午戌, 3 亥卯未
  const [huoStart, lingStart] = [[2, 10], [3, 10], [1, 3], [9, 10]][group];
  const hongluan = mod(3 - yearBranch, 12);
  Object.assign(at, {
    wenchang: 10 - hour, wenqu: 4 + hour, zuofu: 4 + month - 1, youbi: 10 - (month - 1),
    tiankui: kui, tianyue: yue, lucun, qingyang: lucun + 1, tuoluo: lucun - 1,
    tianma: [2, 11, 8, 5][group], huoxing: huoStart + hour, lingxing: lingStart + hour,
    dikong: 11 - hour, dijie: 11 + hour, hongluan, tianxi: hongluan + 6,
  });

  const hua = Object.fromEntries(SIHUA[yearStem].map((star, i) => [star, i]));
  const palaces = Array.from({ length: 12 }, (_, b) => ({
    branch: b,
    stem: stemOf(b),
    name: mod(life - b, 12), // index into PALACES
    body: b === body,
    main: [],
    minor: [],
  }));
  for (const [star, pos] of Object.entries(at)) {
    const p = palaces[mod(pos, 12)];
    const entry = { star, hua: hua[star] ?? null };
    (MAIN_STARS[star] ? p.main : p.minor).push(entry);
  }

  // 10-year periods: from the life palace, starting at the bureau number of years old
  // (nominal age), clockwise for yang-year men and yin-year women, else counter-clockwise.
  const forward = (yearStem % 2 === 0) === (gender === 'male');
  for (let i = 0; i < 12; i++) {
    const p = palaces[mod(life + (forward ? i : -i), 12)];
    p.decade = { from: bureau + i * 10, to: bureau + i * 10 + 9 };
  }

  return { year, month, day, hour, gender, yearStem, yearBranch, life, body, bureau, lifeNayin, forward, at: Object.fromEntries(Object.entries(at).map(([k, v]) => [k, mod(v, 12)])), palaces };
}

// ---- Reading helpers ----------------------------------------------------------------------------

export const palaceByName = (z, name) => z.palaces.find((p) => p.name === name);

// Main stars to read for a palace: its own, or if it has none, those of the opposite palace
// (an "empty" palace borrows them, as the classics say).
export function starsToRead(z, p) {
  if (p.main.length) return { stars: p.main, borrowed: false };
  return { stars: z.palaces[mod(p.branch + 6, 12)].main, borrowed: true };
}

// The 10-year period a nominal age (虚岁) falls in, or null before the first.
export const decadeAt = (z, age) => z.palaces.find((p) => age >= p.decade.from && age <= p.decade.to) || null;

// Nominal age in a Gregorian year: 1 in the lunar year of birth, plus one each new year.
export const nominalAge = (z, year) => year - z.year + 1;

// The yearly overlay (流年) for a Gregorian year: the palace of that year's branch, and where
// that year's four transformations land in the birth chart.
export function yearly(z, year) {
  const stem = mod(year - 4, 10);
  const branch = mod(year - 4, 12);
  const hua = SIHUA[stem].map((star, i) => ({ star, hua: i, palace: z.palaces[z.at[star]] }));
  return { year, stem, branch, palace: z.palaces[branch], hua };
}
