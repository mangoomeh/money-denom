import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupPairs, searchTokens, money, age } from '../src/tokensearch.js';

// Shaped like DexScreener's search response for "Paper".
const pair = (chainId, address, symbol, name, liq, vol, created, quote = { address: '0xweth', symbol: 'WETH', name: 'Wrapped Ether' }) => ({
  chainId, baseToken: { address, symbol, name }, quoteToken: quote, liquidity: { usd: liq }, volume: { h24: vol }, pairCreatedAt: created, url: `https://dexscreener.com/${chainId}/${address}`,
});
const PAIRS = [
  pair('robinhood', '0xa32296Cad5fbeEf9592e17A991c3efaA70d78B07', 'Paper', 'Papertrade', 10252061, 13196815, 1000),
  pair('robinhood', '0xa32296Cad5fbeEf9592e17A991c3efaA70d78B07', 'Paper', 'Papertrade', 50000, 1000, 900),
  pair('robinhood', '0x95dF1b551fbCA2DBe27c7568F447CDe86ee82713', 'PAPER', 'PaperStock', 24310, 0.28, 2000),
  pair('solana', '2UVvBmymicq5XJnf2RaiSoa2Pguozuv71DAm24Ztpump', 'paper', 'paper coin', 0, 1845, 3000),
  pair('base', '0xbase', 'PAPER', 'Paper', 99999999, 1, 1),
];

test('real trading beats fake liquidity (the fake "Bonk" tokens seen on Solana)', () => {
  const pairs = [
    pair('solana', 'FakeBonk1', 'Bonk', 'Bonk Coin', 50394585, 2, 1),
    pair('solana', 'DezXAZ', 'Bonk', 'Bonk', 303247, 173607, 1),
    pair('solana', 'DezXAZ', 'Bonk', 'Bonk', 213639, 21764, 1),
  ];
  const r = groupPairs(pairs, 'solana', 'bonk');
  assert.deepEqual(r.map((t) => t.address), ['DezXAZ', 'FakeBonk1']);
  assert.equal(r[1].oddLiquidity, true);
  assert.equal(r[1].possibleCopycat, true);
  assert.equal(r[0].oddLiquidity, undefined);
});

test('groups pairs per token on the chosen chain, most traded first', () => {
  const r = groupPairs(PAIRS, 'robinhood', 'paper');
  assert.deepEqual(r.map((t) => t.symbol), ['Paper', 'PAPER']);
  assert.equal(r[0].pairs, 2);
  assert.equal(r[0].liquidityUsd, 10302061);
  assert.equal(r[0].createdAt, 900);
  assert.equal(r[0].possibleCopycat, undefined);
  assert.equal(r[1].possibleCopycat, true); // same symbol, far less liquidity
  assert.deepEqual(groupPairs(PAIRS, 'solana', 'paper').map((t) => t.address), ['2UVvBmymicq5XJnf2RaiSoa2Pguozuv71DAm24Ztpump']);
});

test('the quote side is only included when it matches the search', () => {
  assert.equal(groupPairs(PAIRS, 'robinhood', 'paper').some((t) => t.symbol === 'WETH'), false);
  assert.equal(groupPairs(PAIRS, 'robinhood', 'weth')[0].symbol, 'WETH');
});

test('searchTokens calls DexScreener and ignores short queries', async () => {
  let url;
  const fetchImpl = async (u) => { url = u; return { ok: true, json: async () => ({ pairs: PAIRS }) }; };
  assert.equal((await searchTokens('paper', 'robinhood', { fetchImpl }))[0].name, 'Papertrade');
  assert.equal(url, 'https://api.dexscreener.com/latest/dex/search?q=paper');
  assert.deepEqual(await searchTokens('p', 'robinhood', { fetchImpl }), []);
});

test('money and age', () => {
  assert.equal(money(10252061), '$10.3M');
  assert.equal(money(24310), '$24.3K');
  assert.equal(age(0), '');
  assert.equal(age(Date.now() - 90 * 60000), '1h old');
  assert.equal(age(Date.now() - 3 * 86400000), '3d old');
});
