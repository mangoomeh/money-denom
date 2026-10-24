import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPS, SCREENS, LANGS, findLesson, renderScreen, say } from '../src/godigital.js';

const lessons = APPS.flatMap((a) => a.lessons);

test('every step\'s screen exists and its button to press is on it', () => {
  for (const l of lessons) {
    for (const [i, s] of l.steps.entries()) {
      assert.ok(SCREENS[s.screen], `${l.id} step ${i + 1}: no screen ${s.screen}`);
      const html = renderScreen(s);
      if (s.tap) assert.ok(html.includes(`data-id="${s.tap}"`), `${l.id} step ${i + 1}: "${s.tap}" isn't on ${s.screen}`);
    }
  }
});

test('everything is written in every language', () => {
  const codes = LANGS.map(([c]) => c);
  const check = (obj, where) => { for (const c of codes) assert.ok(typeof obj[c] === 'string' && obj[c].trim(), `${where}: missing ${c}`); };
  for (const app of APPS) {
    check(app, app.id);
    for (const l of app.lessons) {
      check(l, l.id);
      for (const [i, s] of l.steps.entries()) {
        check(s, `${l.id} step ${i + 1}`);
        for (const c of s.chips || []) if (typeof c !== 'string') check(c, `${l.id} step ${i + 1} chip`);
      }
    }
  }
  // Burmese text really is in Burmese script.
  for (const l of lessons) for (const s of l.steps) assert.match(s.my, /[က-႟]/, `${l.id}: ${s.en}`);
});

test('lessons have unique ids and can be found', () => {
  assert.equal(new Set(lessons.map((l) => l.id)).size, lessons.length);
  for (const l of lessons) assert.equal(findLesson(l.id).lesson, l);
  assert.equal(findLesson('nope'), null);
});

test('the guides asked for are all there', () => {
  const ids = lessons.map((l) => l.id);
  for (const id of ['grab-account', 'grab-ride', 'grab-food', 'grab-places', 'grab-pay', 'grab-cars', 'fp-order', 'dbs-paynow', 'dbs-scan', 'dbs-bills', 'dbs-safe']) assert.ok(ids.includes(id), id);
  // The car types guide covers wheelchairs.
  assert.ok(findLesson('grab-cars').lesson.steps.some((s) => /wheelchair/i.test(s.en)));
});

test('say() picks the language and falls back to English', () => {
  assert.equal(say({ en: 'Hi', zh: '你好' }, 'zh'), '你好');
  assert.equal(say({ en: 'Hi' }, 'my'), 'Hi');
  assert.equal(say('👥 4', 'my'), '👥 4');
});
