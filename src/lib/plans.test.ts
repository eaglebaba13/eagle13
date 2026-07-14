import { describe, expect, it } from "vitest";
import { PLANS, PLAN_ORDER, planForRole, planRank, getPlan } from "./plans";

describe("plans", () => {
  it("has all four canonical plans", () => {
    expect(PLAN_ORDER).toEqual(["free", "pro", "professional", "enterprise"]);
  });

  it("plan ordering is monotonic", () => {
    expect(planRank("free")).toBeLessThan(planRank("pro"));
    expect(planRank("pro")).toBeLessThan(planRank("professional"));
    expect(planRank("professional")).toBeLessThan(planRank("enterprise"));
  });

  it("higher plans inherit lower-plan capabilities", () => {
    for (const cap of PLANS.free.capabilities) {
      expect(PLANS.pro.capabilities).toContain(cap);
      expect(PLANS.professional.capabilities).toContain(cap);
      expect(PLANS.enterprise.capabilities).toContain(cap);
    }
  });

  it("premium capabilities are gated correctly", () => {
    expect(PLANS.free.capabilities).not.toContain("decision.intelligence");
    expect(PLANS.pro.capabilities).not.toContain("options.analytics");
    expect(PLANS.professional.capabilities).toContain("options.analytics");
    expect(PLANS.enterprise.capabilities).toContain("broker.live");
    expect(PLANS.professional.capabilities).not.toContain("broker.live");
  });

  it("planForRole maps roles to plans", () => {
    expect(planForRole("guest")).toBe("free");
    expect(planForRole("free")).toBe("free");
    expect(planForRole("pro")).toBe("pro");
    expect(planForRole("professional")).toBe("professional");
    expect(planForRole("enterprise")).toBe("enterprise");
    expect(planForRole("admin")).toBe("enterprise");
  });

  it("enterprise is marked contact-sales without a fixed price", () => {
    const p = getPlan("enterprise");
    expect(p.contactSales).toBe(true);
    expect(p.monthlyPrice).toBeNull();
  });

  it("limits are configurable per plan", () => {
    expect(PLANS.free.limits.watchlists).toBeLessThan(PLANS.pro.limits.watchlists);
    expect(PLANS.pro.limits.backtestsPerDay).toBeLessThan(PLANS.professional.limits.backtestsPerDay);
  });
});