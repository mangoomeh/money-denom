import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainBigrams, nextWordOdds, pickWord, trainFilter, scoreMessage, roughTokens, filterTerms } from '../src/learnai.js';

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

test('Chinese text: words split on spaces, and the filter reads two-character pieces', () => {
  const m = trainBigrams('我 喜欢 吃 鸡饭 。\n我 喜欢 喝 咖啡 。\n我 喜欢 吃 面 。');
  assert.equal(nextWordOdds(m, ['我', '喜欢'])[0].word, '吃');
  assert.equal(nextWordOdds(m, '咖啡')[0].word, '。');
  assert.deepEqual(filterTerms('点击链接'), ['点击', '击链', '链接']);
  assert.deepEqual(filterTerms('Click 链接 now'), ['click', 'now', '链接']);
});

test('the Chinese lessons match the English ones', async () => {
  const en = await import('../learnai/lessons.js');
  const zh = await import('../learnai/lessons-zh.js');
  assert.deepEqual(zh.LESSONS.map((l) => [l.id, l.emoji, l.cards.map((c) => c.demo || 'text'), l.quiz.map((q) => [q.options.length, q.answer])]),
    en.LESSONS.map((l) => [l.id, l.emoji, l.cards.map((c) => c.demo || 'text'), l.quiz.map((q) => [q.options.length, q.answer])]));
  for (const key of ['SPAM_TRAIN', 'SPAM_TEST', 'CHECK_ITEMS', 'SORT_ITEMS', 'PROMPTS', 'GLOSSARY']) assert.equal(zh[key].length, en[key].length, key);
  assert.deepEqual(zh.SPAM_TRAIN.map((m) => m.label), en.SPAM_TRAIN.map((m) => m.label));
  assert.deepEqual(zh.CHECK_ITEMS.map((m) => m.risky), en.CHECK_ITEMS.map((m) => m.risky));
  assert.deepEqual(zh.SORT_ITEMS.map((m) => m.good), en.SORT_ITEMS.map((m) => m.good));
});

test('taught correctly, each language\'s filter gets every test message right', async () => {
  for (const file of ['lessons.js', 'lessons-zh.js']) {
    const { SPAM_TRAIN, SPAM_TEST, PREDICT_TEXT, PREDICT_STARTS } = await import(`../learnai/${file}`);
    const model = trainFilter(SPAM_TRAIN);
    for (const m of SPAM_TEST) assert.equal(scoreMessage(model, m.text).p >= 0.5, m.label === 'scam', `${file}: ${m.text}`);
    // Every first word on offer leads somewhere.
    const bigrams = trainBigrams(PREDICT_TEXT);
    for (const w of PREDICT_STARTS) assert.ok(nextWordOdds(bigrams, ['<s>', w]).length, `${file}: ${w}`);
  }
});
