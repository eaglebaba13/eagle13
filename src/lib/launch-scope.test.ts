import { describe, it, expect } from "vitest";
import {
  ACTIVE_MARKETS,
  HIDDEN_UNTIL_PROVIDER_READY,
  isActiveMarket,
  isHiddenMarket,
  marketVisibility,
  hiddenMarketReason,
  LAUNCH_MARKETS,
} from "./launch-scope";

describe("launch-scope", () => {
  it("has NIFTY50, BANKNIFTY, INDIA_VIX active", () => {
    expect(ACTIVE_MARKETS).toEqual(["NIFTY50", "BANKNIFTY", "INDIA_VIX"]);
  });

  it("hides commodities and crypto", () => {
    for (const s of ["GOLD", "SILVER", "CRUDEOIL", "NATURAL_GAS", "XAUUSD", "XAGUSD", "BTC", "ETH"]) {
      expect(isHiddenMarket(s)).toBe(true);
      expect(isActiveMarket(s)).toBe(false);
      expect(marketVisibility(s)).toBe("HIDDEN");
      expect(hiddenMarketReason(s)).toMatch(/./);
    }
  });

  it("marks Combined PCR as coming next", () => {
    expect(marketVisibility("COMBINED_PCR")).toBe("COMING_NEXT");
  });

  it("registry contains exactly three active markets", () => {
    expect(LAUNCH_MARKETS.active.length).toBe(3);
  });

  it("active markets and hidden markets do not overlap", () => {
    for (const a of ACTIVE_MARKETS) {
      expect((HIDDEN_UNTIL_PROVIDER_READY as readonly string[]).includes(a)).toBe(false);
    }
  });
});