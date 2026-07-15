// Phase 21.2 · Stage 3 — trusted 09:15 IST session anchor + previous-session
// close helpers for the Absolute-Degree Intraday snapshot. Pure/deterministic.
// India Standard Time = UTC+05:30 year-round (no DST).

export type InstrumentSymbol = "NIFTY50" | "BANKNIFTY";

export type SnapshotStatus =
  | "PREVIEW"
  | "LOCKED"
  | "HISTORICAL_LOCKED"
  | "NO_TRADING_SESSION";

export type SessionAnchor = {
  tradingDate: string; // YYYY-MM-DD (IST)
  anchorIst: string; // e.g. "2026-07-15T09:15:00+05:30"
  anchorUtc: string; // ISO Z
  anchorDate: Date; // Date object representing the anchor moment
  isTradingDay: boolean;
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Return YYYY-MM-DD for a Date rendered in IST. */
export function istDateString(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD as an IST-anchored 09:15:00 wall clock, return a UTC Date. */
export function parseIstDateAt0915(tradingDate: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tradingDate)) {
    throw new Error(`Invalid tradingDate (want YYYY-MM-DD): ${tradingDate}`);
  }
  // 09:15 IST = 03:45:00 UTC.
  return new Date(`${tradingDate}T03:45:00.000Z`);
}

function dayOfWeekIst(tradingDate: string): number {
  // 0=Sun … 6=Sat. Anchor at noon IST to sidestep any DST edge (India has none,
  // but keep the helper defensive).
  const d = new Date(`${tradingDate}T06:30:00.000Z`);
  return d.getUTCDay();
}

export function isWeekendIst(tradingDate: string): boolean {
  const dow = dayOfWeekIst(tradingDate);
  return dow === 0 || dow === 6;
}

function shiftDays(tradingDate: string, days: number): string {
  const base = new Date(`${tradingDate}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * Trusted 09:15 IST anchor. Rejects unsupported instruments and reports
 * weekend classification so callers can short-circuit to NO_TRADING_SESSION.
 */
export function getTradingSessionAnchor(
  tradingDate: string,
  instrument: InstrumentSymbol,
): SessionAnchor {
  if (instrument !== "NIFTY50" && instrument !== "BANKNIFTY") {
    throw new Error(`Unsupported instrument for intraday anchor: ${instrument}`);
  }
  const anchorDate = parseIstDateAt0915(tradingDate);
  return {
    tradingDate,
    anchorIst: `${tradingDate}T09:15:00+05:30`,
    anchorUtc: anchorDate.toISOString(),
    anchorDate,
    isTradingDay: !isWeekendIst(tradingDate),
  };
}

/** Walk backwards from `tradingDate` skipping weekends. */
export function previousTradingDate(tradingDate: string): string {
  let d = shiftDays(tradingDate, -1);
  while (isWeekendIst(d)) d = shiftDays(d, -1);
  return d;
}

export function todayIst(now: Date = new Date()): string {
  return istDateString(now);
}

/** Determine snapshot status given a trading date and current instant. */
export function computeSnapshotStatus(
  tradingDate: string,
  now: Date = new Date(),
): SnapshotStatus {
  if (isWeekendIst(tradingDate)) return "NO_TRADING_SESSION";
  const today = todayIst(now);
  if (tradingDate < today) return "HISTORICAL_LOCKED";
  if (tradingDate > today) return "PREVIEW";
  // Same IST day: PREVIEW before 09:15 IST, LOCKED at/after.
  const anchor = parseIstDateAt0915(tradingDate);
  return now.getTime() >= anchor.getTime() ? "LOCKED" : "PREVIEW";
}