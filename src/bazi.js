// Pure BaZi (Four Pillars) logic. Year and month pillars follow the solar terms, which are found
// from the sun's apparent longitude (abridged VSOP87, Meeus ch. 25, good to about a minute).
// Day and hour pillars follow the local clock, or true solar time when a longitude is given.

export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
export const STEM_PINYIN = ['jiǎ', 'yǐ', 'bǐng', 'dīng', 'wù', 'jǐ', 'gēng', 'xīn', 'rén', 'guǐ'];
export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
export const BRANCH_PINYIN = ['zǐ', 'chǒu', 'yín', 'mǎo', 'chén', 'sì', 'wǔ', 'wèi', 'shēn', 'yǒu', 'xū', 'hài'];
export const ANIMALS = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];
export const ELEMENTS = [
  { id: 'wood', zh: '木', en: 'Wood' },
  { id: 'fire', zh: '火', en: 'Fire' },
  { id: 'earth', zh: '土', en: 'Earth' },
  { id: 'metal', zh: '金', en: 'Metal' },
  { id: 'water', zh: '水', en: 'Water' },
];

// Element index of each branch's main qi, and the hidden stems (main qi first).
export const BRANCH_ELEMENT = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];
export const HIDDEN_STEMS = [
  [9], [5, 9, 7], [0, 2, 4], [1], [4, 1, 9], [2, 4, 6],
  [3, 5], [5, 3, 1], [6, 8, 4], [7], [4, 7, 3], [8, 0],
];

export const TEN_GODS = [
  { zh: '比肩', en: 'Friend' }, { zh: '劫财', en: 'Rob Wealth' },
  { zh: '食神', en: 'Eating God' }, { zh: '伤官', en: 'Hurting Officer' },
  { zh: '偏财', en: 'Indirect Wealth' }, { zh: '正财', en: 'Direct Wealth' },
  { zh: '七杀', en: 'Seven Killings' }, { zh: '正官', en: 'Direct Officer' },
  { zh: '偏印', en: 'Indirect Resource' }, { zh: '正印', en: 'Direct Resource' },
];

const NAYIN = [
  '海中金', '炉中火', '大林木', '路旁土', '剑锋金', '山头火', '涧下水', '城头土', '白蜡金', '杨柳木',
  '泉中水', '屋上土', '霹雳火', '松柏木', '长流水', '沙中金', '山下火', '平地木', '壁上土', '金箔金',
  '覆灯火', '天河水', '大驿土', '钗钏金', '桑柘木', '大溪水', '沙中土', '天上火', '石榴木', '大海水',
];

export const LIFE_STAGES = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养'];
const LIFE_START = [11, 6, 2, 9, 2, 9, 5, 0, 8, 3]; // branch where each stem's 长生 falls

// The twelve 节 that start each month, from 寅 month (立春, 315°) onward.
export const JIE = [
  { zh: '立春', en: 'Start of Spring' }, { zh: '惊蛰', en: 'Awakening of Insects' },
  { zh: '清明', en: 'Clear and Bright' }, { zh: '立夏', en: 'Start of Summer' },
  { zh: '芒种', en: 'Grain in Ear' }, { zh: '小暑', en: 'Minor Heat' },
  { zh: '立秋', en: 'Start of Autumn' }, { zh: '白露', en: 'White Dew' },
  { zh: '寒露', en: 'Cold Dew' }, { zh: '立冬', en: 'Start of Winter' },
  { zh: '大雪', en: 'Major Snow' }, { zh: '小寒', en: 'Minor Cold' },
];

const mod = (n, m) => ((n % m) + m) % m;
const DAY_MS = 86400000;
const YEAR_DAYS = 365.2422;

export const stemElement = (s) => Math.floor(s / 2);
export const isYang = (s) => s % 2 === 0;
export const cycleIndex = (stem, branch) => mod(6 * stem - 5 * branch, 60);
export const pillarOf = (index) => ({ index: mod(index, 60), stem: mod(index, 10), branch: mod(index, 12) });
export const pillarName = (p) => STEMS[p.stem] + BRANCHES[p.branch];
export const nayin = (p) => NAYIN[Math.floor(p.index / 2)];

