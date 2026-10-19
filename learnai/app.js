import { trainBigrams, nextWordOdds, pickWord, trainFilter, scoreMessage, roughTokens } from '../src/learnai.js';
import { LESSONS, PREDICT_TEXT, PREDICT_STARTS, SPAM_TRAIN, SPAM_TEST, CHECK_ITEMS, SORT_ITEMS, PROMPTS, GLOSSARY } from './lessons.js';

const STORAGE_KEY = 'learnai-v1';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && s.done) return s;
  } catch { /* ignore */ }
  return { done: {} };
}
const state = load();
const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ } };

let lesson = null; // the open lesson
let step = 0; // index into its cards, then its quiz questions, then the finish screen
let answers = []; // chosen option per quiz question

// ---- Header and lesson list ------------------------------------------------------------------------

function renderProgress() {
  const n = Object.keys(state.done).length;
  $('progress-bar').style.width = `${(n / LESSONS.length) * 100}%`;
  $('progress-line').textContent = n === LESSONS.length
    ? `All ${LESSONS.length} lessons done 🎉`
    : n ? `${n} of ${LESSONS.length} lessons done` : `${LESSONS.length} short lessons · about 40 minutes in all`;
}

function renderList() {
  const next = LESSONS.find((l) => !state.done[l.id]);
  $('lesson-list').innerHTML = `
    ${next ? `<button class="primary la-continue" type="button" data-open="${next.id}">${Object.keys(state.done).length ? 'Continue' : 'Start'}: ${next.emoji} ${esc(next.title)}</button>` : `
      <div class="card la-cert"><p class="la-cert-emoji">🏅</p><h2>You finished AI for Beginners!</h2>
      <p class="hint">You know how AI learns, writes and slips up, how to ask it well and how to stay safe. Now go and try it.</p></div>`}
    <ol class="la-lessons">${LESSONS.map((l, i) => {
      const d = state.done[l.id];
      return `<li><button type="button" class="la-lesson ${d ? 'done' : ''}" data-open="${l.id}">
        <span class="la-emoji" aria-hidden="true">${l.emoji}</span>
        <span class="la-text"><strong>${i + 1}. ${esc(l.title)}</strong><small>${l.minutes} min${d ? ` · quiz ${d.score}/${l.quiz.length}` : ''}</small></span>
        <span class="la-check" aria-label="${d ? 'Done' : 'Not done'}">${d ? '✓' : '›'}</span></button></li>`;
    }).join('')}</ol>
    ${Object.keys(state.done).length ? '<p class="la-reset"><button class="linkish" type="button" id="reset">Reset my progress</button></p>' : ''}`;
}

// ---- Lesson view -----------------------------------------------------------------------------------

function openLesson(id) {
  lesson = LESSONS.find((l) => l.id === id);
  step = 0;
  answers = [];
  $('lesson-list').hidden = true;
  $('lesson-view').hidden = false;
  renderLesson();
}

function closeLesson() {
  lesson = null;
  $('lesson-list').hidden = false;
  $('lesson-view').hidden = true;
  renderList();
  window.scrollTo(0, 0);
}

