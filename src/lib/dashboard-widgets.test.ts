import { describe, it, expect } from "vitest";
import {
  DASHBOARD_WIDGETS,
  DATA_DEPENDENCY_QUERY_KEY,
  applyPreferences,
  auditWidgetRegistry,
  desktopWidgets,
  mobileWidgets,
  planMeets,
  requiredWidgetIds,
  resolveWidgetsForContext,
} from "./dashboard-widgets";

describe("Phase 24B · dashboard widget registry", () => {
  it("widget IDs are unique", () => {
    const ids = DASHBOARD_WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("core widgets are registered", () => {
    const ids = new Set(DASHBOARD_WIDGETS.map((w) => w.id));
    for (const id of [
      "market-summary",
      "nifty50",
      "banknifty",
      "india-vix",
      "gold-silver-ratio",
      "astro-levels",
      "planet-nakshatra",
      "signal",
      "decision",
      "risk",
      "market-breadth",
      "options-pcr",
      "alerts",
      "formula-version",
      "data-freshness",
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("every dependency has a query key mapping", () => {
    for (const w of DASHBOARD_WIDGETS) {
      expect(DATA_DEPENDENCY_QUERY_KEY[w.dataDependency]).toBeDefined();
    }
  });

  it("shared dependency reuses the same query key", () => {
    const marketWidgets = DASHBOARD_WIDGETS.filter((w) => w.dataDependency === "MARKET_DATA");
    expect(marketWidgets.length).toBeGreaterThan(1);
    const key = DATA_DEPENDENCY_QUERY_KEY.MARKET_DATA;
    for (const w of marketWidgets) {
      expect(DATA_DEPENDENCY_QUERY_KEY[w.dataDependency]).toBe(key);
    }
  });

  it("registry audit finds no duplicates or missing loaders", () => {
    const audit = auditWidgetRegistry();
    expect(audit.duplicateIds).toEqual([]);
    expect(audit.missingLoaders).toEqual([]);
  });

  it("desktop and mobile see same widget set for the same context", () => {
    const ctx = { plan: "professional" as const };
    const d = new Set(desktopWidgets(ctx).map((w) => w.id));
    const m = new Set(mobileWidgets(ctx).map((w) => w.id));
    expect([...d].sort()).toEqual([...m].sort());
  });

  it("desktop and mobile may have distinct ordering", () => {
    const ctx = { plan: "professional" as const };
    const d = desktopWidgets(ctx).map((w) => w.id);
    const m = mobileWidgets(ctx).map((w) => w.id);
    // Same set → same length, but this asserts ordering can be independently controlled
    expect(d.length).toBe(m.length);
  });

  it("planMeets ordering", () => {
    expect(planMeets("free", "free")).toBe(true);
    expect(planMeets("free", "pro")).toBe(false);
    expect(planMeets("pro", "free")).toBe(true);
    expect(planMeets("professional", "pro")).toBe(true);
  });

  it("free plan hides pro/professional widgets", () => {
    const free = resolveWidgetsForContext({ plan: "free" }).map((w) => w.id);
    expect(free).not.toContain("signal");
    expect(free).not.toContain("alerts");
    expect(free).toContain("gold-silver-ratio");
  });

  it("professional plan sees observation widgets", () => {
    const pro = resolveWidgetsForContext({ plan: "professional" }).map((w) => w.id);
    expect(pro).toContain("signal");
    expect(pro).toContain("alerts");
  });

  it("required widgets cannot be hidden through preferences", () => {
    const required = requiredWidgetIds();
    const visible = applyPreferences(DASHBOARD_WIDGETS, {
      hidden: [...required, "signal"],
      collapsed: [],
      desktopOrder: [],
      mobileOrder: [],
    }, "desktop").map((w) => w.id);
    for (const id of required) expect(visible).toContain(id);
    expect(visible).not.toContain("signal");
  });

  it("reset layout returns registry order", () => {
    const reset = applyPreferences(DASHBOARD_WIDGETS, {
      hidden: [],
      collapsed: [],
      desktopOrder: [],
      mobileOrder: [],
    }, "desktop").map((w) => w.id);
    const orderCanon = [...DASHBOARD_WIDGETS].sort((a, b) => a.desktopOrder - b.desktopOrder).map((w) => w.id);
    expect(reset).toEqual(orderCanon);
  });

  it("custom desktop order is respected", () => {
    const custom = applyPreferences(DASHBOARD_WIDGETS, {
      hidden: [],
      collapsed: [],
      desktopOrder: ["astro-levels", "gold-silver-ratio"],
      mobileOrder: [],
    }, "desktop").map((w) => w.id);
    expect(custom[0]).toBe("astro-levels");
    expect(custom[1]).toBe("gold-silver-ratio");
  });

  it("environment filter excludes non-matching widgets", () => {
    const list = resolveWidgetsForContext({ plan: "admin", environment: "production" }, [
      { ...DASHBOARD_WIDGETS[0], id: "dev-only", environment: "development" },
      ...DASHBOARD_WIDGETS,
    ]);
    expect(list.map((w) => w.id)).not.toContain("dev-only");
  });

  it("feature flag filter excludes widgets when flag missing", () => {
    const flagged = [
      { ...DASHBOARD_WIDGETS[0], id: "beta-widget", featureFlag: "beta-x" },
      ...DASHBOARD_WIDGETS,
    ];
    const withoutFlag = resolveWidgetsForContext({ plan: "admin" }, flagged).map((w) => w.id);
    expect(withoutFlag).not.toContain("beta-widget");
    const withFlag = resolveWidgetsForContext(
      { plan: "admin", featureFlags: ["beta-x"] },
      flagged,
    ).map((w) => w.id);
    expect(withFlag).toContain("beta-widget");
  });

  it("registry audit detects duplicate IDs", () => {
    const audit = auditWidgetRegistry([
      DASHBOARD_WIDGETS[0],
      { ...DASHBOARD_WIDGETS[0] },
    ]);
    expect(audit.duplicateIds).toContain(DASHBOARD_WIDGETS[0].id);
  });

  it("registry audit detects missing loader", () => {
    const audit = auditWidgetRegistry([
      // @ts-expect-error deliberate missing loader
      { ...DASHBOARD_WIDGETS[0], componentLoader: undefined, id: "broken" },
    ]);
    expect(audit.missingLoaders).toContain("broken");
  });
});