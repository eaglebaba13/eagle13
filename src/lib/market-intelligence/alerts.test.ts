import { describe, it, expect } from "vitest";
import { diffAlerts } from "./alerts";
import type { NewsItem } from "./types";

describe("alerts", () => {
  it("emits BIAS_CHANGE only on transition", () => {
    const a = diffAlerts({ institutionalBias: "NEUTRAL" }, { institutionalBias: "STRONG_BUY" });
    expect(a.some((x) => x.kind === "BIAS_CHANGE")).toBe(true);
    const b = diffAlerts({ institutionalBias: "STRONG_BUY" }, { institutionalBias: "STRONG_BUY" });
    expect(b.length).toBe(0);
  });
  it("emits HIGH_IMPACT_NEWS only for unseen items", () => {
    const news: NewsItem[] = [
      {
        headline: "RBI hikes rates",
        source: "Reuters",
        publishedAt: null,
        url: null,
        category: "MACRO",
        affectedAssets: [],
        affectedSector: null,
        importance: 1,
        sentiment: "NEGATIVE",
        impact: "HIGH",
      },
    ];
    const a = diffAlerts({}, { highImpactNews: news });
    expect(a.length).toBe(1);
    const b = diffAlerts({ seenNewsKeys: ["Reuters::RBI hikes rates"] }, { highImpactNews: news });
    expect(b.length).toBe(0);
  });
});