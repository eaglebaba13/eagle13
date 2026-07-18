import { describe, it, expect } from "vitest";
import {
  RC1_CHECKLIST,
  RC1_CHECKLIST_VERSION,
  evaluateRC1,
  type RC1GateStatus,
} from "./rc1-checklist";

function all(status: RC1GateStatus): Map<string, RC1GateStatus> {
  return new Map(RC1_CHECKLIST.map((g) => [g.id, status] as const));
}

describe("rc1-checklist", () => {
  it("version stable", () => {
    expect(RC1_CHECKLIST_VERSION).toBe("rc1-checklist@1.0.0");
  });

  it("READY when every mandatory gate PASS and signoff PASS", () => {
    const r = evaluateRC1(all("PASS"));
    expect(r.verdict).toBe("READY");
    expect(r.failing).toEqual([]);
    expect(r.pending).toEqual([]);
  });

  it("AWAITING_SIGNOFF when human signoff pending but nothing failing", () => {
    const m = all("PASS");
    m.set("signoff.human", "PENDING");
    const r = evaluateRC1(m);
    expect(r.verdict).toBe("AWAITING_SIGNOFF");
    expect(r.pending).toContain("signoff.human");
  });

  it("BLOCKED when any mandatory gate FAIL", () => {
    const m = all("PASS");
    m.set("trading.live-order-off", "FAIL");
    const r = evaluateRC1(m);
    expect(r.verdict).toBe("BLOCKED");
    expect(r.failing).toContain("trading.live-order-off");
  });

  it("has trading-safety gates locked to off", () => {
    const ids = RC1_CHECKLIST.filter((g) => g.category === "trading-safety").map((g) => g.id);
    expect(ids).toContain("trading.live-order-off");
    expect(ids).toContain("trading.broker-exec-off");
    expect(ids).toContain("trading.coindcx-off");
    expect(ids).toContain("trading.no-formula-change");
  });
});