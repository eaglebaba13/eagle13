import { describe, it, expect } from "vitest";
import { detectSource, parseDegrees, parsePlanetTable } from "./astro-fixture-parser";

describe("Phase 21.0C · degree parsing", () => {
  it("parses D°M'S\" and D M S", () => {
    expect(parseDegrees("16° 19' 12\"")).toBeCloseTo(16 + 19 / 60 + 12 / 3600, 6);
    expect(parseDegrees("16 19 12")).toBeCloseTo(16 + 19 / 60 + 12 / 3600, 6);
    expect(parseDegrees("16.32")).toBe(16.32);
  });
  it("returns undefined on garbage", () => {
    expect(parseDegrees("abc")).toBeUndefined();
  });
});

describe("Phase 21.0C · source detection", () => {
  it("detects Drik / MPanchang / Prokerala / Swiss", () => {
    expect(detectSource("From drikpanchang.com")).toBe("DRIK");
    expect(detectSource("mpanchang table")).toBe("MPANCHANG");
    expect(detectSource("prokerala output")).toBe("PROKERALA");
    expect(detectSource("Swiss Ephemeris")).toBe("SWISS");
    expect(detectSource("random text")).toBe("AUTO");
  });
});

describe("Phase 21.0C · planet table parser", () => {
  it("parses a clean tab-separated table without guessing", () => {
    const text = [
      "Sun\tSagittarius\t16 19 12\tPurva Ashadha\t3\tD",
      "Moon\tTaurus\t10 15 00\tRohini\t2\tD",
      "Rahu\tPisces\t5 00 00\tUttara Bhadrapada\t2\tR",
    ].join("\n");
    const r = parsePlanetTable(text, "DRIK");
    expect(r.planets.length).toBe(3);
    expect(r.planets[0].planet).toBe("Sun");
    expect(r.planets[0].sign).toBe("Sagittarius");
    expect(r.planets[0].nakshatra).toBe("Purva Ashadha");
    expect(r.planets[0].pada).toBe(3);
    expect(r.planets[0].retrograde).toBe(false);
    expect(r.planets[2].retrograde).toBe(true);
    expect(r.planets[0].siderealLongitude).toBeCloseTo(240 + 16 + 19 / 60 + 12 / 3600, 4);
  });
  it("flags rows with missing fields as ambiguous, does not fabricate", () => {
    const text = "Sun\tSagittarius\t16 19 12";
    const r = parsePlanetTable(text, "DRIK");
    expect(r.planets).toHaveLength(0);
    expect(r.rows[0].ambiguous).toBe(true);
    expect(r.rows[0].reason).toMatch(/nakshatra|pada|retrograde/);
  });
  it("skips lines without a recognizable planet name", () => {
    const r = parsePlanetTable("Header row junk\nsome bar baz");
    expect(r.rows).toHaveLength(0);
  });
});