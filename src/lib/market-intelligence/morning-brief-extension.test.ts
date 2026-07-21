import { describe, it, expect } from "vitest";
import { buildMorningBriefSections } from "./morning-brief-extension";
import { makeEnvelope } from "./freshness";
import { computeInstitutionalProbability } from "./probability";

describe("morning-brief-extension", () => {
  it("assembles sections when data is available", () => {
    const now = new Date().toISOString();
    const secs = buildMorningBriefSections({
      generatedAt: now,
      fiiDii: makeEnvelope({
        section: "fiiDii", source: "test",
        fetchedAt: now, publishedAt: now,
        data: {
          latest: { tradeDate: "2025-11-11", fiiBuy: 0, fiiSell: 0, fiiNet: 800, diiBuy: 0, diiSell: 0, diiNet: 900 },
          previous: null, dailyChange: null, trend: [], institutionalBias: "BUY",
        },
      }),
      global: makeEnvelope({
        section: "global", source: "test",
        fetchedAt: now, publishedAt: now,
        data: { rows: [{ symbol: "N225", label: "Nikkei", last: 1, change: 1, changePct: 1, status: "OPEN", contributionPct: 1 }], compositeBiasPct: 0.5 },
      }),
      macro: makeEnvelope({
        section: "macro", source: "test",
        fetchedAt: now, publishedAt: now,
        data: { rows: [], macroRisk: "MEDIUM", reasons: ["DXY firm"] },
      }),
      sectors: makeEnvelope({
        section: "sectors", source: "test",
        fetchedAt: now, publishedAt: now,
        data: { rows: [], strongest: [], weakest: [], rotationScore: 0 },
      }),
      news: makeEnvelope({
        section: "news", source: "test",
        fetchedAt: now, publishedAt: now,
        data: { items: [], highImpact: [] },
      }),
      probability: computeInstitutionalProbability({ institutionalBias: "BUY" }),
    });
    const titles = secs.map((s) => s.title);
    expect(titles).toContain("Global Summary");
    expect(titles).toContain("Macro Summary");
    expect(titles).toContain("Institutional Summary");
  });
});