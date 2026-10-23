// Reading token activity on Solana over JSON-RPC: PublicNode's free node by default (it
// allows web pages and needs no key; Solana's own public node blocks web pages), or
// Helius when a key is given.
//
// Every transaction lists each holder's token balance before and after, plus who signed.
// A signer whose balance of the token went up bought it; a non-signer whose balance went
// up received it. Results use the same shapes as onchain.js so the app can show either chain.

import { percentOf, levelCounts, USD_LEVELS, PCT_LEVELS } from './onchain.js';
import { usdSeries as coinbaseSeries, priceAt } from './prices.js';

export const SOLANA = {
  name: 'Solana',
  publicRpc: 'https://solana-rpc.publicnode.com',
  heliusRpc: (key) => `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`,
  explorer: 'https://solscan.io',
};
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const WSOL = 'So11111111111111111111111111111111111111112';
// Stablecoins buys are paid with, and their decimals.
export const STABLES = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 6, // USDC
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY2Ln7nmVJo9Fmi5: 6, // USDT
};
// The refundable deposit for opening a token account, which isn't money spent on the token.
const TOKEN_ACCOUNT_RENT = 2039280n;
const METADATA_PROGRAM = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const isSolanaAddress = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s).trim());

// ---- RPC -----------------------------------------------------------------------------------------
// One call per request (PublicNode allows only one getTransaction per batch), a few in
// parallel. Calls that hit a rate limit wait and retry on their own.

export function makeSolRpc({ url = SOLANA.publicRpc, concurrency = 4, usesKey = false, fetchImpl = (...a) => fetch(...a), signal } = {}) {
  let nextId = 0;
  const limited = (status, r) => status === 429 || !r || (r.error && /rate|too many|429|limit|busy/i.test(`${r.error.message} ${r.error.code}`));

  async function callOne(method, params) {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw new Error('Cancelled');
      let status = 0, reply = null;
      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++nextId, method, params }),
          signal,
        });
        status = res.status;
        reply = await res.json().catch(() => null);
      } catch {
        if (signal?.aborted) throw new Error('Cancelled');
      }
      if (status === 401 || status === 403) {
        throw new Error(usesKey ? 'The Helius key was refused. Check it in Settings.' : `The free Solana node refused the request${reply?.error?.message ? ` (“${reply.error.message}”)` : ''}. Try again later, or add a free Helius key in Settings.`);
      }
      if (limited(status, reply)) {
        if (attempt >= 8) throw new Error('The Solana node is too busy right now. Try again shortly.');
        await sleep(Math.min(800 * 2 ** attempt, 8000));
        continue;
      }
      if (reply.error) throw new Error(reply.error.message);
      return reply.result;
    }
  }

  // Runs [method, params] calls a few at a time; results come back in order.
  // With `each`, results are handed over as they arrive and not kept (saves memory).
  async function many(calls, { onProgress, each } = {}) {
    const results = each ? null : new Array(calls.length);
    let next = 0, done = 0;
    const worker = async () => {
      while (next < calls.length) {
        const k = next++;
        const r = await callOne(calls[k][0], calls[k][1]);
        if (each) each(r, k); else results[k] = r;
        onProgress?.(++done, calls.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, calls.length) }, worker));
    return results;
  }
  return { many, call: callOne };
}

export function solRpcFor({ heliusKey, signal } = {}) {
  return heliusKey
    ? makeSolRpc({ url: SOLANA.heliusRpc(heliusKey), concurrency: 8, usesKey: true, signal })
    : makeSolRpc({ url: SOLANA.publicRpc, concurrency: 4, signal });
}

// ---- Base58, SHA-256 and program addresses -------------------------------------------------------------

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Decode(s) {
  let n = 0n;
  for (const c of s) {
    const v = B58.indexOf(c);
    if (v < 0) throw new Error('Not a Solana address');
    n = n * 58n + BigInt(v);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  for (const c of s) { if (c !== '1') break; bytes.unshift(0); }
  return Uint8Array.from(bytes);
}

export function base58Encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = `1${s}`; }
  return s;
}

const P = 2n ** 255n - 19n;
const modPow = (b, e, m) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; };
const D = ((-121665n * modPow(121666n, P - 2n, P)) % P + P) % P;