// ---- Sun position -----------------------------------------------------------------------

// Abridged VSOP87 terms for the Earth's heliocentric longitude [A (1e-8 rad), B, C].
const L_TERMS = [
  [[175347046, 0, 0], [3341656, 4.6692568, 6283.07585], [34894, 4.6261, 12566.1517], [3497, 2.7441, 5753.3849],
    [3418, 2.8289, 3.5231], [3136, 3.6277, 77713.7715], [2676, 4.4181, 7860.4194], [2343, 6.1352, 3930.2097],
    [1324, 0.7425, 11506.7698], [1273, 2.0371, 529.691], [1199, 1.1096, 1577.3435], [990, 5.233, 5884.927],
    [902, 2.045, 26.298], [857, 3.508, 398.149], [780, 1.179, 5223.694], [753, 2.533, 5507.553],
    [505, 4.583, 18849.228], [492, 4.205, 775.523], [357, 2.92, 0.067], [317, 5.849, 11790.629],
    [284, 1.899, 796.298], [271, 0.315, 10977.079], [243, 0.345, 5486.778], [206, 4.806, 2544.314],
    [205, 1.869, 5573.143], [202, 2.458, 6069.777], [156, 0.833, 213.299], [132, 3.411, 2942.463],
    [126, 1.083, 20.775], [115, 0.645, 0.98], [103, 0.636, 4694.003], [102, 0.976, 15720.839],
    [102, 4.267, 7.114], [99, 6.21, 2146.17], [98, 0.68, 155.42], [86, 5.98, 161000.69],
    [85, 1.3, 6275.96], [85, 3.67, 71430.7], [80, 1.81, 17260.15], [79, 3.04, 12036.46],
    [75, 1.76, 5088.63], [74, 3.5, 3154.69], [74, 4.68, 801.82], [70, 0.83, 9437.76],
    [62, 3.98, 8827.39], [61, 1.82, 7084.9], [57, 2.78, 6286.6], [56, 4.39, 14143.5],
    [56, 3.47, 6279.55], [52, 0.19, 12139.55], [52, 1.33, 1748.02], [51, 0.28, 5856.48],
    [49, 0.49, 1194.45], [41, 5.37, 8429.24], [41, 2.4, 19651.05], [39, 6.17, 10447.39],
    [37, 6.04, 10213.29], [37, 2.57, 1059.38], [36, 1.71, 2352.87], [36, 1.78, 6812.77],
    [33, 0.59, 17789.85], [30, 0.44, 83996.85], [30, 2.74, 1349.87], [25, 3.16, 4690.48]],
  [[628331966747, 0, 0], [206059, 2.678235, 6283.07585], [4303, 2.6351, 12566.1517], [425, 1.59, 3.523],
    [119, 5.796, 26.298], [109, 2.966, 1577.344], [93, 2.59, 18849.23], [72, 1.14, 529.69],
    [68, 1.87, 398.15], [67, 4.41, 5507.55], [59, 2.89, 5223.69], [56, 2.17, 155.42],
    [45, 0.4, 796.3], [36, 0.47, 775.52], [29, 2.65, 7.11], [21, 5.34, 0.98],
    [19, 1.85, 5486.78], [19, 4.97, 213.3], [17, 2.99, 6275.96], [16, 0.03, 2544.31],
    [16, 1.43, 2146.17], [15, 1.21, 10977.08], [12, 2.83, 1748.02], [12, 3.26, 5088.63],
    [12, 5.27, 1194.45], [12, 2.08, 4694], [11, 0.77, 553.57], [10, 1.3, 6286.6],
    [10, 4.24, 1349.87], [9, 2.7, 242.73], [9, 5.64, 951.72], [8, 5.3, 2352.87],
    [6, 2.65, 9437.76], [6, 4.67, 4690.48]],
  [[52919, 0, 0], [8720, 1.0721, 6283.0758], [309, 0.867, 12566.152], [27, 0.05, 3.52],
    [16, 5.19, 26.3], [16, 3.68, 155.42], [10, 0.76, 18849.23], [9, 2.06, 77713.77],
    [7, 0.83, 775.52], [5, 4.66, 1577.34], [4, 1.03, 7.11], [4, 3.44, 5573.14],
    [3, 5.14, 796.3], [3, 6.05, 5507.55], [3, 1.19, 242.73], [3, 6.12, 529.69],
    [3, 0.31, 398.15], [3, 2.28, 553.57], [2, 4.38, 5223.69], [2, 3.75, 0.98]],
  [[289, 5.844, 6283.076], [35, 0, 0], [17, 5.49, 12566.15], [3, 5.2, 155.42],
    [1, 4.72, 3.52], [1, 5.3, 18849.23], [1, 5.97, 242.73]],
  [[114, 3.142, 0], [8, 4.13, 6283.08], [1, 3.84, 12566.15]],
  [[1, 3.14, 0]],
];

