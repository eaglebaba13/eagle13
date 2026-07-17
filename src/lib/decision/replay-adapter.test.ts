import { describe, expect, it } from "vitest";
import { alignReplay, type ReplayObservation, type ReplayAlignmentContext } from "./replay-adapter";

const FV = "decision@1.0.0";
const ctx: ReplayAlignmentContext = {
  instrument: "NIFTY",
  formulaVersion: FV,
  minObservations: 3,
  expectedIntervalMs: 60_000,
};

function obs(over: Partial<ReplayObservation>): ReplayObservation {
  return {
    timestamp: over.timestamp ?? "2026-07-17T09:15:00Z",
    instrument: over.instrument ?? "NIFTY",
    session: over.session ?? "REGULAR",
    provider: over.provider ?? "UPSTOX",
    formulaVersion: over.formulaVersion ?? FV,
    snapshotId: over.snapshotId ?? "s1",
    state: over.state ?? "CE",
    confidence: over.confidence ?? 70,
    price: over.price ?? null,
    expiry: over.expiry ?? null,
  };
}

describe("alignReplay", () => {
  it("NO_DATA on empty input", () => {
    expect(alignReplay([], ctx).capability).toBe("NO_DATA");
  });

  it("rejects mixed sessions", () => {
    const r = alignReplay(
      [
        obs({ timestamp: "2026-07-17T09:00:00Z", session: "PREOPEN", snapshotId: "a" }),
        obs({ timestamp: "2026-07-17T09:15:00Z", session: "REGULAR", snapshotId: "b" }),
        obs({ timestamp: "2026-07-17T09:16:00Z", session: "REGULAR", snapshotId: "c" }),
      ],
      ctx,
    );
    expect(r.capability).toBe("MIXED_SESSIONS");
  });

  it("rejects mixed providers", () => {
    const r = alignReplay(
      [
        obs({ snapshotId: "a", provider: "UPSTOX" }),
        obs({ snapshotId: "b", provider: "NSE", timestamp: "2026-07-17T09:16:00Z" }),
        obs({ snapshotId: "c", timestamp: "2026-07-17T09:17:00Z" }),
      ],
      ctx,
    );
    expect(r.capability).toBe("MIXED_PROVIDERS");
  });

  it("rejects formula-version mismatch", () => {
    const r = alignReplay(
      [
        obs({ snapshotId: "a", formulaVersion: "decision@0.9.0" }),
        obs({ snapshotId: "b", formulaVersion: "decision@0.9.0", timestamp: "2026-07-17T09:16:00Z" }),
        obs({ snapshotId: "c", formulaVersion: "decision@0.9.0", timestamp: "2026-07-17T09:17:00Z" }),
      ],
      ctx,
    );
    expect(r.capability).toBe("MIXED_FORMULA_VERSIONS");
  });

  it("dedupes identical snapshotId+timestamp", () => {
    const r = alignReplay(
      [
        obs({ snapshotId: "x", timestamp: "2026-07-17T09:15:00Z" }),
        obs({ snapshotId: "x", timestamp: "2026-07-17T09:15:00Z" }),
        obs({ snapshotId: "y", timestamp: "2026-07-17T09:16:00Z" }),
        obs({ snapshotId: "z", timestamp: "2026-07-17T09:17:00Z" }),
      ],
      ctx,
    );
    expect(r.dedupeCount).toBe(1);
    expect(r.observationCount).toBe(3);
  });

  it("TOO_FEW_OBSERVATIONS below minimum", () => {
    const r = alignReplay(
      [obs({ snapshotId: "a" }), obs({ snapshotId: "b", timestamp: "2026-07-17T09:16:00Z" })],
      ctx,
    );
    expect(r.capability).toBe("TOO_FEW_OBSERVATIONS");
  });

  it("computes durations, transitions, MFE/MAE, forward move", () => {
    const r = alignReplay(
      [
        obs({ snapshotId: "1", timestamp: "2026-07-17T09:15:00Z", state: "CE", confidence: 80, price: 100 }),
        obs({ snapshotId: "2", timestamp: "2026-07-17T09:16:00Z", state: "CE", confidence: 78, price: 102 }),
        obs({ snapshotId: "3", timestamp: "2026-07-17T09:17:00Z", state: "PE", confidence: 60, price: 98 }),
        obs({ snapshotId: "4", timestamp: "2026-07-17T09:18:00Z", state: "PE", confidence: 62, price: 99 }),
      ],
      ctx,
    );
    expect(r.capability).toBe("SUPPORTED");
    expect(r.transitions).toBe(1);
    expect(r.reversalCount).toBe(1);
    expect(r.weakeningCount).toBe(1);
    expect(r.forwardMove).toBe(-1);
    expect(r.mfe).toBe(2);
    expect(r.mae).toBe(-2);
    expect(r.dominantDecision === "CE" || r.dominantDecision === "PE").toBe(true);
    expect(r.provenance.snapshotIds.length).toBe(4);
  });

  it("counts missing intervals from expectedIntervalMs", () => {
    const r = alignReplay(
      [
        obs({ snapshotId: "1", timestamp: "2026-07-17T09:15:00Z" }),
        obs({ snapshotId: "2", timestamp: "2026-07-17T09:16:00Z" }),
        obs({ snapshotId: "3", timestamp: "2026-07-17T09:20:00Z" }),
      ],
      ctx,
    );
    expect(r.missingIntervals).toBeGreaterThanOrEqual(1);
    expect(r.quality === "PARTIAL" || r.quality === "OK" || r.quality === "DEGRADED").toBe(true);
  });

  it("filters wrong-instrument observations as invalid", () => {
    const r = alignReplay(
      [
        obs({ snapshotId: "1", instrument: "BANKNIFTY" }),
        obs({ snapshotId: "2", timestamp: "2026-07-17T09:16:00Z" }),
        obs({ snapshotId: "3", timestamp: "2026-07-17T09:17:00Z" }),
        obs({ snapshotId: "4", timestamp: "2026-07-17T09:18:00Z" }),
      ],
      ctx,
    );
    expect(r.invalidCount).toBe(1);
    expect(r.capability).toBe("SUPPORTED");
  });
});