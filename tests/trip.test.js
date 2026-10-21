import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nights, tripDays, tripStatus, itemsOn, unscheduled, mapsUrl, itineraryText, summariseWeather, weatherTags,
  packingList, fullPackingList, packingProgress, encodeTrip, decodeTrip, mergeTrips, isIsoDate, MAX_DAYS,
} from '../src/trip.js';
import { mergeList } from '../src/sync.js';

const trip = (extra = {}) => ({
  id: 't', name: 'Tokyo', destination: 'Tokyo', start: '2026-11-28', end: '2026-12-02', abroad: true,
  luggage: 'checked', laundry: false, tags: ['city'], updatedAt: 1, items: [], ...extra,
});
const item = (id, date, time, extra = {}) => ({ id, date, time, title: id, kind: 'activity', createdAt: 1, updatedAt: 1, ...extra });

test('days and nights cross month ends and ignore daylight saving', () => {
  assert.equal(nights('2026-11-28', '2026-12-02'), 4);
  assert.deepEqual(tripDays('2026-11-28', '2026-12-02'), ['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
  assert.deepEqual(tripDays('2026-03-28', '2026-03-30'), ['2026-03-28', '2026-03-29', '2026-03-30']);
  assert.deepEqual(tripDays('2026-11-28', ''), ['2026-11-28']);
  assert.deepEqual(tripDays('2026-11-28', '2026-11-20'), ['2026-11-28']);
  assert.equal(tripDays('2026-01-01', '2027-01-01').length, MAX_DAYS);
  assert.equal(isIsoDate('2026-02-30'), false);
});

test('tripStatus counts down, then counts days', () => {
  assert.deepEqual(tripStatus(trip(), '2026-11-21'), { phase: 'before', daysToGo: 7 });
  assert.deepEqual(tripStatus(trip(), '2026-11-28'), { phase: 'during', day: 1, of: 5 });
  assert.deepEqual(tripStatus(trip(), '2026-12-02'), { phase: 'during', day: 5, of: 5 });
  assert.deepEqual(tripStatus(trip(), '2026-12-03'), { phase: 'after' });
  assert.deepEqual(tripStatus(trip({ start: '' }), '2026-12-03'), { phase: 'unset' });
});

test('a day lists timed items in order, then untimed ones', () => {
  const t = trip({ items: [
    item('lunch', '2026-11-29', '12:30'), item('free', '2026-11-29', ''), item('flight', '2026-11-29', '08:05'),
    item('gone', '2026-11-29', '09:00', { deleted: true }), item('other', '2026-11-30', '10:00'), item('old', '2026-11-01', ''),
  ] });
  assert.deepEqual(itemsOn(t, '2026-11-29').map((i) => i.id), ['flight', 'lunch', 'free']);
  assert.deepEqual(unscheduled(t).map((i) => i.id), ['old']);
});

test('maps links add the destination unless the place already names it', () => {
  assert.equal(mapsUrl('Senso-ji', 'Tokyo'), 'https://www.google.com/maps/search/?api=1&query=Senso-ji%2C%20Tokyo');
  assert.equal(mapsUrl('Tokyo Tower', 'Tokyo'), 'https://www.google.com/maps/search/?api=1&query=Tokyo%20Tower');
});

test('itinerary text for a chat', () => {
  const t = trip({ end: '2026-11-29', items: [item('Fly', '2026-11-28', '08:05', { kind: 'transport', place: 'Changi T3' })] });
  assert.equal(itineraryText(t), '🧳 Tokyo · Tokyo\n\nDay 1 · Sat, 28 Nov\n  08:05 ✈️ Fly @ Changi T3\n\nDay 2 · Sun, 29 Nov\n  (free)');
});

test('weather summary and tags', () => {
  const f = summariseWeather({ max: [12.4, 9.6, null], min: [4.2, 6], rain: [10, 70, 55] });
  assert.deepEqual(f, { maxC: 12, minC: 4, rainyDays: 2, days: 2 });
  assert.deepEqual(weatherTags(f), ['cool', 'cold', 'rain']);
  assert.deepEqual(weatherTags(summariseWeather({ max: [32], min: [26], rain: [0.4], rainIsMm: true })), ['hot']);
  assert.equal(summariseWeather({ max: [], min: [], rain: [] }), null);
});

test('packing scales with the trip and reacts to weather, activities and luggage', () => {
  const qty = (list, key) => list.find((i) => i.key === key)?.qty;
  const has = (list, key) => list.some((i) => i.key === key);
  const base = packingList(trip(), null);
  assert.equal(qty(base, 'tops'), 5);
  assert.equal(qty(base, 'bottoms'), 3);
  assert.ok(has(base, 'passport') && has(base, 'adaptor'));
  assert.ok(!has(base, 'jacket') && !has(base, 'swimwear'));

  const long = packingList(trip({ end: '2026-12-20' }), null);
  assert.equal(qty(long, 'tops'), 10);
  assert.equal(qty(packingList(trip({ end: '2026-12-20', laundry: true }), null), 'tops'), 4);

  const cold = packingList(trip(), { maxC: 10, minC: 2, rainyDays: 1 });
  assert.ok(has(cold, 'jacket') && has(cold, 'thermals') && has(cold, 'umbrella'));
  assert.equal(cold.find((i) => i.key === 'jacket').name, 'Warm coat');

  const beach = packingList(trip({ tags: ['beach'], luggage: 'carry-on', abroad: false }), null);
  assert.ok(has(beach, 'swimwear') && has(beach, 'sunscreen') && has(beach, 'id') && !has(beach, 'passport'));
  assert.match(beach.find((i) => i.key === 'shampoo').note, /100 ml/);
  assert.equal(new Set(cold.map((i) => i.key)).size, cold.length, 'keys are unique');
});

test('removed suggestions stay removed and own items are added', () => {
  const packing = { hidden: { pillow: true }, custom: [{ id: 'x', name: 'Camera', cat: 'Electronics' }], checked: { 'c:x': true, passport: true } };
  const list = fullPackingList(trip(), packing, null);
  assert.ok(!list.some((i) => i.key === 'pillow'));
  assert.ok(list.some((i) => i.key === 'c:x' && i.custom));
  const p = packingProgress(list, packing.checked);
  assert.equal(p.done, 2);
  assert.equal(p.total, list.length);
});

test('a trip survives the link round trip without the packing list', async () => {
  const t = trip({ items: [item('Ramen 一蘭', '2026-11-29', '19:00')], packing: { checked: { passport: true } } });
  const back = await decodeTrip(await encodeTrip(t));
  assert.equal(back.items[0].title, 'Ramen 一蘭');
  assert.equal(back.start, '2026-11-28');
  assert.equal(back.packing, undefined);
  assert.equal(await decodeTrip('nope'), null);
});

test('merging trips keeps both sides\' items and the newer details, in either order', () => {
  const packing = { checked: { passport: true } };
  const mine = trip({ packing, items: [item('a', '2026-11-28', ''), item('b', '2026-11-29', '', { updatedAt: 5, title: 'mine' })] });
  const theirs = trip({ name: 'Tokyo & Osaka', updatedAt: 2, items: [item('b', '2026-11-29', '', { updatedAt: 3 }), item('c', '2026-11-30', '')] });
  const ab = mergeTrips(mine, theirs);
  const ba = mergeTrips(theirs, mine);
  assert.equal(ab.trip.name, 'Tokyo & Osaka');
  assert.equal(ab.trip.items.find((i) => i.id === 'b').title, 'mine');
  assert.equal(ab.changed, 1);
  assert.deepEqual(ab.trip.packing, packing, 'packing on this phone is kept');
  const ids = (t) => t.items.map((i) => `${i.id}:${i.title}`).sort();
  assert.deepEqual(ids(ab.trip), ids(ba.trip));
});

test('mergeList breaks ties the same way on both phones', () => {
  const x = [{ id: '1', updatedAt: 1, v: 'x' }];
  const y = [{ id: '1', updatedAt: 1, v: 'y' }];
  assert.deepEqual(mergeList(x, y), mergeList(y, x));
});
