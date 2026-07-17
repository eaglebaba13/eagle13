import { describe, it, expect } from "vitest";
import { shouldSuppressShell, buildBreadcrumbs } from "./AppShell";

describe("Phase 36 · AppShell suppression", () => {
  it("suppresses on /auth and its children", () => {
    expect(shouldSuppressShell("/auth")).toBe(true);
    expect(shouldSuppressShell("/auth/callback")).toBe(true);
  });

  it("suppresses on self-shelled routes", () => {
    expect(shouldSuppressShell("/")).toBe(true);
    expect(shouldSuppressShell("/astro")).toBe(true);
    expect(shouldSuppressShell("/live-terminal")).toBe(true);
    expect(shouldSuppressShell("/live-market-terminal")).toBe(true);
    expect(shouldSuppressShell("/live-levels")).toBe(true);
    expect(shouldSuppressShell("/option-strategy")).toBe(true);
  });

  it("suppresses on API / MCP / well-known prefixes", () => {
    expect(shouldSuppressShell("/api/public/webhooks/razorpay")).toBe(true);
    expect(shouldSuppressShell("/.mcp")).toBe(true);
    expect(shouldSuppressShell("/.well-known/oauth-protected-resource")).toBe(true);
  });

  it("keeps the shell on ordinary app routes", () => {
    expect(shouldSuppressShell("/decision")).toBe(false);
    expect(shouldSuppressShell("/settings")).toBe(false);
    expect(shouldSuppressShell("/admin/system-status")).toBe(false);
  });
});

describe("Phase 36 · Breadcrumbs", () => {
  it("returns just Home on /", () => {
    const c = buildBreadcrumbs("/");
    expect(c).toEqual([{ label: "Home", to: "/" }]);
  });

  it("resolves labels from NAV_REGISTRY when available", () => {
    const c = buildBreadcrumbs("/decision");
    expect(c[0].label).toBe("Home");
    expect(c[c.length - 1].label).toBe("Decision");
  });

  it("falls back to prettified segments when no registry entry", () => {
    const c = buildBreadcrumbs("/admin/beta-readiness");
    expect(c.map((x) => x.label)).toEqual(["Home", "Admin", "Beta Readiness"]);
  });
});