function renderLesson() {
  const nCards = lesson.cards.length;
  const nQuiz = lesson.quiz.length;
  const total = nCards + nQuiz;
  const dots = Array.from({ length: total }, (_, i) => `<span class="${i < step ? 'past' : i === step ? 'now' : ''} ${i >= nCards ? 'q' : ''}"></span>`).join('');
  let body;
  let canNext = true;
  if (step < nCards) {
    const c = lesson.cards[step];
    body = c.demo ? `<div class="card la-demo" id="demo"></div>` : `<div class="card la-card"><h2>${c.h}</h2>${c.body}</div>`;
  } else if (step < total) {
    const qi = step - nCards;
    const q = lesson.quiz[qi];
    const picked = answers[qi];
    canNext = picked != null;
    body = `<div class="card la-quiz"><p class="eyebrow-dark">Quick check · ${qi + 1} of ${nQuiz}</p><h2>${esc(q.q)}</h2>
      <div class="la-options">${q.options.map((o, i) => {
        const cls = picked == null ? '' : i === q.answer ? 'right' : i === picked ? 'wrong' : 'dim';
        return `<button type="button" class="la-option ${cls}" data-pick="${i}" ${picked != null ? 'disabled' : ''}>${esc(o)}</button>`;
      }).join('')}</div>
      ${picked != null ? `<p class="la-why ${picked === q.answer ? 'right' : 'wrong'}"><b>${picked === q.answer ? 'Yes!' : 'Not quite.'}</b> ${esc(q.why)}</p>` : ''}</div>`;
  } else {
    const score = lesson.quiz.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0);
    const prev = state.done[lesson.id];
    state.done[lesson.id] = { score: Math.max(score, prev?.score ?? 0) };
    persist();
    renderProgress();
    const next = LESSONS[LESSONS.indexOf(lesson) + 1];
    body = `<div class="card la-finish"><p class="la-cert-emoji">${score === nQuiz ? '🌟' : '👍'}</p>
      <h2>Lesson done!</h2><p>You got <b>${score} of ${nQuiz}</b>${score === nQuiz ? ' — perfect.' : '. Have another look whenever you like.'}</p>
      ${next ? `<button class="primary" type="button" data-open="${next.id}">Next: ${next.emoji} ${esc(next.title)}</button>` : '<button class="primary" type="button" id="to-list">See your progress 🏅</button>'}
      <button class="secondary" type="button" id="again">Do this lesson again</button></div>`;
  }
  const atEnd = step >= total;
  $('lesson-view').innerHTML = `
    <div class="la-lesson-head"><button class="secondary small" type="button" id="close">‹ Lessons</button>
      <span>${lesson.emoji} ${esc(lesson.title)}</span></div>
    <div class="la-dots">${dots}</div>
    ${body}
    ${atEnd ? '' : `<div class="la-nav">
      <button class="secondary" type="button" id="prev" ${step === 0 ? 'disabled' : ''}>Back</button>
      <button class="primary" type="button" id="next" ${canNext ? '' : 'disabled'}>${step === total - 1 ? 'Finish' : step === nCards - 1 ? 'Quick quiz' : 'Next'}</button></div>`}`;
  const c = lesson.cards[step];
  if (c?.demo) DEMOS[c.demo]($('demo'));
}

function go(delta) {
  step = Math.max(0, step + delta);
  renderLesson();
  window.scrollTo(0, 0);
}

// ---- Demos -----------------------------------------------------------------------------------------

const DEMOS = { predict: demoPredict, spam: demoSpam, tokens: demoTokens, prompt: demoPrompt, check: demoCheck, sort: demoSort };
const pct = (p) => `${Math.round(p * 100)}%`;

