// Helpers for the Local Chat app: reading Ollama's streamed replies, separating a model's reasoning from
// its answer, and turning the model's Markdown into safe HTML.

// Ollama streams one JSON object per line. Feed it text as it arrives; it returns the complete objects
// and the unfinished tail to carry over to the next chunk.
export function readJsonLines(buffer) {
  const lines = buffer.split('\n');
  const rest = lines.pop();
  const objects = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try { objects.push(JSON.parse(line)); } catch { /* skip a garbled line */ }
  }
  return { objects, rest };
}

// Some models write their reasoning inside <think>…</think> at the start of the reply. Split it out,
// including while the reasoning is still streaming in (no closing tag yet).
export function splitThinking(text) {
  const m = /^\s*<think>([\s\S]*?)(<\/think>|$)/.exec(text);
  if (!m) return { thinking: '', answer: text, thinkingDone: true };
  return { thinking: m[1].trim(), answer: text.slice(m[0].length).replace(/^\s+/, ''), thinkingDone: m[2] === '</think>' };
}

// The server address as typed, cleaned up: adds http:// for localhost and https:// otherwise, drops a
// trailing slash or /api.
export function normaliseServer(text) {
  let s = String(text || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = (/^(localhost|127\.|\[::1\]|192\.168\.|10\.)/i.test(s) ? 'http://' : 'https://') + s;
  return s.replace(/\/+$/, '').replace(/\/api$/, '');
}

// A short title for a conversation from its first message.
export function titleFrom(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'New chat';
  return t.length > 48 ? `${t.slice(0, 45).replace(/\s+\S*$/, '')}…` : t;
}

// ---- Markdown ---------------------------------------------------------------------------------------

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Inline formatting on already-escaped text: code, bold, italic, strikethrough, links.
function inline(s) {
  const codes = [];
  let out = s.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  out = out
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isTableRule = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

// Markdown to HTML. Everything is escaped first, so a model can't inject markup or scripts. Code blocks
// get a language label and a copy button (data-copy holds the block's index).
export function renderMarkdown(src) {
  const lines = esc(String(src || '')).split('\n');
  const html = [];
  let i = 0;
  let codeIndex = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/.exec(line);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${fence[1]}\\s*$`).test(lines[i])) body.push(lines[i++]);
      i++; // the closing fence (or the end, while a reply is still streaming)
      html.push(`<div class="md-code"><div class="md-code-bar"><span>${fence[2] || 'code'}</span><button type="button" class="md-copy" data-copy="${codeIndex++}">Copy</button></div><pre><code>${body.join('\n')}</code></pre></div>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { const n = Math.min(6, h[1].length + 2); html.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) { html.push('<hr>'); i++; continue; }
    if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      html.push(`<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*&gt;\s?/.test(line)) {
      const q = [];
      while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) q.push(lines[i++].replace(/^\s*&gt;\s?/, ''));
      html.push(`<blockquote>${renderMarkdownEscaped(q)}</blockquote>`);
      continue;
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const items = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (m && /\d/.test(m[2]) === ordered && m[1].length <= li[1].length + 1) { items.push(m[3]); i++; continue; }
        // Indented lines (continuations or nested items) belong to the last item.
        if (items.length && /^\s{2,}\S/.test(lines[i])) { items[items.length - 1] += `\n${lines[i].trim()}`; i++; continue; }
        break;
      }
      const start = ordered ? Number.parseInt(li[2], 10) : 1;
      html.push(`<${ordered ? 'ol' : 'ul'}${ordered && start !== 1 ? ` start="${start}"` : ''}>${items.map((it) => `<li>${inline(it).replace(/\n/g, '<br>')}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(```|~~~|#{1,6}\s|&gt;|([-*+]|\d+[.)])\s)/.test(lines[i]) && !(isTableRow(lines[i]) && isTableRule(lines[i + 1] || ''))) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    html.push(`<p>${inline(para.join('\n')).replace(/\n/g, '<br>')}</p>`);
  }
  return html.join('');
}

// Blockquote bodies are already escaped; render them without escaping twice.
function renderMarkdownEscaped(lines) {
  return lines.map((l) => (l.trim() ? inline(l) : '')).join('<br>');
}

// The code inside each fenced block, in order, for the copy buttons.
export function codeBlocks(src) {
  const out = [];
  const re = /^\s*(```|~~~)[^\n]*\n([\s\S]*?)(?:^\s*\1\s*$|(?![\s\S]))/gm;
  let m;
  while ((m = re.exec(String(src || '')))) out.push(m[2].replace(/\n$/, ''));
  return out;
}