// Whether 32 bytes are a valid ed25519 public key. Program-derived addresses must not be.
export function isOnCurve(bytes) {
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(bytes[i]);
  y &= (1n << 255n) - 1n;
  if (y >= P) return false;
  const y2 = (y * y) % P;
  const u = (y2 - 1n + P) % P;
  const v = (D * y2 + 1n) % P;
  const x2 = (u * modPow(v, P - 2n, P)) % P;
  return x2 === 0n || modPow(x2, (P - 1n) / 2n, P) === 1n;
}

async function sha256(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
}

export async function findProgramAddress(seeds, programId) {
  const program = base58Decode(programId);
  const marker = new TextEncoder().encode('ProgramDerivedAddress');
  for (let bump = 255; bump >= 0; bump--) {
    const hash = await sha256([...seeds, Uint8Array.of(bump), program, marker]);
    if (!isOnCurve(hash)) return base58Encode(hash);
  }
  throw new Error('No program address found');
}

// The standard token account of `owner` for `mint` (it keeps its address even after it's closed).
export function associatedTokenAddress(owner, mint, tokenProgram) {
  return findProgramAddress([base58Decode(owner), base58Decode(tokenProgram), base58Decode(mint)], ATA_PROGRAM);
}

// ---- Token details --------------------------------------------------------------------------------------

function readBorshString(bytes, offset) {
  const len = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
  const text = new TextDecoder().decode(bytes.slice(offset + 4, offset + 4 + len)).replace(/\0+$/, '').trim();
  return [text, offset + 4 + len];
}

const clean = (text) => {
  const visible = String(text || '').replace(/[\p{Cf}\p{Cc}]/gu, '');
  return { text: visible, suspicious: visible !== String(text || '') };
};

