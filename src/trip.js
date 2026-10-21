// Pure trip logic: the days of a trip, the itinerary, and a packing list worked out from
// the trip's length, activities, luggage and weather. Dates are 'YYYY-MM-DD' strings and
// day arithmetic is done in UTC so time zones and daylight saving can't shift a day.

import { mergeList, newer, countChanged, encodeData, decodeData } from './sync.js';

const DAY = 86400000;
const toMs = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const MAX_DAYS = 60;

export const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && toIso(toMs(s)) === s;

export function nights(start, end) {
  if (!isIsoDate(start) || !isIsoDate(end)) return 0;
  return Math.max(0, Math.round((toMs(end) - toMs(start)) / DAY));
}

// Every date of the trip, first to last, capped at MAX_DAYS.
export function tripDays(start, end) {
  if (!isIsoDate(start)) return [];
  const n = isIsoDate(end) ? Math.min(nights(start, end), MAX_DAYS - 1) : 0;
  return Array.from({ length: n + 1 }, (_, i) => toIso(toMs(start) + i * DAY));
}

export const localIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Where today falls relative to the trip: { phase: 'before', daysToGo } | { phase: 'during', day, of } | { phase: 'after' }.
export function tripStatus(trip, today) {
  if (!isIsoDate(trip.start)) return { phase: 'unset' };
  const end = isIsoDate(trip.end) ? trip.end : trip.start;
  if (today < trip.start) return { phase: 'before', daysToGo: nights(today, trip.start) };
  if (today > end) return { phase: 'after' };
  return { phase: 'during', day: nights(trip.start, today) + 1, of: nights(trip.start, end) + 1 };
}

export const KINDS = {
  activity: { icon: '📍', label: 'Activity' },
  food: { icon: '🍜', label: 'Food' },
  transport: { icon: '✈️', label: 'Transport' },
  stay: { icon: '🏨', label: 'Stay' },
};

// A day's items: timed ones in time order, then untimed ones in the order they were added.
export function itemsOn(trip, date) {
  return trip.items
    .filter((i) => !i.deleted && i.date === date)
    .sort((a, b) => (a.time ? 0 : 1) - (b.time ? 0 : 1) || (a.time || '').localeCompare(b.time || '') || a.createdAt - b.createdAt);
}

// Items whose date is outside the trip (after the dates were changed), so they aren't lost.
export function unscheduled(trip) {
  const days = new Set(tripDays(trip.start, trip.end));
  return trip.items.filter((i) => !i.deleted && !days.has(i.date));
}

