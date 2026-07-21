import { describe, it, expect } from "vitest";
import { classifyFreshness, makeEnvelope } from "./freshness";

describe("freshness", () => {
  const t = { liveMs: 60_000, freshMs: 300_000, staleMs: 3_600_000 };
  it("bucketizes ageMs", () => {
    expect(classifyFreshness(0, t)).toBe("LIVE");
    expect(classifyFreshness(120_000, t)).toBe("FRESH");
    expect(classifyFreshness(1_800_000, t)).toBe("STALE");
    expect(classifyFreshness(7_200_000, t)).toBe("UNAVAILABLE");
    expect(classifyFreshness(null, t)).toBe("UNAVAILABLE");
  });
  it("marks PARTIAL when completeness < 1", () => {
    const env = makeEnvelope({
      section: "global",
      source: "test",
      fetchedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      data: { rows: [] },
      completeness: 0.5,
    });
    expect(env.status).toBe("PARTIAL");
  });
  it("returns UNAVAILABLE when data is null", () => {
    const env = makeEnvelope({
      section: "global",
      source: "test",
      fetchedAt: null,
      publishedAt: null,
      data: null,
    });
    expect(env.status).toBe("UNAVAILABLE");
    expect(env.confidence).toBe(0);
  });
});