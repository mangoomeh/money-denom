import { readJsonLines, splitThinking, normaliseServer, titleFrom, renderMarkdown, codeBlocks } from '../src/chat.js';
import { allChats, saveChat, deleteChat, clearChats } from './store.js';

const STORAGE_KEY = 'local-chat-v1';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const SITE = location.origin; // what OLLAMA_ORIGINS has to allow

const PERSONAS = [
  { id: 'helpful', name: 'Helpful assistant', system: 'You are a helpful, friendly assistant. Give clear, accurate answers. Use Markdown (headings, lists, tables, code blocks) when it makes the answer easier to read. If you are not sure about something, say so.' },
  { id: 'simple', name: 'Explain simply', system: 'You explain things simply, like a patient teacher talking to a curious beginner. Use short sentences, everyday examples and no jargon. If you must use a technical word, explain it.' },
  { id: 'code', name: 'Coding helper', system: 'You are an expert programmer. Give working code in fenced code blocks with the language named, explain briefly, point out pitfalls, and prefer simple, readable solutions.' },
  { id: 'translate', name: 'Translator', system: 'You are a translator. Translate what the user sends into natural, idiomatic language the way a native speaker would say it. If the target language is unclear, translate English into Chinese and anything else into English. Add a short note only when there is an ambiguity.' },
  { id: 'writer', name: 'Writing coach', system: 'You are a writing coach. Improve the user\'s text so it is clear, warm and concise, keep their voice, and briefly list the main changes you made.' },
  { id: 'custom', name: 'My own instructions', system: '' },
];
const STARTERS = [
  'Explain how a mortgage works, simply',
  'Plan a 3-day trip to Penang with food stops',
  'Write a polite reminder to a friend who owes me $50',
  'Give me 5 easy dinners with chicken and rice',
];

// ---- State -----------------------------------------------------------------------------------------

function load() {
  const defaults = { server: 'http://localhost:11434', model: '', persona: 'helpful', customSystem: '', temperature: 0.7, numCtx: 0, think: true, lastChat: null };
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s) return { ...defaults, ...s };
  } catch { /* ignore */ }
  return defaults;
}
const settings = load();
const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ } };

let chats = []; // all conversations, newest first
let chat = null; // the open one: { id, title, model, created, updated, messages: [{ role, content, thinking?, images?, stats? }] }
let models = []; // from /api/tags
const caps = new Map(); // model name → capabilities from /api/show
let attachments = []; // base64 JPEGs waiting to be sent
let controller = null; // AbortController of the reply being streamed
let connection = { ok: null, message: '' };

const newChat = () => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: 'New chat', model: settings.model, created: Date.now(), updated: Date.now(), messages: [] });
const systemPrompt = () => {
  const p = PERSONAS.find((x) => x.id === settings.persona) || PERSONAS[0];
  return p.id === 'custom' ? settings.customSystem.trim() : p.system;
};
const api = (path) => `${normaliseServer(settings.server)}${path}`;

// ---- Talking to Ollama ------------------------------------------------------------------------------

// Why a request failed, in plain words, with what to do about it.
function explainFailure(err, status) {
  const server = normaliseServer(settings.server);
  if (status === 403) return `Ollama refused this site. Set OLLAMA_ORIGINS to ${SITE} on your PC and restart Ollama (see the setup guide).`;
  if (status === 404) return 'Ollama answered, but couldn\'t find that model. Pull it on your PC with "ollama pull <name>" or pick another.';
  if (location.protocol === 'https:' && /^http:/.test(server) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(server)) {
    return 'This page is secure (https), so browsers block plain http addresses like this one. On your phone use your Tailscale https address instead (see the setup guide).';
  }
  if (/localhost|127\.0\.0\.1/.test(server) && matchMedia('(pointer: coarse)').matches) {
    return 'On a phone, "localhost" means the phone itself, not your PC. Use your PC\'s Tailscale https address (see the setup guide).';
  }
  return `Couldn't reach Ollama at ${server}. Check Ollama is running on your PC, that OLLAMA_ORIGINS allows ${SITE}, and that the address is right.${err?.message ? ` (${err.message})` : ''}`;
}

