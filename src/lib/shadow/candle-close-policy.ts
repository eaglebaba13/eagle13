// Phase 23 · Stage 2 — Closed-candle detection. Pure, deterministic.
// Only CLOSED_VALID can advance the shadow orchestrator.

import type { ShadowClosedCandle } from "./shadow-types";

export type CandleCloseStatus =
  | "CLOSED_VALID"
  | "OPEN_CANDLE"
  | "STALE_CANDLE"
  | "DUPLICATE_CANDLE"
  | "FUTURE_CANDLE"
  | "OUTSIDE_SESSION"
  | "DATA_INCOMPLETE";

export type CandleCloseResult = {
  readonly status: CandleCloseStatus;
  readonly reason?: string;
};

export type CandleClosePolicy = {
  readonly timeframe: string; // "1m","3m","5m","15m","1d"
  readonly gracePeriodSeconds: number;
  readonly staleAfterSeconds: number;
  readonly nowIso: string;
  readonly sessionOpenIso?: string;
  readonly sessionCloseIso?: string;
  readonly is247?: boolean;
  readonly lastAcceptedCandleDate?: string | null;
};

export function timeframeSeconds(tf: string): number {
  const m = /^(\d+)([mhd])$/i.exec(tf);
  if (!m) return 60;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  return u === "m" ? n * 60 : u === "h" ? n * 3600 : n * 86400;
}

export function classifyCandleClose(
  candle: ShadowClosedCandle | null,
  policy: CandleClosePolicy,
): CandleCloseResult {
  if (!candle) return { status: "DATA_INCOMPLETE", reason: "NO_CANDLE" };
  if (!candle.closed) return { status: "OPEN_CANDLE" };
  const now = Date.parse(policy.nowIso);
  const t = Date.parse(candle.date);
  if (!Number.isFinite(now) || !Number.isFinite(t))
    return { status: "DATA_INCOMPLETE", reason: "BAD_TIMESTAMP" };
  const tfSec = timeframeSeconds(policy.timeframe);
  const closeAtMs = t + tfSec * 1000;
  if (now < closeAtMs - policy.gracePeriodSeconds * 1000)
    return { status: "FUTURE_CANDLE" };
  if (now - closeAtMs > policy.staleAfterSeconds * 1000)
    return { status: "STALE_CANDLE" };
  if (policy.lastAcceptedCandleDate && policy.lastAcceptedCandleDate === candle.date)
    return { status: "DUPLICATE_CANDLE" };
  if (!policy.is247 && policy.sessionOpenIso && policy.sessionCloseIso) {
    const open = Date.parse(policy.sessionOpenIso);
    const close = Date.parse(policy.sessionCloseIso);
    if (Number.isFinite(open) && Number.isFinite(close)) {
      if (t < open || closeAtMs > close + policy.gracePeriodSeconds * 1000)
        return { status: "OUTSIDE_SESSION" };
    }
  }
  return { status: "CLOSED_VALID" };
}

// ---- Session policies -----------------------------------------------------

export type SessionPolicy = {
  readonly instrument: string;
  readonly timezone: string;
  readonly openHHMM: string;
  readonly closeHHMM: string;
  readonly is247: boolean;
  readonly entryWindow?: { openHHMM: string; closeHHMM: string };
  readonly sessionCloseExit: boolean;
};

export const SESSION_POLICIES: Readonly<Record<string, SessionPolicy>> = {
  NIFTY50: {
    instrument: "NIFTY50",
    timezone: "Asia/Kolkata",
    openHHMM: "09:15",
    closeHHMM: "15:30",
    is247: false,
    entryWindow: { openHHMM: "09:30", closeHHMM: "15:00" },
    sessionCloseExit: true,
  },
  BANKNIFTY: {
    instrument: "BANKNIFTY",
    timezone: "Asia/Kolkata",
    openHHMM: "09:15",
    closeHHMM: "15:30",
    is247: false,
    entryWindow: { openHHMM: "09:30", closeHHMM: "15:00" },
    sessionCloseExit: true,
  },
  BTC: {
    instrument: "BTC",
    timezone: "UTC",
    openHHMM: "00:00",
    closeHHMM: "23:59",
    is247: true,
    sessionCloseExit: false,
  },
  XAUUSD: {
    instrument: "XAUUSD",
    timezone: "UTC",
    openHHMM: "00:00",
    closeHHMM: "23:59",
    is247: false,
    sessionCloseExit: false,
  },
  CRUDEOIL: {
    instrument: "CRUDEOIL",
    timezone: "Asia/Kolkata",
    openHHMM: "09:00",
    closeHHMM: "23:30",
    is247: false,
    sessionCloseExit: true,
  },
  NATURALGAS: {
    instrument: "NATURALGAS",
    timezone: "Asia/Kolkata",
    openHHMM: "09:00",
    closeHHMM: "23:30",
    is247: false,
    sessionCloseExit: true,
  },
};

export function getSessionPolicy(instrument: string): SessionPolicy | null {
  return SESSION_POLICIES[instrument] ?? null;
}