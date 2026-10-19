// Reading a receipt photo with your own AI: a vision model (such as Qwen3-VL) running in Ollama on
// your PC, the same setup as the Local Chat app. The model only transcribes the text; the app's
// receipt parser and checks then read it, exactly as they do OCR text.

import { normaliseServer } from '../src/chat.js';
import { AI_TRANSCRIBE_PROMPT, cleanTranscript } from '../src/receipt.js';

const TIMEOUT_MS = 180000; // a cold model load plus a large photo can take a while on a modest PC

// The photo as a base64 JPEG, prepared the same way as in Local Chat.
function toBase64(bitmap) {
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bitmap.width * scale);
  c.height = Math.round(bitmap.height * scale);
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

function explain(server, status) {
  if (status === 403) return `Your AI refused this site. Set OLLAMA_ORIGINS to ${location.origin} on your PC and restart Ollama.`;
  if (status === 404) return 'Your AI couldn\'t find that model. Pull it on your PC (e.g. "ollama pull qwen3-vl:8b") or pick another in Settings.';
  if (/localhost|127\.0\.0\.1/.test(server) && matchMedia('(pointer: coarse)').matches) return 'On a phone, "localhost" is the phone itself. Use your PC\'s Tailscale https address in Settings.';
  return `Couldn't reach your AI at ${server}. Check Ollama is running and Tailscale is connected.`;
}

// The models Ollama has, with whether each can see images.
export async function listModels(serverText) {
  const server = normaliseServer(serverText);
  let res;
  try { res = await fetch(`${server}/api/tags`); } catch { throw new Error(explain(server)); }
  if (!res.ok) throw new Error(explain(server, res.status));
  const names = ((await res.json()).models || []).map((m) => m.name).sort();
  const withCaps = await Promise.all(names.map(async (name) => {
    try {
      const r = await fetch(`${server}/api/show`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: name }) });
      const info = r.ok ? await r.json() : {};
      return { name, vision: (info.capabilities || []).includes('vision') };
    } catch { return { name, vision: false }; }
  }));
  return withCaps;
}

// The receipt's text as transcribed by the model, cleaned to plain lines for the parser.
export async function readReceiptWithAi(bitmap, { server: serverText, model }, signal) {
  const server = normaliseServer(serverText);
  if (!server || !model) throw new Error('Set up your AI in Settings first.');
  const messages = [{ role: 'user', content: AI_TRANSCRIBE_PROMPT, images: [toBase64(bitmap)] }];
  return cleanTranscript(await ask(server, model, messages, signal));
}

// One request for plain text. Copying text needs no reasoning: thinking off is faster and leaves the
// model's memory (context) for the photo and the answer. Models that can't think reject the setting,
// so it is dropped for them.
async function ask(server, model, messages, signal) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort);
  const send = (think) => fetch(`${server}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: timeout.signal,
    body: JSON.stringify({
      model,
      stream: false,
      ...(think === false ? { think: false } : {}),
      options: { num_ctx: 8192 },
      messages,
    }),
  });
  let res;
  let body;
  try {
    res = await send(false);
    if (res.status === 400) {
      const err = await res.clone().json().catch(() => ({}));
      if (/think/i.test(err.error || '')) res = await send(undefined);
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error || ''; } catch { /* ignore */ }
      throw Object.assign(new Error(detail && res.status !== 403 && res.status !== 404 ? `Your AI said: ${detail}` : explain(server, res.status)), { fromServer: true });
    }
    body = await res.json();
  } catch (e) {
    if (e.fromServer) throw e;
    if (signal?.aborted) throw new Error('Cancelled.');
    if (timeout.signal.aborted) throw new Error('Your AI took too long. Try again, or try a smaller model.');
    throw new Error(explain(server));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  const text = body.message?.content || '';
  if (!text.trim()) throw new Error('Your AI returned no text. Try again, or use a vision model such as qwen3-vl.');
  return text;
}
