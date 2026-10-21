// Helpers for sharing app data between phones by link, with no server. Records carry
// an id and an updatedAt, so two copies can be merged in any order and end up the same.

export const newId = () => Math.random().toString(36).slice(2, 10);

// The newer record wins. On a tie, the one whose JSON sorts later wins, so both
// phones pick the same one whichever way round they merge.
export function newer(a, b) {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

// Merges two lists of records by id. Deletions are records with deleted: true.
export function mergeList(mine, theirs) {
  const out = mine.map((x) => {
    const other = theirs.find((y) => y.id === x.id);
    return other ? newer(x, other) : x;
  });
  for (const y of theirs) if (!mine.some((x) => x.id === y.id)) out.push(y);
  return out;
}

// How many records in `merged` are new or different from `before`.
export function countChanged(before, merged) {
  return merged.filter((x) => {
    const old = before.find((y) => y.id === x.id);
    return !old || JSON.stringify(old) !== JSON.stringify(x);
  }).length;
}

function toB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

// Any JSON value as a compact, URL-safe string for a link's #hash.
export async function encodeData(value) {
  return toB64(await pipe(new TextEncoder().encode(JSON.stringify(value)), new CompressionStream('deflate-raw')));
}

// The value back from encodeData, or null if the text isn't one.
export async function decodeData(text) {
  try {
    return JSON.parse(new TextDecoder().decode(await pipe(fromB64(text), new DecompressionStream('deflate-raw'))));
  } catch {
    return null;
  }
}
