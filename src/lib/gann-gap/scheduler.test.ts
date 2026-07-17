import { describe, it, expect } from "vitest";
import { decideSchedulerAction } from "./scheduler";
import { DEFAULT_GANN_GAP_CONFIG } from "./config";

// Build a Date at a given IST hour/minute on a weekday (2024-01-03 = Wed).
function istInstant(dateIst: string, hour: number, minute: number): Date {
  // IST=UTC+05:30
  const [y, m, d] = dateIst.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - 5, minute - 30));
}

describe("gann-gap scheduler", () => {
  const cfg = DEFAULT_GANN_GAP_CONFIG;

  it("returns IDLE_PENDING before the 15:26 cutoff", () => {
    const d = decideSchedulerAction({
      now: istInstant("2024-01-03", 10, 0), config: cfg,
      hasFrozenForToday: false, hasOutcomeForPending: true,
    });
    expect(d.action).toBe("IDLE_PENDING");
  });

  it("returns FREEZE_NOW at cutoff when no frozen record yet", () => {
    const d = decideSchedulerAction({
      now: istInstant("2024-01-03", 15, 26), config: cfg,
      hasFrozenForToday: false, hasOutcomeForPending: true,
    });
    expect(d.action).toBe("FREEZE_NOW");
  });

  it("returns IDLE_AFTER_FREEZE after freeze completes", () => {
    const d = decideSchedulerAction({
      now: istInstant("2024-01-03", 15, 30), config: cfg,
      hasFrozenForToday: true, hasOutcomeForPending: true,
    });
    expect(d.action).toBe("IDLE_AFTER_FREEZE");
  });

  it("returns EVALUATE_OUTCOME_NOW after market open when outcome pending", () => {
    const d = decideSchedulerAction({
      now: istInstant("2024-01-03", 9, 30), config: cfg,
      hasFrozenForToday: false, hasOutcomeForPending: false,
    });
    expect(d.action).toBe("EVALUATE_OUTCOME_NOW");
  });

  it("returns IDLE_NON_TRADING_DAY on weekends when outcome resolved", () => {
    const d = decideSchedulerAction({
      now: istInstant("2024-01-06", 15, 30), config: cfg, // Saturday
      hasFrozenForToday: false, hasOutcomeForPending: true,
    });
    expect(d.action).toBe("IDLE_NON_TRADING_DAY");
  });
});
