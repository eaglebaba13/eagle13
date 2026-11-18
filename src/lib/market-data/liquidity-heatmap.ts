import type { OptionChainSnapshot } from "../option-chain/types";

export type HeatmapAsset = "NIFTY50" | "BANKNIFTY" | "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
export const HEATMAP_ASSETS: readonly HeatmapAsset[] = ["NIFTY50", "BANKNIFTY", "BTCUSDT", "ETHUSDT", "SOLUSDT"];
export function isHeatmapAsset(value: string): value is HeatmapAsset { return HEATMAP_ASSETS.includes(value as HeatmapAsset); }
export type HeatmapSource = "UPSTOX_OI" | "BINANCE_DEPTH";
export interface LiquidityLevel { timestamp: number; price: number; intensity: number; bid: number; ask: number; gex: number | null }
export interface LiquiditySnapshot { asset: HeatmapAsset; source: HeatmapSource; timestamp: number; spot: number | null; expiry: string | null; maxPain: number | null; levels: LiquidityLevel[] }

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
export function normalizeDepth(asset: HeatmapAsset, raw: { bids?: unknown; asks?: unknown }, timestamp: number): LiquiditySnapshot {
  const levels = new Map<number, LiquidityLevel>();
  for (const [side, rows] of [["bid", raw.bids], ["ask", raw.asks]] as const) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const price = Number(row[0]); const quantity = Number(row[1]);
      if (!finite(price) || price <= 0 || !finite(quantity) || quantity <= 0) continue;
      const value = price * quantity;
      const prev = levels.get(price) ?? { timestamp, price, intensity: 0, bid: 0, ask: 0, gex: null };
      levels.set(price, { ...prev, intensity: prev.intensity + value, [side]: prev[side] + value });
    }
  }
  const bids = [...levels.values()].filter((row) => row.bid > 0).map((row) => row.price);
  const asks = [...levels.values()].filter((row) => row.ask > 0).map((row) => row.price);
  const spot = bids.length && asks.length ? (Math.max(...bids) + Math.min(...asks)) / 2 : null;
  return { asset, source: "BINANCE_DEPTH", timestamp, spot, expiry: null, maxPain: null, levels: [...levels.values()].sort((a, b) => a.price - b.price) };
}

export function normalizeOptionChain(asset: "NIFTY50" | "BANKNIFTY", snapshot: OptionChainSnapshot): LiquiditySnapshot {
  const timestamp = Date.parse(snapshot.timestamp);
  const spot = finite(snapshot.spotPrice) && snapshot.spotPrice > 0 ? snapshot.spotPrice : null;
  const strikes = snapshot.strikes.filter((s) => finite(s.strike) && s.strike > 0);
  const levels = strikes.map((s) => {
    const call = finite(s.call.oi) && s.call.oi > 0 ? s.call.oi : 0;
    const put = finite(s.put.oi) && s.put.oi > 0 ? s.put.oi : 0;
    const cg = s.call.greeks?.gamma; const pg = s.put.greeks?.gamma;
    const gex = spot != null && (finite(cg) || finite(pg)) ? ((finite(cg) ? cg : 0) * call - (finite(pg) ? pg : 0) * put) * spot * spot : null;
    return { timestamp, price: s.strike, intensity: call + put, bid: put, ask: call, gex };
  }).sort((a, b) => a.price - b.price);
  // Total expiry payout at each listed strike; the minimum is max pain.
  const maxPain = levels.length ? levels.reduce((best, candidate) => {
    const payout = levels.reduce((sum, level) => sum + Math.max(0, candidate.price - level.price) * level.ask + Math.max(0, level.price - candidate.price) * level.bid, 0);
    return payout < best.payout ? { price: candidate.price, payout } : best;
  }, { price: levels[0].price, payout: Infinity }).price : null;
  return { asset, source: "UPSTOX_OI", timestamp, spot, expiry: snapshot.expiry, maxPain, levels };
}

const palettes = {
  institutional: ["#090514", "#1e1b4b", "#10b981", "#06b6d4", "#f59e0b"],
  contrast: ["#090514", "#312e81", "#0891b2", "#f59e0b", "#fef3c7"],
} as const;
export type HeatmapPalette = keyof typeof palettes;
export function heatmapColor(ratio: number, palette: HeatmapPalette = "institutional"): string {
  const colors = palettes[palette];
  const scaled = Math.max(0, Math.min(1, finite(ratio) ? ratio : 0)) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled)); const fraction = scaled - index;
  const a = colors[index]; const b = colors[index + 1];
  return `#${[1, 3, 5].map((offset) => Math.round(parseInt(a.slice(offset, offset + 2), 16) * (1 - fraction) + parseInt(b.slice(offset, offset + 2), 16) * fraction).toString(16).padStart(2, "0")).join("")}`;
}
