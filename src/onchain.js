// Reading token transfers from EVM chains over plain JSON-RPC (no API key needed).
//
// Public RPCs limit eth_getLogs in different ways (block span, number of results), and
// say so in their error messages, so getLogs() splits a request until it fits.
// Token amounts are BigInt throughout; addresses are lower-case.

export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const CHAINS = {
  robinhood: {
    id: 4663,
    name: 'Robinhood Chain',
    rpc: 'https://rpc.mainnet.chain.robinhood.com',
    explorer: 'https://robinhoodchain.blockscout.com',
    native: 'ETH',
  },
};

export class RpcError extends Error {
  constructor(err) {
    super(err?.message || 'RPC error');
    this.code = err?.code;
  }
}

export const toHex = (n) => `0x${n.toString(16)}`;
export const fromHex = (h) => Number.parseInt(h, 16);
export const isAddress = (s) => /^0x[0-9a-fA-F]{40}$/.test(String(s).trim());
export const normAddress = (s) => String(s).trim().toLowerCase();
export const topicFor = (address) => `0x${normAddress(address).slice(2).padStart(64, '0')}`;
export const addressFromTopic = (topic) => `0x${topic.slice(-40)}`.toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- JSON-RPC transport ---------------------------------------------------------------------

export function makeRpc(url, { fetchImpl = (...a) => fetch(...a), retries = 6, signal } = {}) {
  let nextId = 0;
  async function send(body) {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw new Error('Cancelled');
      let res;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        });
      } catch (err) {
        if (signal?.aborted) throw new Error('Cancelled');
        if (attempt >= retries) throw new Error('Could not reach the blockchain. Check your connection.');
        await sleep(500 * 2 ** attempt);
        continue;
      }
      // Rate limited or a server hiccup: wait (as long as the server asks, if it says) and retry.
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const after = Number(res.headers?.get?.('retry-after'));
        await sleep(after > 0 ? Math.min(after, 30) * 1000 : Math.min(1000 * 2 ** attempt, 10000));
        continue;
      }
      if (res.status === 429) throw new Error('The public blockchain node is busy (rate limited). Wait a minute and try again.');
      if (!res.ok) throw new Error(`The blockchain node answered with error ${res.status}`);
      return res.json();
    }
  }
  return {
    async call(method, params) {
      const r = await send({ jsonrpc: '2.0', id: ++nextId, method, params });
      if (r.error) throw new RpcError(r.error);
      return r.result;
    },
    // Several calls in one request. Each result is the value or an RpcError.
    async batch(calls) {
      if (!calls.length) return [];
      const body = calls.map(([method, params]) => ({ jsonrpc: '2.0', id: ++nextId, method, params }));
      const res = await send(body);
      const byId = new Map((Array.isArray(res) ? res : [res]).map((r) => [r.id, r]));
      return body.map((b) => {
        const r = byId.get(b.id);
        if (!r) return new RpcError({ message: 'No answer' });
        return r.error ? new RpcError(r.error) : r.result;
      });
    },
  };
}

// ---- Logs -----------------------------------------------------------------------------------------

const byChainOrder = (a, b) => a.block - b.block || a.logIndex - b.logIndex;

// eth_getLogs over [from, to], split into smaller requests whenever the node says the
// span or the number of results is too big.
export async function getLogs(rpc, filter, from, to, { onProgress } = {}) {
  const out = [];
  const queue = [[from, to]];
  let maxSpan = Infinity;
  while (queue.length) {
    const [a, b] = queue.shift();
    if (b - a + 1 > maxSpan) {
      for (let s = a; s <= b; s += maxSpan) queue.push([s, Math.min(b, s + maxSpan - 1)]);
      continue;
    }
    try {
      const logs = await rpc.call('eth_getLogs', [{ ...filter, fromBlock: toHex(a), toBlock: toHex(b) }]);
      out.push(...logs);
      onProgress?.(out.length);
    } catch (err) {
      const allowed = /only (\d+) (?:are )?allowed/i.exec(err.message) || /(?:max(?:imum)?|limit)[^\d]{0,30}(\d+) blocks/i.exec(err.message);
      if (allowed && Number(allowed[1]) < b - a + 1) {
        maxSpan = Number(allowed[1]);
        queue.unshift([a, b]);
      } else if (/exceed|limit|too many|too large|range/i.test(err.message) && b > a) {
        const mid = Math.floor((a + b) / 2);
        queue.unshift([a, mid], [mid + 1, b]);
      } else {
        throw err;
      }
    }
  }
  return out;
}