async function getJson(path, body) {
  let res;
  try {
    res = await fetch(api(path), body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  } catch (e) { throw new Error(explainFailure(e)); }
  if (!res.ok) throw new Error(explainFailure(null, res.status));
  return res.json();
}

async function connect() {
  if (!normaliseServer(settings.server)) { connection = { ok: false, message: 'Enter your Ollama address in Settings.' }; renderStatus(); return; }
  try {
    const [version, tags] = await Promise.all([getJson('/api/version').catch(() => ({})), getJson('/api/tags')]);
    models = (tags.models || []).sort((a, b) => a.name.localeCompare(b.name));
    connection = { ok: true, message: `Connected to Ollama${version.version ? ` ${version.version}` : ''} · ${models.length} model${models.length === 1 ? '' : 's'}`, version: version.version };
    if (!models.some((m) => m.name === settings.model)) settings.model = models[0]?.name || '';
    persist();
    if (settings.model) await loadCaps(settings.model);
  } catch (e) {
    connection = { ok: false, message: e.message };
  }
  renderStatus();
  renderModel();
}

async function loadCaps(name) {
  if (caps.has(name)) return caps.get(name);
  let c = [];
  try {
    const info = await getJson('/api/show', { model: name });
    c = info.capabilities || [];
    // Older Ollama versions don't list capabilities; guess vision from the model's families.
    if (!info.capabilities && /clip|mllama|vision/i.test(JSON.stringify(info.details || {}) + (info.model_info ? Object.keys(info.model_info).join(' ') : ''))) c = ['vision'];
  } catch { /* unknown: plain chat */ }
  caps.set(name, c);
  renderComposer();
  return c;
}
const can = (cap) => (caps.get(settings.model) || []).includes(cap);

// Stream a reply to the open chat into a new assistant message.
async function reply() {
  const model = settings.model;
  if (!model) { connection = { ok: false, message: connection.ok ? 'Pick a model first.' : connection.message || 'Not connected yet.' }; renderStatus(); openSheet('settings-sheet'); return; }
  controller = new AbortController(); // busy from here, so a double tap can't send twice
  renderComposer();
  await loadCaps(model);
  const sys = systemPrompt();
  const history = chat.messages.map((m) => ({ role: m.role, content: m.content, ...(m.images?.length ? { images: m.images } : {}) }));
  const body = {
    model,
    messages: sys ? [{ role: 'system', content: sys }, ...history] : history,
    stream: true,
    options: { temperature: settings.temperature, ...(settings.numCtx ? { num_ctx: settings.numCtx } : {}) },
    ...(can('thinking') ? { think: !!settings.think } : {}),
  };
  const msg = { role: 'assistant', content: '', thinking: '', model, started: Date.now() };
  chat.messages.push(msg);
  chat.model = model;
  renderMessages(true);
  let buffer = '';
  try {
    const res = await fetch(api('/api/chat'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error || ''; } catch { /* ignore */ }
      throw Object.assign(new Error(detail || explainFailure(null, res.status)), { status: res.status, detail });
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const { objects, rest } = readJsonLines(buffer + decoder.decode(value, { stream: true }));
      buffer = rest;
      for (const o of objects) {
        if (o.error) throw new Error(o.error);
        if (o.message?.content) msg.content += o.message.content;
        if (o.message?.thinking) msg.thinking += o.message.thinking;
        if (o.done) msg.stats = { tokens: o.eval_count, seconds: o.eval_duration ? o.eval_duration / 1e9 : null };
      }
      scheduleStreamRender();
    }
  } catch (e) {
    if (e.name === 'AbortError') msg.stopped = true;
    else msg.error = e.status ? (e.detail || explainFailure(null, e.status)) : e.message && !/fetch|network|load failed/i.test(e.message) ? e.message : explainFailure(e);
  }
  controller = null;
  msg.finished = Date.now();
  // Models that put their reasoning in <think> tags: move it out of the answer.
  const split = splitThinking(msg.content);
  if (split.thinking) { msg.thinking = (msg.thinking ? `${msg.thinking}\n` : '') + split.thinking; msg.content = split.answer; }
  if (!msg.content && !msg.thinking && !msg.error && !msg.stopped) msg.error = 'The model sent an empty reply. Try again, or try another model.';
  await persistChat();
  renderComposer();
  renderMessages();
}

let renderQueued = false;
function scheduleStreamRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderMessages(); });
}

async function send(text) {
  const content = text.trim();
  if ((!content && !attachments.length) || controller) return;
  if (!chat) chat = newChat();
  chat.messages.push({ role: 'user', content, ...(attachments.length ? { images: attachments } : {}) });
  if (chat.title === 'New chat') chat.title = titleFrom(content || 'Photo');
  attachments = [];
  $('input').value = '';
  autoGrow();
  renderAttachments();
  await persistChat();
  stickToBottom = true;
  await reply();
}

