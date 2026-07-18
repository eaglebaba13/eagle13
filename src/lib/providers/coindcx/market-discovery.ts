// Phase 3F — Deterministic parser for `markets_details` responses.
// Pure. No fetch. Server layer calls this on the JSON payload.

import type { CoindcxMarket } from "./types";
import {
  classifyBase,
  linkedUnderlyingFor,
  normalizeStatus,
  isSurfacedMarket,
  marketSortKey,
} from "./symbols";

function asNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Accepts the raw markets_details payload (array of records) and returns a
 * normalized market list. Unknown/missing fields never throw — they become
 * null and are noted in `notes`.
 */
export function parseMarketsDetails(raw: unknown): readonly CoindcxMarket[] {
  if (!Array.isArray(raw)) return [];
  const out: CoindcxMarket[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const base = asString(r.base_currency_short_name ?? r.target_currency_short_name ?? "").toUpperCase();
    const quote = asString(r.base_currency_short_name && r.target_currency_short_name
      ? r.base_currency_short_name
      : "").toUpperCase();
    // CoinDCX schema: `symbol` = pair; `target_currency_short_name` = base asset;
    // `base_currency_short_name` = quote asset.
    const target = asString(r.target_currency_short_name).toUpperCase();
    const quoteAsset = asString(r.base_currency_short_name).toUpperCase();
    const pair = asString(r.symbol) || asString(r.pair) || `${target}${quoteAsset}`;
    const resolvedBase = target || base;
    const resolvedQuote = quoteAsset || quote;
    if (!resolvedBase || !pair) continue;

    const assetClass = classifyBase(resolvedBase);
    const linked = assetClass === "TOKENIZED_METAL" ? linkedUnderlyingFor(resolvedBase) : null;
    const status = normalizeStatus(r.status);
    const notes: string[] = [];
    if (assetClass === "TOKENIZED_METAL") {
      notes.push("TOKENIZED — NOT PHYSICAL");
      notes.push("Reference-only. Not consumed by Gold/Silver formulas.");
    }

    out.push({
      pair,
      ecode: asString(r.ecode) || null,
      base: resolvedBase,
      quote: resolvedQuote,
      assetClass,
      status,
      minQuantity: asNumberOrNull(r.min_quantity),
      maxQuantity: asNumberOrNull(r.max_quantity),
      tickSize: asNumberOrNull(r.min_price ?? r.step),
      baseCurrencyPrecision: asNumberOrNull(r.base_currency_precision),
      targetCurrencyPrecision: asNumberOrNull(r.target_currency_precision),
      linkedUnderlying: linked,
      notes,
    });
  }
  const surfaced = out.filter(isSurfacedMarket);
  surfaced.sort((a, b) => {
    const [ac, ar, ap] = marketSortKey(a);
    const [bc, br, bp] = marketSortKey(b);
    if (ac !== bc) return ac - bc;
    if (ar !== br) return ar - br;
    return ap.localeCompare(bp);
  });
  return surfaced;
}

export function discoverySummary(markets: readonly CoindcxMarket[]): {
  readonly discoveredMarkets: number;
  readonly cryptoMajors: number;
  readonly tokenizedMetals: number;
} {
  let crypto = 0;
  let metal = 0;
  for (const m of markets) {
    if (m.assetClass === "CRYPTO_MAJOR") crypto++;
    else if (m.assetClass === "TOKENIZED_METAL") metal++;
  }
  return { discoveredMarkets: markets.length, cryptoMajors: crypto, tokenizedMetals: metal };
}