// ERC-20 Transfer log → { block, ts, tx, logIndex, token, from, to, value }. NFTs (4 topics) are skipped.
export function parseTransfer(log) {
  if (log.topics?.length !== 3 || log.topics[0] !== TRANSFER_TOPIC) return null;
  return {
    block: fromHex(log.blockNumber),
    // Some nodes return blockTimestamp as 0x0; addTimestamps() fills those in.
    ts: log.blockTimestamp && fromHex(log.blockTimestamp) > 0 ? fromHex(log.blockTimestamp) : null,
    tx: log.transactionHash,
    logIndex: fromHex(log.logIndex),
    token: log.address.toLowerCase(),
    from: addressFromTopic(log.topics[1]),
    to: addressFromTopic(log.topics[2]),
    value: BigInt(!log.data || log.data === '0x' ? 0 : log.data.slice(0, 66)),
  };
}

export async function getTransfers(rpc, { token, from, to, fromBlock, toBlock, onProgress }) {
  const filter = { topics: [TRANSFER_TOPIC, from ? topicFor(from) : null, to ? topicFor(to) : null] };
  if (token) filter.address = normAddress(token);
  const logs = await getLogs(rpc, filter, fromBlock, toBlock, { onProgress });
  return logs.map(parseTransfer).filter(Boolean).sort(byChainOrder);
}

// ---- Blocks and time -------------------------------------------------------------------------------

export async function latestBlock(rpc) {
  return fromHex(await rpc.call('eth_blockNumber', []));
}

// The first block at or after unix time `ts` (or latest + 1 if `ts` is in the future).
// Interpolation search, falling back to bisection, so it takes a handful of requests.
export async function blockAtTime(rpc, ts, { cache = new Map(), head } = {}) {
  const timeOf = async (n) => {
    if (!cache.has(n)) {
      const b = await rpc.call('eth_getBlockByNumber', [toHex(n), false]);
      cache.set(n, fromHex(b.timestamp));
    }
    return cache.get(n);
  };
  let hi = head ?? await latestBlock(rpc);
  let thi = await timeOf(hi);
  if (ts > thi) return hi + 1;
  let lo = 0;
  let tlo = await timeOf(0);
  if (ts <= tlo) return 0;
  for (let step = 0; hi - lo > 1; step++) {
    let guess = step % 2 === 0 && thi > tlo
      ? lo + Math.floor(((ts - tlo) / (thi - tlo)) * (hi - lo))
      : Math.floor((lo + hi) / 2);
    guess = Math.min(hi - 1, Math.max(lo + 1, guess));
    const t = await timeOf(guess);
    if (t >= ts) { hi = guess; thi = t; } else { lo = guess; tlo = t; }
  }
  return hi;
}

// Block range [fromBlock, toBlock] covering unix times [start, end).
export async function blockRange(rpc, start, end) {
  const head = await latestBlock(rpc);
  const cache = new Map();
  const fromBlock = await blockAtTime(rpc, start, { cache, head });
  const toBlock = Math.min(head, (await blockAtTime(rpc, end, { cache, head })) - 1);
  return { fromBlock, toBlock, head };
}

// Exact timestamps for a set of blocks.
export async function blockTimes(rpc, blocks, { chunk = 25 } = {}) {
  const list = [...new Set(blocks)];
  const out = new Map();
  for (let i = 0; i < list.length; i += chunk) {
    const part = list.slice(i, i + chunk);
    const res = await rpc.batch(part.map((b) => ['eth_getBlockByNumber', [toHex(b), false]]));
    res.forEach((r, k) => { if (r && !(r instanceof Error)) out.set(part[k], fromHex(r.timestamp)); });
    if (i + chunk < list.length) await sleep(150);
  }
  return out;
}

// Fills in missing transfer times: exact for a few sample blocks, interpolated in between
// (block times are steady, so this is accurate to a second or two).
export async function addTimestamps(rpc, transfers, { samples = 24 } = {}) {
  const missing = transfers.filter((t) => t.ts == null);
  if (!missing.length) return transfers;
  const blocks = [...new Set(missing.map((t) => t.block))].sort((a, b) => a - b);
  const step = Math.max(1, Math.floor((blocks.length - 1) / (samples - 1)));
  const anchorsWanted = blocks.filter((_, i) => i % step === 0);
  if (anchorsWanted.at(-1) !== blocks.at(-1)) anchorsWanted.push(blocks.at(-1));
  const anchors = [...(await blockTimes(rpc, anchorsWanted)).entries()].sort((a, b) => a[0] - b[0]);
  for (const t of missing) {
    let k = anchors.findIndex(([b]) => b >= t.block);
    if (k === -1) k = anchors.length - 1;
    const [b1, t1] = anchors[k];
    const [b0, t0] = anchors[Math.max(0, k - 1)];
    t.ts = b1 === b0 ? t1 : Math.round(t0 + ((t.block - b0) / (b1 - b0)) * (t1 - t0));
  }
  return transfers;
}

