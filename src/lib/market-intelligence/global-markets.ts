// Phase 44C — Global market cohort normalization + contribution weighting.
import type { GlobalMarketRow, GlobalMarketSection } from "./types";

export const GLOBAL_MARKET_UNIVERSE: ReadonlyArray<{ symbol: string; label: string }> = [
  { symbol: "GIFT_NIFTY", label: "GIFT NIFTY" },
  { symbol: "N225", label: "Nikkei 225" },
  { symbol: "HSI", label: "Hang Seng" },
  { symbol: "SSEC", label: "Shanghai Composite" },
  { symbol: "FTSE", label: "FTSE 100" },
  { symbol: "GDAXI", label: "DAX" },
  { symbol: "FCHI", label: "CAC 40" },
  { symbol: "YM=F", label: "Dow Futures" },
  { symbol: "NQ=F", label: "Nasdaq Futures" },
  { symbol: "ES=F", label: "S&P Futures" },
];

export interface GlobalMarketInput {
  readonly symbol: string;
  readonly label?: string;
  readonly last: number | null;
  readonly change: number | null;
  readonly changePct: number | null;
  readonly status?: GlobalMarketRow["status"];
}

export function aggregateGlobalMarkets(
  inputs: readonly GlobalMarketInput[],
): GlobalMarketSection {
  const total = inputs.reduce(
    (s, r) => s + (r.changePct != null && Number.isFinite(r.changePct) ? Math.abs(r.changePct) : 0),
    0,
  );
  const rows: GlobalMarketRow[] = inputs.map((r) => {
    const known = GLOBAL_MARKET_UNIVERSE.find((u) => u.symbol === r.symbol);
    const contribution =
      total > 0 && r.changePct != null && Number.isFinite(r.changePct)
        ? Math.abs(r.changePct) / total
        : null;
    return {
      symbol: r.symbol,
      label: r.label ?? known?.label ?? r.symbol,
      last: r.last,
      change: r.change,
      changePct: r.changePct,
      status: r.status ?? "UNKNOWN",
      contributionPct: contribution,
    };
  });
  const valid = rows.filter((r) => r.changePct != null && Number.isFinite(r.changePct));
  const composite = valid.length
    ? valid.reduce(
        (s, r) =>
          s +
          Math.sign(r.changePct as number) *
            Math.min(Math.abs(r.changePct as number), 5),
        0,
      ) /
      (valid.length * 5)
    : 0;
  return { rows, compositeBiasPct: clamp(composite, -1, 1) };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}