// Phase 3F — Symbol classification and normalization for CoinDCX.
// Pure — no I/O. Deterministic. Consumed by discovery + adapter.

import type { CoindcxAssetClass, CoindcxMarket, CoindcxMarketStatus } from "./types";

/** Canonical crypto majors surfaced to the UI (see Phase 3F requirements). */
export const CRYPTO_MAJOR_BASES: readonly string[] = [
  "BTC",
  "ETH",
  "SOL",
  "XRP",
] as const;

/**
 * Tokenized-metal bases. These are ERC-20 style representations that TRACK
 * spot metals — they are NOT the physical instrument and NOT the Gold/Silver
 * consumed by the trading formulas. They are surfaced as reference data
 * only, with a "TOKENIZED — NOT PHYSICAL" disclaimer in the UI.
 *
 * PAXG → Paxos Gold, XAUT → Tether Gold, KAG → tokenized silver variants.
 * If a symbol lands here it never becomes the canonical Gold/Silver source.
 */
export const TOKENIZED_METAL_MAP: Readonly<Record<string, "GOLD" | "SILVER">> = {
  PAXG: "GOLD",
  XAUT: "GOLD",
  KAG: "SILVER",
  DGX: "GOLD",
} as const;

export function classifyBase(base: string): CoindcxAssetClass {
  const b = base.toUpperCase();
  if (CRYPTO_MAJOR_BASES.includes(b)) return "CRYPTO_MAJOR";
  if (b in TOKENIZED_METAL_MAP) return "TOKENIZED_METAL";
  return "OTHER";
}

export function linkedUnderlyingFor(base: string): "GOLD" | "SILVER" | null {
  const b = base.toUpperCase();
  return TOKENIZED_METAL_MAP[b] ?? null;
}

export function normalizeStatus(raw: unknown): CoindcxMarketStatus {
  if (typeof raw !== "string") return "UNKNOWN";
  const s = raw.trim().toLowerCase();
  if (s === "active" || s === "enabled") return "ACTIVE";
  if (s === "inactive" || s === "disabled") return "INACTIVE";
  if (s === "suspended" || s === "paused") return "SUSPENDED";
  return "UNKNOWN";
}

/**
 * Filter that the CoinDCX admin/UI surfaces expose. We only surface the
 * pairs users care about: crypto majors AND tokenized metals — never every
 * altcoin/meme pair. This keeps output deterministic and small.
 */
export function isSurfacedMarket(m: CoindcxMarket): boolean {
  if (m.assetClass === "OTHER") return false;
  return m.status !== "SUSPENDED";
}

/** Sort helper: crypto majors first (in declared order), then tokenized metals. */
export function marketSortKey(m: CoindcxMarket): [number, number, string] {
  const classRank = m.assetClass === "CRYPTO_MAJOR" ? 0 : m.assetClass === "TOKENIZED_METAL" ? 1 : 2;
  const baseRank = m.assetClass === "CRYPTO_MAJOR"
    ? CRYPTO_MAJOR_BASES.indexOf(m.base.toUpperCase())
    : 100;
  return [classRank, baseRank, m.pair];
}