async function persistChat() {
  if (!chat) return;
  chat.updated = Date.now();
  if (!chats.includes(chat)) chats.unshift(chat);
  chats.sort((a, b) => b.updated - a.updated);
  settings.lastChat = chat.id;
  persist();
  try { await saveChat(chat); } catch { /* storage full or blocked: the chat lives until the page closes */ }
  renderChatList();
}

// ---- Rendering --------------------------------------------------------------------------------------

let stickToBottom = true;
const scroller = $('scroller');
scroller.addEventListener('scroll', () => { stickToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80; });

function renderMessages(forceBottom = false) {
  const msgs = chat?.messages || [];
  $('empty').hidden = msgs.length > 0;
  const lastAssistant = msgs.map((m) => m.role).lastIndexOf('assistant');
  const lastUser = msgs.map((m) => m.role).lastIndexOf('user');
  $('messages').innerHTML = msgs.map((m, i) => {
    if (m.role === 'user') {
      return `<div class="ch-msg user"><div class="ch-bubble">${(m.images || []).map((b) => `<img src="data:image/jpeg;base64,${b}" alt="">`).join('')}${m.content ? `<div class="ch-text">${esc(m.content).replace(/\n/g, '<br>')}</div>` : ''}</div>
        ${i === lastUser && !controller ? `<div class="ch-actions"><button type="button" data-act="edit" data-i="${i}">Edit</button></div>` : ''}</div>`;
    }
    const streaming = controller && i === msgs.length - 1;
    const split = splitThinking(m.content);
    const thinking = (m.thinking || '') + (split.thinking ? `${m.thinking ? '\n' : ''}${split.thinking}` : '');
    const answer = split.thinking || /^\s*<think>/.test(m.content) ? split.answer : m.content;
    const stillThinking = streaming && !answer && (thinking || /^\s*<think>/.test(m.content));
    const secs = m.finished && m.started ? Math.max(1, Math.round((m.finished - m.started) / 1000)) : null;
    const speed = m.stats?.tokens && m.stats?.seconds ? `${(m.stats.tokens / m.stats.seconds).toFixed(1)} tokens/s` : '';
    return `<div class="ch-msg bot">
      ${thinking ? `<details class="ch-think" ${stillThinking ? 'open' : ''}><summary>${stillThinking ? 'Thinking…' : `Reasoning${secs ? ` · ${secs}s` : ''}`}</summary><div class="ch-think-body">${esc(thinking).replace(/\n/g, '<br>')}</div></details>` : ''}
      <div class="ch-md" data-i="${i}">${answer ? renderMarkdown(answer) : streaming && !stillThinking ? '<span class="ch-dots"><i></i><i></i><i></i></span>' : ''}${streaming && answer ? '<span class="ch-caret">▍</span>' : ''}</div>
      ${m.error ? `<div class="ch-error">⚠️ ${esc(m.error)}</div>` : ''}
      ${m.stopped ? '<div class="ch-meta">Stopped.</div>' : ''}
      ${streaming ? '' : `<div class="ch-actions">
        ${answer ? `<button type="button" data-act="copy" data-i="${i}">Copy</button>` : ''}
        ${i === lastAssistant ? `<button type="button" data-act="regen" data-i="${i}">↻ Regenerate</button>` : ''}
        <span class="ch-meta">${esc(m.model || '')}${speed ? ` · ${speed}` : ''}</span></div>`}
    </div>`;
  }).join('');
  if (forceBottom || stickToBottom) scroller.scrollTop = scroller.scrollHeight;
}

function renderStatus() {
  const el = $('empty-status');
  el.className = `ch-status ${connection.ok ? 'ok' : connection.ok === false ? 'bad' : ''}`;
  el.innerHTML = connection.ok == null ? 'Connecting…' : connection.ok
    ? `● ${esc(connection.message)}`
    : `● ${esc(connection.message)} <button type="button" class="linkish" id="status-settings">Open settings</button>`;
  const t = $('test-result');
  t.className = `ch-test ${connection.ok ? 'ok' : connection.ok === false ? 'bad' : ''}`;
  t.textContent = connection.ok == null ? '' : connection.message;
}

