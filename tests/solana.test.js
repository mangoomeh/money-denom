import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base58Decode, base58Encode, isOnCurve, associatedTokenAddress, tokenDeltas, summariseSolana, makeSolRpc,
  signaturesInWindow, isSolanaAddress, paidInSolTx, solSpentUsd, WSOL,
} from '../src/solana.js';
import { chooseGranularity, candleRequests, parseCandles, priceAt } from '../src/prices.js';

// Real accounts from a pump.fun transaction on Solana mainnet.
const T22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const MINT = 'TTWofwAge91oFhZs7kpQdyrVRkmevgM88xijGvQFbKo';
const CURVE = '8o6yYRnEGChhfRHm3zpmXE136Tu2mH7ChMoy741trVvJ'; // bonding curve (a program address)
const WALLET = '2KYJCBZX8VvXhqgt8fTukyNenB5zhvhDxYpeTNPfcfwF';

test('base58 round trip', () => {
  for (const a of [MINT, WALLET, '11111111111111111111111111111111']) {
    const bytes = base58Decode(a);
    assert.equal(bytes.length, 32);
    assert.equal(base58Encode(bytes), a);
  }
  assert.equal(isSolanaAddress(MINT), true);
  assert.equal(isSolanaAddress('0xa32296cad5fbeef9592e17a991c3efaa70d78b07'), false);
});

test('wallets are on the ed25519 curve; program addresses are not', () => {
  assert.equal(isOnCurve(base58Decode(WALLET)), true);
  assert.equal(isOnCurve(base58Decode(CURVE)), false);
});

test('associated token address matches the chain', async () => {
  assert.equal(await associatedTokenAddress(CURVE, MINT, T22), 'GxwyYYGwVwJ365UCESNKMDZVHhyuiPEK2pxeYN8scoFE');
  assert.equal(await associatedTokenAddress(WALLET, MINT, T22), 'DT6GkWFxhQCrXzAJnYrMoQCnXqXcd789HqxTt4DfnAjN');
});

// A transaction in the shape getTransaction(jsonParsed) returns.
const tx = ({ slot, time, sig, signers, changes }) => ({
  slot,
  blockTime: time,
  transaction: { signatures: [sig], message: { accountKeys: signers.map((pubkey) => ({ pubkey, signer: true })), instructions: [] } },
  meta: {
    preTokenBalances: changes.map(([owner, pre], i) => ({ accountIndex: 10 + i, mint: MINT, owner, uiTokenAmount: { amount: String(pre) } })),
    postTokenBalances: changes.map(([owner, , post], i) => ({ accountIndex: 10 + i, mint: MINT, owner, uiTokenAmount: { amount: String(post) } })),
  },
});

test('tokenDeltas and summariseSolana: buys, sells, transfers and same-block buyers', () => {
  const A = 'A'.repeat(32), B = 'B'.repeat(32), C = 'C'.repeat(32);
  const txs = [
    tx({ slot: 100, time: 1000, sig: 's1', signers: [A], changes: [[CURVE, 1000, 900], [A, 0, 100]] }), // A buys
    tx({ slot: 100, time: 1000, sig: 's2', signers: [B], changes: [[CURVE, 900, 850], [B, 0, 50]] }),  // B buys, same block
    tx({ slot: 105, time: 1002, sig: 's3', signers: [A], changes: [[A, 100, 70], [C, 0, 30]] }),       // A sends 30 to C
    tx({ slot: 107, time: 1003, sig: 's4', signers: [B], changes: [[B, 50, 20], [CURVE, 850, 880]] }), // B sells 30
  ];
  const { deltas, signers } = tokenDeltas(txs[0], MINT);
  assert.equal(deltas.get(A), 100n);
  assert.equal(signers.has(A), true);
  const ws = new Map(summariseSolana(txs, MINT).map((w) => [w.address, w]));
  assert.equal(ws.get(A).bought, 100n);
  assert.equal(ws.get(A).firstTx, 's1');
  assert.deepEqual(ws.get(A).bundledWith, [B]);
  assert.equal(ws.get(B).sold, 30n);
  assert.equal(ws.has(C), false); // received, didn't buy
  assert.equal(ws.has(CURVE), false); // the curve never signs
  const withTransfers = new Map(summariseSolana(txs, MINT, { countTransfersIn: true }).map((w) => [w.address, w]));
  assert.equal(withTransfers.get(C).inAmount, 30n);
});

test('makeSolRpc runs calls in parallel, retries rate-limited ones, keeps order', async () => {
  let inFlight = 0, maxInFlight = 0;
  const seen = new Map();
  const fetchImpl = async (url, { body }) => {
    const c = JSON.parse(body);
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    const n = c.params[0];
    seen.set(n, (seen.get(n) || 0) + 1);
    if (n % 3 === 0 && seen.get(n) === 1) return { status: 429, json: async () => ({ id: c.id, error: { code: 429, message: 'Too many requests' } }) };
    return { status: 200, json: async () => ({ id: c.id, result: n * 10 }) };
  };
  const rpc = makeSolRpc({ concurrency: 3, fetchImpl });
  const calls = [1, 2, 3, 4, 5, 6, 7].map((n) => ['x', [n]]);
  assert.deepEqual(await rpc.many(calls), [10, 20, 30, 40, 50, 60, 70]);
  assert.equal(maxInFlight, 3);
  assert.equal(seen.get(3), 2); // retried once
  const streamed = [];
  await rpc.many(calls.slice(0, 3), { each: (r) => streamed.push(r) });
  assert.deepEqual(streamed.sort((a, b) => a - b), [10, 20, 30]);
});

