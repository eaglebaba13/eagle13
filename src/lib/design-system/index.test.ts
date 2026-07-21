import { describe, it, expect } from "vitest";
import { confidenceBand, confidenceLabel, statusVar, confidenceVar } from "./index";

describe("design-system confidence bands", () => {
  it.each([
    [100, "deep"],
    [90, "deep"],
    [89, "high"],
    [75, "high"],
    [74, "mid"],
    [60, "mid"],
    [59, "low"],
    [40, "low"],
    [39, "weak"],
    [0, "weak"],
  ])("%d -> %s", (v, expected) => {
    expect(confidenceBand(v)).toBe(expected);
  });
  it("handles non-finite input", () => {
    expect(confidenceBand(Number.NaN)).toBe("weak");
  });
  it("labels bands", () => {
    expect(confidenceLabel("deep")).toBe("Very High");
    expect(confidenceLabel("weak")).toBe("Very Low");
  });
  it("exposes CSS var names", () => {
    expect(statusVar("buy")).toBe("var(--eb-status-buy)");
    expect(confidenceVar("mid")).toBe("var(--eb-conf-60)");
  });
});
