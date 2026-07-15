import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { absoluteIntradayValidationSignal } from "./absolute-intraday-decision-adapter";
import type { IntradaySnapshot } from "./gann-intraday.functions";
import type { SessionSimulation } from "./gann-intraday-simulator";

describe("Phase 21.2 Stage 5 · Decision adapter isolation", () => {
  it("adapter file never imports the Decision Engine modules", () => {
    const src = readFileSync(
      new URL("./absolute-intraday-decision-adapter.ts", import.meta.url),
      "utf8",
    );
    expect(src).not.toMatch(/decision-engine/);
    expect(src).not.toMatch(/decision\.functions/);
  });

  it("returns WAIT + PARTIAL when no simulation is provided", () => {
    const snap = {
      status: "PREVIEW",
      rankedLevels: [{}],
    } as unknown as IntradaySnapshot;
    const sig = absoluteIntradayValidationSignal(snap, null);
    expect(sig.direction).toBe("WAIT");
    expect(sig.dataQuality).toBe("PARTIAL");
    expect(sig.labeledAs).toBe(
      "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION",
    );
  });

  it("returns MISSING when snapshot has no ranked levels", () => {
    const snap = {
      status: "NO_TRADING_SESSION",
      rankedLevels: [],
    } as unknown as IntradaySnapshot;
    const sig = absoluteIntradayValidationSignal(snap, null);
    expect(sig.dataQuality).toBe("MISSING");
  });

  it("selects the highest-grade approved cube setup", () => {
    const snap = {
      status: "LOCKED",
      rankedLevels: [{}],
    } as unknown as IntradaySnapshot;
    const sim = {
      perLevel: [
        {
          cube: {
            action: "BUY",
            cubeGrade: "C",
            conditionsAligned: 3,
            conditionsAvailable: 5,
            reasons: ["c-reason"],
          },
        },
        {
          cube: {
            action: "BUY",
            cubeGrade: "A",
            conditionsAligned: 5,
            conditionsAvailable: 5,
            reasons: ["a-reason"],
          },
        },
      ],
    } as unknown as SessionSimulation;
    const sig = absoluteIntradayValidationSignal(snap, sim);
    expect(sig.direction).toBe("BUY");
    expect(sig.grade).toBe("A");
    expect(sig.confidence).toBe(1);
    expect(sig.reasons).toContain("a-reason");
  });
});