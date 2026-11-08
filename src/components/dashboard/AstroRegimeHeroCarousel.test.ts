import { describe, it, expect } from "vitest";
import {
  DECK_TABS,
  type DeckTabId,
  AstroRegimeHeroCarousel,
  InstitutionalResearchDeck,
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
});
