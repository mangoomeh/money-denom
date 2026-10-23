// Tiny, honest versions of what real AI does, small enough to run on a phone: a word predictor
// (how chatbots write), a scam filter that learns from examples (how AI learns), and a rough token
// splitter (how AI reads text).

// ---- Next-word prediction -----------------------------------------------------------------------

// Chinese has no spaces between words, so Chinese training text is written with spaces between them.
const CJK = '\u3400-\u9fff';
const words = (s) => s.toLowerCase().match(new RegExp(`[a-z']+|[${CJK}]+|[.,!?。，！？]`, 'g')) || [];

// Count which word follows each word, and each pair of words, in the training text.
export function trainBigrams(text) {
  const next = new Map();
  const count = (key, w) => {
    if (!next.has(key)) next.set(key, new Map());
    const m = next.get(key);
    m.set(w, (m.get(w) || 0) + 1);
  };
  for (const line of text.split('\n')) {
    const w = ['<s>', ...words(line)];
    for (let i = 0; i + 1 < w.length; i++) {
      count(w[i], w[i + 1]);
      if (i > 0) count(`${w[i - 1]} ${w[i]}`, w[i + 1]);
    }
  }
  return next;
}

// The chances of each next word after the words so far, highest first. It looks at the last two words
// when it has seen that pair, otherwise just the last one: real chatbots look back over thousands of
// words. Temperature below 1 makes the likely words likelier still; above 1 flattens the odds so rarer
// words get picked more.
export function nextWordOdds(model, context, temperature = 1) {
  const ctx = typeof context === 'string' ? [context] : context;
  const pair = ctx.slice(-2).join(' ');
  const m = (ctx.length > 1 && model.get(pair)) || model.get(ctx[ctx.length - 1]);
  if (!m) return [];
  const t = Math.max(0.05, temperature);
  const weights = [...m].map(([w, n]) => [w, n ** (1 / t)]);
  const total = weights.reduce((s, [, x]) => s + x, 0);
  return weights.map(([w, x]) => ({ word: w, p: x / total })).sort((a, b) => b.p - a.p || a.word.localeCompare(b.word));
}

// Pick a word from the odds, using `rand` (a number from 0 to 1).
export function pickWord(odds, rand) {
  let acc = 0;
  for (const o of odds) {
    acc += o.p;
    if (rand < acc) return o.word;
  }
  return odds.length ? odds[odds.length - 1].word : null;
}

// ---- Learning from examples: a naive Bayes scam filter -------------------------------------------

// What the filter counts: English words, and Chinese in overlapping two-character pieces (so it works
// on everyday Chinese typed without spaces; most Chinese words are two characters).
export function filterTerms(text) {
  const out = words(text).filter((x) => /[a-z]/.test(x));
  for (const run of text.replace(/\s+/g, '').match(new RegExp(`[${CJK}]+`, 'g')) || []) {
    if (run.length === 1) out.push(run);
    for (let i = 0; i + 1 < run.length; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}

export function trainFilter(examples) {
  const counts = { scam: new Map(), normal: new Map() };
  const totals = { scam: 0, normal: 0 };
  const docs = { scam: 0, normal: 0 };
  const vocab = new Set();
  for (const { text, label } of examples) {
    docs[label]++;
    for (const w of new Set(filterTerms(text))) {
      counts[label].set(w, (counts[label].get(w) || 0) + 1);
      totals[label]++;
      vocab.add(w);
    }
  }
  return { counts, totals, docs, vocab };
}

// How likely a message is a scam, from 0 to 1, and the words that pushed it most either way.
export function scoreMessage(model, text) {
  const { counts, totals, docs, vocab } = model;
  if (!docs.scam || !docs.normal) return null;
  const v = vocab.size + 1;
  let logOdds = Math.log(docs.scam / docs.normal);
  const clues = [];
  for (const w of new Set(filterTerms(text))) {
    if (!vocab.has(w)) continue;
    const ps = ((counts.scam.get(w) || 0) + 1) / (totals.scam + v);
    const pn = ((counts.normal.get(w) || 0) + 1) / (totals.normal + v);
    const weight = Math.log(ps / pn);
    logOdds += weight;
    clues.push({ word: w, weight });
  }
  clues.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  return { p: 1 / (1 + Math.exp(-logOdds)), clues };
}

// ---- Tokens ---------------------------------------------------------------------------------------

// A rough split into tokens, the pieces a language model reads. Real tokenizers learn their pieces
// from data; this mimics their usual shape: common short words whole, long words in chunks, a space
// joined to the word after it, numbers in groups of up to three digits, and each Chinese character
// on its own.
export function roughTokens(text) {
  const out = [];
  const re = /( ?[A-Za-z]+)|( ?\d+)|([㐀-鿿])|( ?[^\sA-Za-z\d㐀-鿿])|(\s+)/g;
  let m;
  while ((m = re.exec(text))) {
    const [piece, word, num, cjk, other, space] = m;
    if (word) {
      const lead = word.startsWith(' ') ? ' ' : '';
      const core = word.trim();
      if (core.length <= 7) { out.push(word); continue; }
      const parts = core.match(/.{1,4}/g);
      parts.forEach((p, i) => out.push(i === 0 ? lead + p : p));
    } else if (num) {
      const lead = num.startsWith(' ') ? ' ' : '';
      num.trim().match(/\d{1,3}/g).forEach((p, i) => out.push(i === 0 ? lead + p : p));
    } else if (cjk || other) out.push(piece);
    else if (space && space.includes('\n')) out.push(space);
    else if (space && space.length > 1) out.push(space);
  }
  return out;
}