const bigrams = trainBigrams(PREDICT_TEXT);
function demoPredict(box) {
  let sentence = [];
  let temperature = 1;
  const last = () => (sentence.length ? sentence[sentence.length - 1] : '<s>');
  const context = () => ['<s>', ...sentence];
  const ended = () => ['.', '?', '!'].includes(last());
  const text = () => sentence.map((w, i) => (i && !/^[.,!?]$/.test(w) ? ` ${w}` : w)).join('').replace(/^./, (c) => c.toUpperCase());
  const add = (w) => { if (w) sentence.push(w); draw(); };
  function draw() {
    const odds = sentence.length && !ended() ? nextWordOdds(bigrams, context(), temperature).slice(0, 5) : [];
    box.innerHTML = `<p class="eyebrow-dark">Try it: be the chatbot</p>
      <h2>What word comes next?</h2>
      <p class="hint">This tiny model has read ${PREDICT_TEXT.split('\n').length} everyday sentences and only looks at the last two words, so it sometimes writes nonsense. Real chatbots read billions of sentences and look back over the whole conversation. Tap a word, or let it pick.</p>
      ${sentence.length ? '' : `<p class="la-label">Pick a first word:</p><div class="la-chips">${PREDICT_STARTS.map((w) => `<button type="button" class="la-chip" data-w="${w}">${w}</button>`).join('')}</div>`}
      ${sentence.length ? `<p class="la-sentence">${esc(text())}<span class="la-caret">${ended() ? '' : '▍'}</span></p>` : ''}
      ${odds.length ? `<div class="la-odds">${odds.map((o) => `<button type="button" class="la-odd" data-w="${esc(o.word)}"><span class="w">${esc(o.word)}</span><span class="bar"><span style="width:${pct(o.p)}"></span></span><span class="p">${pct(o.p)}</span></button>`).join('')}</div>` : ''}
      ${sentence.length ? `<div class="la-row">
        ${ended() ? '' : '<button type="button" class="secondary small" id="p-one">Let AI pick one</button><button type="button" class="secondary small" id="p-all">Finish the sentence</button>'}
        <button type="button" class="secondary small" id="p-reset">Start again</button></div>` : ''}
      <label class="field"><span>Temperature: <b>${temperature.toFixed(1)}</b> ${temperature < 0.7 ? '(safe, predictable)' : temperature > 1.4 ? '(wild, creative)' : '(normal)'}</span>
        <input type="range" id="p-temp" min="0.2" max="2" step="0.1" value="${temperature}"></label>
      <p class="hint">Watch the percentages change as you move the slider: low makes the top word win more often, high gives the long shots a chance.</p>`;
  }
  box.onclick = (e) => {
    const w = e.target.closest('[data-w]')?.dataset.w;
    if (w) { add(w); return; }
    const id = e.target.closest('button')?.id;
    if (id === 'p-one') add(pickWord(nextWordOdds(bigrams, context(), temperature), Math.random()));
    if (id === 'p-all') {
      for (let i = 0; i < 15 && !ended(); i++) {
        const w2 = pickWord(nextWordOdds(bigrams, context(), temperature), Math.random());
        if (!w2) break;
        sentence.push(w2);
      }
      draw();
    }
    if (id === 'p-reset') { sentence = []; draw(); }
  };
  box.oninput = (e) => { if (e.target.id === 'p-temp') { temperature = Number(e.target.value); draw(); } };
  draw();
}

