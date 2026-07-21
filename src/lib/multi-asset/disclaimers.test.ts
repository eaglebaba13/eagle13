import { describe, it, expect } from "vitest";
import {
  DISCLAIMER_GENERAL,
  DISCLAIMER_CRYPTO,
  DISCLAIMER_DERIVATIVES,
  ALL_DISCLAIMERS,
  composeDisclaimerBlock,
} from "./disclaimers";

describe("Phase 44 disclaimers", () => {
  it("includes the mandated general disclaimer text", () => {
    expect(DISCLAIMER_GENERAL).toMatch(/research and market analytics/i);
    expect(DISCLAIMER_GENERAL).toMatch(/do not constitute financial/i);
  });
  it("crypto disclaimer flags 24x7 and volatility", () => {
    expect(DISCLAIMER_CRYPTO).toMatch(/24x7/);
    expect(DISCLAIMER_CRYPTO).toMatch(/volatile/i);
  });
  it("derivatives disclaimer flags loss of premium", () => {
    expect(DISCLAIMER_DERIVATIVES).toMatch(/premium/i);
  });
  it("composeDisclaimerBlock contains all three disclaimers", () => {
    const block = composeDisclaimerBlock();
    for (const d of ALL_DISCLAIMERS) expect(block).toContain(d);
  });
});