// ---- Tokens and addresses ---------------------------------------------------------------------------

function hexToText(hex) {
  const bytes = new Uint8Array((hex.match(/../g) || []).map((b) => Number.parseInt(b, 16)));
  return new TextDecoder().decode(bytes).replace(/\0+$/, '').trim();
}

// ABI string (or old-style bytes32) returned by symbol() / name().
export function decodeString(result) {
  if (!result || typeof result !== 'string' || result === '0x') return '';
  const body = result.slice(2);
  if (body.length === 64) return hexToText(body);
  const len = Number.parseInt(body.slice(64, 128), 16);
  return hexToText(body.slice(128, 128 + len * 2));
}

// Token names can hide invisible characters to imitate real tokens (e.g. a fake "USDG").
// Returns the visible text and whether anything was hidden.
export function cleanName(text) {
  const visible = text.replace(/[\p{Cf}\p{Cc}]/gu, '');
  return { text: visible, suspicious: visible !== text };
}

export async function tokenInfo(rpc, token) {
  const to = normAddress(token);
  const [name, symbol, decimals, supply] = await rpc.batch([
    ['eth_call', [{ to, data: '0x06fdde03' }, 'latest']],
    ['eth_call', [{ to, data: '0x95d89b41' }, 'latest']],
    ['eth_call', [{ to, data: '0x313ce567' }, 'latest']],
    ['eth_call', [{ to, data: '0x18160ddd' }, 'latest']],
  ]);
  if (supply instanceof Error || !supply || supply === '0x') throw new Error('That address isn’t a token on this chain.');
  const n = cleanName(name instanceof Error ? '' : decodeString(name));
  const sym = cleanName(symbol instanceof Error ? '' : decodeString(symbol));
  return {
    address: to,
    name: n.text,
    symbol: sym.text || '?',
    suspicious: n.suspicious || sym.suspicious,
    decimals: decimals instanceof Error || !decimals || decimals === '0x' ? 18 : Number(BigInt(decimals)),
    totalSupply: BigInt(supply),
  };
}

// Which of these addresses are contracts (pools, routers, launchpads) rather than wallets.
export async function findContracts(rpc, addresses, { chunk = 25, onProgress } = {}) {
  const list = [...new Set(addresses.map(normAddress))].filter((a) => a !== ZERO_ADDRESS);
  const contracts = new Set();
  for (let i = 0; i < list.length; i += chunk) {
    const part = list.slice(i, i + chunk);
    const codes = await rpc.batch(part.map((a) => ['eth_getCode', [a, 'latest']]));
    codes.forEach((code, k) => {
      if (typeof code === 'string' && code !== '0x' && code.length > 2) contracts.add(part[k]);
    });
    onProgress?.(Math.min(list.length, i + chunk), list.length);
    if (i + chunk < list.length) await sleep(150); // stay under public rate limits
  }
  return contracts;
}

export async function balancesOf(rpc, token, wallets, { chunk = 25 } = {}) {
  const out = new Map();
  for (let i = 0; i < wallets.length; i += chunk) {
    const part = wallets.slice(i, i + chunk);
    const res = await rpc.batch(part.map((w) => ['eth_call', [{ to: normAddress(token), data: `0x70a08231${topicFor(w).slice(2)}` }, 'latest']]));
    res.forEach((r, k) => out.set(part[k], typeof r === 'string' && r !== '0x' ? BigInt(r) : null));
    if (i + chunk < wallets.length) await sleep(150);
  }
  return out;
}

// ---- Analysis -----------------------------------------------------------------------------------------

