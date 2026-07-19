// Phase 3F.2A — Selector: turn CoinDCX tokenized-metal snapshots into
// GoldSilverRatioInput. Deterministic. No side effects.

import type { CoindcxMarketSnapshot } from "@/lib/providers/coindcx/types";
import type { GoldSilverRatioInput, MetalFreshness, MetalQuoteInput } from "./types";
import { troyOuncesForToken } from "./gold-silver-ratio";

function toMetalFreshness(status: string): MetalFreshness {
  switch (status) {
    case "LIVE":
      return "LIVE";
    case "DELAYED":
      return "DELAYED";
    case "STALE":
      return "STALE";
    default:
      return "UNAVAILABLE";
  }
}

function toQuote(
  snap: CoindcxMarketSnapshot | null,
  side: "GOLD" | "SILVER",
): MetalQuoteInput | null {
  if (!snap || !snap.ticker) return null;
  const troyOz = troyOuncesForToken(snap.market.base);
  return {
    instrument: snap.market.pair,
    classification: side === "GOLD" ? "TOKENIZED_GOLD" : "TOKENIZED_SILVER",
    price: snap.ticker.last,
    quoteCurrency: snap.market.quote,
    troyOuncesPerUnit: troyOz,
    timestamp: snap.ticker.timestamp,
    freshness: toMetalFreshness(snap.meta.status),
  };
}

/** Pick preferred tokenized metal for each side, matching quote currency. */
export function buildGoldSilverInput(
  snapshots: readonly CoindcxMarketSnapshot[],
): GoldSilverRatioInput {
  const golds = snapshots.filter(
    (s) =>
      s.market.assetClass === "TOKENIZED_METAL" &&
      s.market.linkedUnderlying === "GOLD" &&
      s.ticker != null,
  );
  const silvers = snapshots.filter(
    (s) =>
      s.market.assetClass === "TOKENIZED_METAL" &&
      s.market.linkedUnderlying === "SILVER" &&
      s.ticker != null,
  );
  // Prefer USDT-quoted pairs so quote currencies align.
  const preferQuote = (arr: CoindcxMarketSnapshot[]) =>
    arr.find((s) => s.market.quote === "USDT") ?? arr[0] ?? null;
  const gold = toQuote(preferQuote(golds), "GOLD");
  const silver = toQuote(preferQuote(silvers), "SILVER");
  // If both exist but quote currencies differ, try to align them.
  if (gold && silver && gold.quoteCurrency !== silver.quoteCurrency) {
    const alignedSilver = silvers.find(
      (s) => s.market.quote === gold.quoteCurrency,
    );
    if (alignedSilver) return { gold, silver: toQuote(alignedSilver, "SILVER") };
    const alignedGold = golds.find(
      (s) => s.market.quote === silver.quoteCurrency,
    );
    if (alignedGold) return { gold: toQuote(alignedGold, "GOLD"), silver };
  }
  return { gold, silver };
}