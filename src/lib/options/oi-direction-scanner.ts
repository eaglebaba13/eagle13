import type { OptionChainSnapshot, OptionChainStrike } from "../option-chain/types";

export const OI_SYMBOLS = [
  "NIFTY",
  "BANKNIFTY",
  "FINNIFTY",
  "MIDCPNIFTY",
  "SENSEX",
  "RELIANCE",
  "HDFCBANK",
  "ICICIBANK",
  "SBIN",
  "INFY",
  "TCS",
  "AXISBANK",
  "ITC",
  "LT",
  "TATAMOTORS",
] as const;
export const OI_WEIGHTS = {
  direction: 20,
  price: 20,
  pcr: 15,
  buildup: 15,
  walls: 10,
  vwap: 10,
  liquidity: 10,
} as const;
export type OiInterval = 1 | 3 | 5 | 15;
export type OiContext = {
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  vwap: number | null;
  priorHigh: number | null;
  priorLow: number | null;
};
export type OiObservation = {
  snapshot: OptionChainSnapshot;
  context: OiContext;
  source: "CAPTURED" | "CANDLE_HISTORY";
};
export type OiPillar = {
  key: keyof typeof OI_WEIGHTS;
  weight: number;
  points: number | null;
  reason: string;
};
export type OiRow = {
  timestamp: string;
  source: OiObservation["source"];
  spot: number | null;
  callChange: number | null;
  putChange: number | null;
  diff: number | null;
  momentum: number | null;
  direction: string;
  pcr: number | null;
  overallPcr: number | null;
  support: number | null;
  resistance: number | null;
  buildup: string;
  view: string;
  score: number;
  coverage: number;
  pillars: OiPillar[];
  straddle: number | null;
  atm: number | null;
  strikes: readonly OptionChainStrike[];
};
export const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export function oiSession(timestamp: string | number) {
  const wall = new Date(new Date(timestamp).getTime() + 19_800_000);
  return {
    date: wall.toISOString().slice(0, 10),
    minute: wall.getUTCHours() * 60 + wall.getUTCMinutes(),
    weekday: wall.getUTCDay(),
  };
}
export function oiMath(call: number | null, put: number | null, previousDiff: number | null) {
  const diff = finite(call) && finite(put) ? put - call : null;
  const momentum = finite(diff) && finite(previousDiff) ? diff - previousDiff : null;
  const pcr =
    finite(call) && finite(put) && call > 0 && put > 0
      ? Math.round((put / call) * 1000) / 1000
      : null;
  return { diff, momentum, pcr };
}
export function formatOi(value: number | null, compact = true): string {
  if (!finite(value)) return "—";
  if (compact && Math.abs(value) >= 1e7) return `${(value / 1e7).toFixed(2)} Cr`;
  if (compact && Math.abs(value) >= 1e5) return `${(value / 1e5).toFixed(2)} L`;
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
export function pcrRegime(pcr: number | null): string {
  return pcr == null
    ? "Unavailable: both OI changes must be positive"
    : pcr < 0.8
      ? "Call Dominance"
      : pcr < 0.98
        ? "Moderate Call"
        : pcr <= 1.02
          ? "Balanced"
          : pcr <= 1.2
            ? "Moderate Put"
            : "Strong Put Dominance";
}
export function nearAtm(snapshot: OptionChainSnapshot, depth = 10) {
  const sorted = snapshot.strikes.slice().sort((a, b) => a.strike - b.strike);
  if (!finite(snapshot.spotPrice) || !sorted.length)
    return { atm: null, strikes: [] as OptionChainStrike[] };
  const spot = snapshot.spotPrice;
  const index = sorted.reduce(
    (best, s, i) => (Math.abs(s.strike - spot) < Math.abs(sorted[best].strike - spot) ? i : best),
    0,
  );
  return {
    atm: sorted[index].strike,
    strikes: sorted.slice(Math.max(0, index - depth), index + depth + 1),
  };
}
function sum(
  strikes: readonly OptionChainStrike[],
  side: "call" | "put",
  field: "oi" | "changeOi",
) {
  return strikes.length && strikes.every((s) => finite(s[side][field]))
    ? strikes.reduce((n, s) => n + s[side][field]!, 0)
    : null;
}
function wall(strikes: readonly OptionChainStrike[], side: "call" | "put", spot: number | null) {
  if (!finite(spot)) return null;
  const candidates = strikes.filter(
    (s) =>
      (side === "put" ? s.strike <= spot : s.strike >= spot) &&
      finite(s[side].oi) &&
      finite(s[side].changeOi),
  );
  return (
    candidates.sort(
      (a, b) =>
        b[side].oi! +
          Math.max(0, b[side].changeOi!) -
          (a[side].oi! + Math.max(0, a[side].changeOi!)) || a.strike - b.strike,
    )[0]?.strike ?? null
  );
}
const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
export function computeOiRows(
  observations: readonly OiObservation[],
  interval: OiInterval = 1,
): OiRow[] {
  const buckets = new Map<string, OiObservation>();
  for (const o of [...observations].sort((a, b) =>
    a.snapshot.timestamp.localeCompare(b.snapshot.timestamp),
  )) {
    const s = oiSession(o.snapshot.timestamp);
    if (s.minute < 555 || s.minute > 930) continue;
    buckets.set(
      `${s.date}:${o.snapshot.instrument}:${o.snapshot.expiry}:${Math.floor((s.minute - 555) / interval)}`,
      o,
    );
  }
  const rows: OiRow[] = [];
  let previous: OiObservation | undefined;
  for (const o of buckets.values()) {
    const { snapshot: snap, context: c } = o;
    const { atm, strikes } = nearAtm(snap);
    const priorRow = rows.at(-1);
    const continuous =
      previous &&
      oiSession(previous.snapshot.timestamp).date === oiSession(snap.timestamp).date &&
      previous.snapshot.instrument === snap.instrument &&
      previous.snapshot.expiry === snap.expiry &&
      Date.parse(snap.timestamp) - Date.parse(previous.snapshot.timestamp) <=
        (interval + 1) * 60_000;
    // Reset acceleration on basket changes rather than reporting an ATM-roll artifact as direction.
    const priorStrikes = continuous
      ? strikes
          .map((s) => previous!.snapshot.strikes.find((p) => p.strike === s.strike))
          .filter((s): s is OptionChainStrike => !!s)
      : [];
    const comparable =
      continuous &&
      priorStrikes.length === strikes.length &&
      priorRow?.strikes.length === strikes.length &&
      priorRow.strikes.every((s, i) => s.strike === strikes[i].strike);
    const previousMath = comparable
      ? oiMath(sum(priorStrikes, "call", "changeOi"), sum(priorStrikes, "put", "changeOi"), null)
      : null;
    const callChange = sum(strikes, "call", "changeOi"),
      putChange = sum(strikes, "put", "changeOi");
    const { diff, momentum, pcr } = oiMath(callChange, putChange, previousMath?.diff ?? null);
    const callOi = sum(strikes, "call", "oi"),
      putOi = sum(strikes, "put", "oi");
    const overallPcr = callOi != null && callOi > 0 && putOi != null ? putOi / callOi : null;
    const priceDelta =
      comparable && finite(snap.spotPrice) && finite(previous!.snapshot.spotPrice)
        ? snap.spotPrice - previous!.snapshot.spotPrice!
        : null;
    const oldCall = sum(priorStrikes, "call", "oi"),
      oldPut = sum(priorStrikes, "put", "oi");
    const oiDelta =
      callOi != null && putOi != null && oldCall != null && oldPut != null
        ? callOi + putOi - oldCall - oldPut
        : null;
    const buildup =
      !finite(priceDelta) || !finite(oiDelta)
        ? "UNAVAILABLE"
        : priceDelta === 0 || oiDelta === 0
          ? "NEUTRAL"
          : priceDelta > 0
            ? oiDelta > 0
              ? "LONG BUILD-UP"
              : "SHORT COVERING"
            : oiDelta > 0
              ? "SHORT BUILD-UP"
              : "LONG UNWINDING";
    const support = wall(strikes, "put", snap.spotPrice),
      resistance = wall(strikes, "call", snap.spotPrice);
    const atmLeg = strikes.find((s) => s.strike === atm);
    const straddle =
      finite(atmLeg?.call.ltp) && finite(atmLeg?.put.ltp) ? atmLeg.call.ltp + atmLeg.put.ltp : null;
    const oldAtm = comparable
      ? previous!.snapshot.strikes.find((s) => s.strike === atm)
      : undefined;
    const oldStraddle =
      finite(oldAtm?.call.ltp) && finite(oldAtm?.put.ltp) ? oldAtm.call.ltp + oldAtm.put.ltp : null;
    const factors: OiPillar[] = [];
    const add = (key: keyof typeof OI_WEIGHTS, signal: number | null, reason: string) =>
      factors.push({
        key,
        weight: OI_WEIGHTS[key],
        points:
          signal == null
            ? null
            : Math.round(((Math.max(-1, Math.min(1, signal)) + 1) / 2) * OI_WEIGHTS[key] * 10) / 10,
        reason,
      });
    add(
      "direction",
      diff != null && momentum != null ? (sign(diff) + sign(momentum)) / 2 : null,
      "Mean of differential sign and acceleration sign; same strike basket required.",
    );
    add(
      "price",
      finite(c.open) && finite(snap.spotPrice) && priceDelta != null
        ? (sign(snap.spotPrice - c.open) + sign(priceDelta)) / 2
        : null,
      "Session-open bias and interval spot momentum.",
    );
    add(
      "pcr",
      pcr != null && overallPcr != null && comparable && priorRow?.pcr != null
        ? (sign(pcr - 1) + sign(pcr - priorRow.pcr) + sign(overallPcr - 1)) / 3
        : null,
      "Net PCR regime, PCR trend and aggregate OI PCR; divergence offsets conviction.",
    );
    const atmCeDelta =
      finite(atmLeg?.call.oi) && finite(oldAtm?.call.oi) ? atmLeg.call.oi - oldAtm.call.oi : null;
    const atmPeDelta =
      finite(atmLeg?.put.oi) && finite(oldAtm?.put.oi) ? atmLeg.put.oi - oldAtm.put.oi : null;
    add(
      "buildup",
      priceDelta != null && oiDelta != null && atmCeDelta != null && atmPeDelta != null
        ? (sign(priceDelta) + sign(atmPeDelta - atmCeDelta)) / 2
        : null,
      "Spot/OI quadrant with ATM put writing versus call unwinding confirmation.",
    );
    add(
      "walls",
      support != null && resistance != null && resistance > support && finite(snap.spotPrice)
        ? 1 - (2 * (snap.spotPrice - support)) / (resistance - support)
        : null,
      "Relative distance between put support and call resistance (OI + positive daily change).",
    );
    add(
      "vwap",
      finite(c.vwap) && finite(snap.spotPrice) ? sign(snap.spotPrice - c.vwap) : null,
      "Volume-weighted spot candles; unavailable for zero-volume index candles.",
    );
    const sweep =
      finite(snap.spotPrice) &&
      finite(c.priorLow) &&
      finite(c.low) &&
      c.low < c.priorLow &&
      snap.spotPrice > c.priorLow
        ? 1
        : finite(snap.spotPrice) &&
            finite(c.priorHigh) &&
            finite(c.high) &&
            c.high > c.priorHigh &&
            snap.spotPrice < c.priorHigh
          ? -1
          : 0;
    add(
      "liquidity",
      oldStraddle != null &&
        straddle != null &&
        priceDelta != null &&
        finite(c.priorHigh) &&
        finite(c.priorLow)
        ? (sweep + (straddle > oldStraddle ? sign(priceDelta) : 0)) / 2
        : null,
      "Prior-range sweep/reclaim plus same-strike straddle expansion; decay contributes neutral.",
    );
    const coverage = factors.reduce((n, p) => n + (p.points == null ? 0 : p.weight), 0);
    const score = Math.round(factors.reduce((n, p) => n + (p.points ?? p.weight / 2), 0));
    const view =
      coverage < 70
        ? "NEUTRAL"
        : diff != null && momentum != null && sign(diff) !== 0 && sign(momentum) === -sign(diff)
          ? "REVERSAL WATCH"
          : score >= 65
            ? "BULLISH"
            : score <= 35
              ? "BEARISH"
              : "NEUTRAL";
    rows.push({
      timestamp: snap.timestamp,
      source: o.source,
      spot: snap.spotPrice,
      callChange,
      putChange,
      diff,
      momentum,
      direction:
        momentum == null
          ? "BASELINE / GAP"
          : momentum > 0
            ? "▲ BULLISH SHIFT"
            : momentum < 0
              ? "▼ BEARISH SHIFT"
              : "UNCHANGED",
      pcr,
      overallPcr,
      support,
      resistance,
      buildup,
      view,
      score,
      coverage,
      pillars: factors,
      straddle,
      atm,
      strikes,
    });
    previous = o;
  }
  return rows;
}

export function oiTimeline(rows: readonly OiRow[], now: number, interval: OiInterval) {
  const s = oiSession(now);
  if (s.weekday === 0 || s.weekday === 6 || s.minute < 555) return [];
  const start = Date.parse(`${s.date}T09:15:00+05:30`);
  const buckets = new Map(
    rows
      .filter((r) => oiSession(r.timestamp).date === s.date)
      .map((r) => [Math.floor((Date.parse(r.timestamp) - start) / (interval * 60_000)), r]),
  );
  return Array.from(
    { length: Math.floor((Math.min(s.minute, 930) - 555) / interval) + 1 },
    (_, i) => ({
      timestamp: new Date(start + i * interval * 60_000).toISOString(),
      row: buckets.get(i) ?? null,
    }),
  );
}
