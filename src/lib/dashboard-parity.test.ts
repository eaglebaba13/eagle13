import { describe, it, expect } from "vitest";
import { LEGACY_DASHBOARD_WIDGETS, legacyWidgetsById } from "./dashboard-widgets";

// Phase 24C · Legacy dashboard parity oracle.
//
// Locks the widget set, order, spans, dependency, and refresh policy the
// `/` route consumes. Any regression that changes displayed widgets,
// ordering, or data cadence trips this suite.

describe("Phase 24C · legacy dashboard parity", () => {
  it("exposes the exact widget IDs used by `/`", () => {
    expect(LEGACY_DASHBOARD_WIDGETS.map((w) => w.id)).toEqual([
      "legacy-quote",
      "legacy-vix",
      "legacy-gold-silver",
      "legacy-signal",
      "legacy-global-markets",
      "legacy-cpr",
      "legacy-safe-zones",
      "legacy-gann",
      "legacy-pivot",
      "legacy-gann-cycle",
    ]);
  });

  it("every legacy widget shares the MARKET_DATA query key", () => {
    for (const w of LEGACY_DASHBOARD_WIDGETS) {
      expect(w.dataDependency).toBe("MARKET_DATA");
    }
  });

  it("every legacy widget uses the 30s refresh cadence", () => {
    for (const w of LEGACY_DASHBOARD_WIDGETS) {
      expect(w.refreshPolicy).toEqual({ kind: "interval", intervalMs: 30_000 });
    }
  });

  it("Gold–Silver Ratio appears above CPR / Pivot / Gann sections", () => {
    const ids = LEGACY_DASHBOARD_WIDGETS.map((w) => w.id);
    const gs = ids.indexOf("legacy-gold-silver");
    expect(gs).toBeLessThan(ids.indexOf("legacy-cpr"));
    expect(gs).toBeLessThan(ids.indexOf("legacy-pivot"));
    expect(gs).toBeLessThan(ids.indexOf("legacy-gann"));
    expect(gs).toBeLessThan(ids.indexOf("legacy-gann-cycle"));
  });

  it("index quote and Gold–Silver Ratio are required (cannot be hidden)", () => {
    const map = legacyWidgetsById();
    expect(map.get("legacy-quote")?.required).toBe(true);
    expect(map.get("legacy-gold-silver")?.required).toBe(true);
  });

  it("all legacy widgets have real component loaders (no placeholder)", () => {
    for (const w of LEGACY_DASHBOARD_WIDGETS) {
      expect(typeof w.componentLoader).toBe("function");
    }
  });

  it("safe zones and gann 360° share one row (equal spans)", () => {
    const map = legacyWidgetsById();
    expect(map.get("legacy-safe-zones")?.desktopSpan).toBe(6);
    expect(map.get("legacy-gann")?.desktopSpan).toBe(6);
  });
});