function demoSpam(box) {
  let labels = [];
  let custom = '';
  function draw() {
    if (labels.length < SPAM_TRAIN.length) {
      const m = SPAM_TRAIN[labels.length];
      box.innerHTML = `<p class="eyebrow-dark">Try it: be the teacher</p>
        <h2>Teach a scam filter</h2>
        <p class="hint">Label each message. The filter learns from your answers, nothing else. Message ${labels.length + 1} of ${SPAM_TRAIN.length}.</p>
        <div class="la-msg">${esc(m.text)}</div>
        <div class="la-row la-two"><button type="button" class="la-big bad" data-label="scam">🚨 Scam</button><button type="button" class="la-big good" data-label="normal">✅ Normal</button></div>`;
      return;
    }
    const model = trainFilter(SPAM_TRAIN.map((m, i) => ({ text: m.text, label: labels[i] })));
    const wrongTeach = labels.filter((l, i) => l !== SPAM_TRAIN[i].label).length;
    const results = SPAM_TEST.map((m) => ({ ...m, s: scoreMessage(model, m.text) }));
    const right = results.filter((r) => r.s && (r.s.p >= 0.5) === (r.label === 'scam')).length;
    const row = (text, s, truth) => {
      if (!s) return `<div class="la-test"><p>${esc(text)}</p><p class="hint">It needs at least one scam and one normal example to learn.</p></div>`;
      const scam = s.p >= 0.5;
      const clues = s.clues.slice(0, 3).map((c) => `<span class="la-clue ${c.weight > 0 ? 'bad' : 'good'}">${esc(c.word)}</span>`).join(' ');
      return `<div class="la-test ${truth == null ? '' : scam === (truth === 'scam') ? 'ok' : 'miss'}">
        <p>${esc(text)}</p>
        <p class="la-verdict">${scam ? '🚨 Scam' : '✅ Normal'} <small>${pct(scam ? s.p : 1 - s.p)} sure</small>${truth == null ? '' : scam === (truth === 'scam') ? ' <b class="ok">✓ right</b>' : ' <b class="miss">✗ wrong</b>'}</p>
        ${clues ? `<p class="hint">Clue words: ${clues}</p>` : ''}</div>`;
    };
    box.innerHTML = `<p class="eyebrow-dark">Try it: be the teacher</p>
      <h2>Now it's tested on messages it has never seen</h2>
      ${results.map((r) => row(r.text, r.s, r.label)).join('')}
      <p class="la-score">It got <b>${right} of ${SPAM_TEST.length}</b> right.
        ${wrongTeach ? `You labelled ${wrongTeach} example${wrongTeach > 1 ? 's' : ''} differently from the usual answer, so it learned that too. Rubbish in, rubbish out!` : 'It learned only from your 8 examples: that\'s how AI learns.'}</p>
      <label class="field"><span>Type your own message to test it</span><input id="s-own" value="${esc(custom)}" placeholder="e.g. Claim your free prize now" autocomplete="off"></label>
      <div id="s-own-out">${custom.trim() ? row(custom, scoreMessage(model, custom), null) : ''}</div>
      <button type="button" class="secondary small" id="s-reset">Teach it again</button>`;
  }
  box.onclick = (e) => {
    const l = e.target.closest('[data-label]')?.dataset.label;
    if (l) { labels.push(l); draw(); return; }
    if (e.target.closest('#s-reset')) { labels = []; custom = ''; draw(); }
  };
  box.oninput = (e) => {
    if (e.target.id !== 's-own') return;
    custom = e.target.value;
    const model = trainFilter(SPAM_TRAIN.map((m, i) => ({ text: m.text, label: labels[i] })));
    const s = scoreMessage(model, custom);
    // Redraw only the result so typing isn't interrupted.
    const tmp = document.createElement('div');
    if (custom.trim() && s) {
      const scam = s.p >= 0.5;
      tmp.innerHTML = `<div class="la-test"><p class="la-verdict">${scam ? '🚨 Scam' : '✅ Normal'} <small>${pct(scam ? s.p : 1 - s.p)} sure</small></p>
        ${s.clues.length ? `<p class="hint">Clue words: ${s.clues.slice(0, 3).map((c) => `<span class="la-clue ${c.weight > 0 ? 'bad' : 'good'}">${esc(c.word)}</span>`).join(' ')}</p>` : '<p class="hint">None of these words were in its lessons, so it\'s just guessing.</p>'}</div>`;
    }
    box.querySelector('#s-own-out').innerHTML = tmp.innerHTML;
  };
  draw();
}

function demoTokens(box) {
  const start = 'I want to eat chicken rice tonight! Unbelievable. 你好 2026';
  box.innerHTML = `<p class="eyebrow-dark">Try it: see what AI sees</p>
    <h2>Split text into tokens</h2>
    <p class="hint">Type anything. Each coloured block is roughly one token. (Every AI splits a little differently; this is a close imitation.)</p>
    <textarea id="t-in" class="la-textarea" rows="3">${esc(start)}</textarea>
    <div class="la-tokens" id="t-out"></div>
    <p class="la-score" id="t-count"></p>`;
  const draw = () => {
    const text = box.querySelector('#t-in').value;
    const toks = roughTokens(text);
    box.querySelector('#t-out').innerHTML = toks.map((tk, i) => `<span class="tk c${i % 5}">${esc(tk).replace(/ /g, '␣').replace(/\n/g, '↵')}</span>`).join('');
    const words = (text.match(/\S+/g) || []).length;
    box.querySelector('#t-count').innerHTML = `<b>${toks.length}</b> tokens · ${words} words · ${text.length} characters`;
  };
  box.querySelector('#t-in').addEventListener('input', draw);
  draw();
}

