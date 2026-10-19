import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSFER_TOPIC, ZERO_ADDRESS, toHex, topicFor, getTransfers, blockAtTime, blockRange, tokenInfo, findContracts,
  summariseWallets, percentOf, formatAmount, groupCounterparties, decodeString, earlyBuyers, groupInToken, walletFlows, cleanName,
} from '../src/onchain.js';

const A = (n) => `0x${n.toString(16).padStart(40, '0')}`; // test addresses
const POOL = A(0xbeef);
const TOKEN = A(0x70c);

// A fake chain: one block per second from t=1000, with the same limits Robinhood Chain's RPC has.
function fakeChain({ transfers, contracts = [], maxSpanNoAddress = 30000, maxLogs = 10000, blankTimes = false }) {
  const head = 100000;
  const logs = transfers.map((t, i) => ({
    address: t.token ?? TOKEN, blockNumber: toHex(t.block), blockTimestamp: blankTimes ? '0x0' : toHex(1000 + t.block),
    transactionHash: t.tx ?? `0x${(i + 1).toString(16).padStart(64, '0')}`, logIndex: toHex(i),
    topics: [TRANSFER_TOPIC, topicFor(t.from), topicFor(t.to)], data: toHex(t.value),
  }));
  let calls = 0;
  const handle = (method, params) => {
    calls++;
    if (method === 'eth_blockNumber') return toHex(head);
    if (method === 'eth_getBlockByNumber') return { timestamp: toHex(1000 + Number.parseInt(params[0], 16)) };
    if (method === 'eth_getCode') return contracts.includes(params[0]) ? '0x6080' : '0x';
    if (method === 'eth_call') {
      const sel = params[0].data.slice(0, 10);
      if (sel === '0x18160ddd') return toHex(1000000n);
      if (sel === '0x70a08231') return toHex(777n);
      if (sel === '0x313ce567') return toHex(0);
      if (sel === '0x95d89b41') return '0x' + '20'.padStart(64, '0') + '4'.padStart(64, '0') + Buffer.from('PEPE').toString('hex').padEnd(64, '0');
      return '0x';
    }
    if (method === 'eth_getLogs') {
      const f = params[0];
      const from = Number.parseInt(f.fromBlock, 16), to = Number.parseInt(f.toBlock, 16);
      if (!f.address && to - from + 1 > maxSpanNoAddress) throw { code: -32602, message: `query spans ${to - from + 1} blocks, but only ${maxSpanNoAddress} are allowed for this request` };
      const match = logs.filter((l) => {
        const b = Number.parseInt(l.blockNumber, 16);
        if (b < from || b > to) return false;
        if (f.address && l.address !== f.address) return false;
        return f.topics.every((t, i) => t == null || t === l.topics[i]);
      });
      if (match.length > maxLogs) throw { code: -32000, message: `logs matched by query exceeds limit of ${maxLogs}` };
      return match;
    }
    throw { message: `unknown ${method}` };
  };
  const reply = (req) => { try { return { id: req.id, result: handle(req.method, req.params) }; } catch (e) { return { id: req.id, error: e }; } };
  return {
    rpc: {
      call: async (m, p) => { const r = reply({ id: 1, method: m, params: p }); if (r.error) { const e = new Error(r.error.message); throw e; } return r.result; },
      batch: async (calls) => calls.map(([m, p]) => { const r = reply({ id: 1, method: m, params: p }); return r.error ? new Error(r.error.message) : r.result; }),
    },
    calls: () => calls,
  };
}

test('blockAtTime finds the first block at or after a time', async () => {
  const { rpc } = fakeChain({ transfers: [] });
  assert.equal(await blockAtTime(rpc, 1000 + 12345), 12345);
  assert.equal(await blockAtTime(rpc, 0), 0);
  assert.equal(await blockAtTime(rpc, 1e12), 100001);
  assert.deepEqual(await blockRange(rpc, 1000 + 500, 1000 + 800), { fromBlock: 500, toBlock: 799, head: 100000 });
});

