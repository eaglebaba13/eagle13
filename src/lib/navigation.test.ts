import { describe, it, expect } from "vitest";
import {
  NAV_REGISTRY,
  desktopNav,
  mobileDrawerNav,
  mobileBottomNav,
  resolveNavigationForContext,
  resolveDesktopNav,
  resolveMobileDrawerNav,
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

  it("every item has a status classification", () => {
    const valid = ["LIVE", "RESEARCH", "PROVIDER_PENDING", "COMING_SOON", "INTERNAL"];
    for (const item of NAV_REGISTRY) {
      expect(valid).toContain(item.status);
    }
  });

  it("no commercial items in registry (license, billing, pricing, referrals)", () => {
    const ids = NAV_REGISTRY.map((n) => n.id);
    expect(ids).not.toContain("license");
    expect(ids).not.toContain("billing");
    expect(ids).not.toContain("pricing");
    expect(ids).not.toContain("referrals");
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

describe("Phase 24B · navigation filtering (personal terminal)", () => {
  it("resolveDesktopNav returns all desktop-visible items", () => {
    const d = resolveDesktopNav().map((i) => i.id);
    expect(d.length).toBeGreaterThan(0);
    expect(d).toContain("dashboard");
    expect(d).toContain("astro-levels");
  });

  it("resolveMobileDrawerNav returns all mobile-visible items", () => {
    const m = resolveMobileDrawerNav().map((i) => i.id);
    expect(m.length).toBeGreaterThan(0);
    expect(m).toContain("dashboard");
  });

  it("resolveNavigationForContext returns all items", () => {
    const all = resolveNavigationForContext();
    expect(all.length).toBe(NAV_REGISTRY.length);
  });
});
