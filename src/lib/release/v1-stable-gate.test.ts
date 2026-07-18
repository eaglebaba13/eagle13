import { describe, it, expect } from "vitest";
import {
  V1_STABLE_GATES,
  evaluateV1StableReadiness,
  type V1GateStatus,
} from "./v1-stable-gate";
import {
  V1_MANIFEST,
  V1_VERSION,
  manifestContainsSecrets,
  manifestTradingSafe,
} from "./v1-manifest";

function all(status: V1GateStatus): Map<string, V1GateStatus> {
  return new Map(V1_STABLE_GATES.map((g) => [g.id, status]));
}

describe("v1 stable gate", () => {
  it("BLOCKED when any trading flag is true", () => {
    const r = evaluateV1StableReadiness({
      statuses: all("PASS"),
      tradingFlagsAllFalse: false,
    });
    expect(r.verdict).toBe("BLOCKED");
    expect(r.blockers).toContain("trading.flags-off");
  });

  it("BLOCKED when a mandatory gate FAILs", () => {
    const m = all("PASS");
    m.set("build.tests", "FAIL");
    const r = evaluateV1StableReadiness({ statuses: m, tradingFlagsAllFalse: true });
    expect(r.verdict).toBe("BLOCKED");
    expect(r.failing).toContain("build.tests");
  });

  it("AWAITING_HUMAN_SIGNOFF when tech PASS but human sign-off PENDING", () => {
    const m = all("PASS");
    m.set("signoff.human", "PENDING");
    const r = evaluateV1StableReadiness({ statuses: m, tradingFlagsAllFalse: true });
    expect(r.verdict).toBe("AWAITING_HUMAN_SIGNOFF");
    expect(r.pending).toContain("signoff.human");
  });

  it("READY_FOR_DEPLOYMENT when all gates PASS and flags safe", () => {
    const r = evaluateV1StableReadiness({
      statuses: all("PASS"),
      tradingFlagsAllFalse: true,
    });
    expect(r.verdict).toBe("READY_FOR_DEPLOYMENT");
  });
});

describe("v1 manifest", () => {
  it("declares canonical version 1.0.0 on stable channel", () => {
    expect(V1_VERSION).toBe("1.0.0");
    expect(V1_MANIFEST.version).toBe("1.0.0");
    expect(V1_MANIFEST.channel).toBe("stable");
  });

  it("keeps all trading flags false", () => {
    expect(manifestTradingSafe()).toBe(true);
    expect(V1_MANIFEST.tradingFlags.LIVE_ORDER_ENABLED).toBe(false);
    expect(V1_MANIFEST.tradingFlags.BROKER_ORDER_EXECUTION_ENABLED).toBe(false);
    expect(V1_MANIFEST.tradingFlags.COINDCX_TRADING_ENABLED).toBe(false);
  });

  it("contains no secret-like keys", () => {
    expect(manifestContainsSecrets()).toBe(false);
  });

  it("lists required legal routes", () => {
    for (const r of ["/privacy", "/terms", "/risk", "/release-notes", "/status"]) {
      expect(V1_MANIFEST.legalRoutes).toContain(r);
    }
  });

  it("documents known limitations without profitability claims", () => {
    expect(V1_MANIFEST.knownLimitations.length).toBeGreaterThan(0);
    const joined = V1_MANIFEST.knownLimitations.join(" ").toLowerCase();
    expect(joined).not.toMatch(/guaranteed profit|risk[- ]free|assured returns/);
  });
});