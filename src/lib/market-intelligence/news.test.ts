import { describe, it, expect } from "vitest";
import { classifyImpact, classifySentiment, normalizeNews } from "./news";

describe("news", () => {
  it("detects sentiment", () => {
    expect(classifySentiment("Nifty surges to record")).toBe("POSITIVE");
    expect(classifySentiment("Stock plunges after loss warning")).toBe("NEGATIVE");
    expect(classifySentiment("Stocks trade sideways")).toBe("NEUTRAL");
  });
  it("detects HIGH impact from keywords", () => {
    expect(classifyImpact("RBI hikes repo rate")).toBe("HIGH");
    expect(classifyImpact("FOMC cuts rate")).toBe("HIGH");
    expect(classifyImpact("Company launches new product")).toBe("LOW");
  });
  it("normalizes and sorts by importance", () => {
    const s = normalizeNews([
      { headline: "Small update", source: "X", publishedAt: null },
      { headline: "RBI hikes rate cut projections", source: "Reuters", publishedAt: "2025-11-11T09:00:00Z" },
    ]);
    expect(s.items[0].impact).toBe("HIGH");
    expect(s.highImpact.length).toBe(1);
  });
});