function renderModel() {
  $('model-name').textContent = settings.model || (connection.ok ? 'Choose a model' : 'Not connected');
  $('model-list').innerHTML = models.length ? models.map((m) => {
    const d = m.details || {};
    const size = m.size ? `${(m.size / 1e9).toFixed(1)} GB` : '';
    return `<button type="button" class="ch-model-row ${m.name === settings.model ? 'on' : ''}" data-model="${esc(m.name)}">
      <strong>${esc(m.name)}</strong><small>${[d.parameter_size, d.family, d.quantization_level, size].filter(Boolean).map(esc).join(' · ')}</small></button>`;
  }).join('') : `<p class="hint">${connection.ok ? 'No models yet. On your PC run, for example, <code>ollama pull llama3.2</code>.' : esc(connection.message || 'Not connected.')}</p>`;
}

function renderComposer() {
  const busy = !!controller;
  $('send').textContent = busy ? '■' : '↑';
  $('send').setAttribute('aria-label', busy ? 'Stop' : 'Send');
  $('send').classList.toggle('stop', busy);
  $('attach-label').hidden = !can('vision');
  const tags = [];
  if (can('vision')) tags.push('can see photos');
  if (can('thinking')) tags.push(settings.think ? 'thinks first' : 'thinking off');
  $('composer-hint').textContent = settings.model ? `${settings.model}${tags.length ? ` · ${tags.join(' · ')}` : ''} · runs on your PC` : '';
}

function renderAttachments() {
  $('attachments').innerHTML = attachments.map((b, i) => `<span class="ch-thumb"><img src="data:image/jpeg;base64,${b}" alt=""><button type="button" data-rm="${i}" aria-label="Remove">✕</button></span>`).join('');
}

function renderChatList() {
  const q = $('chat-search').value.trim().toLowerCase();
  const list = chats.filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)));
  $('chat-list').innerHTML = list.length ? list.map((c) => `<div class="ch-chat-row ${chat && c.id === chat.id ? 'on' : ''}">
      <button type="button" class="ch-chat-open" data-open="${c.id}"><strong>${esc(c.title)}</strong><small>${new Date(c.updated).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · ${esc(c.model || '')}</small></button>
      <button type="button" class="ch-icon" data-rename="${c.id}" aria-label="Rename">✎</button>
      <button type="button" class="ch-icon" data-del="${c.id}" aria-label="Delete">🗑</button></div>`).join('')
    : `<p class="hint">${q ? 'No chats match.' : 'No chats yet.'}</p>`;
}

function renderStarters() {
  $('starters').innerHTML = STARTERS.map((s) => `<button type="button" class="ch-starter" data-start="${esc(s)}">${esc(s)}</button>`).join('');
}

// ---- Setup guide ------------------------------------------------------------------------------------

function renderGuide() {
  const origin = SITE;
  $('guide-body').innerHTML = `
    <p>Two Ollama settings let this page talk to it. <b>OLLAMA_ORIGINS</b> allows this website; <b>OLLAMA_HOST</b> lets Ollama accept your phone's connection through Tailscale.</p>
    <h4>1. On your PC: change two Ollama settings</h4>
    <p><b>Windows</b>: Start → search "environment variables" → <i>Edit environment variables for your account</i> → New, twice:</p>
    <pre>OLLAMA_ORIGINS = ${esc(origin)}
OLLAMA_HOST    = 0.0.0.0:11434</pre>
    <p>Then quit Ollama from the tray icon (bottom right) and start it again. If Windows Firewall asks, allow <b>Private networks</b> only.</p>
    <p><b>Mac</b>: in Terminal, then quit and reopen Ollama:</p>
    <pre>launchctl setenv OLLAMA_ORIGINS "${esc(origin)}"
launchctl setenv OLLAMA_HOST "0.0.0.0:11434"</pre>
    <p><b>Linux</b>: <code>sudo systemctl edit ollama</code>, add the lines below, save, then <code>sudo systemctl restart ollama</code>:</p>
    <pre>[Service]
Environment="OLLAMA_ORIGINS=${esc(origin)}"
Environment="OLLAMA_HOST=0.0.0.0:11434"</pre>
    <p>Now this page works <b>on the PC itself</b> with <code>http://localhost:11434</code>. Tap <i>Use localhost</i>, then <i>Test connection</i>.</p>
    <h4>2. For your phone: Tailscale (free)</h4>
    <ol>
      <li>Install <b>Tailscale</b> on the PC and the phone, and sign in to the same account on both.</li>
      <li>On the PC, open a terminal (Windows: PowerShell) and run:<pre>tailscale serve --bg 11434</pre>If it asks you to enable HTTPS for your tailnet, follow the link it gives and turn it on, then run it again.</li>
      <li>It prints an address like <code>https://your-pc.tail1234.ts.net</code>. Type that into <i>Ollama address</i> on your phone and tap <i>Test connection</i>.</li>
    </ol>
    <p>This address only works on devices signed in to your Tailscale account, at home or outside. Keep the Tailscale app connected on the phone.</p>
    <h4>Still not connecting?</h4>
    <ul>
      <li><b>"Refused this site" (403):</b> OLLAMA_ORIGINS isn't set, or Ollama wasn't restarted after setting it. It must be exactly <code>${esc(origin)}</code>.</li>
      <li><b>Can't reach it:</b> is Ollama running (try <code>ollama list</code>)? Is Tailscale connected on both devices? Chrome may ask to allow access to devices on your network: tap Allow.</li>
      <li><b>Slow replies:</b> big models need a strong PC. Try a smaller one such as <code>llama3.2</code>, <code>gemma3:4b</code> or <code>qwen3:4b</code>.</li>
      <li><b>Photos:</b> need a model that can see, such as <code>gemma3</code> or <code>llava</code>; the 📎 button appears when the model supports it.</li>
    </ul>`;
}

