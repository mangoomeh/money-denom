import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainBigrams, nextWordOdds, pickWord, trainFilter, scoreMessage, roughTokens } from '../src/learnai.js';

test('word predictor learns which word comes next', () => {
  const m = trainBigrams('I like chicken rice.\nI like chicken rice.\nI like kaya toast.');
  const odds = nextWordOdds(m, 'like');
  assert.equal(odds[0].word, 'chicken');
  assert.ok(Math.abs(odds[0].p - 2 / 3) < 1e-9);
  assert.equal(nextWordOdds(m, '<s>')[0].word, 'i');
  assert.deepEqual(nextWordOdds(m, 'nothing'), []);
});

test('two words of context beat one', () => {
  const m = trainBigrams('I want to eat rice.\nwe go to the beach.');
  assert.equal(nextWordOdds(m, ['want', 'to'])[0].word, 'eat');
  assert.equal(nextWordOdds(m, ['go', 'to'])[0].word, 'the');
  assert.equal(nextWordOdds(m, ['to']).length, 2);
});

test('temperature sharpens or flattens the odds', () => {
  const m = trainBigrams('a b\na b\na b\na c');
  const cold = nextWordOdds(m, 'a', 0.3)[0].p;
  const normal = nextWordOdds(m, 'a', 1)[0].p;
  const hot = nextWordOdds(m, 'a', 3)[0].p;
  assert.ok(cold > normal && normal > hot, `${cold} ${normal} ${hot}`);
  assert.ok(Math.abs(normal - 0.75) < 1e-9);
});

test('picking follows the odds', () => {
  const odds = [{ word: 'x', p: 0.7 }, { word: 'y', p: 0.3 }];
  assert.equal(pickWord(odds, 0.1), 'x');
  assert.equal(pickWord(odds, 0.8), 'y');
  assert.equal(pickWord([], 0.5), null);
});

test('scam filter learns from labelled examples', () => {
  const model = trainFilter([
    { text: 'You won a prize, click the link to claim now', label: 'scam' },
    { text: 'Urgent: your bank account is locked, click link', label: 'scam' },
    { text: 'Dinner at 7 tonight?', label: 'normal' },
    { text: 'Can you send me the photos from Saturday', label: 'normal' },
  ]);
  const s = scoreMessage(model, 'Click this link to claim your prize');
  assert.ok(s.p > 0.8, String(s.p));
  assert.equal(s.clues[0].weight > 0, true);
  const n = scoreMessage(model, 'Are we still on for dinner tonight');
  assert.ok(n.p < 0.3, String(n.p));
  assert.equal(scoreMessage(trainFilter([{ text: 'hi', label: 'normal' }]), 'hi'), null);
});

test('rough tokens look like real ones', () => {
  assert.deepEqual(roughTokens('I like chicken rice.'), ['I', ' like', ' chicken', ' rice', '.']);
  assert.deepEqual(roughTokens('unbelievable'), ['unbe', 'liev', 'able']);
  assert.deepEqual(roughTokens('Pay 12345 now'), ['Pay', ' 123', '45', ' now']);
  assert.deepEqual(roughTokens('你好'), ['你', '好']);
});