// Sorts transfers into buys (from a contract such as a pool to a wallet), sells (wallet to
// contract), mints (from the zero address) and wallet-to-wallet transfers, then totals
// them per wallet. Addresses in `contracts` (ones that sent tokens, like pools) never
// appear as wallets.
export function summariseWallets(transfers, contracts, { countTransfersIn = false } = {}) {
  const wallets = new Map();
  const isContract = (a) => contracts.has(a);
  const get = (a) => {
    if (!wallets.has(a)) {
      wallets.set(a, { address: a, bought: 0n, sold: 0n, received: 0n, sent: 0n, minted: 0n, buys: 0, firstTs: null, firstBlock: null, firstTx: null, buyTxs: new Set() });
    }
    return wallets.get(a);
  };
  const arrive = (w, t) => {
    if (w.firstBlock == null || t.block < w.firstBlock) { w.firstTs = t.ts; w.firstBlock = t.block; w.firstTx = t.tx; }
  };
  // Recipients per transaction, to spot one transaction buying for several wallets.
  const recipientsByTx = new Map();

  for (const t of transfers) {
    if (t.value === 0n) continue;
    const fromZero = t.from === ZERO_ADDRESS;
    const toZero = t.to === ZERO_ADDRESS;
    const fromC = isContract(t.from);
    const toC = isContract(t.to);
    if (toZero || toC) {
      if (!fromZero && !fromC) get(t.from).sold += t.value;
      continue;
    }
    const w = get(t.to);
    if (fromZero) { w.minted += t.value; if (countTransfersIn) arrive(w, t); continue; }
    if (fromC) {
      w.bought += t.value;
      w.buys++;
      w.buyTxs.add(t.tx);
      arrive(w, t);
      if (!recipientsByTx.has(t.tx)) recipientsByTx.set(t.tx, new Set());
      recipientsByTx.get(t.tx).add(t.to);
    } else {
      w.received += t.value;
      get(t.from).sent += t.value;
      if (countTransfersIn) arrive(w, t);
    }
  }

  return [...wallets.values()].map((w) => {
    const bundledWith = new Set();
    for (const tx of w.buyTxs) for (const other of recipientsByTx.get(tx) || []) if (other !== w.address) bundledWith.add(other);
    const inAmount = w.bought + (countTransfersIn ? w.received + w.minted : 0n);
    const { buyTxs, ...rest } = w;
    return { ...rest, inAmount, bundledWith: [...bundledWith] };
  }).filter((w) => w.inAmount > 0n || w.sold > 0n);
}

// Share of supply as a percentage (to 4 decimal places), e.g. 1.2345.
export function percentOf(amount, supply) {
  if (!supply) return 0;
  return Number((amount * 1000000n) / supply) / 10000;
}

// Human-readable token amount: 1234567.89 → "1.23M".
export function formatAmount(raw, decimals) {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const frac = Number(abs % scale) / Number(scale);
  const v = Number(whole) + frac;
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  const [div, suffix] = units.find(([d]) => v >= d) || [1, ''];
  const shown = v / div;
  const text = shown >= 100 ? shown.toFixed(0) : shown >= 10 ? shown.toFixed(1) : shown.toFixed(2);
  return `${neg ? '-' : ''}${Number(text).toLocaleString('en-US', { maximumFractionDigits: 2 })}${suffix}`;
}

// Groups a wallet's outgoing (or incoming) transfers by counterparty.
export function groupCounterparties(transfers, wallet, direction = 'out') {
  const me = normAddress(wallet);
  const groups = new Map();
  for (const t of transfers) {
    const other = direction === 'out' ? t.to : t.from;
    if ((direction === 'out' ? t.from : t.to) !== me || other === me) continue;
    if (!groups.has(other)) groups.set(other, { address: other, count: 0, firstTs: t.ts, lastTs: t.ts, byToken: new Map() });
    const g = groups.get(other);
    g.count++;
    g.firstTs = Math.min(g.firstTs, t.ts);
    g.lastTs = Math.max(g.lastTs, t.ts);
    g.byToken.set(t.token, (g.byToken.get(t.token) || 0n) + t.value);
  }
  return [...groups.values()].sort((a, b) => a.firstTs - b.firstTs);
}

// ---- Whole searches, as the app runs them ------------------------------------------------------------