// ---- Settings ---------------------------------------------------------------------------------------

function writeSettings() {
  $('server').value = settings.server;
  $('persona').innerHTML = PERSONAS.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('persona').value = settings.persona;
  $('custom-system').value = settings.customSystem;
  $('custom-field').hidden = settings.persona !== 'custom';
  $('temperature').value = settings.temperature;
  $('temp-out').textContent = `${Number(settings.temperature).toFixed(1)} ${settings.temperature < 0.4 ? '(focused)' : settings.temperature > 1 ? '(adventurous)' : '(balanced)'}`;
  $('num-ctx').value = String(settings.numCtx);
  $('think').checked = settings.think;
}

function openSheet(id) {
  document.querySelectorAll('.ch-sheet').forEach((s) => { s.hidden = s.id !== id; });
  if (id === 'chats-sheet') renderChatList();
  if (id === 'models-sheet') { renderModel(); connect(); }
}
const closeSheets = () => document.querySelectorAll('.ch-sheet').forEach((s) => { s.hidden = true; });

// ---- Photos -----------------------------------------------------------------------------------------

// Photos are shrunk to 1024 px JPEGs: plenty for the model, and much quicker to send.
async function toBase64Jpeg(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bitmap.width * scale);
  c.height = Math.round(bitmap.height * scale);
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

// ---- Events -----------------------------------------------------------------------------------------

const input = $('input');
function autoGrow() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}
input.addEventListener('input', autoGrow);
input.addEventListener('keydown', (e) => {
  // Enter sends on a keyboard; on a phone, Enter makes a new line and the button sends.
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) {
    e.preventDefault();
    send(input.value);
  }
});
$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  if (controller) controller.abort();
  else send(input.value);
});
$('attach').addEventListener('change', async (e) => {
  for (const f of e.target.files) {
    try { attachments.push(await toBase64Jpeg(f)); } catch { /* not an image we can read */ }
  }
  e.target.value = '';
  renderAttachments();
});
$('attachments').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rm]');
  if (b) { attachments.splice(Number(b.dataset.rm), 1); renderAttachments(); }
});

$('messages').addEventListener('click', async (e) => {
  const copyBtn = e.target.closest('.md-copy');
  if (copyBtn) {
    const i = Number(copyBtn.closest('.ch-md').dataset.i);
    const code = codeBlocks(splitThinking(chat.messages[i].content).answer)[Number(copyBtn.dataset.copy)];
    copyText(code ?? '', copyBtn);
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b || controller) return;
  const i = Number(b.dataset.i);
  const m = chat.messages[i];
  if (b.dataset.act === 'copy') copyText(splitThinking(m.content).answer, b);
  if (b.dataset.act === 'regen') {
    chat.messages.splice(i);
    await reply();
  }
  if (b.dataset.act === 'edit') {
    chat.messages.splice(i);
    input.value = m.content;
    attachments = m.images || [];
    renderAttachments();
    renderMessages();
    autoGrow();
    input.focus();
    await persistChat();
  }
});

async function copyText(text, button) {
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
  }
  const was = button.textContent;
  button.textContent = 'Copied ✓';
  setTimeout(() => { button.textContent = was; }, 1400);
}

