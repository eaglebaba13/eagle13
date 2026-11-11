import { describe, it, expect } from "vitest";
import {
  DECK_TABS,
  type DeckTabId,
  AstroRegimeHeroCarousel,
  InstitutionalResearchDeck,
  formatPcr,
} from "./AstroRegimeHeroCarousel";

describe("AstroRegimeHeroCarousel / Institutional Research Deck Tabs", () => {
  it("registers all 4 institutional modules in exact canonical order", () => {
    expect(DECK_TABS).toHaveLength(4);

    const tabIds: DeckTabId[] = DECK_TABS.map((t) => t.id);
    expect(tabIds).toEqual(["astro", "smc", "derivatives", "unicorn"]);

    expect(DECK_TABS[0].label).toBe("Astro Harmonics");
    expect(DECK_TABS[1].label).toBe("SMC Order Flow");
    expect(DECK_TABS[2].label).toBe("Derivatives & GEX");
    expect(DECK_TABS[3].label).toBe("🦄 ICT Unicorn Radar & SMT");
  });

  it("exports InstitutionalResearchDeck as alias for AstroRegimeHeroCarousel", () => {
    expect(InstitutionalResearchDeck).toBe(AstroRegimeHeroCarousel);
  });

  describe("formatPcr safe institutional helper", () => {
    it("safely formats raw numbers", () => {
      expect(formatPcr(1.1234)).toBe("1.12");
      expect(formatPcr(1)).toBe("1.00");
      expect(formatPcr(0.85)).toBe("0.85");
    });

    it("safely formats numeric strings", () => {
      expect(formatPcr("1.25")).toBe("1.25");
      expect(formatPcr("0.9")).toBe("0.90");
    });

    it("safely parses DecisionSummary object with pcrOi", () => {
      expect(formatPcr({ pcrOi: 1.15, status: "SUPPORTED", computed: true })).toBe("1.15");
      expect(formatPcr({ pcrOi: "1.32", status: "SUPPORTED" })).toBe("1.32");
    });

    it("falls back gracefully when pcrOi is null or object is empty without throwing", () => {
      expect(formatPcr({ pcrOi: null, status: "NO_DATA", computed: false })).toBe("1.00");
      expect(formatPcr({ pcrOi: null, status: "NO_DATA" }, "1.08")).toBe("1.08");
      expect(formatPcr({})).toBe("1.00");
    });

    it("falls back gracefully for null, undefined, NaN, and invalid inputs", () => {
      expect(formatPcr(null)).toBe("1.00");
      expect(formatPcr(undefined)).toBe("1.00");
      expect(formatPcr(NaN)).toBe("1.00");
      expect(formatPcr(Infinity)).toBe("1.00");
      expect(formatPcr("invalid-string")).toBe("1.00");
      expect(formatPcr(null, "1.08")).toBe("1.08");
      expect(formatPcr(undefined, "1.08")).toBe("1.08");
    });
  });
});