test('getTransfers splits requests that are too wide or return too many logs', async () => {
  const transfers = Array.from({ length: 250 }, (_, i) => ({ block: i * 300, from: POOL, to: A(i + 1), value: 10 }));
  const chain = fakeChain({ transfers, maxLogs: 40, maxSpanNoAddress: 1000 });
  const byToken = await getTransfers(chain.rpc, { token: TOKEN, fromBlock: 0, toBlock: 100000 });
  assert.equal(byToken.length, 250);
  assert.deepEqual(byToken.map((t) => t.block), transfers.map((t) => t.block)); // sorted
  const outOfPool = await getTransfers(chain.rpc, { from: POOL, fromBlock: 0, toBlock: 20000 }); // no token: 1000-block spans
  assert.equal(outOfPool.length, 67);
});

test('tokenInfo reads symbol, decimals and supply', async () => {
  const { rpc } = fakeChain({ transfers: [] });
  const info = await tokenInfo(rpc, TOKEN);
  assert.equal(info.symbol, 'PEPE');
  assert.equal(info.decimals, 0);
  assert.equal(info.totalSupply, 1000000n);
  assert.equal(decodeString('0x' + Buffer.from('ABC').toString('hex').padEnd(64, '0')), 'ABC'); // bytes32 style
});

test('summariseWallets: buys, sells, transfers, bundles and % of supply', async () => {
  const w1 = A(1), w2 = A(2), w3 = A(3), w4 = A(4);
  const transfers = [
    { block: 10, from: ZERO_ADDRESS, to: POOL, value: 1000000 },           // liquidity added
    { block: 20, from: POOL, to: w1, value: 15000, tx: '0xaa' },           // w1 buys 1.5%
    { block: 20, from: POOL, to: w2, value: 12000, tx: '0xaa' },           // same tx → bundled with w1
    { block: 21, from: POOL, to: w3, value: 5000 },                        // w3 buys 0.5%
    { block: 22, from: w3, to: w4, value: 5000 },                          // w3 passes it to w4 (not a buy)
    { block: 23, from: w1, to: POOL, value: 3000 },                        // w1 sells some
  ];
  const chain = fakeChain({ transfers, contracts: [POOL] });
  const list = await getTransfers(chain.rpc, { token: TOKEN, fromBlock: 0, toBlock: 100 });
  const contracts = await findContracts(chain.rpc, list.flatMap((t) => [t.from, t.to]));
  assert.deepEqual([...contracts], [POOL]);
  const ws = new Map(summariseWallets(list, contracts).map((w) => [w.address, w]));
  assert.equal(ws.has(POOL), false);
  assert.equal(ws.get(w1).bought, 15000n);
  assert.equal(ws.get(w1).sold, 3000n);
  assert.equal(percentOf(ws.get(w1).inAmount, 1000000n), 1.5);
  assert.deepEqual(ws.get(w1).bundledWith, [w2]);
  assert.equal(ws.get(w1).firstTs, 1020);
  assert.equal(ws.has(w4), false); // a transfer isn't a buy, so w4 isn't listed by default
  const withTransfers = new Map(summariseWallets(list, contracts, { countTransfersIn: true }).map((w) => [w.address, w]));
  assert.equal(withTransfers.get(w4).inAmount, 5000n);
});

test('groupCounterparties counts who a wallet sent to', () => {
  const me = A(9);
  const t = (to, ts, token = TOKEN, value = 1n) => ({ from: me, to, ts, token, value });
  const groups = groupCounterparties([t(A(1), 5), t(A(2), 6), t(A(1), 7, A(0x55), 3n), { from: A(1), to: me, ts: 8, token: TOKEN, value: 1n }], me);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].byToken.get(A(0x55)), 3n);
  assert.equal(groupCounterparties([{ from: A(1), to: me, ts: 8, token: TOKEN, value: 1n }], me, 'in').length, 1);
});

test('formatAmount and percentOf', () => {
  assert.equal(formatAmount(1234567n * 10n ** 18n, 18), '1.23M');
  assert.equal(formatAmount(999n, 0), '999');
  assert.equal(formatAmount(15n * 10n ** 17n, 18), '1.5');
  assert.equal(percentOf(1n, 3n), 33.3333);
});