$('open-chats').addEventListener('click', () => openSheet('chats-sheet'));
$('open-models').addEventListener('click', () => openSheet('models-sheet'));
$('open-settings').addEventListener('click', () => openSheet('settings-sheet'));
$('new-chat').addEventListener('click', () => {
  if (controller) controller.abort();
  chat = null;
  settings.lastChat = null;
  persist();
  renderMessages();
  closeSheets();
  input.focus();
});
document.querySelectorAll('.ch-sheet').forEach((s) => s.addEventListener('click', (e) => {
  if (e.target === s || e.target.closest('[data-close]')) closeSheets();
}));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheets(); });

$('chat-search').addEventListener('input', renderChatList);
$('chat-list').addEventListener('click', async (e) => {
  const open = e.target.closest('[data-open]');
  const ren = e.target.closest('[data-rename]');
  const del = e.target.closest('[data-del]');
  if (open) {
    if (controller) controller.abort();
    chat = chats.find((c) => c.id === open.dataset.open);
    settings.lastChat = chat.id;
    if (chat.model && models.some((m) => m.name === chat.model)) { settings.model = chat.model; loadCaps(chat.model); renderModel(); }
    persist();
    stickToBottom = true;
    renderMessages(true);
    renderComposer();
    closeSheets();
  }
  if (ren) {
    const c = chats.find((x) => x.id === ren.dataset.rename);
    const name = prompt('Rename chat', c.title);
    if (name && name.trim()) { c.title = name.trim(); await saveChat(c).catch(() => {}); renderChatList(); }
  }
  if (del) {
    const c = chats.find((x) => x.id === del.dataset.del);
    if (!confirm(`Delete "${c.title}"?`)) return;
    chats = chats.filter((x) => x !== c);
    await deleteChat(c.id).catch(() => {});
    if (chat === c) { chat = null; renderMessages(); }
    renderChatList();
  }
});

$('model-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-model]');
  if (!b) return;
  settings.model = b.dataset.model;
  persist();
  renderModel();
  closeSheets();
  await loadCaps(settings.model);
  renderComposer();
});

$('server').addEventListener('change', () => { settings.server = normaliseServer($('server').value); $('server').value = settings.server; persist(); });
$('use-local').addEventListener('click', () => { settings.server = 'http://localhost:11434'; $('server').value = settings.server; persist(); testConnection(); });
async function testConnection() {
  settings.server = normaliseServer($('server').value);
  $('server').value = settings.server;
  persist();
  caps.clear();
  connection = { ok: null, message: '' };
  $('test-result').textContent = 'Testing…';
  await connect();
  renderComposer();
  if (!connection.ok) $('guide').open = true;
}
$('test').addEventListener('click', testConnection);
$('persona').addEventListener('input', () => { settings.persona = $('persona').value; persist(); writeSettings(); });
$('custom-system').addEventListener('input', () => { settings.customSystem = $('custom-system').value; persist(); });
$('temperature').addEventListener('input', () => { settings.temperature = Number($('temperature').value); persist(); writeSettings(); });
$('num-ctx').addEventListener('input', () => { settings.numCtx = Number($('num-ctx').value); persist(); });
$('think').addEventListener('input', () => { settings.think = $('think').checked; persist(); renderComposer(); });
$('export').addEventListener('click', () => {
  const text = chats.map((c) => `# ${c.title}\n${new Date(c.created).toLocaleString()} · ${c.model || ''}\n\n${c.messages.map((m) => `**${m.role === 'user' ? 'You' : 'AI'}:** ${m.content}`).join('\n\n')}`).join('\n\n---\n\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  a.download = `local-chat-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('clear-all').addEventListener('click', async () => {
  if (!confirm('Delete all chats on this device?')) return;
  await clearChats().catch(() => {});
  chats = [];
  chat = null;
  renderMessages();
  renderChatList();
});
document.body.addEventListener('click', (e) => {
  if (e.target.id === 'status-settings') openSheet('settings-sheet');
  const s = e.target.closest('[data-start]');
  if (s) send(s.dataset.start);
});

// ---- Start-up ---------------------------------------------------------------------------------------

writeSettings();
renderGuide();
renderStarters();
renderStatus();
renderModel();
renderComposer();
try {
  chats = (await allChats()).sort((a, b) => b.updated - a.updated);
} catch { chats = []; }
chat = chats.find((c) => c.id === settings.lastChat) || null;
renderMessages(true);
connect();
