// Finding a token's address by its name or symbol, using DexScreener's free public search
// (no key; covers Robinhood Chain and Solana). Several tokens often share a name, so results
// are grouped per token and ranked by real trading volume (fake tokens can show huge
// "liquidity" with almost no trades), with smaller namesakes and odd ones flagged.

const SEARCH_URL = 'https://api.dexscreener.com/latest/dex/search?q=';
const CHAIN_IDS = { robinhood: 'robinhood', solana: 'solana' };

export async function searchTokens(query, chain, { fetchImpl = (...a) => fetch(...a), signal } = {}) {
  const q = String(query).trim();
  if (q.length < 2) return [];
  const res = await fetchImpl(SEARCH_URL + encodeURIComponent(q), { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status}). Try again in a moment.`);
  const data = await res.json();
  return groupPairs(data.pairs || [], chain, q);
}

export function groupPairs(pairs, chain, query) {
  const wanted = CHAIN_IDS[chain];
  const needle = query.toLowerCase();
  const tokens = new Map();
  for (const p of pairs) {
    if (p.chainId !== wanted) continue;
    // Usually the searched token is the base; include the quote side only if it matches.
    for (const side of [p.baseToken, p.quoteToken]) {
      if (!side?.address) continue;
      const matches = side.symbol?.toLowerCase().includes(needle) || side.name?.toLowerCase().includes(needle);
      if (side !== p.baseToken && !matches) continue;
      const key = side.address.toLowerCase();
      const t = tokens.get(key) || {
        address: side.address, symbol: side.symbol || '?', name: side.name || '',
        liquidityUsd: 0, volume24h: 0, createdAt: null, pairs: 0, url: p.url, image: p.info?.imageUrl || null,
      };
      t.liquidityUsd += p.liquidity?.usd || 0;
      t.volume24h += p.volume?.h24 || 0;
      t.pairs++;
      if (p.pairCreatedAt && (t.createdAt == null || p.pairCreatedAt < t.createdAt)) t.createdAt = p.pairCreatedAt;
      tokens.set(key, t);
    }
  }
  const list = [...tokens.values()].sort((a, b) => b.volume24h - a.volume24h || b.liquidityUsd - a.liquidityUsd);
  const top = new Map();
  for (const t of list) {
    // Lots of "liquidity" but next to no trading is a common sign of a fake.
    if (t.liquidityUsd >= 50000 && t.volume24h < t.liquidityUsd / 1000) t.oddLiquidity = true;
    // A namesake with far less trading than the most-traded token of that symbol may be a copycat.
    const sym = t.symbol.toLowerCase();
    if (!top.has(sym)) top.set(sym, t);
    else if (top.get(sym).volume24h > 0 && t.volume24h < top.get(sym).volume24h / 100) t.possibleCopycat = true;
  }
  return list;
}

export function money(v) {
  if (!v) return '$0';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function age(ms, now = Date.now()) {
  if (!ms) return '';
  const mins = Math.floor((now - ms) / 60000);
  if (mins < 60) return `${mins}m old`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h old`;
  return `${Math.floor(hours / 24)}d old`;
}