test('earlyBuyers: wallets with ≥1% in a window, with exact times even when logs lack them', async () => {
  const w1 = A(1), w2 = A(2), w3 = A(3);
  const transfers = [
    { block: 100, from: POOL, to: w1, value: 9000 },   // before the window
    { block: 500, from: POOL, to: w1, value: 6000 },   // 0.6%
    { block: 520, from: POOL, to: w1, value: 6000 },   // w1 now 1.2% inside the window
    { block: 600, from: POOL, to: w2, value: 30000 },  // 3%
    { block: 650, from: POOL, to: w3, value: 4000 },   // 0.4%: below 1%
    { block: 900, from: POOL, to: w3, value: 90000 },  // after the window
  ];
  const { rpc } = fakeChain({ transfers, contracts: [POOL], blankTimes: true });
  const r = await earlyBuyers(rpc, { token: TOKEN, start: 1000 + 400, end: 1000 + 800, minPct: 1 });
  assert.equal(r.info.symbol, 'PEPE');
  assert.equal(r.buyers, 3);
  assert.deepEqual(r.wallets.map((w) => [w.address, w.pct, w.buys, w.firstTs]), [[w2, 3, 1, 1600], [w1, 1.2, 2, 1500]]);
  assert.equal(r.wallets[0].holds, 777n);
  assert.equal(r.matched, 2);
  assert.equal(r.wallets[0].isContract, false);
});

test('groupInToken: which wallets of a group bought another token', async () => {
  const w1 = A(1), w2 = A(2), w3 = A(3);
  const OTHER = A(0x0b);
  const transfers = [
    { token: OTHER, block: 300, from: POOL, to: w1, value: 20000 },
    { token: OTHER, block: 310, from: w1, to: w2, value: 5000 },   // passed on, not bought
    { token: TOKEN, block: 320, from: POOL, to: w3, value: 1 },     // a different token
  ];
  const { rpc } = fakeChain({ transfers, contracts: [POOL], blankTimes: true });
  const r = await groupInToken(rpc, { token: OTHER, wallets: [w1, w2, w3], start: 1000, end: 1000 + 1000 });
  const rows = Object.fromEntries(r.rows.map((x) => [x.address, x]));
  assert.equal(rows[w1].bought, 20000n);
  assert.equal(rows[w1].pct, 2);
  assert.equal(rows[w1].firstTs, 1300);
  assert.equal(rows[w2].bought, 0n);
  assert.equal(rows[w2].received, 5000n);
  assert.equal(rows[w3].found, false);
});

test('walletFlows: who a wallet sent tokens to', async () => {
  const me = A(9);
  const transfers = [
    { block: 50, from: me, to: A(1), value: 5 },
    { block: 60, from: me, to: A(2), value: 5 },
    { block: 70, from: me, to: A(1), value: 5 },
    { block: 80, from: me, to: POOL, value: 5 },
    { block: 90, from: A(3), to: me, value: 5 },
  ];
  const { rpc } = fakeChain({ transfers, contracts: [POOL] });
  const out = await walletFlows(rpc, { wallet: me, start: 1000, end: 1000 + 200 });
  assert.deepEqual(out.groups.map((g) => [g.address, g.count, g.isContract]), [[A(1), 2, false], [A(2), 1, false], [POOL, 1, true]]);
  const incoming = await walletFlows(rpc, { wallet: me, start: 1000, end: 1000 + 200, direction: 'in' });
  assert.deepEqual(incoming.groups.map((g) => g.address), [A(3)]);
});

test('cleanName spots look-alike token names with hidden characters', () => {
  assert.deepEqual(cleanName('U\u206fS\u206fDG'), { text: 'USDG', suspicious: true });
  assert.deepEqual(cleanName('Paper'), { text: 'Paper', suspicious: false });
  assert.deepEqual(cleanName('金钱自由'), { text: '金钱自由', suspicious: false });
});
