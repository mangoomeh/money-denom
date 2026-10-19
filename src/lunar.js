// Chinese lunar (农历) calendar from astronomy: months start on the day of the new moon in Beijing
// time, the month holding the winter solstice is month 11, and in a year of 13 months the first month
// without a principal solar term (中气) is the leap month. New moons follow Meeus ch. 49.

import { solarTermMs, sunLongitudeAt, deltaT, msFromJd } from './bazi.js';

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const sin = (deg) => Math.sin(deg * RAD);

// Moment (UTC ms) of the k-th new moon after 6 January 2000.
export function newMoonMs(k) {
  const T = k / 1236.85;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T ** 2 - 0.00000015 * T ** 3 + 0.00000000073 * T ** 4;
  const E = 1 - 0.002516 * T - 0.0000074 * T ** 2;
  const M = 2.5534 + 29.1053567 * k - 0.0000014 * T ** 2 - 0.00000011 * T ** 3;
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T ** 2 + 0.00001238 * T ** 3 - 0.000000058 * T ** 4;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T ** 2 - 0.00000227 * T ** 3 + 0.000000011 * T ** 4;
  const O = 124.7746 - 1.56375588 * k + 0.0020672 * T ** 2 + 0.00000215 * T ** 3;
  jde += -0.4072 * sin(Mp) + 0.17241 * E * sin(M) + 0.01608 * sin(2 * Mp) + 0.01039 * sin(2 * F)
    + 0.00739 * E * sin(Mp - M) - 0.00514 * E * sin(Mp + M) + 0.00208 * E * E * sin(2 * M)
    - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) + 0.00056 * E * sin(2 * Mp + M)
    - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F)
    - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(O) - 0.00007 * sin(Mp + 2 * M)
    + 0.00004 * sin(2 * Mp - 2 * F) + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F)
    + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F) + 0.00003 * sin(Mp - M + 2 * F)
    - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
  const planetary = [
    [0.000325, 299.77 + 0.107408 * k - 0.009173 * T ** 2], [0.000165, 251.88 + 0.016321 * k],
    [0.000164, 251.83 + 26.651886 * k], [0.000126, 349.42 + 36.412478 * k], [0.00011, 84.66 + 18.206239 * k],
    [0.000062, 141.74 + 53.303771 * k], [0.00006, 207.14 + 2.453732 * k], [0.000056, 154.84 + 7.30686 * k],
    [0.000047, 34.52 + 27.261239 * k], [0.000042, 207.19 + 0.121824 * k], [0.00004, 291.34 + 1.844379 * k],
    [0.000037, 161.72 + 24.198154 * k], [0.000035, 239.56 + 25.513099 * k], [0.000023, 331.55 + 3.592518 * k],
  ];
  for (const [c, a] of planetary) jde += c * sin(a);
  const year = 2000 + k / 12.3685;
  return msFromJd(jde - deltaT(year) / 86400);
}

// Beijing time (UTC+8) from 1929; Beijing local mean time before.
const chinaOffsetMs = (ms) => (ms >= Date.UTC(1928, 11, 31, 16) ? 8 : 116.4 / 15) * 3600000;
const dayOf = (ms) => Math.floor((ms + chinaOffsetMs(ms)) / DAY_MS); // days since 1970-01-01, Beijing date
const dayStartMs = (day) => day * DAY_MS - chinaOffsetMs(day * DAY_MS);
const nmDay = (k) => dayOf(newMoonMs(k));

function kOnOrBefore(day) {
  let k = Math.floor((day * DAY_MS - Date.UTC(2000, 0, 6, 18, 14)) / (29.530588861 * DAY_MS));
  while (nmDay(k + 1) <= day) k++;
  while (nmDay(k) > day) k--;
  return k;
}

const suiCache = new Map();

// The months from the month-11 before the winter solstice of year y−1 up to the next month 11.
function sui(y) {
  if (suiCache.has(y)) return suiCache.get(y);
  const ws1 = dayOf(solarTermMs(270, Date.UTC(y - 1, 11, 21)));
  const ws2 = dayOf(solarTermMs(270, Date.UTC(y, 11, 21)));
  const k1 = kOnOrBefore(ws1);
  const k2 = kOnOrBefore(ws2);
  const months = [];
  for (let k = k1; k < k2; k++) {
    const start = nmDay(k);
    const end = nmDay(k + 1);
    const a = Math.floor(sunLongitudeAt(dayStartMs(start)) / 30);
    const b = Math.floor(sunLongitudeAt(dayStartMs(end)) / 30);
    months.push({ start, days: end - start, hasZhongqi: a !== b });
  }
  const leapIndex = months.length === 13 ? months.findIndex((m) => !m.hasZhongqi) : -1;
  let num = 10;
  let lunarYear = y - 1;
  months.forEach((m, i) => {
    if (i === leapIndex) { m.leap = true; } else { m.leap = false; num = (num % 12) + 1; }
    if (num === 1 && !m.leap) lunarYear = y;
    m.month = num;
    m.year = lunarYear;
  });
  suiCache.set(y, months);
  return months;
}

const monthsAround = (y) => [...sui(y), ...sui(y + 1)];
const dateOfDay = (day) => {
  const d = new Date(day * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};

// Lunar date → Western date. Returns null if that lunar date does not exist.
export function lunarToSolar(year, month, day, leap = false) {
  const m = monthsAround(year).find((x) => x.year === year && x.month === month && x.leap === leap);
  if (!m || day < 1 || day > m.days) return null;
  return dateOfDay(m.start + day - 1);
}

// Western date → lunar date { year, month, day, leap, days (in that month) }.
export function solarToLunar(year, month, day) {
  const d = Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
  const m = [...sui(year), ...sui(year + 1)].find((x) => d >= x.start && d < x.start + x.days);
  return { year: m.year, month: m.month, day: d - m.start + 1, leap: m.leap, days: m.days };
}

// The months of a lunar year in order, with their lengths, for building a picker.
export function lunarYearMonths(year) {
  return monthsAround(year).filter((m) => m.year === year).map(({ month, leap, days }) => ({ month, leap, days }));
}

const MONTH_ZH = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export const lunarMonthName = (month, leap) => `${leap ? '闰' : ''}${MONTH_ZH[month - 1]}月`;
export function lunarDayName(day) {
  if (day <= 10) return `初${DIGITS[day]}`;
  if (day < 20) return `十${DIGITS[day - 10]}`;
  if (day === 20) return '二十';
  if (day < 30) return `廿${DIGITS[day - 20]}`;
  return '三十';
}
