// Phase 3F.1 — Pure selectors shared by dashboard crypto widgets.
// Market-data only. No trading, no side effects. Reused across widgets
// so all consumers share a single query result (see coindcx-markets key).

import type { CoindcxMarketSnapshot } from "./types";

/** Default watchlist tickers rendered by every crypto dashboard widget. */
export const DEFAULT_CRYPTO_WATCHLIST: readonly string[] = ["BTC", "ETH", "SOL", "XRP"];

/** Preferred quote currency (USDT first, then INR fallback). */
const QUOTE_PREFERENCE: readonly string[] = ["USDT", "INR"];

export type CryptoWidgetRow = {
  readonly base: string;
  readonly pair: string;
  readonly quote: string;
  readonly last: number | null;
  readonly change24hAbs: number | null;
  readonly change24hPct: number | null;
  readonly volume24h: number | null;
  readonly high24h: number | null;
  readonly low24h: number | null;
  readonly status: "LIVE" | "DELAYED" | "OFFLINE" | "UNAVAILABLE";
  readonly ageSec: number | null;
  readonly linkedUnderlying: "GOLD" | "SILVER" | null;
};

function pickSnapshot(
  snapshots: readonly CoindcxMarketSnapshot[],
  base: string,
): CoindcxMarketSnapshot | null {
  for (const q of QUOTE_PREFERENCE) {
    const found = snapshots.find(
      (s) => s.market.base === base && s.market.quote === q,
    );
    if (found) return found;
  }
  return snapshots.find((s) => s.market.base === base) ?? null;
}

function classifyStatus(snap: CoindcxMarketSnapshot | null): CryptoWidgetRow["status"] {
  if (!snap) return "UNAVAILABLE";
  switch (snap.meta.status) {
    case "LIVE":
      return "LIVE";
    case "DELAYED":
      return "DELAYED";
    case "STALE":
    case "UNAVAILABLE":
    case "TRADING_DISABLED":
    default:
      return snap.ticker ? "DELAYED" : "OFFLINE";
  }
}

/** Build a widget row for a base symbol (missing snapshot → UNAVAILABLE). */
export function buildCryptoRow(
  snapshots: readonly CoindcxMarketSnapshot[],
  base: string,
): CryptoWidgetRow {
  const snap = pickSnapshot(snapshots, base);
  const ticker = snap?.ticker ?? null;
  const last = ticker?.last ?? null;
  const pct = ticker?.change24hPct ?? null;
  const abs =
    last != null && pct != null ? (last * pct) / (100 + pct) : null;
  return {
    base,
    pair: snap?.market.pair ?? base,
    quote: snap?.market.quote ?? "—",
    last,
    change24hAbs: abs,
    change24hPct: pct,
    volume24h: ticker?.volume24h ?? null,
    high24h: ticker?.high24h ?? null,
    low24h: ticker?.low24h ?? null,
    status: classifyStatus(snap),
    ageSec: snap?.meta.ageSec ?? null,
    linkedUnderlying: snap?.market.linkedUnderlying ?? null,
  };
}

export function buildWatchlist(
  snapshots: readonly CoindcxMarketSnapshot[],
  bases: readonly string[] = DEFAULT_CRYPTO_WATCHLIST,
): CryptoWidgetRow[] {
  return bases.map((b) => buildCryptoRow(snapshots, b));
}

/** Tokenized metals — only returned when the provider actually supplies them. */
export function findTokenizedMetals(
  snapshots: readonly CoindcxMarketSnapshot[],
): { gold: CryptoWidgetRow | null; silver: CryptoWidgetRow | null } {
  const goldSnap =
    snapshots.find(
      (s) =>
        s.market.assetClass === "TOKENIZED_METAL" &&
        s.market.linkedUnderlying === "GOLD",
    ) ?? null;
  const silverSnap =
    snapshots.find(
      (s) =>
        s.market.assetClass === "TOKENIZED_METAL" &&
        s.market.linkedUnderlying === "SILVER",
    ) ?? null;
  const toRow = (snap: CoindcxMarketSnapshot | null): CryptoWidgetRow | null => {
    if (!snap) return null;
    return buildCryptoRow([snap], snap.market.base);
  };
  return { gold: toRow(goldSnap), silver: toRow(silverSnap) };
}

export type CryptoDashboardSummary = {
  readonly total: number;
  readonly gainers: number;
  readonly losers: number;
  readonly flat: number;
  readonly avgChangePct: number | null;
  readonly bestPerformer: CryptoWidgetRow | null;
  readonly worstPerformer: CryptoWidgetRow | null;
  readonly worstStatus: CryptoWidgetRow["status"];
};

const STATUS_RANK: Record<CryptoWidgetRow["status"], number> = {
  LIVE: 0,
  DELAYED: 1,
  OFFLINE: 2,
  UNAVAILABLE: 3,
};

export function summarizeCrypto(rows: readonly CryptoWidgetRow[]): CryptoDashboardSummary {
  const known = rows.filter((r) => r.change24hPct != null);
  const gainers = known.filter((r) => (r.change24hPct ?? 0) > 0).length;
  const losers = known.filter((r) => (r.change24hPct ?? 0) < 0).length;
  const flat = known.length - gainers - losers;
  const avg =
    known.length === 0
      ? null
      : known.reduce((s, r) => s + (r.change24hPct ?? 0), 0) / known.length;
  let best: CryptoWidgetRow | null = null;
  let worst: CryptoWidgetRow | null = null;
  for (const r of known) {
    if (!best || (r.change24hPct ?? -Infinity) > (best.change24hPct ?? -Infinity)) best = r;
    if (!worst || (r.change24hPct ?? Infinity) < (worst.change24hPct ?? Infinity)) worst = r;
  }
  const worstStatus = rows.reduce<CryptoWidgetRow["status"]>(
    (acc, r) => (STATUS_RANK[r.status] > STATUS_RANK[acc] ? r.status : acc),
    "LIVE",
  );
  return {
    total: rows.length,
    gainers,
    losers,
    flat,
    avgChangePct: avg,
    bestPerformer: best,
    worstPerformer: worst,
    worstStatus: rows.length === 0 ? "UNAVAILABLE" : worstStatus,
  };
}
