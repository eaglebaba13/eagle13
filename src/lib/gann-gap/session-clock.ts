// Phase 2I-B — IST session clock for Gann Gap lifecycle.
//
// Pure. Determines lifecycle (PENDING | EVAL | FROZEN) from an instant
// and the configured 15:26 IST signal cutoff. Weekend-aware; if a real
// trading calendar is provided, holidays are respected. Never touches
// wall-clock outside of the injected `now` value.

import type { GannGapLifecycle } from "./types";
import type { GannGapConfig } from "./config";

const IST_OFFSET_MINUTES = 330; // UTC+05:30

export type TradingCalendar = {
  /** Returns true when the given IST date (YYYY-MM-DD) is a trading day. */
  isTradingDay(istDate: string): boolean;
  /** Next trading day (IST YYYY-MM-DD) strictly after the given IST date. */
  nextTradingDay(istDate: string): string;
};

/** Weekend-only default calendar. Unknown holidays fall through. */
function dayOfWeek(istDate: string): number {
  // Parse as UTC to avoid TZ shifting the day. 0=Sun..6=Sat.
  return new Date(`${istDate}T00:00:00Z`).getUTCDay();
}
function addDays(istDate: string, days: number): string {
  const d = new Date(`${istDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const WEEKEND_ONLY_CALENDAR: TradingCalendar = {
  isTradingDay(istDate: string) {
    const dow = dayOfWeek(istDate);
    return dow !== 0 && dow !== 6;
  },
  nextTradingDay(istDate: string) {
    let cur = istDate;
    for (let i = 0; i < 10; i++) {
      cur = addDays(cur, 1);
      if (WEEKEND_ONLY_CALENDAR.isTradingDay(cur)) return cur;
    }
    return cur;
  },
};

export function toIstParts(now: Date): {
  date: string;
  hour: number;
  minute: number;
} {
  const shifted = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  const date = shifted.toISOString().slice(0, 10);
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  return { date, hour, minute };
}

export interface LifecycleInput {
  readonly now: Date;
  readonly config: GannGapConfig;
  readonly calendar?: TradingCalendar;
  /** When true, treat the current IST date as already-frozen. */
  readonly forceFrozen?: boolean;
}

export interface LifecycleResult {
  readonly lifecycle: GannGapLifecycle;
  readonly istDate: string;
  readonly nextTradingDate: string;
  readonly reason: string;
  readonly isTradingDay: boolean;
}

export function resolveLifecycle(input: LifecycleInput): LifecycleResult {
  const cal = input.calendar ?? WEEKEND_ONLY_CALENDAR;
  const { date, hour, minute } = toIstParts(input.now);
  const cutoff = input.config.signalCutoffIst;
  const beforeCutoff =
    hour < cutoff.hour || (hour === cutoff.hour && minute < cutoff.minute);
  const isTradingDay = cal.isTradingDay(date);
  const nextTradingDate = cal.nextTradingDay(date);

  if (!isTradingDay) {
    return {
      lifecycle: "FROZEN",
      istDate: date,
      nextTradingDate,
      isTradingDay: false,
      reason: "Non-trading day — outlook frozen from prior session",
    };
  }
  if (input.forceFrozen) {
    return {
      lifecycle: "FROZEN",
      istDate: date,
      nextTradingDate,
      isTradingDay,
      reason: "Frozen record loaded from persistence",
    };
  }
  if (beforeCutoff) {
    return {
      lifecycle: "PENDING",
      istDate: date,
      nextTradingDate,
      isTradingDay,
      reason: `Waiting for ${String(cutoff.hour).padStart(2, "0")}:${String(cutoff.minute).padStart(2, "0")} IST signal cutoff`,
    };
  }
  return {
    lifecycle: "EVAL",
    istDate: date,
    nextTradingDate,
    isTradingDay,
    reason: "Signal cutoff reached — evaluating outlook",
  };
}