export function mapsUrl(place, destination = '') {
  const q = destination && !place.toLowerCase().includes(destination.toLowerCase()) ? `${place}, ${destination}` : place;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function formatDay(iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(toMs(iso)).toLocaleDateString('en-SG', { ...opts, timeZone: 'UTC' });
}

// The itinerary as plain text, to paste into a chat.
export function itineraryText(trip, url) {
  const lines = [`🧳 ${trip.name}${trip.destination ? ` · ${trip.destination}` : ''}`];
  tripDays(trip.start, trip.end).forEach((d, n) => {
    const items = itemsOn(trip, d);
    lines.push('', `Day ${n + 1} · ${formatDay(d)}`);
    if (!items.length) lines.push('  (free)');
    for (const i of items) lines.push(`  ${i.time ? `${i.time} ` : ''}${KINDS[i.kind]?.icon ?? '•'} ${i.title}${i.place ? ` @ ${i.place}` : ''}`);
  });
  if (url) lines.push('', `Open the trip: ${url}`);
  return lines.join('\n');
}

// ---- Calendar ------------------------------------------------------------------------

const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (iso) => iso.replace(/-/g, '');
const nextDay = (iso) => toIso(toMs(iso) + DAY);

// Long lines are folded at 75 characters, as the calendar format requires.
// Splits by whole characters so an emoji is never cut in half.
function fold(line) {
  const chars = [...line];
  const out = [chars.splice(0, 75).join('')];
  while (chars.length) out.push(` ${chars.splice(0, 74).join('')}`);
  return out.join('\r\n');
}

// The itinerary as an .ics file for Google or Apple Calendar: the trip as an all-day event,
// timed items as one-hour events and untimed ones as all-day events. Times have no time
// zone, so they show at that clock time wherever the phone is (i.e. local time on the trip).
export function itineraryIcs(trip, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pocket Apps//Trip Planner//EN', 'CALSCALE:GREGORIAN'];
  const event = (uid, fields) => lines.push('BEGIN:VEVENT', `UID:${uid}@pocket-apps`, `DTSTAMP:${stamp}`, ...fields, 'END:VEVENT');
  if (isIsoDate(trip.start)) {
    const end = isIsoDate(trip.end) ? trip.end : trip.start;
    event(trip.id, [`DTSTART;VALUE=DATE:${icsDate(trip.start)}`, `DTEND;VALUE=DATE:${icsDate(nextDay(end))}`, `SUMMARY:${icsText(`🧳 ${trip.name}`)}`,
      ...(trip.destination ? [`LOCATION:${icsText(trip.destination)}`] : [])]);
  }
  for (const i of trip.items.filter((x) => !x.deleted && isIsoDate(x.date))) {
    const when = i.time
      ? [`DTSTART:${icsDate(i.date)}T${i.time.replace(':', '')}00`, 'DURATION:PT1H']
      : [`DTSTART;VALUE=DATE:${icsDate(i.date)}`, `DTEND;VALUE=DATE:${icsDate(nextDay(i.date))}`];
    event(`${trip.id}-${i.id}`, [...when, `SUMMARY:${icsText(`${KINDS[i.kind]?.icon ?? ''} ${i.title}`.trim())}`,
      ...(i.place ? [`LOCATION:${icsText(i.place)}`] : []), ...(i.notes ? [`DESCRIPTION:${icsText(i.notes)}`] : [])]);
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

// ---- Weather -------------------------------------------------------------------------

// Summarises daily highs, lows and rain into the conditions packing cares about.
// `rain` is a list of daily rain chances (%) for a forecast, or rainfall (mm) for past years.
export function summariseWeather({ max, min, rain, rainIsMm }) {
  const nums = (a) => a.filter((x) => typeof x === 'number');
  const hi = nums(max);
  const lo = nums(min);
  if (!hi.length || !lo.length) return null;
  const wet = nums(rain).filter((r) => (rainIsMm ? r >= 1 : r >= 50)).length;
  return { maxC: Math.round(Math.max(...hi)), minC: Math.round(Math.min(...lo)), rainyDays: wet, days: hi.length };
}

export function weatherTags(w) {
  if (!w) return [];
  const tags = [];
  if (w.maxC >= 27) tags.push('hot');
  if (w.minC < 15) tags.push('cool');
  if (w.minC < 5) tags.push('cold');
  if (w.rainyDays > 0) tags.push('rain');
  return tags;
}

// ---- Packing ---------------------------------------------------------------------------

export const ACTIVITIES = [
  { id: 'city', label: '🏙️ City' },
  { id: 'beach', label: '🏖️ Beach' },
  { id: 'hiking', label: '🥾 Hiking' },
  { id: 'business', label: '💼 Work' },
  { id: 'snow', label: '⛷️ Snow' },
  { id: 'dining', label: '🍷 Nice dinners' },
];

export const CATEGORIES = ['Documents', 'Clothes', 'Toiletries', 'Electronics', 'Health', 'For this trip'];

// The suggested list for a trip. Each item has a stable key, so ticks and removals
// survive when the list is worked out again after the trip changes.
export function packingList(trip, weather) {
  const n = nights(trip.start, trip.end);
  const days = Math.min(n + 1, trip.laundry ? 4 : 10);
  const tags = new Set([...(trip.tags || []), ...weatherTags(weather)]);
  if (tags.has('snow')) tags.add('cold').add('cool');
  if (tags.has('cold')) tags.add('cool');
  const carryOn = trip.luggage === 'carry-on';
  const list = [];
  const add = (cat, key, name, extra = {}) => list.push({ key, cat, name, ...extra });

  if (trip.abroad) {
    add('Documents', 'passport', 'Passport', { note: 'valid for 6+ months after you return' });
    add('Documents', 'visa', 'Visa / arrival card', { note: 'check the entry rules' });
    add('Documents', 'insurance', 'Travel insurance details');
    add('Documents', 'money', 'Cards and some local cash');
  } else {
    add('Documents', 'id', 'ID card');
    add('Documents', 'money', 'Cards and some cash');
  }
  add('Documents', 'bookings', 'Tickets and hotel bookings');

  add('Clothes', 'tops', 'Tops', { qty: days });
  add('Clothes', 'underwear', 'Underwear', { qty: days });
  add('Clothes', 'socks', 'Socks', { qty: days });
  add('Clothes', 'bottoms', 'Trousers / shorts', { qty: Math.max(1, Math.ceil(days / 2)) });
  add('Clothes', 'sleepwear', 'Sleepwear', { qty: n > 7 && !trip.laundry ? 2 : 1 });
  add('Clothes', 'shoes', tags.has('city') ? 'Comfortable walking shoes' : 'Shoes');
  if (tags.has('cool')) add('Clothes', 'jacket', tags.has('cold') ? 'Warm coat' : 'Light jacket');
  if (tags.has('cool')) add('Clothes', 'layers', 'Sweater / fleece', { qty: Math.min(2, Math.ceil(days / 4)) });
  if (tags.has('cold')) {
    add('Clothes', 'thermals', 'Thermal top and leggings', { qty: Math.min(3, Math.ceil(days / 3)) });
    add('Clothes', 'gloves', 'Gloves, beanie and scarf');
  }
  if (tags.has('hot')) add('Clothes', 'hat', 'Cap or sun hat');
  if (tags.has('rain')) add('Clothes', 'raincoat', 'Rain jacket or poncho');
  if (trip.laundry) add('Clothes', 'laundry', 'Laundry bag', { note: 'clothes counted for 4 days, then a wash' });

  const liquids = carryOn ? { note: 'under 100 ml each, in a 1 L clear bag' } : {};
  add('Toiletries', 'toothbrush', 'Toothbrush and toothpaste', liquids);
  add('Toiletries', 'deodorant', 'Deodorant');
  add('Toiletries', 'shampoo', 'Shampoo and body wash', liquids);
  add('Toiletries', 'skincare', 'Skincare and razor');
  if (tags.has('hot') || tags.has('beach') || tags.has('snow')) add('Toiletries', 'sunscreen', 'Sunscreen', liquids);
  if (tags.has('cold')) add('Toiletries', 'lipbalm', 'Lip balm and moisturiser');

  add('Electronics', 'charger', 'Phone charger');
  add('Electronics', 'powerbank', 'Power bank', { note: 'in your carry-on, never checked in' });
  if (trip.abroad) add('Electronics', 'adaptor', 'Travel adaptor');
  add('Electronics', 'earphones', 'Earphones');
  if (trip.abroad) add('Electronics', 'esim', 'eSIM or roaming set up');

  add('Health', 'meds', 'Your regular medicine');
  add('Health', 'firstaid', 'Plasters and painkillers');
  add('Health', 'sanitiser', 'Hand sanitiser and tissues');
  if (tags.has('hiking') || tags.has('beach') || tags.has('hot')) add('Health', 'repellent', 'Insect repellent');

  if (tags.has('rain')) add('For this trip', 'umbrella', 'Foldable umbrella');
  if (tags.has('hot') || tags.has('beach') || tags.has('snow')) add('For this trip', 'sunglasses', 'Sunglasses');
  if (tags.has('beach')) {
    add('For this trip', 'swimwear', 'Swimwear', { qty: n >= 3 ? 2 : 1 });
    add('For this trip', 'flipflops', 'Flip-flops');
    add('For this trip', 'drybag', 'Waterproof phone pouch');
  }
  if (tags.has('hiking')) {
    add('For this trip', 'hikingshoes', 'Hiking shoes');
    add('For this trip', 'daypack', 'Day pack');
    add('For this trip', 'bottle', 'Water bottle');
  }
  if (tags.has('business')) {
    add('For this trip', 'formal', 'Work outfits', { qty: Math.max(1, Math.min(days, 5)) });
    add('For this trip', 'laptop', 'Laptop and charger');
  }
  if (tags.has('dining')) add('For this trip', 'dressy', 'A smart outfit');
  if (tags.has('snow')) add('For this trip', 'snowgear', 'Ski jacket, pants and goggles');
  if (n >= 1) add('For this trip', 'pillow', 'Neck pillow and eye mask');
  return list;
}

// The full list shown to the user: suggestions they haven't removed, plus their own items.
export function fullPackingList(trip, packing, weather) {
  const hidden = packing.hidden || {};
  const own = (packing.custom || []).map((c) => ({ key: `c:${c.id}`, cat: c.cat, name: c.name, custom: true }));
  return [...packingList(trip, weather).filter((i) => !hidden[i.key]), ...own];
}

export function packingProgress(list, checked = {}) {
  const done = list.filter((i) => checked[i.key]).length;
  return { done, total: list.length, pct: list.length ? Math.round((done * 100) / list.length) : 0 };
}

// ---- Sharing -----------------------------------------------------------------------------

const SHARED = ['id', 'name', 'destination', 'start', 'end', 'abroad', 'luggage', 'laundry', 'tags', 'updatedAt'];

// Only the itinerary and trip details travel in a link; packing ticks stay on each phone.
export function encodeTrip(trip) {
  const out = { v: 1, items: trip.items };
  for (const k of SHARED) out[k] = trip[k];
  return encodeData(out);
}

export async function decodeTrip(text) {
  const t = await decodeData(text);
  if (!t || t.v !== 1 || !t.id || !Array.isArray(t.items)) return null;
  const trip = { items: t.items };
  for (const k of SHARED) trip[k] = t[k];
  trip.name = String(trip.name || 'Trip');
  trip.tags = Array.isArray(trip.tags) ? trip.tags : [];
  return trip;
}

export function mergeTrips(mine, theirs) {
  const pick = (t) => Object.fromEntries(SHARED.map((k) => [k, t[k]]));
  const head = newer(pick(mine), pick(theirs));
  const items = mergeList(mine.items, theirs.items);
  return { trip: { ...mine, ...head, items }, changed: countChanged(mine.items, items) };
}
