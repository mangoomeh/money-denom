// Birthplaces and the UTC offset and longitude a birth form resolves to. Shared by the BaZi and feng shui apps.

import { zoneOffset } from './bazi.js';

// Birthplaces with their longitude and IANA time zone; the zone's history gives the offset on the birth date.
export const CITIES = [
  ['Singapore', 103.82, 'Asia/Singapore'], ['Kuala Lumpur', 101.69, 'Asia/Kuala_Lumpur'], ['Penang', 100.33, 'Asia/Kuala_Lumpur'],
  ['Johor Bahru', 103.76, 'Asia/Kuala_Lumpur'], ['Kuching', 110.34, 'Asia/Kuching'], ['Jakarta', 106.85, 'Asia/Jakarta'],
  ['Bangkok', 100.5, 'Asia/Bangkok'], ['Ho Chi Minh City', 106.66, 'Asia/Ho_Chi_Minh'], ['Manila', 120.98, 'Asia/Manila'],
  ['Hong Kong', 114.17, 'Asia/Hong_Kong'], ['Macau', 113.54, 'Asia/Macau'], ['Taipei', 121.56, 'Asia/Taipei'],
  ['Beijing', 116.4, 'Asia/Shanghai'], ['Shanghai', 121.47, 'Asia/Shanghai'], ['Guangzhou', 113.26, 'Asia/Shanghai'],
  ['Shenzhen', 114.06, 'Asia/Shanghai'], ['Xiamen', 118.09, 'Asia/Shanghai'], ['Chengdu', 104.07, 'Asia/Shanghai'],
  ['Ürümqi (Beijing time)', 87.62, 'Asia/Shanghai'], ['Tokyo', 139.69, 'Asia/Tokyo'], ['Seoul', 126.98, 'Asia/Seoul'],
  ['Sydney', 151.21, 'Australia/Sydney'], ['Melbourne', 144.96, 'Australia/Melbourne'], ['Perth', 115.86, 'Australia/Perth'],
  ['Auckland', 174.76, 'Pacific/Auckland'], ['London', -0.13, 'Europe/London'], ['New York', -74.01, 'America/New_York'],
  ['Toronto', -79.38, 'America/Toronto'], ['Vancouver', -123.12, 'America/Vancouver'], ['San Francisco', -122.42, 'America/Los_Angeles'],
];
export const cityOf = (name) => CITIES.find(([n]) => n === name);
export const CITY_ZH = { 'Singapore': '新加坡', 'Kuala Lumpur': '吉隆坡', 'Penang': '槟城', 'Johor Bahru': '新山', 'Kuching': '古晋', 'Jakarta': '雅加达', 'Bangkok': '曼谷', 'Ho Chi Minh City': '胡志明市', 'Manila': '马尼拉', 'Hong Kong': '香港', 'Macau': '澳门', 'Taipei': '台北', 'Beijing': '北京', 'Shanghai': '上海', 'Guangzhou': '广州', 'Shenzhen': '深圳', 'Xiamen': '厦门', 'Chengdu': '成都', 'Ürümqi (Beijing time)': '乌鲁木齐（北京时间）', 'Tokyo': '东京', 'Seoul': '首尔', 'Sydney': '悉尼', 'Melbourne': '墨尔本', 'Perth': '珀斯', 'Auckland': '奥克兰', 'London': '伦敦', 'New York': '纽约', 'Toronto': '多伦多', 'Vancouver': '温哥华', 'San Francisco': '旧金山' };

// The birthplace's UTC offset and longitude for a form; a listed city uses its zone's history.
export function placeFor(f, birth) {
  const city = cityOf(f.city);
  if (!city) {
    const tz = String(f.tz ?? 'fixed:8');
    if (/^-?[\d.]+$/.test(tz) || tz.startsWith('fixed:')) return { tz: Number(tz.replace('fixed:', '')), lon: f.lon, city: null };
    const { offset, dst } = zoneOffset(tz, birth.year, birth.month, birth.day, birth.hour, birth.minute);
    return { tz: offset, lon: f.lon, city: null, zone: tz, dst };
  }
  const { offset, dst } = zoneOffset(city[2], birth.year, birth.month, birth.day, birth.hour, birth.minute);
  const today = zoneOffset(city[2], new Date().getFullYear(), 1, 15).offset;
  return { tz: offset, lon: city[1], city: city[0], dst, changed: offset !== today && !dst, today };
}
