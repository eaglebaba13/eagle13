import { describe, it, expect } from "vitest";
import { checkSubscriptionAccess } from "../subscription-gate";
import { hasPermission, ROLE_RANK } from "../roles";

describe("SaaS Monetization & User Management RBAC", () => {
  it("superadmin has top rank and access to all admin capabilities", () => {
    expect(ROLE_RANK.superadmin).toBe(6);
    expect(ROLE_RANK.admin).toBe(5);
    expect(ROLE_RANK.superadmin).toBeGreaterThan(ROLE_RANK.admin);

    expect(hasPermission("superadmin", "admin.console")).toBe(true);
    expect(hasPermission("superadmin", "admin.users")).toBe(true);
    expect(hasPermission("superadmin", "admin.plans")).toBe(true);
    expect(hasPermission("superadmin", "admin.payments")).toBe(true);
    expect(hasPermission("superadmin", "superadmin.roles")).toBe(true);
  });

  it("admin has access to admin console, users, plans, and payments but not superadmin.roles", () => {
    expect(hasPermission("admin", "admin.console")).toBe(true);
    expect(hasPermission("admin", "admin.users")).toBe(true);
    expect(hasPermission("admin", "admin.plans")).toBe(true);
    expect(hasPermission("admin", "admin.payments")).toBe(true);
    expect(hasPermission("admin", "superadmin.roles")).toBe(false);
  });

  it("regular user or guest cannot access admin consoles", () => {
    expect(hasPermission("user", "admin.users")).toBe(false);
    expect(hasPermission("guest", "admin.users")).toBe(false);
    expect(hasPermission("pro", "admin.users")).toBe(false);
  });

  describe("checkSubscriptionAccess", () => {
    it("superadmin and admin always bypass tier gates", () => {
      const res1 = checkSubscriptionAccess("superadmin", "free", null, ["pro"]);
      expect(res1.allowed).toBe(true);

      const res2 = checkSubscriptionAccess("admin", "free", null, ["institutional"]);
      expect(res2.allowed).toBe(true);
    });

    it("active pro plan allows pro-gated features", () => {
      const futureDate = new Date(Date.now() + 10 * 86400 * 1000).toISOString();
      const res = checkSubscriptionAccess("user", "pro", futureDate, ["pro", "institutional"]);
      expect(res.allowed).toBe(true);
      expect(res.isExpired).toBe(false);
    });

    it("expired pro plan blocks access", () => {
      const pastDate = new Date(Date.now() - 5 * 86400 * 1000).toISOString();
      const res = checkSubscriptionAccess("user", "pro", pastDate, ["pro"]);
      expect(res.allowed).toBe(false);
      expect(res.isExpired).toBe(true);
    });

    it("free user is blocked on pro-gated features", () => {
      const res = checkSubscriptionAccess("user", "free", null, ["pro", "institutional"]);
      expect(res.allowed).toBe(false);
    });
  });
});

