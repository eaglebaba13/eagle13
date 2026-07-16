import { describe, it, expect } from "vitest";
import {
  NAV_REGISTRY,
  desktopNav,
  mobileDrawerNav,
  mobileBottomNav,
} from "./navigation";

describe("Phase 24A · shared navigation registry", () => {
  it("registry contains a canonical Dashboard route", () => {
    const dash = NAV_REGISTRY.find((n) => n.id === "dashboard");
    expect(dash).toBeDefined();
    expect(dash?.to).toBe("/");
  });

  it("ids are unique", () => {
    const ids = NAV_REGISTRY.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("desktop and mobile drawer share the same route set", () => {
    const desk = new Set(desktopNav().map((n) => n.id));
    const mob = new Set(mobileDrawerNav().map((n) => n.id));
    expect([...desk].sort()).toEqual([...mob].sort());
  });

  it("desktop and mobile drawer share the same ordering", () => {
    const desk = desktopNav().map((n) => n.id);
    const mob = mobileDrawerNav().map((n) => n.id);
    expect(desk).toEqual(mob);
  });

  it("mobile bottom nav is a small subset (≤5) of the full menu", () => {
    const bottom = mobileBottomNav();
    expect(bottom.length).toBeGreaterThan(0);
    expect(bottom.length).toBeLessThanOrEqual(5);
    for (const it of bottom) {
      expect(NAV_REGISTRY.some((n) => n.id === it.id)).toBe(true);
    }
  });

  it("every routed item points to a slash-prefixed path", () => {
    for (const it of NAV_REGISTRY) {
      if (it.to) expect(it.to.startsWith("/")).toBe(true);
    }
  });
});