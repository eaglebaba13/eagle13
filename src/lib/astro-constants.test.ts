import { describe, it, expect } from "vitest";
import {
  NAKSHATRAS,
  SIGNS,
  NAKSHATRA_LORDS,
  isBullNakshatra,
  isBearNakshatra,
  retroBiasOf,
  EAGLEBABA_EXTENDED_BEAR_NAKSHATRAS,
} from "./astro-constants";

describe("astro constants", () => {
  it("has the 27 nakshatras, 12 signs and 9 dasha lords", () => {
    expect(NAKSHATRAS).toHaveLength(27);
    expect(SIGNS).toHaveLength(12);
    expect(NAKSHATRA_LORDS).toHaveLength(9);
    expect(new Set(NAKSHATRAS).size).toBe(27);
  });
});

describe("isBullNakshatra / isBearNakshatra", () => {
  it("classifies known bull nakshatras", () => {
    for (const n of ["Krittika", "Uttara Phalguni", "Chitra", "Dhanishta", "Pushya"]) {
      expect(isBullNakshatra(n)).toBe(true);
      expect(isBearNakshatra(n)).toBe(false);
    }
  });
  it("classifies known bear nakshatras", () => {
    for (const n of ["Shatabhisha", "Uttara Ashadha", "Vishakha", "Purva Bhadrapada"]) {
      expect(isBearNakshatra(n)).toBe(true);
      expect(isBullNakshatra(n)).toBe(false);
    }
  });
  it("excludes Bharani from the authentic Gann bear set (Phase 21.0)", () => {
    expect(isBearNakshatra("Bharani")).toBe(false);
    expect(EAGLEBABA_EXTENDED_BEAR_NAKSHATRAS.has("Bharani")).toBe(true);
  });
  it("treats a neutral nakshatra as neither bull nor bear", () => {
    expect(isBullNakshatra("Rohini")).toBe(false);
    expect(isBearNakshatra("Rohini")).toBe(false);
  });
  it("returns false for unknown names", () => {
    expect(isBullNakshatra("Nonexistent")).toBe(false);
    expect(isBearNakshatra("")).toBe(false);
  });
});

describe("retroBiasOf", () => {
  it("maps Mars/Jupiter retrograde to bull", () => {
    expect(retroBiasOf("Mars")).toBe("bull");
    expect(retroBiasOf("Jupiter")).toBe("bull");
  });
  it("maps Mercury/Saturn retrograde to bear", () => {
    expect(retroBiasOf("Mercury")).toBe("bear");
    expect(retroBiasOf("Saturn")).toBe("bear");
  });
  it("maps Venus to neutral", () => {
    expect(retroBiasOf("Venus")).toBe("neutral");
  });
  it("maps other bodies to none", () => {
    for (const p of ["Sun", "Moon", "Rahu", "Ketu"]) {
      expect(retroBiasOf(p)).toBe("none");
    }
  });
});