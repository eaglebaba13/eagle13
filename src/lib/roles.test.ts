import { describe, it, expect } from "vitest";
import { hasPermission, highestRole, ROLE_RANK, ROLES } from "./roles";

describe("roles", () => {
  it("guest cannot cloud-sync but free can", () => {
    expect(hasPermission("guest", "cloud.sync")).toBe(false);
    expect(hasPermission("free", "cloud.sync")).toBe(true);
  });

  it("only admin can access admin console", () => {
    for (const r of ROLES) {
      expect(hasPermission(r, "admin.console")).toBe(r === "admin");
    }
  });

  it("broker access requires pro or higher", () => {
    expect(hasPermission("free", "read.broker")).toBe(false);
    expect(hasPermission("pro", "read.broker")).toBe(true);
    expect(hasPermission("professional", "read.broker")).toBe(true);
    expect(hasPermission("enterprise", "read.broker")).toBe(true);
    expect(hasPermission("admin", "read.broker")).toBe(true);
  });

  it("highestRole picks the top-ranked role", () => {
    expect(highestRole([])).toBe("guest");
    expect(highestRole(["free", "pro"])).toBe("pro");
    expect(highestRole(["pro", "admin", "free"])).toBe("admin");
  });

  it("null role has no permissions", () => {
    expect(hasPermission(null, "read.dashboard")).toBe(false);
  });

  it("rank is monotonic", () => {
    expect(ROLE_RANK.guest).toBeLessThan(ROLE_RANK.free);
    expect(ROLE_RANK.free).toBeLessThan(ROLE_RANK.pro);
    expect(ROLE_RANK.pro).toBeLessThan(ROLE_RANK.professional);
    expect(ROLE_RANK.professional).toBeLessThan(ROLE_RANK.enterprise);
    expect(ROLE_RANK.enterprise).toBeLessThan(ROLE_RANK.admin);
  });
});