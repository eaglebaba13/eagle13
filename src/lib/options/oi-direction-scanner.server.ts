import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fetchCanonicalOptionChain } from "../option-chain/canonical-snapshot.server";
import { resolveOptionChainInstrumentKey } from "../option-chain/upstox-provider.server";
import { UpstoxHttpClient } from "../provider-foundation/upstox/upstox-http.server";
import { makeStrike, type OptionChainSnapshot } from "../option-chain/types";
import {
  OI_SYMBOLS,
  computeOiRows,
  finite,
  nearAtm,
  oiSession,
  type OiContext,
  type OiInterval,
  type OiObservation,
} from "./oi-direction-scanner";

type Candle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi: number | null;
};
const emptyContext = (): OiContext => ({
  open: null,
  high: null,
  low: null,
  previousClose: null,
  vwap: null,
  priorHigh: null,
  priorLow: null,
});

/** One writer per Node process; deploy with a single scheduler replica and a persistent config volume. */
export class OiSnapshotStore {
  private observations: OiObservation[] = [];
  private loaded: Promise<void> | null = null;
  private writes = Promise.resolve();
  public error: string | null = null;
  constructor(
    private path = resolve(
      process.env.OI_DIRECTION_SNAPSHOT_PATH || "config/oi-direction-snapshots.json",
    ),
  ) {}
  async load() {
    this.loaded ??= (async () => {
      try {
        const data = JSON.parse(await readFile(this.path, "utf8"));
        if (data.version !== 1 || !Array.isArray(data.observations))
          throw new Error("Invalid snapshot store");
        this.observations = data.observations.filter(
          (o: OiObservation) =>
            o &&
            ["CAPTURED", "CANDLE_HISTORY"].includes(o.source) &&
            o.context &&
            o.snapshot?.provider === "UPSTOX" &&
            Number.isFinite(Date.parse(o.snapshot.timestamp)) &&
            OI_SYMBOLS.includes(o.snapshot.instrument as (typeof OI_SYMBOLS)[number]) &&
            Array.isArray(o.snapshot.strikes) &&
            o.snapshot.strikes.every((s) => finite(s.strike) && s.call && s.put),
        );
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT")
          this.error = "Snapshot persistence could not be read; collecting in memory.";
      }
    })();
    await this.loaded;
  }
  async append(incoming: readonly OiObservation[], now: number) {
    await this.load();
    const date = oiSession(now).date;
    const map = new Map<string, OiObservation>();
    for (const o of [...this.observations, ...incoming]) {
      if (oiSession(o.snapshot.timestamp).date !== date) continue;
      const key = `${o.snapshot.instrument}:${o.snapshot.expiry}:${o.snapshot.timestamp.slice(0, 16)}`;
      const existing = map.get(key);
      if (existing?.source === "CAPTURED" && o.source === "CANDLE_HISTORY") continue;
      map.set(key, o);
    }
    this.observations = [...map.values()]
      .sort((a, b) => a.snapshot.timestamp.localeCompare(b.snapshot.timestamp))
      .slice(-OI_SYMBOLS.length * 376 * 3);
    const payload = JSON.stringify({ version: 1, observations: this.observations });
    this.writes = this.writes.then(async () => {
      try {
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(`${this.path}.tmp`, payload, { mode: 0o600 });
        await rename(`${this.path}.tmp`, this.path);
        this.error = null;
      } catch {
        this.error = "Snapshot persistence failed; observations are in memory only.";
      }
    });
    await this.writes;
  }
  get(symbol: string, expiry: string | undefined, now: number) {
    const all = this.observations.filter(
      (o) =>
        o.snapshot.instrument === symbol &&
        oiSession(o.snapshot.timestamp).date === oiSession(now).date,
    );
    const selected = expiry ?? all.at(-1)?.snapshot.expiry;
    return all.filter((o) => o.snapshot.expiry === selected);
  }
}

const store = new OiSnapshotStore();
const http = new UpstoxHttpClient({ timeoutMs: 8_000, maxRetries: 0 });
const flights = new Map<string, Promise<void>>();
const lastAttempt = new Map<string, number>();
const latest = new Map<string, OptionChainSnapshot>();
const priceHistory = new Map<string, { prices: Candle[]; context: OiContext }>();
const errors = new Map<string, string>();
const historyAttempt = new Map<string, number>();
const historyFlights = new Map<string, Promise<void>>();
let historyQueue = Promise.resolve();
const exchangeStatus = new Map<string, { at: number; open: boolean }>();
async function exchangeOpen(symbol: string, now: number) {
  if (!scannerMarketHours(now)) return false;
  const exchange = symbol === "SENSEX" ? "BSE" : "NSE";
  const cached = exchangeStatus.get(exchange);
  if (cached && now - cached.at < 30_000) return cached.open;
  const response = await http.request<{ data?: { status?: string } }>({
    path: `v2/market/status/${exchange}`,
  });
  const open = response.ok && response.data?.data?.status === "NORMAL_OPEN";
  exchangeStatus.set(exchange, { at: now, open });
  return open;
}

