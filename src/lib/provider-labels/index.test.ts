import { describe, it, expect } from "vitest";
import {
  SAFE_PROVIDER_LABELS,
  containsRawProviderRef,
  redactRawProviderRefs,
  safeProviderLabel,
} from "./index";

describe("provider-labels", () => {
  it("safeProviderLabel resolves known roles", () => {
    expect(safeProviderLabel("COMMODITY")).toBe(SAFE_PROVIDER_LABELS.COMMODITY);
    expect(safeProviderLabel("MARKET_DATA")).toBe(SAFE_PROVIDER_LABELS.MARKET_DATA);
    expect(safeProviderLabel("OPTIONS")).toBe(SAFE_PROVIDER_LABELS.OPTIONS);
  });

  it("safeProviderLabel falls back for unknown raw strings", () => {
    expect(safeProviderLabel("Yahoo Finance (COMEX)", "COMMODITY")).toBe(
      SAFE_PROVIDER_LABELS.COMMODITY,
    );
    expect(safeProviderLabel(null)).toBe(SAFE_PROVIDER_LABELS.UNKNOWN);
  });

  it("containsRawProviderRef detects raw brand names and endpoints", () => {
    expect(containsRawProviderRef("Yahoo Finance")).toBe(true);
    expect(containsRawProviderRef("query1.finance.yahoo.com")).toBe(true);
    expect(containsRawProviderRef("www.nseindia.com")).toBe(true);
    expect(containsRawProviderRef("api.upstox.com")).toBe(true);
    expect(containsRawProviderRef("Market Data Provider")).toBe(false);
    expect(containsRawProviderRef(null)).toBe(false);
  });

  it("redactRawProviderRefs strips leaks from free-form prose", () => {
    const cleaned = redactRawProviderRefs(
      "Fetched from Yahoo Finance (COMEX) via query1.finance.yahoo.com and NSE at www.nseindia.com",
    );
    expect(containsRawProviderRef(cleaned)).toBe(false);
    expect(cleaned).toContain(SAFE_PROVIDER_LABELS.COMMODITY);
  });

  it("SAFE_PROVIDER_LABELS never contains raw brand text", () => {
    for (const label of Object.values(SAFE_PROVIDER_LABELS)) {
      expect(containsRawProviderRef(label)).toBe(false);
    }
  });
});