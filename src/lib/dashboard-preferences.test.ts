import { describe, it, expect } from "vitest";
import {
  DEFAULT_PREFERENCES,
  DASHBOARD_PREFERENCE_VERSION,
  parsePreferences,
  loadPreferences,
  savePreferences,
  toggleCollapsed,
  hideWidget,
  showWidget,
  moveWidget,
  resetDesktop,
  resetMobile,
  resetAll,
  isHidden,
  isCollapsed,
  REQUIRED_WIDGET_IDS,
} from "./dashboard-preferences";

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("Phase 24D · dashboard preferences", () => {
  it("defaults to empty schema at current version", () => {
    expect(DEFAULT_PREFERENCES.version).toBe(DASHBOARD_PREFERENCE_VERSION);
    expect(DEFAULT_PREFERENCES.hidden).toEqual([]);
  });

  it("parses valid payload", () => {
    const p = parsePreferences({
      version: DASHBOARD_PREFERENCE_VERSION,
      collapsed: ["a"],
      hidden: ["legacy-vix"],
      desktopOrder: ["a", "b"],
      mobileOrder: ["b", "a"],
    });
    expect(p.collapsed).toEqual(["a"]);
    expect(p.hidden).toEqual(["legacy-vix"]);
  });

  it("falls back on corrupted payload", () => {
    expect(parsePreferences("garbage")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences({ version: 999 })).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences({ version: DASHBOARD_PREFERENCE_VERSION, hidden: 42 })).toEqual({
      ...DEFAULT_PREFERENCES,
    });
  });

  it("strips required widget ids from parsed hidden list", () => {
    const p = parsePreferences({
      version: DASHBOARD_PREFERENCE_VERSION,
      hidden: [...REQUIRED_WIDGET_IDS, "legacy-vix"],
    });
    expect(p.hidden).toEqual(["legacy-vix"]);
  });

  it("load/save round-trips through storage", () => {
    const s = makeStorage();
    savePreferences(s, hideWidget(DEFAULT_PREFERENCES, "legacy-vix"));
    expect(loadPreferences(s).hidden).toEqual(["legacy-vix"]);
  });

  it("load returns defaults on JSON parse error", () => {
    const s = makeStorage();
    s.setItem("eb-dashboard-prefs", "{not json");
    expect(loadPreferences(s)).toEqual(DEFAULT_PREFERENCES);
  });

  it("required widget cannot be hidden", () => {
    const p = hideWidget(DEFAULT_PREFERENCES, "legacy-quote");
    expect(isHidden(p, "legacy-quote")).toBe(false);
  });

  it("optional widget hide/show", () => {
    let p = hideWidget(DEFAULT_PREFERENCES, "legacy-vix");
    expect(isHidden(p, "legacy-vix")).toBe(true);
    p = showWidget(p, "legacy-vix");
    expect(isHidden(p, "legacy-vix")).toBe(false);
  });

  it("collapse toggles", () => {
    let p = toggleCollapsed(DEFAULT_PREFERENCES, "legacy-cpr");
    expect(isCollapsed(p, "legacy-cpr")).toBe(true);
    p = toggleCollapsed(p, "legacy-cpr");
    expect(isCollapsed(p, "legacy-cpr")).toBe(false);
  });

  it("desktop reorder is independent of mobile reorder", () => {
    const start = { ...DEFAULT_PREFERENCES, desktopOrder: ["a", "b", "c"], mobileOrder: ["a", "b", "c"] };
    const p = moveWidget(start, "a", "down", "desktop");
    expect(p.desktopOrder).toEqual(["b", "a", "c"]);
    expect(p.mobileOrder).toEqual(["a", "b", "c"]);
  });

  it("move up on first item is a no-op", () => {
    const start = { ...DEFAULT_PREFERENCES, mobileOrder: ["a", "b"] };
    const p = moveWidget(start, "a", "up", "mobile");
    expect(p.mobileOrder).toEqual(["a", "b"]);
  });

  it("resetDesktop / resetMobile / resetAll", () => {
    const start = { ...DEFAULT_PREFERENCES, desktopOrder: ["a"], mobileOrder: ["b"], hidden: ["c"] };
    expect(resetDesktop(start).desktopOrder).toEqual([]);
    expect(resetMobile(start).mobileOrder).toEqual([]);
    expect(resetAll()).toEqual(DEFAULT_PREFERENCES);
  });
});