export function scannerMarketHours(now: number) {
  const s = oiSession(now);
  return s.weekday > 0 && s.weekday < 6 && s.minute >= 555 && s.minute <= 930;
}
export function parseOiCandles(raw: unknown, now: number): Candle[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((v): Candle[] => {
      if (
        !Array.isArray(v) ||
        typeof v[0] !== "string" ||
        !Number.isFinite(Date.parse(v[0])) ||
        !v.slice(1, 6).every(finite) ||
        v.length < 6
      )
        return [];
      const timestamp = new Date(v[0]).toISOString();
      const s = oiSession(timestamp);
      if (
        s.date !== oiSession(now).date ||
        s.minute < 555 ||
        s.minute >= 930 ||
        Date.parse(timestamp) + 60_000 > now
      )
        return [];
      if (v[2] < v[3] || v[5] < 0) return [];
      return [
        {
          timestamp,
          open: v[1],
          high: v[2],
          low: v[3],
          close: v[4],
          volume: v[5],
          oi: finite(v[6]) && v[6] >= 0 ? v[6] : null,
        },
      ];
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
async function candles(key: string, now: number) {
  const r = await http.request<{ data?: { candles?: unknown } }>({
    path: `v3/historical-candle/intraday/${encodeURIComponent(key)}/minutes/1`,
  });
  return r.ok ? parseOiCandles(r.data?.data?.candles, now) : [];
}
export function candleContext(values: readonly Candle[]): OiContext {
  if (!values.length) return emptyContext();
  const volume = values.reduce((n, c) => n + c.volume, 0);
  const prior = values.slice(0, -1);
  return {
    open: values[0].open,
    high: Math.max(...values.map((c) => c.high)),
    low: Math.min(...values.map((c) => c.low)),
    previousClose: null,
    vwap:
      volume > 0
        ? values.reduce((n, c) => n + ((c.high + c.low + c.close) / 3) * c.volume, 0) / volume
        : null,
    priorHigh: prior.length ? Math.max(...prior.map((c) => c.high)) : null,
    priorLow: prior.length ? Math.min(...prior.map((c) => c.low)) : null,
  };
}

async function reconstruct(
  snapshot: OptionChainSnapshot,
  spotCandles: Candle[],
  now: number,
  previousClose: number | null,
) {
  const key = resolveOptionChainInstrumentKey(snapshot.instrument);
  if (!key || !spotCandles.length) return;
  const result = await http.request<{
    data?: {
      instrument_key?: string;
      strike_price?: number;
      instrument_type?: string;
      expiry?: string;
    }[];
  }>({ path: "v2/option/contract", query: { instrument_key: key, expiry_date: snapshot.expiry } });
  if (!result.ok || !Array.isArray(result.data?.data)) return;
  const focus = nearAtm(snapshot).strikes;
  const contracts = result.data.data.filter(
    (c) =>
      c.expiry === snapshot.expiry &&
      focus.some((s) => s.strike === c.strike_price) &&
      ["CE", "PE"].includes(c.instrument_type ?? "") &&
      c.instrument_key,
  );
  const histories = new Map<string, Map<string, Candle>>();
  // Bounded sequential requests: never fan out dozens of candle requests at the provider.
  for (const c of contracts) {
    const data = await candles(c.instrument_key!, now);
    histories.set(
      `${c.strike_price}:${c.instrument_type}`,
      new Map(data.map((v) => [v.timestamp, v])),
    );
  }
  const observations: OiObservation[] = [];
  for (let i = 0; i < spotCandles.length; i++) {
    const candle = spotCandles[i];
    const required = nearAtm({ ...snapshot, spotPrice: candle.close }).strikes;
    if (required.length !== 21 || required.some((s) => !focus.some((f) => f.strike === s.strike)))
      continue;
    const strikes = required.map((s) => {
      const ce = histories.get(`${s.strike}:CE`)?.get(candle.timestamp),
        pe = histories.get(`${s.strike}:PE`)?.get(candle.timestamp);
      const leg = (v: Candle | undefined, current: typeof s.call) => ({
        oi: v?.oi ?? null,
        ltp: v?.close ?? null,
        volume: v?.volume ?? null,
        changeOi:
          finite(v?.oi) && finite(current.oi) && finite(current.changeOi)
            ? v.oi - (current.oi - current.changeOi)
            : null,
      });
      return makeStrike(s.strike, leg(ce, s.call), leg(pe, s.put));
    });
    if (strikes.some((s) => s.call.changeOi == null || s.put.changeOi == null)) continue;
    observations.push({
      source: "CANDLE_HISTORY",
      context: { ...candleContext(spotCandles.slice(0, i + 1)), previousClose },
      snapshot: { ...snapshot, timestamp: candle.timestamp, spotPrice: candle.close, strikes },
    });
  }
  if (observations.length) await store.append(observations, now);
}

export async function captureOiSymbol(symbol: string, expiry?: string, now = Date.now()) {
  const key = `${symbol}:${expiry ?? "auto"}`;
  if (flights.has(key)) return flights.get(key);
  if (now - (lastAttempt.get(key) ?? 0) < 60_000) return;
  lastAttempt.set(key, now);
  const flight = (async () => {
    try {
      const result = await fetchCanonicalOptionChain({ underlying: symbol, expiry });
      let snap = result.snapshot;
      if (
        !result.ok ||
        !snap ||
        snap.provider !== "UPSTOX" ||
        snap.dataQuality !== "OK" ||
        !finite(snap.spotPrice) ||
        !snap.strikes.length
      ) {
        errors.set(key, "Verified Upstox chain unavailable; retained observations are historical.");
        return;
      }
      // The canonical adapter reports UNKNOWN; resolve exchange state without modifying that adapter.
      snap = { ...snap, marketSession: (await exchangeOpen(symbol, now)) ? "OPEN" : "CLOSED" };
      latest.set(key, snap);
      const instrument = resolveOptionChainInstrumentKey(symbol);
      const prices = instrument ? await candles(instrument, now) : [];
      const context = candleContext(prices);
      if (instrument) {
        const quotes = await http.request<{
          data?: Record<
            string,
            {
              instrument_token?: string;
              last_price?: number;
              net_change?: number;
              ohlc?: { open?: number; high?: number; low?: number };
            }
          >;
        }>({ path: "v2/market-quote/quotes", query: { instrument_key: instrument } });
        const quote = quotes.ok
          ? Object.values(quotes.data?.data ?? {}).find((q) => q.instrument_token === instrument)
          : undefined;
        if (finite(quote?.last_price) && finite(quote?.net_change))
          context.previousClose = quote.last_price - quote.net_change;
        if (finite(quote?.ohlc?.open)) context.open = quote.ohlc.open;
        if (finite(quote?.ohlc?.high)) context.high = quote.ohlc.high;
        if (finite(quote?.ohlc?.low)) context.low = quote.ohlc.low;
      }
      errors.delete(key);
      priceHistory.set(key, { prices, context });
      // Holidays/closed sessions cannot be fabricated into intraday captures.
      if (
        scannerMarketHours(now) &&
        snap.marketSession === "OPEN" &&
        oiSession(snap.timestamp).date === oiSession(now).date &&
        Math.abs(now - Date.parse(snap.timestamp)) <= 90_000
      ) {
        await store.append(
          [{ snapshot: { ...snap, strikes: nearAtm(snap).strikes }, context, source: "CAPTURED" }],
          now,
        );
      }
    } catch {
      errors.set(key, "Upstox collection failed; retrying on the next minute.");
    }
  })().finally(() => flights.delete(key));
  flights.set(key, flight);
  return flight;
}

export async function getOiScanner(
  symbol: string,
  expiry: string | undefined,
  interval: OiInterval,
) {
  await store.load();
  await captureOiSymbol(symbol, expiry);
  const now = Date.now();
  const observations = store.get(symbol, expiry, now);
  const key = `${symbol}:${expiry ?? "auto"}`;
  const snap = latest.get(key);
  const historyKey = `${oiSession(now).date}:${symbol}:${snap?.expiry}`;
  const history = priceHistory.get(key);
  if (
    snap &&
    history?.prices.length &&
    oiSession(snap.timestamp).date === oiSession(now).date &&
    now - (historyAttempt.get(historyKey) ?? 0) >= 300_000 &&
    !historyFlights.has(historyKey)
  ) {
    historyAttempt.set(historyKey, now);
    const pending = historyQueue
      .then(() => reconstruct(snap, history.prices, now, history.context.previousClose))
      .catch(() => {
        errors.set(key, "Historical OI backfill incomplete; missing minutes remain gaps.");
      });
    historyQueue = pending;
    historyFlights.set(historyKey, pending);
    void pending.finally(() => historyFlights.delete(historyKey));
  }
  const current = observations.at(-1);
  return {
    now,
    symbol,
    expiry: current?.snapshot.expiry ?? snap?.expiry ?? expiry ?? null,
    expiries: snap?.availableExpiries ?? [],
    rows: computeOiRows(observations, interval),
    context: current?.context ?? emptyContext(),
    error: errors.get(key) ?? null,
    persistenceError: store.error,
    backfilling: [...historyFlights.keys()].some((k) =>
      k.startsWith(`${oiSession(now).date}:${symbol}:`),
    ),
    marketOpen: scannerMarketHours(now) && snap?.marketSession === "OPEN",
  };
}

let collecting = false;
export async function collectOiSession(now = Date.now()) {
  if (collecting || !scannerMarketHours(now)) return;
  collecting = true;
  try {
    for (const symbol of OI_SYMBOLS) await captureOiSymbol(symbol);
  } finally {
    collecting = false;
  }
}
