// Phase 2I-D — Pure scheduler decisions for Gann Gap Outlook.
// Determines whether the current instant should trigger a freeze or an
// outcome evaluation. No side effects. No formula changes.

import { resolveLifecycle, WEEKEND_ONLY_CALENDAR, toIstParts, type TradingCalendar } from "./session-clock";
import type { GannGapConfig } from "./config";

export type SchedulerAction =
  | "FREEZE_NOW"
  | "EVALUATE_OUTCOME_NOW"
  | "IDLE_PENDING"
  | "IDLE_NON_TRADING_DAY"
  | "IDLE_AFTER_FREEZE";

export interface SchedulerDecisionInput {
  readonly now: Date;
  readonly config: GannGapConfig;
  readonly calendar?: TradingCalendar;
  /** Whether a frozen prediction already exists for today's session. */
  readonly hasFrozenForToday: boolean;
  /** Whether the outcome for yesterday's frozen prediction is already evaluated. */
  readonly hasOutcomeForPending: boolean;
  /** IST hour after which an outcome evaluation is meaningful (typically 09:16). */
  readonly outcomeEvalStartHourIst?: number;
}

export interface SchedulerDecision {
  readonly action: SchedulerAction;
  readonly istDate: string;
  readonly reason: string;
}

export function decideSchedulerAction(input: SchedulerDecisionInput): SchedulerDecision {
  const cal = input.calendar ?? WEEKEND_ONLY_CALENDAR;
  const lifecycle = resolveLifecycle({ now: input.now, config: input.config, calendar: cal });
  const { hour } = toIstParts(input.now);
  const outcomeHour = input.outcomeEvalStartHourIst ?? 9;

  if (!lifecycle.isTradingDay) {
    if (!input.hasOutcomeForPending && hour >= outcomeHour) {
      return { action: "EVALUATE_OUTCOME_NOW", istDate: lifecycle.istDate, reason: "Non-trading day — evaluate pending outcome if next-session open available" };
    }
    return { action: "IDLE_NON_TRADING_DAY", istDate: lifecycle.istDate, reason: lifecycle.reason };
  }

  // Evaluate previous session's outcome as soon as market open is available.
  if (!input.hasOutcomeForPending && hour >= outcomeHour) {
    return { action: "EVALUATE_OUTCOME_NOW", istDate: lifecycle.istDate, reason: "Trading day open — evaluate pending prior-session outcome" };
  }

  if (lifecycle.lifecycle === "PENDING") {
    return { action: "IDLE_PENDING", istDate: lifecycle.istDate, reason: lifecycle.reason };
  }

  if (lifecycle.lifecycle === "EVAL" && !input.hasFrozenForToday) {
    return { action: "FREEZE_NOW", istDate: lifecycle.istDate, reason: "Signal cutoff reached — freeze prediction" };
  }

  return { action: "IDLE_AFTER_FREEZE", istDate: lifecycle.istDate, reason: "Already frozen for this session" };
}