test('a refused request explains itself', async () => {
  const fetchImpl = async () => ({ status: 403, json: async () => ({ error: { code: 403, message: 'Access forbidden' } }) });
  await assert.rejects(makeSolRpc({ fetchImpl }).call('getSlot', []), /free Solana node refused/);
  await assert.rejects(makeSolRpc({ fetchImpl, usesKey: true }).call('getSlot', []), /Helius key was refused/);
});

test('signaturesInWindow pages back until the window start', async () => {
  // 2500 signatures, one per second, newest first, ending at t=3500.
  const all = Array.from({ length: 2500 }, (_, i) => ({ signature: `s${2500 - i}`, blockTime: 3500 - i, err: null }));
  const rpc = {
    call: async (method, [, opts]) => {
      const from = opts.before ? all.findIndex((s) => s.signature === opts.before) + 1 : 0;
      return all.slice(from, from + opts.limit);
    },
  };
  const { sigs, complete } = await signaturesInWindow(rpc, 'x', 1500, 2000);
  assert.equal(complete, true);
  assert.equal(sigs.length, 500);
  assert.equal(sigs[0].blockTime, 1999);
  assert.equal(sigs.at(-1).blockTime, 1500);
});

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// A buy in the shape getTransaction(jsonParsed) returns, with SOL and token balances.
const buyTx = ({ payer = WALLET, sol = [0, 0], fee = 5000, tokens = [], time = 1000 }) => ({
  slot: 1,
  blockTime: time,
  transaction: { signatures: ['s'], message: { accountKeys: [{ pubkey: payer, signer: true }, { pubkey: CURVE, signer: false }] } },
  meta: {
    fee,
    preBalances: [sol[0], 0],
    postBalances: [sol[1], 0],
    preTokenBalances: tokens.filter((t) => t.pre != null).map((t) => ({ mint: t.mint, owner: t.owner ?? payer, uiTokenAmount: { amount: String(t.pre) } })),
    postTokenBalances: tokens.filter((t) => t.post != null).map((t) => ({ mint: t.mint, owner: t.owner ?? payer, uiTokenAmount: { amount: String(t.post) } })),
  },
});

test('what a Solana buyer paid: SOL less the fee and new-account deposit, wrapped SOL, stablecoins', () => {
  // First buy: 1.5 SOL left the wallet, including the 0.000005 fee and a 0.00203928 deposit
  // for its new token account; it paid 1.49795572 SOL for the tokens.
  const first = buyTx({ sol: [5_000_000_000, 3_500_000_000], tokens: [{ mint: MINT, post: 1000 }] });
  assert.deepEqual(paidInSolTx(first, WALLET, MINT), { lamports: 1_500_000_000n - 5000n - 2039280n, usd: 0 });
  // Later buy, account already open, paid with wrapped SOL.
  const wrapped = buyTx({ sol: [1_000_000_000, 999_995_000], tokens: [{ mint: MINT, pre: 1000, post: 3000 }, { mint: WSOL, pre: 800_000_000, post: 300_000_000 }] });
  assert.deepEqual(paidInSolTx(wrapped, WALLET, MINT), { lamports: 500_000_000n, usd: 0 });
  // Paid in USDC.
  const usdc = buyTx({ sol: [1_000_000_000, 999_995_000], tokens: [{ mint: MINT, pre: 5, post: 9 }, { mint: USDC, pre: 900_000_000, post: 150_000_000 }] });
  assert.deepEqual(paidInSolTx(usdc, WALLET, MINT), { lamports: 0n, usd: 750 });
  // At $100 then $200 a SOL.
  const price = (ts) => (ts < 2000 ? 100 : 200);
  assert.equal(solSpentUsd({ paid: [{ ts: 1000, lamports: 1_000_000_000n, usd: 0 }, { ts: 2500, lamports: 500_000_000n, usd: 750 }] }, price), 100 + 100 + 750);
  assert.equal(solSpentUsd({ paid: [{ ts: 1000, lamports: 0n, usd: 0 }] }, price), null);
});

test('price candles: size, requests, order and lookup', () => {
  assert.equal(chooseGranularity(0, 3 * 3600), 60);
  assert.equal(chooseGranularity(0, 30 * 86400), 900);
  // 3 hours of minute candles fit one request (starting a candle early).
  assert.deepEqual(candleRequests(10000, 10000 + 3 * 3600, 60), [[9940, 20800]]);
  assert.equal(candleRequests(0, 30 * 86400, 900).length, 10);
  const series = parseCandles([[180, 0, 0, 0, 12], [60, 0, 0, 0, 10], [120, 0, 0, 0, 11]]);
  assert.deepEqual(series, [[60, 10], [120, 11], [180, 12]]);
  assert.deepEqual([priceAt(series, 30), priceAt(series, 60), priceAt(series, 150), priceAt(series, 999)], [10, 10, 11, 12]);
  assert.equal(priceAt([], 5), null);
});
