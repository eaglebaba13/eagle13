import { describe, expect, it } from "vitest";
import {
  evaluateFeatureFlag,
  findFeatureFlag,
  listFlagsForPlan,
  FEATURE_FLAG_REGISTRY,
  FEATURE_FLAG_VERSION,
} from "./index";

describe("feature-flags", () => {
  it("unknown flag denies with unknown_flag", () => {
    const d = evaluateFeatureFlag("nope", { plan: "pro", subscriptionActive: true });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("unknown_flag");
  });
  it("denies below-minimum plan", () => {
    const d = evaluateFeatureFlag("backtest.advanced", { plan: "pro", subscriptionActive: true });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("plan_below_minimum");
  });
  it("denies inactive subscription even on matching plan", () => {
    const d = evaluateFeatureFlag("dashboard.premium", { plan: "pro", subscriptionActive: false });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("subscription_not_active");
  });
  it("allows when plan matches and subscription active", () => {
    const d = evaluateFeatureFlag("options.chain", { plan: "pro", subscriptionActive: true });
    expect(d.allowed).toBe(true);
  });
  it("free plan has dashboard.basic", () => {
    const flags = listFlagsForPlan("free");
    expect(flags.some((f) => f.id === "dashboard.basic")).toBe(true);
    expect(flags.some((f) => f.id === "backtest.advanced")).toBe(false);
  });
  it("enterprise sees admin.console", () => {
    expect(listFlagsForPlan("enterprise").some((f) => f.id === "admin.console")).toBe(true);
    expect(listFlagsForPlan("pro").some((f) => f.id === "admin.console")).toBe(false);
  });
  it("registry entries are unique by id", () => {
    const ids = FEATURE_FLAG_REGISTRY.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("findFeatureFlag returns null for unknown id", () => {
    expect(findFeatureFlag("xyz")).toBeNull();
  });
  it("version stable", () => {
    expect(FEATURE_FLAG_VERSION).toBe("feature-flags@1.0.0");
  });
});