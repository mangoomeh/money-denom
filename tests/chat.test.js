import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJsonLines, splitThinking, normaliseServer, titleFrom, renderMarkdown, codeBlocks } from '../src/chat.js';

test('streamed lines are read whole, the tail carried over', () => {
  const a = readJsonLines('{"a":1}\n{"b":2}\n{"c"');
  assert.deepEqual(a.objects, [{ a: 1 }, { b: 2 }]);
  assert.equal(a.rest, '{"c"');
  const b = readJsonLines(`${a.rest}:3}\n`);
  assert.deepEqual(b.objects, [{ c: 3 }]);
  assert.equal(b.rest, '');
});

test('reasoning in <think> tags is split from the answer, even mid-stream', () => {
  assert.deepEqual(splitThinking('<think>hmm, 2+2</think>\n\nIt is 4.'), { thinking: 'hmm, 2+2', answer: 'It is 4.', thinkingDone: true });
  assert.deepEqual(splitThinking('<think>still going'), { thinking: 'still going', answer: '', thinkingDone: false });
  assert.deepEqual(splitThinking('No tags here'), { thinking: '', answer: 'No tags here', thinkingDone: true });
});

test('server addresses are cleaned up', () => {
  assert.equal(normaliseServer('localhost:11434'), 'http://localhost:11434');
  assert.equal(normaliseServer('my-pc.tail1234.ts.net/'), 'https://my-pc.tail1234.ts.net');
  assert.equal(normaliseServer('http://192.168.1.5:11434/api'), 'http://192.168.1.5:11434');
  assert.equal(normaliseServer(''), '');
});

test('titles are short', () => {
  assert.equal(titleFrom('  Hello   there '), 'Hello there');
  assert.ok(titleFrom('word '.repeat(30)).length <= 49);
  assert.equal(titleFrom(''), 'New chat');
});

test('markdown renders and escapes', () => {
  assert.equal(renderMarkdown('Hi **you** and `x<y`'), '<p>Hi <strong>you</strong> and <code>x&lt;y</code></p>');
  assert.equal(renderMarkdown('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.match(renderMarkdown('# Title'), /<h3>Title<\/h3>/);
  assert.equal(renderMarkdown('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(renderMarkdown('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
  assert.match(renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |'), /<th>A<\/th><th>B<\/th>.*<td>1<\/td><td>2<\/td>/);
  assert.match(renderMarkdown('```js\nconst a = 1 < 2;\n```'), /<span>js<\/span>.*<code>const a = 1 &lt; 2;<\/code>/);
  assert.match(renderMarkdown('[site](https://example.com)'), /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">site<\/a>/);
  assert.doesNotMatch(renderMarkdown('[x](javascript:alert(1))'), /<a /);
  assert.equal(renderMarkdown('snake_case_name stays'), '<p>snake_case_name stays</p>');
  assert.match(renderMarkdown('> quoted'), /<blockquote>quoted<\/blockquote>/);
});

test('an unfinished code block (still streaming) still renders', () => {
  assert.match(renderMarkdown('```py\nprint(1)'), /<pre><code>print\(1\)<\/code><\/pre>/);
});

test('code blocks are extracted for copying', () => {
  assert.deepEqual(codeBlocks('a\n```js\nx = 1\ny = 2\n```\nb\n```\nz\n```'), ['x = 1\ny = 2', 'z']);
});