function demoPrompt(box) {
  const f = { task: 'write a message to my landlord', context: 'the kitchen tap has been leaking for a week', who: 'my landlord', format: 'under 100 words', tone: 'polite but firm' };
  box.innerHTML = `<p class="eyebrow-dark">Try it: build a prompt</p>
    <h2>Prompt builder</h2>
    <p class="hint">Fill in the parts. Watch a vague request turn into a clear one.</p>
    <label class="field"><span>1. Task: what should it do?</span><input id="b-task" value="${esc(f.task)}"></label>
    <label class="field"><span>2. Context: what does it need to know?</span><input id="b-context" value="${esc(f.context)}"></label>
    <label class="field"><span>3. Who is it for?</span><input id="b-who" value="${esc(f.who)}"></label>
    <label class="field"><span>4. Format</span><select id="b-format">${['under 100 words', 'as bullet points', 'as a simple table', 'in 3 short steps', 'in WhatsApp style'].map((o) => `<option ${o === f.format ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
    <label class="field"><span>5. Tone</span><select id="b-tone">${['polite but firm', 'warm and friendly', 'formal', 'simple, for a child', 'funny'].map((o) => `<option ${o === f.tone ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
    <p class="la-label">Vague: <span class="la-weak">"${esc(f.task.split(' ').slice(0, 2).join(' '))}…"</span></p>
    <p class="la-label">Clear:</p>
    <div class="la-built" id="b-out"></div>
    <button type="button" class="primary" id="b-copy">Copy prompt</button>`;
  const draw = () => {
    const v = (id) => box.querySelector(id).value.trim();
    const parts = [
      v('#b-task') && `Please ${v('#b-task')}.`,
      v('#b-context') && `Background: ${v('#b-context')}.`,
      v('#b-who') && `It's for ${v('#b-who')}.`,
      `Make it ${v('#b-tone')}, ${v('#b-format')}.`,
    ].filter(Boolean);
    box.querySelector('#b-out').textContent = parts.join(' ');
  };
  box.oninput = draw;
  box.querySelector('#b-copy').addEventListener('click', () => copy(box.querySelector('#b-out').textContent, box.querySelector('#b-copy')));
  draw();
}

function demoCheck(box) {
  const picks = [];
  function draw() {
    box.innerHTML = `<p class="eyebrow-dark">Try it: be the checker</p>
      <h2>Trust it, or double-check?</h2>
      <p class="hint">A chatbot said each of these. Decide which you'd check before relying on it.</p>
      ${CHECK_ITEMS.map((it, i) => {
        const p = picks[i];
        const right = p != null && p === it.risky;
        return `<div class="la-test ${p == null ? '' : right ? 'ok' : 'miss'}"><p>${esc(it.text)}</p>
          ${p == null ? `<div class="la-row la-two"><button type="button" class="secondary small" data-c="${i}" data-v="0">👍 Fine</button><button type="button" class="secondary small" data-c="${i}" data-v="1">🔍 Double-check</button></div>`
          : `<p class="hint"><b>${right ? 'Good call.' : 'Hmm.'}</b> ${esc(it.why)}</p>`}</div>`;
      }).join('')}`;
  }
  box.onclick = (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    picks[Number(b.dataset.c)] = b.dataset.v === '1';
    draw();
  };
  draw();
}

function demoSort(box) {
  let i = 0;
  let score = 0;
  let last = null;
  function draw() {
    if (i >= SORT_ITEMS.length) {
      box.innerHTML = `<p class="eyebrow-dark">Try it: sort the jobs</p><h2>${score} of ${SORT_ITEMS.length} right</h2>
        <p class="hint">${score >= 6 ? 'You have a good instinct for when to lean on AI.' : 'Rule of thumb: drafts, explanations and ideas are great; exact facts, decisions and official forms need you.'}</p>
        <button type="button" class="secondary small" id="o-again">Play again</button>`;
      return;
    }
    const it = SORT_ITEMS[i];
    box.innerHTML = `<p class="eyebrow-dark">Try it: sort the jobs · ${i + 1} of ${SORT_ITEMS.length}</p>
      <h2>Good use of AI, or be careful?</h2>
      ${last ? `<p class="la-why ${last.ok ? 'right' : 'wrong'}">${last.ok ? '✓ Right' : '✗ Not quite'}: "${esc(last.text)}" is ${last.good ? 'a good use' : 'one to be careful with'}.</p>` : ''}
      <div class="la-msg">${esc(it.text)}</div>
      <div class="la-row la-two"><button type="button" class="la-big good" data-g="1">✅ Good use</button><button type="button" class="la-big bad" data-g="0">⚠️ Be careful</button></div>`;
  }
  box.onclick = (e) => {
    if (e.target.closest('#o-again')) { i = 0; score = 0; last = null; draw(); return; }
    const b = e.target.closest('[data-g]');
    if (!b) return;
    const it = SORT_ITEMS[i];
    const ok = (b.dataset.g === '1') === it.good;
    if (ok) score++;
    last = { ok, text: it.text, good: it.good };
    i++;
    draw();
  };
  draw();
}

// ---- Prompts and words -----------------------------------------------------------------------------

async function copy(text, button) {
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
  }
  const was = button.textContent;
  button.textContent = 'Copied ✓';
  setTimeout(() => { button.textContent = was; }, 1500);
}

function renderPrompts() {
  $('prompt-list').innerHTML = PROMPTS.map((p, i) => `<div class="card la-prompt">
    <h3>${p.emoji} ${esc(p.title)}</h3>
    <p>${esc(p.text).replace(/\[([^\]]+)\]/g, '<mark>[$1]</mark>')}</p>
    <button type="button" class="secondary small" data-copy="${i}">Copy</button></div>`).join('');
}

function renderGlossary() {
  const q = $('word-search').value.trim().toLowerCase();
  const rows = GLOSSARY.filter(([w, d]) => !q || w.toLowerCase().includes(q) || d.toLowerCase().includes(q));
  $('glossary').innerHTML = rows.length ? rows.map(([w, d]) => `<dt>${esc(w)}</dt><dd>${esc(d)}</dd>`).join('') : '<dd class="hint">No match. Try another word.</dd>';
}

// ---- Start-up --------------------------------------------------------------------------------------

function switchTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  window.scrollTo(0, 0);
}

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
$('lesson-list').addEventListener('click', (e) => {
  const o = e.target.closest('[data-open]');
  if (o) { openLesson(o.dataset.open); window.scrollTo(0, 0); return; }
  if (e.target.closest('#reset') && confirm('Reset your progress? Your quiz scores will be cleared.')) {
    state.done = {};
    persist();
    renderProgress();
    renderList();
  }
});
$('lesson-view').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.closest('#demo')) return;
  if (b.id === 'close' || b.id === 'to-list') closeLesson();
  else if (b.id === 'prev') go(-1);
  else if (b.id === 'next') go(1);
  else if (b.id === 'again') openLesson(lesson.id);
  else if (b.dataset.open) { openLesson(b.dataset.open); window.scrollTo(0, 0); }
  else if (b.dataset.pick != null) {
    answers[step - lesson.cards.length] = Number(b.dataset.pick);
    renderLesson();
  }
});
$('prompt-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (b) copy(PROMPTS[Number(b.dataset.copy)].text, b);
});
$('word-search').addEventListener('input', renderGlossary);

renderProgress();
renderList();
renderPrompts();
renderGlossary();
