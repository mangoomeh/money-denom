// Historical USD prices of ETH and SOL from Coinbase's public candles (no key, and it allows
// web pages), for valuing what wallets paid at the time they paid it.

const CANDLES = 'https://api.exchange.coinbase.com/products';
const GRANULARITIES = [60, 300, 900, 3600, 21600, 86400]; // seconds; Coinbase's only choices
const MAX_CANDLES = 300; // per request
const MAX_REQUESTS = 12;

// The finest candle size that covers [start, end] (unix seconds) in a few requests.
export function chooseGranularity(start, end) {
  const span = Math.max(1, end - start);
  return GRANULARITIES.find((g) => span / g <= MAX_CANDLES * MAX_REQUESTS) ?? 86400;
}

// The [start, end] slices (unix seconds) to ask for, each at most 300 candles.
export function candleRequests(start, end, granularity = chooseGranularity(start, end)) {
  const out = [];
  // Start one candle early, so the first buy has a candle at or before it.
  for (let s = start - granularity; s < end; s += granularity * MAX_CANDLES) out.push([s, Math.min(end, s + granularity * MAX_CANDLES)]);
  return out;
}

// Coinbase candles are [time, low, high, open, close, volume], newest first; this keeps
// [time, close] oldest first.
export const parseCandles = (rows) => (Array.isArray(rows) ? rows : []).map((r) => [r[0], r[4]]).sort((a, b) => a[0] - b[0]);

// The close of the last candle at or before t (or the first one, if t is earlier).
export function priceAt(series, t) {
  if (!series.length) return null;
  let lo = 0;
  let hi = series.length - 1;
  if (t < series[0][0]) return series[0][1];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (series[mid][0] <= t) lo = mid; else hi = mid - 1;
  }
  return series[lo][1];
}

// USD price series for 'ETH' or 'SOL' over [start, end] (unix seconds).
export async function usdSeries(asset, start, rawEnd, { fetchImpl = (...a) => fetch(...a), signal, now = Date.now() } = {}) {
  const end = Math.min(rawEnd, Math.floor(now / 1000)); // Coinbase refuses times in the future
  const g = chooseGranularity(start, end);
  const iso = (s) => new Date(s * 1000).toISOString();
  const all = [];
  for (const [s, e] of candleRequests(start, end, g)) {
    const res = await fetchImpl(`${CANDLES}/${asset}-USD/candles?granularity=${g}&start=${iso(s)}&end=${iso(e)}`, { signal });
    if (!res.ok) throw new Error(`Couldn't get ${asset} prices (${res.status}). Try again in a moment.`);
    all.push(...parseCandles(await res.json()));
  }
  const series = all.sort((a, b) => a[0] - b[0]).filter((p, i, a) => !i || p[0] !== a[i - 1][0]);
  if (!series.length) throw new Error(`No ${asset} prices for that time.`);
  return series;
}
