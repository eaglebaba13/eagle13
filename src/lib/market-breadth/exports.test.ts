import { describe, it, expect } from "vitest";
import { readingToCsv, readingToJson, buildResearchBundle } from "./exports";
import { classifyGti } from "./gti-classifier";
import { buildMockBreadthBundle } from "./mock-provider";
import { evaluateVixRegime } from "./vix-regime";
import { adaptPcrConfirmation } from "./pcr-confirmation";

function make() {
  const b = buildMockBreadthBundle({ scenario: "MIXED" });
  return classifyGti({
    broad: b.broad, nifty50: b.nifty50, topWeighted: b.topWeighted,
    banking: b.banking, it: b.it, oilGas: b.oilGas, auto: b.auto,
    pcr: adaptPcrConfirmation({ reading: null }),
    vix: evaluateVixRegime({ currentVix: 15, provider: "MOCK", timestamp: new Date().toISOString(), freshness: "FRESH" }),
    runId: "run-1",
  });
}

describe("exports", () => {
  it("CSV contains research disclaimer, formula version, and each snapshot row", () => {
    const r = make();
    const csv = readingToCsv(r);
    expect(csv).toContain("RESEARCH ONLY — NOT INVESTMENT ADVICE");
    expect(csv).toContain(r.formulaVersion);
    expect(csv).toContain("BROAD");
    expect(csv).toContain("NIFTY50");
    expect(csv).toContain("TOP_WEIGHTED");
  });
  it("JSON round-trips and is not empty", () => {
    const r = make();
    const parsed = JSON.parse(readingToJson(r));
    expect(parsed.state).toBe(r.state);
    expect(parsed.formulaVersion).toBe(r.formulaVersion);
  });
  it("bundle contains conflicts, confidence breakdown, and warnings", () => {
    const b = buildResearchBundle(make());
    expect(b).toHaveProperty("confidenceBreakdown");
    expect(b).toHaveProperty("conflicts");
    expect(b).toHaveProperty("warnings");
  });
});