export async function solTokenInfo(rpc, mint) {
  // Supply and decimals come from the mint account itself (free nodes refuse getTokenSupply).
  const account = await rpc.call('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
  const parsed = account?.value?.data?.parsed;
  if (parsed?.type !== 'mint') throw new Error('That address isn’t a token on Solana.');
  const supply = { value: { amount: parsed.info.supply, decimals: parsed.info.decimals } };
  const tokenProgram = account.value.owner;
  let name = '', symbol = '';
  // Token-2022 tokens (like newer pump.fun coins) carry their name in the mint itself.
  const meta = parsed.info.extensions?.find((e) => e.extension === 'tokenMetadata');
  if (meta) { name = meta.state?.name || ''; symbol = meta.state?.symbol || ''; }
  if (!symbol) {
    try {
      const pda = await findProgramAddress([new TextEncoder().encode('metadata'), base58Decode(METADATA_PROGRAM), base58Decode(mint)], METADATA_PROGRAM);
      const md = await rpc.call('getAccountInfo', [pda, { encoding: 'base64' }]);
      const data = md?.value && Uint8Array.from(atob(md.value.data[0]), (c) => c.charCodeAt(0));
      if (data) {
        let off = 1 + 32 + 32;
        [name, off] = readBorshString(data, off);
        [symbol] = readBorshString(data, off);
      }
    } catch { /* no metadata: show the address only */ }
  }
  const n = clean(name), sym = clean(symbol);
  return {
    address: mint,
    name: n.text,
    symbol: sym.text || `${mint.slice(0, 4)}…`,
    suspicious: n.suspicious || sym.suspicious,
    decimals: supply.value.decimals,
    totalSupply: BigInt(supply.value.amount),
    tokenProgram,
  };
}

// ---- History ---------------------------------------------------------------------------------------------------

// Successful transaction signatures touching `address` between unix times [start, end).
// The node only pages backwards from the newest, so busy addresses take longer to reach old windows.
export async function signaturesInWindow(rpc, address, start, end, { maxPages = 40, onProgress } = {}) {
  const out = [];
  let before;
  for (let page = 0; page < maxPages; page++) {
    const sigs = await rpc.call('getSignaturesForAddress', [address, { limit: 1000, ...(before ? { before } : {}) }]);
    if (!sigs?.length) return { sigs: out, complete: true };
    for (const s of sigs) {
      if (s.blockTime == null) continue;
      if (s.blockTime < start) return { sigs: out, complete: true };
      if (s.blockTime < end && !s.err) out.push(s);
    }
    before = sigs.at(-1).signature;
    onProgress?.(page + 1, out.length, sigs.at(-1).blockTime);
    if (sigs.length < 1000) return { sigs: out, complete: true };
  }
  return { sigs: out, complete: false };
}

const txCall = (s) => ['getTransaction', [s.signature ?? s, { maxSupportedTransactionVersion: 1, encoding: 'jsonParsed' }]];

export async function getTransactions(rpc, sigs, { onProgress } = {}) {
  return (await rpc.many(sigs.map(txCall), { onProgress })).filter(Boolean);
}

// Streams transactions to `fn` without keeping them all in memory.
export async function eachTransaction(rpc, sigs, fn, { onProgress } = {}) {
  await rpc.many(sigs.map(txCall), { onProgress, each: (tx) => { if (tx) fn(tx); } });
}

// Per-owner change in a token's balance within one transaction, plus who signed it.
export function tokenDeltas(tx, mint) {
  const deltas = new Map();
  const add = (b, sign) => {
    if (b.mint !== mint || !b.owner) return;
    deltas.set(b.owner, (deltas.get(b.owner) || 0n) + sign * BigInt(b.uiTokenAmount.amount));
  };
  for (const b of tx.meta?.preTokenBalances || []) add(b, -1n);
  for (const b of tx.meta?.postTokenBalances || []) add(b, 1n);
  const keys = tx.transaction?.message?.accountKeys || [];
  const signers = new Set(keys.filter((k) => k.signer).map((k) => k.pubkey));
  return { deltas, signers };
}

// What `owner` paid in one transaction: SOL it lost (less the network fee if it paid it, and
// the deposit for a token account the transaction opened for it), wrapped SOL it spent, and
// USDC or USDT. Returns { lamports, usd }.
export function paidInSolTx(tx, owner, mint) {
  const keys = tx.transaction?.message?.accountKeys || [];
  const i = keys.findIndex((k) => (k.pubkey ?? k) === owner);
  let lamports = 0n;
  const pre = tx.meta?.preBalances?.[i];
  const post = tx.meta?.postBalances?.[i];
  if (i >= 0 && pre != null && post != null) {
    lamports = BigInt(pre) - BigInt(post);
    if (i === 0) lamports -= BigInt(tx.meta.fee || 0);
  }
  const change = new Map();
  let hadTokenAccount = false;
  for (const [list, sign] of [[tx.meta?.preTokenBalances || [], -1n], [tx.meta?.postTokenBalances || [], 1n]]) {
    for (const b of list) {
      if (b.owner !== owner) continue;
      if (b.mint === mint && sign < 0n) hadTokenAccount = true;
      change.set(b.mint, (change.get(b.mint) || 0n) + sign * BigInt(b.uiTokenAmount.amount));
    }
  }
  if (!hadTokenAccount) lamports -= TOKEN_ACCOUNT_RENT;
  lamports -= change.get(WSOL) || 0n;
  let usd = 0;
  for (const [m, decimals] of Object.entries(STABLES)) {
    const d = change.get(m) || 0n;
    if (d < 0n) usd += Number(-d) / 10 ** decimals;
  }
  return { lamports: lamports > 0n ? lamports : 0n, usd };
}

// Ordinary wallets are ed25519 keys; program accounts (pools, bonding curves) are not.
// No network call needed.
export function walletKinds(addresses) {
  return new Map([...new Set(addresses)].map((a) => {
    try { return [a, isOnCurve(base58Decode(a)) ? 'wallet' : 'program']; } catch { return [a, 'program']; }
  }));
}

// Current balances, read from each owner's standard token account (free nodes refuse
// getTokenAccountsByOwner). A closed or missing account means a balance of 0.
export async function solBalances(rpc, mint, owners, tokenProgram) {
  const atas = await Promise.all(owners.map((o) => associatedTokenAddress(o, mint, tokenProgram)));
  const out = new Map();
  // PublicNode allows up to 10 accounts per request.
  const calls = [];
  for (let i = 0; i < atas.length; i += 10) {
    calls.push(['getMultipleAccounts', [atas.slice(i, i + 10), { encoding: 'base64', dataSlice: { offset: 64, length: 8 } }]]);
  }
  const replies = await rpc.many(calls);
  replies.forEach((res, c) => {
    const i = c * 10;
    // A token account's balance is a little-endian u64 at byte 64 (after mint and owner).
    (res?.value || []).forEach((acc, k) => {
      let amount = 0n;
      if (acc?.data?.[0]) {
        const bytes = Uint8Array.from(atob(acc.data[0]), (c) => c.charCodeAt(0));
        for (let b = bytes.length - 1; b >= 0; b--) amount = (amount << 8n) | BigInt(bytes[b]);
      }
      out.set(owners[i + k], amount);
    });
  });
  return out;
}

// ---- Searches ---------------------------------------------------------------------------------------------------

const MAX_TX = { public: 15000, helius: 30000 };

function txLimitCheck(n, rpcKind) {
  if (n > MAX_TX[rpcKind]) {
    throw new Error(`This window has ${n.toLocaleString()} transactions, too many to read in one go. Try a shorter window.`);
  }
}

// Sums deltas over transactions into per-wallet buys, sells and transfers. Transactions can
// be added one at a time as they arrive (add), then totalled (finish).
export function solanaSummary(mint, { countTransfersIn = false } = {}) {
  const wallets = new Map();
  const get = (a) => {
    if (!wallets.has(a)) wallets.set(a, { address: a, bought: 0n, sold: 0n, received: 0n, sent: 0n, minted: 0n, buys: 0, firstTs: null, firstSlot: null, firstTx: null, paid: [] });
    return wallets.get(a);
  };
  const buyersBySlot = new Map();
  let count = 0;
  const add = (tx) => {
    count++;
    const { deltas, signers } = tokenDeltas(tx, mint);
    const sig = tx.transaction.signatures[0];
    for (const [owner, d] of deltas) {
      if (d === 0n) continue;
      const w = get(owner);
      const signed = signers.has(owner);
      if (d > 0n) {
        if (signed) {
          w.bought += d;
          w.buys++;
          w.paid.push({ ts: tx.blockTime, ...paidInSolTx(tx, owner, mint) });
          if (!buyersBySlot.has(tx.slot)) buyersBySlot.set(tx.slot, new Set());
          buyersBySlot.get(tx.slot).add(owner);
        } else w.received += d;
        if ((signed || countTransfersIn) && (w.firstSlot == null || tx.slot < w.firstSlot)) {
          w.firstSlot = tx.slot; w.firstTs = tx.blockTime; w.firstTx = sig;
        }
      } else if (signed) w.sold += -d;
      else w.sent += -d;
    }
  };
  const finish = () => [...wallets.values()].map((w) => {
    const sameBlock = w.firstSlot != null ? [...(buyersBySlot.get(w.firstSlot) || [])].filter((o) => o !== w.address) : [];
    return { ...w, inAmount: w.bought + (countTransfersIn ? w.received : 0n), bundledWith: sameBlock };
  }).filter((w) => w.inAmount > 0n);
  return { add, finish, count: () => count };
}

export function summariseSolana(txs, mint, opts) {
  const s = solanaSummary(mint, opts);
  txs.forEach(s.add);
  return s.finish();
}

// Dollars each wallet spent on its buys, at SOL's price when it paid; null if nothing was seen.
export function solSpentUsd(w, solPrice) {
  if (!w.paid?.some((p) => p.lamports > 0n || p.usd > 0)) return null;
  return w.paid.reduce((sum, p) => sum + p.usd + (p.lamports > 0n ? (Number(p.lamports) / 1e9) * solPrice(p.ts) : 0), 0);
}

// With minUsd, counts wallets that spent at least that many dollars instead of % of supply.
// What was paid is in the transactions already read, so only SOL prices are fetched.
export async function solEarlyBuyers(rpc, { token, start, end, minPct = 1, minUsd = null, usdSeries = coinbaseSeries, countTransfersIn = false, maxResults = 200, rpcKind = 'public', onStep = () => {} }) {
  onStep('Reading the token…');
  const info = await solTokenInfo(rpc, token);
  onStep('Finding transactions in your window…');
  const { sigs, complete } = await signaturesInWindow(rpc, token, start, end, {
    onProgress: (page, n, t) => onStep(`Going back through history… ${n.toLocaleString()} found so far (at ${new Date(t * 1000).toLocaleString()})`),
  });
  if (!complete) throw new Error('This token has had too much activity since then to reach that window (over 40,000 transactions). Try a more recent window.');
  txLimitCheck(sigs.length, rpcKind);
  const summary = solanaSummary(token, { countTransfersIn });
  const t0 = Date.now();
  await eachTransaction(rpc, sigs, summary.add, {
    onProgress: (done, n) => {
      const rate = done / Math.max(1, (Date.now() - t0) / 60000);
      const left = done > 20 ? Math.ceil((n - done) / rate) : null;
      onStep(`Reading ${n.toLocaleString()} transactions… ${done.toLocaleString()} done${left > 1 ? ` (about ${left} min left)` : ''}`);
    },
  });
  let wallets = summary.finish();
  const buyers = wallets.length;
  // Dollar values are shown whenever SOL prices can be had; they're required only with minUsd.
  let series = null;
  onStep('Getting SOL prices for the window…');
  try {
    series = await usdSeries('SOL', start, end);
  } catch (e) {
    if (minUsd != null) throw e;
  }
  wallets = wallets.map((w) => ({ ...w, pct: percentOf(w.inAmount, info.totalSupply), spentUsd: series ? solSpentUsd(w, (ts) => priceAt(series, ts)) : null }));
  const unpriced = series ? wallets.filter((w) => w.spentUsd == null && w.bought > 0n).length : 0;
  const levels = minUsd != null ? levelCounts(wallets.map((w) => w.spentUsd), USD_LEVELS) : levelCounts(wallets.map((w) => w.pct), PCT_LEVELS);
  wallets = minUsd != null
    ? wallets.filter((w) => w.spentUsd != null && w.spentUsd >= minUsd).sort((a, b) => b.spentUsd - a.spentUsd)
    : wallets.filter((w) => w.pct >= minPct).sort((a, b) => (b.inAmount > a.inAmount ? 1 : b.inAmount < a.inAmount ? -1 : 0));
  const spentTotal = wallets.reduce((s, w) => s + (w.spentUsd || 0), 0);
  const matched = wallets.length;
  wallets = wallets.slice(0, maxResults);
  if (wallets.length) {
    onStep('Checking the results…');
    const kinds = walletKinds(wallets.map((w) => w.address));
    // Program accounts (pools, bonding curves) aren't people.
    wallets = wallets.filter((w) => kinds.get(w.address) !== 'program');
    const holds = await solBalances(rpc, token, wallets.map((w) => w.address), info.tokenProgram);
    wallets = wallets.map((w) => ({ ...w, holds: holds.get(w.address) ?? null, isContract: false }));
  }
  return { info, transfers: summary.count(), buyers, matched, wallets, levels, unpriced, spentTotal };
}

export async function solGroupInToken(rpc, { token, wallets, start, end, onStep = () => {} }) {
  onStep('Reading the token…');
  const info = await solTokenInfo(rpc, token);
  const rows = [];
  for (const [i, owner] of wallets.entries()) {
    onStep(`Checking wallet ${i + 1} of ${wallets.length}…`);
    const ata = await associatedTokenAddress(owner, token, info.tokenProgram);
    const { sigs } = await signaturesInWindow(rpc, ata, start, end, { maxPages: 5 });
    let txs = sigs.length ? await getTransactions(rpc, sigs) : [];
    let s = summariseSolana(txs, token, { countTransfersIn: true }).find((w) => w.address === owner);
    if (!s) {
      // Bots often use a non-standard token account, so fall back to the wallet's own history.
      onStep(`Checking wallet ${i + 1} of ${wallets.length} (full history)…`);
      const own = await signaturesInWindow(rpc, owner, start, end, { maxPages: 3 });
      txs = own.sigs.length && own.sigs.length <= 1500 ? await getTransactions(rpc, own.sigs) : [];
      s = summariseSolana(txs, token, { countTransfersIn: true }).find((w) => w.address === owner);
    }
    rows.push({
      address: owner,
      bought: s?.bought ?? 0n,
      received: s?.received ?? 0n,
      pct: s ? percentOf(s.bought + s.received, info.totalSupply) : 0,
      firstTs: s?.firstTs ?? null,
      firstTx: s?.firstTx ?? null,
      found: Boolean(s),
    });
  }
  const holds = await solBalances(rpc, token, wallets, info.tokenProgram);
  return { info, rows: rows.map((r) => ({ ...r, holds: holds.get(r.address) ?? null })) };
}

// Who a wallet sent SOL and tokens to (or received them from) between two times.
export async function solWalletFlows(rpc, { wallet, start, end, direction = 'out', rpcKind = 'public', onStep = () => {} }) {
  onStep('Finding the wallet’s transactions…');
  const { sigs, complete } = await signaturesInWindow(rpc, wallet, start, end, {
    onProgress: (page, n) => onStep(`Going back through history… ${n.toLocaleString()} found`),
  });
  if (!complete) throw new Error('This wallet has been too active since then to reach that window. Try a more recent window.');
  txLimitCheck(sigs.length, rpcKind);
  const txs = await getTransactions(rpc, sigs, { onProgress: (done, n) => onStep(`Reading ${n.toLocaleString()} transactions… ${done.toLocaleString()} done`) });

  const groups = new Map();
  const touch = (address, ts) => {
    if (!groups.has(address)) groups.set(address, { address, count: 0, firstTs: ts, lastTs: ts, byToken: new Map() });
    const g = groups.get(address);
    g.count++;
    g.firstTs = Math.min(g.firstTs, ts);
    g.lastTs = Math.max(g.lastTs, ts);
    return g;
  };
  const SOL = 'SOL';
  for (const tx of txs) {
    // SOL moved by the System Program, including inside other programs' instructions.
    const instructions = [
      ...(tx.transaction.message.instructions || []),
      ...(tx.meta?.innerInstructions || []).flatMap((x) => x.instructions),
    ];
    for (const ins of instructions) {
      if (ins.program !== 'system' || !/^transfer/.test(ins.parsed?.type || '')) continue;
      const { source, destination, lamports } = ins.parsed.info;
      const other = direction === 'out' ? (source === wallet ? destination : null) : (destination === wallet ? source : null);
      if (!other || other === wallet || !lamports) continue;
      const g = touch(other, tx.blockTime);
      g.byToken.set(SOL, (g.byToken.get(SOL) || 0n) + BigInt(lamports));
    }
    // Tokens: the wallet's balance went down and someone else's went up (or the reverse).
    const mints = new Set([...(tx.meta?.postTokenBalances || []), ...(tx.meta?.preTokenBalances || [])].map((b) => b.mint));
    for (const mint of mints) {
      const { deltas } = tokenDeltas(tx, mint);
      const mine = deltas.get(wallet) || 0n;
      if (direction === 'out' ? mine >= 0n : mine <= 0n) continue;
      for (const [owner, d] of deltas) {
        if (owner === wallet || (direction === 'out' ? d <= 0n : d >= 0n)) continue;
        const g = touch(owner, tx.blockTime);
        g.byToken.set(mint, (g.byToken.get(mint) || 0n) + (d < 0n ? -d : d));
      }
    }
  }
  const list = [...groups.values()].sort((a, b) => a.firstTs - b.firstTs);
  onStep('Reading token names…');
  const tokens = new Map([[SOL, { symbol: 'SOL', decimals: 9 }]]);
  for (const mint of new Set(list.flatMap((g) => [...g.byToken.keys()]))) {
    if (tokens.has(mint)) continue;
    try { tokens.set(mint, await solTokenInfo(rpc, mint)); } catch { tokens.set(mint, { symbol: `${mint.slice(0, 4)}…`, decimals: 0 }); }
  }
  const kinds = walletKinds(list.map((g) => g.address));
  return { transfers: txs.length, groups: list.map((g) => ({ ...g, isContract: kinds.get(g.address) === 'program' })), tokens };
}
