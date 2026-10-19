import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base58Decode, base58Encode, isOnCurve, associatedTokenAddress, tokenDeltas, summariseSolana, makeSolRpc,
  signaturesInWindow, isSolanaAddress,
} from '../src/solana.js';

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