// Feature 1: wallets that bought at least minPct of a token's supply between two times.
// Only addresses that sent tokens are checked for being contracts (pools, routers and
// launchpads always send), plus the final candidates, which keeps it fast on busy tokens.
export async function earlyBuyers(rpc, { token, start, end, minPct = 1, countTransfersIn = false, maxResults = 200, onStep = () => {} }) {
  onStep('Reading the token…');
  const info = await tokenInfo(rpc, token);
  onStep('Finding the blocks for your time window…');
  const { fromBlock, toBlock } = await blockRange(rpc, start, end);
  if (toBlock < fromBlock) return { info, fromBlock, toBlock, transfers: 0, buyers: 0, wallets: [] };
  const transfers = await getTransfers(rpc, {
    token, fromBlock, toBlock, onProgress: (n) => onStep(`Reading transfers… ${n.toLocaleString()}`),
  });
  onStep('Telling wallets apart from pools and routers…');
  const senders = [...new Set(transfers.map((t) => t.from))];
  const contracts = await findContracts(rpc, senders, { onProgress: (i, n) => onStep(`Checking addresses… ${i}/${n}`) });
  let wallets = summariseWallets(transfers, contracts, { countTransfersIn }).filter((w) => w.inAmount > 0n);
  const buyers = wallets.length;
  wallets = wallets
    .map((w) => ({ ...w, pct: percentOf(w.inAmount, info.totalSupply) }))
    .filter((w) => w.pct >= minPct)
    .sort((a, b) => (b.inAmount > a.inAmount ? 1 : b.inAmount < a.inAmount ? -1 : 0));
  // Details (exact time, current balance, contract check) for the top results only.
  const matched = wallets.length;
  wallets = wallets.slice(0, maxResults);
  if (wallets.length) {
    onStep('Checking the results…');
    await addTimestamps(rpc, transfers);
    const contractsAmong = await findContracts(rpc, wallets.map((w) => w.address));
    const times = await blockTimes(rpc, wallets.map((w) => w.firstBlock));
    const holds = await balancesOf(rpc, token, wallets.map((w) => w.address));
    // A contract here is usually a smart wallet (common on Robinhood Chain), sometimes a pool.
    wallets = wallets.map((w) => ({
      ...w,
      firstTs: times.get(w.firstBlock) ?? w.firstTs,
      holds: holds.get(w.address) ?? null,
      isContract: contractsAmong.has(w.address),
    }));
  }
  return { info, fromBlock, toBlock, transfers: transfers.length, buyers, matched, wallets };
}

// Feature 2: how a group of wallets traded another token between two times.
// One query per wallet: nodes allow much longer ranges for a single address.
export async function groupInToken(rpc, { token, wallets, start, end, onStep = () => {} }) {
  onStep('Reading the token…');
  const info = await tokenInfo(rpc, token);
  onStep('Finding the blocks for your time window…');
  const { fromBlock, toBlock } = await blockRange(rpc, start, end);
  const incoming = [];
  for (const [i, w] of wallets.entries()) {
    onStep(`Checking wallet ${i + 1} of ${wallets.length}…`);
    incoming.push(...await getTransfers(rpc, { token, to: w, fromBlock, toBlock }));
  }
  onStep('Telling buys apart from transfers…');
  const contracts = await findContracts(rpc, incoming.map((t) => t.from));
  await addTimestamps(rpc, incoming);
  const summary = new Map(summariseWallets(incoming, contracts, { countTransfersIn: true }).map((w) => [w.address, w]));
  const holds = await balancesOf(rpc, token, wallets);
  const rows = wallets.map((address) => {
    const w = summary.get(address);
    return {
      address,
      bought: w?.bought ?? 0n,
      received: (w?.received ?? 0n) + (w?.minted ?? 0n),
      pct: w ? percentOf(w.bought + w.received + w.minted, info.totalSupply) : 0,
      firstTs: w?.firstTs ?? null,
      firstTx: w?.firstTx ?? null,
      holds: holds.get(address) ?? null,
      found: Boolean(w),
    };
  });
  return { info, fromBlock, toBlock, rows };
}

// Feature 3: who a wallet sent tokens to (or received from) between two times.
export async function walletFlows(rpc, { wallet, start, end, direction = 'out', onStep = () => {} }) {
  onStep('Finding the blocks for your time window…');
  const { fromBlock, toBlock } = await blockRange(rpc, start, end);
  const transfers = await getTransfers(rpc, {
    ...(direction === 'out' ? { from: wallet } : { to: wallet }),
    fromBlock, toBlock,
    onProgress: (n) => onStep(`Reading transfers… ${n.toLocaleString()}`),
  });
  await addTimestamps(rpc, transfers);
  const groups = groupCounterparties(transfers, wallet, direction);
  onStep('Reading token names…');
  const tokens = new Map();
  for (const address of new Set(transfers.map((t) => t.token))) {
    try { tokens.set(address, await tokenInfo(rpc, address)); } catch { tokens.set(address, { address, symbol: '?', decimals: 18 }); }
  }
  const contracts = await findContracts(rpc, groups.map((g) => g.address));
  return { fromBlock, toBlock, transfers: transfers.length, groups: groups.map((g) => ({ ...g, isContract: contracts.has(g.address) })), tokens };
}