const RAD = Math.PI / 180;
export const jdFromMs = (ms) => ms / DAY_MS + 2440587.5;
export const msFromJd = (jd) => (jd - 2440587.5) * DAY_MS;

// TT − UT in seconds (Espenak & Meeus polynomials).
export function deltaT(year) {
  const y = year;
  let t;
  if (y < 1800) { t = (y - 1820) / 100; return -20 + 32 * t * t; }
  if (y < 1860) {
    t = y - 1800;
    return 13.72 - 0.332447 * t + 0.0068612 * t ** 2 + 0.0041116 * t ** 3 - 0.00037436 * t ** 4
      + 0.0000121272 * t ** 5 - 0.0000001699 * t ** 6 + 0.000000000875 * t ** 7;
  }
  if (y < 1900) { t = y - 1860; return 7.62 + 0.5737 * t - 0.251754 * t ** 2 + 0.01680668 * t ** 3 - 0.0004473624 * t ** 4 + t ** 5 / 233174; }
  if (y < 1920) { t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4; }
  if (y < 1941) { t = y - 1920; return 21.2 + 0.84493 * t - 0.0761 * t ** 2 + 0.0020936 * t ** 3; }
  if (y < 1961) { t = y - 1950; return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547; }
  if (y < 1986) { t = y - 1975; return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718; }
  if (y < 2005) { t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
  if (y < 2050) { t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t ** 2; }
  t = (y - 1820) / 100;
  if (y < 2150) return -20 + 32 * t * t - 0.5628 * (2150 - y);
  return -20 + 32 * t * t;
}

// Apparent geocentric ecliptic longitude of the sun, in degrees, at a Julian Ephemeris Day.
export function sunLongitude(jde) {
  const tau = (jde - 2451545) / 365250;
  let L = 0;
  L_TERMS.forEach((series, power) => {
    let sum = 0;
    for (const [a, b, c] of series) sum += a * Math.cos(b + c * tau);
    L += sum * tau ** power;
  });
  L /= 1e8;
  const T = tau * 10;
  const omega = (125.04452 - 1934.136261 * T) * RAD;
  const ls = (280.4665 + 36000.7698 * T) * RAD;
  const lm = (218.3165 + 481267.8813 * T) * RAD;
  const nutation = -17.2 * Math.sin(omega) - 1.32 * Math.sin(2 * ls) - 0.23 * Math.sin(2 * lm) + 0.21 * Math.sin(2 * omega);
  // geocentric = heliocentric + 180°, then FK5, nutation and aberration (arcseconds)
  return mod(L / RAD + 180 + (-0.09033 + nutation - 20.4898) / 3600, 360);
}

const jdeFromJd = (jd) => jd + deltaT(2000 + (jd - 2451545) / YEAR_DAYS) / 86400;
export const sunLongitudeAt = (ms) => sunLongitude(jdeFromJd(jdFromMs(ms)));

// The moment (UTC ms) the sun reaches `target` degrees, nearest to the guess.
export function solarTermMs(target, guessMs) {
  let jd = jdFromMs(guessMs);
  for (let i = 0; i < 30; i++) {
    const diff = mod(target - sunLongitude(jdeFromJd(jd)) + 180, 360) - 180;
    jd += (diff * YEAR_DAYS) / 360;
    if (Math.abs(diff) < 1e-7) break;
  }
  return msFromJd(jd);
}

// ---- Ten gods, stages, interactions ------------------------------------------------------

// Ten god of `stem` as seen from the day master `dm` (both stem indexes).
export function tenGod(dm, stem) {
  const rel = mod(stemElement(stem) - stemElement(dm), 5);
  const order = [0, 2, 4, 6, 8][rel]; // same, I produce, I control, controls me, produces me
  return order + (isYang(stem) === isYang(dm) ? 0 : 1);
}

export function lifeStage(stem, branch) {
  const start = LIFE_START[stem];
  return isYang(stem) ? mod(branch - start, 12) : mod(start - branch, 12);
}

// The two "void" (空亡) branches of the ten-day week a pillar belongs to.
export function voidBranches(p) {
  const first = mod(p.index - (p.index % 10), 12);
  return [mod(first + 10, 12), mod(first + 11, 12)];
}

const STEM_COMBOS = { '0,5': 2, '1,6': 3, '2,7': 4, '3,8': 0, '4,9': 1 }; // 合化 element
const BRANCH_SIX = { '0,1': 2, '2,11': 0, '3,10': 1, '4,9': 3, '5,8': 4, '6,7': 1 };
const HARMS = ['0,7', '1,6', '2,5', '3,4', '8,11', '9,10'];
const TRIOS = [[8, 0, 4, 4], [11, 3, 7, 0], [2, 6, 10, 1], [5, 9, 1, 3]]; // 三合 + element
const MEETINGS = [[2, 3, 4, 0], [5, 6, 7, 1], [8, 9, 10, 3], [11, 0, 1, 4]]; // 三会 + element
const PUNISH_TRIOS = [[2, 5, 8], [1, 10, 7]];

// Combinations, clashes, harms and punishments among the pillars.
export function interactions(pillars) {
  const out = [];
  const at = pillars.map((p, i) => ({ ...p, i })).filter((p) => p.stem != null);
  const pairKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (let a = 0; a < at.length; a++) {
    for (let b = a + 1; b < at.length; b++) {
      const p = at[a]; const q = at[b];
      const who = [p.i, q.i];
      const sk = pairKey(p.stem, q.stem);
      if (sk in STEM_COMBOS) out.push({ kind: 'stem-combo', who, text: `${STEMS[p.stem]}${STEMS[q.stem]} combine`, element: STEM_COMBOS[sk] });
      if (Math.abs(p.stem - q.stem) === 6) out.push({ kind: 'stem-clash', who, text: `${STEMS[p.stem]}${STEMS[q.stem]} clash` });
      const bk = pairKey(p.branch, q.branch);
      if (bk in BRANCH_SIX) out.push({ kind: 'combo', who, text: `${BRANCHES[p.branch]}${BRANCHES[q.branch]} six combination`, element: BRANCH_SIX[bk] });
      if (mod(p.branch - q.branch, 12) === 6) out.push({ kind: 'clash', who, text: `${BRANCHES[p.branch]}${BRANCHES[q.branch]} clash` });
      if (HARMS.includes(bk)) out.push({ kind: 'harm', who, text: `${BRANCHES[p.branch]}${BRANCHES[q.branch]} harm` });
      if (bk === '0,3') out.push({ kind: 'punish', who, text: '子卯 punishment' });
      if (p.branch === q.branch && [4, 6, 9, 11].includes(p.branch)) {
        out.push({ kind: 'punish', who, text: `${BRANCHES[p.branch]}${BRANCHES[q.branch]} self-punishment` });
      }
    }
  }
  const groupOf = (set) => set.map((b) => at.filter((p) => p.branch === b).map((p) => p.i));
  const addGroup = (set, kind, label, element) => {
    const found = groupOf(set);
    if (found.every((ids) => ids.length)) {
      out.push({ kind, who: found.flat(), text: `${set.map((b) => BRANCHES[b]).join('')} ${label}`, element });
    }
  };
  for (const [a, b, c, e] of TRIOS) addGroup([a, b, c], 'trio', 'three harmony', e);
  for (const [a, b, c, e] of MEETINGS) addGroup([a, b, c], 'meeting', 'directional meeting', e);
  for (const set of PUNISH_TRIOS) addGroup(set, 'punish', 'punishment');
  return out;
}

// ---- The chart ---------------------------------------------------------------------------

const KEYS = ['hour', 'day', 'month', 'year'];

// input: { year, month, day, hour, minute, timeKnown, tzOffset (hours), longitude, trueSolar,
//          gender: 'male' | 'female', ziStartsDay (23:00 starts the next day) }
export function computeChart(input) {
  const { year, month, day, timeKnown = true, tzOffset = 8, gender = 'male', ziStartsDay = true } = input;
  const hour = timeKnown ? input.hour : 12;
  const minute = timeKnown ? input.minute : 0;
  const wall = new Date(0);
  wall.setUTCFullYear(year, month - 1, day);
  wall.setUTCHours(hour, minute, 0, 0);
  const utcMs = wall.getTime() - tzOffset * 3600000;

  // Local solar time for the day and hour pillars.
  let solarMs = wall.getTime();
  let solarNote = null;
  if (input.trueSolar && Number.isFinite(input.longitude)) {
    const lonMin = (input.longitude / 15 - tzOffset) * 60;
    const eot = equationOfTime(utcMs);
    solarMs = wall.getTime() + (lonMin + eot) * 60000;
    solarNote = { longitudeMinutes: lonMin, equationMinutes: eot };
  }
  const solar = new Date(solarMs);

  // Year and month from the sun's longitude at the moment of birth.
  const lambda = sunLongitudeAt(utcMs);
  const monthNo = Math.floor(mod(lambda - 315, 360) / 30); // 0 = 寅 month
  const lichun = solarTermMs(315, Date.UTC(year, 1, 4));
  const solarYear = utcMs < lichun ? year - 1 : year;
  const yearP = pillarOf(solarYear - 4);
  const monthP = pillarOf(cycleIndex(mod(yearP.stem * 2 + 2 + monthNo, 10), mod(monthNo + 2, 12)));

  // Day and hour from the local (solar) clock.
  const minutes = solar.getUTCHours() * 60 + solar.getUTCMinutes();
  const lateZi = minutes >= 23 * 60;
  const jdn = Math.floor(Date.UTC(solar.getUTCFullYear(), solar.getUTCMonth(), solar.getUTCDate()) / DAY_MS) + 2440588;
  const dayP = pillarOf(jdn + 49 + (lateZi && ziStartsDay ? 1 : 0));
  let hourP = null;
  if (timeKnown) {
    const hb = Math.floor((minutes + 60) / 120) % 12;
    const stemDay = lateZi && !ziStartsDay ? (dayP.stem + 1) % 10 : dayP.stem;
    hourP = pillarOf(cycleIndex(mod(stemDay * 2 + hb, 10), hb));
  }

  const dm = dayP.stem;
  const raw = { hour: hourP, day: dayP, month: monthP, year: yearP };
  const pillars = KEYS.map((key) => {
    const p = raw[key];
    if (!p) return { key, missing: true };
    return {
      key,
      ...p,
      name: pillarName(p),
      nayin: nayin(p),
      stemGod: key === 'day' ? null : tenGod(dm, p.stem),
      hidden: HIDDEN_STEMS[p.branch].map((s) => ({ stem: s, god: tenGod(dm, s) })),
      stage: lifeStage(dm, p.branch),
    };
  });

  // Element counts: the visible stems and each branch's main qi; hidden stems weighted separately.
  const counts = [0, 0, 0, 0, 0];
  const weighted = [0, 0, 0, 0, 0];
  for (const p of pillars) {
    if (p.missing) continue;
    counts[stemElement(p.stem)] += 1;
    counts[BRANCH_ELEMENT[p.branch]] += 1;
    weighted[stemElement(p.stem)] += 1;
    HIDDEN_STEMS[p.branch].forEach((s, i) => { weighted[stemElement(s)] += [1, 0.5, 0.3][i]; });
  }

  // Luck pillars: forward for yang-year men and yin-year women.
  const forward = isYang(yearP.stem) === (gender === 'male');
  const prevJie = solarTermMs(mod(315 + monthNo * 30, 360), utcMs - mod(lambda - 315 - monthNo * 30, 360) * DAY_MS);
  const nextJie = solarTermMs(mod(345 + monthNo * 30, 360), prevJie + 30.4 * DAY_MS);
  const gapDays = forward ? (nextJie - utcMs) / DAY_MS : (utcMs - prevJie) / DAY_MS;
  const startMonths = Math.round(gapDays * 4); // 3 days = 1 year, so 1 day = 4 months
  const startMs = utcMs + (gapDays / 3) * YEAR_DAYS * DAY_MS;
  const startYearAt = new Date(startMs).getUTCFullYear();
  const luck = [];
  for (let i = 1; i <= 10; i++) {
    const p = pillarOf(monthP.index + (forward ? i : -i));
    luck.push({
      ...p,
      name: pillarName(p),
      stemGod: tenGod(dm, p.stem),
      branchGod: tenGod(dm, HIDDEN_STEMS[p.branch][0]),
      age: startMonths / 12 + (i - 1) * 10,
      fromYear: startYearAt + (i - 1) * 10,
    });
  }

  return {
    input: { ...input, hour, minute },
    utcMs,
    solarTime: timeKnown ? { hour: solar.getUTCHours(), minute: solar.getUTCMinutes(), ...solarNote } : null,
    sunLongitude: lambda,
    solarYear,
    animal: ANIMALS[yearP.branch],
    pillars,
    dayMaster: dm,
    counts,
    weighted,
    voids: voidBranches(dayP),
    interactions: interactions(pillars.map((p) => (p.missing ? {} : { stem: p.stem, branch: p.branch }))),
    jie: { prev: { ...JIE[monthNo], ms: prevJie }, next: { ...JIE[(monthNo + 1) % 12], ms: nextJie } },
    luck: { forward, gapDays, startYears: Math.floor(startMonths / 12), startMonthsRem: startMonths % 12, startMs, pillars: luck },
  };
}

// The pillar of a Gregorian year (counted from 立春), and its ten god for a day master.
export function annualPillar(year, dm) {
  const p = pillarOf(year - 4);
  return { ...p, year, name: pillarName(p), stemGod: tenGod(dm, p.stem), branchGod: tenGod(dm, HIDDEN_STEMS[p.branch][0]) };
}

// Apparent minus mean solar time, in minutes.
export function equationOfTime(ms) {
  const jde = jdeFromJd(jdFromMs(ms));
  const t = (jde - 2451545) / 365250;
  const l0 = mod(280.4664567 + 360007.6982779 * t + 0.03032028 * t * t, 360);
  const lambda = sunLongitude(jde);
  const T = t * 10;
  const eps = (23.4392911 - 0.0130042 * T) * RAD;
  const alpha = Math.atan2(Math.cos(eps) * Math.sin(lambda * RAD), Math.cos(lambda * RAD)) / RAD;
  const e = mod(l0 - 0.0057183 - alpha + 180, 360) - 180;
  return e * 4;
}

// Parses "YYYY-MM-DD" and "HH:MM" from date/time inputs. Returns null when invalid.
export function parseBirth(dateText, timeText) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || '').trim());
  if (!d) return null;
  const [year, month, day] = d.slice(1).map(Number);
  const check = new Date(Date.UTC(2000, month - 1, day));
  if (month < 1 || month > 12 || check.getUTCMonth() !== month - 1 || year < 1800 || year > 2200) return null;
  if (month === 2 && day === 29 && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))) return null;
  const t = /^(\d{1,2}):(\d{2})/.exec(String(timeText || '').trim());
  if (!t) return { year, month, day, timeKnown: false, hour: 12, minute: 0 };
  const hour = Number(t[1]); const minute = Number(t[2]);
  if (hour > 23 || minute > 59) return null;
  return { year, month, day, timeKnown: true, hour, minute };
}
