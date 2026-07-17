import { describe, expect, it } from "vitest";
import { humaniseLegacyLabel, humaniseStatus, rollupHealth } from "./index";

describe("humaniseStatus", () => {
  it("returns skeleton for LOADING", () => {
    const r = humaniseStatus("LOADING");
    expect(r.showSkeleton).toBe(true);
    expect(r.tone).toBe("info");
  });
  it("marks PROVIDER_UNAVAILABLE as danger + retryable", () => {
    const r = humaniseStatus("PROVIDER_UNAVAILABLE", "Upstox");
    expect(r.tone).toBe("danger");
    expect(r.retryable).toBe(true);
    expect(r.detail).toContain("Upstox");
  });
  it("labels COMING_SOON without skeleton or retry", () => {
    const r = humaniseStatus("COMING_SOON");
    expect(r.label).toBe("Coming soon");
    expect(r.showSkeleton).toBe(false);
    expect(r.retryable).toBe(false);
  });
});

describe("humaniseLegacyLabel", () => {
  it.each([
    ["Missing", "Waiting for provider"],
    ["Unavailable", "Provider temporarily unavailable"],
    ["Not Available", "Provider temporarily unavailable"],
    ["No Data", "Waiting for provider"],
  ])("%s → %s", (raw, expected) => {
    expect(humaniseLegacyLabel(raw)).toBe(expected);
  });
  it("passes through unknown labels", () => {
    expect(humaniseLegacyLabel("Custom label")).toBe("Custom label");
  });
  it("returns empty string for nullish input", () => {
    expect(humaniseLegacyLabel(null)).toBe("");
    expect(humaniseLegacyLabel(undefined)).toBe("");
  });
});

describe("rollupHealth", () => {
  it("GREEN when all ready", () => {
    expect(rollupHealth(["READY", "READY"])).toBe("GREEN");
  });
  it("YELLOW when any degraded/partial/waiting", () => {
    expect(rollupHealth(["READY", "PARTIAL"])).toBe("YELLOW");
    expect(rollupHealth(["READY", "PROVIDER_DEGRADED"])).toBe("YELLOW");
    expect(rollupHealth(["READY", "WAITING_PROVIDER"])).toBe("YELLOW");
  });
  it("RED when any unavailable, even alongside degraded", () => {
    expect(rollupHealth(["PROVIDER_UNAVAILABLE", "PARTIAL"])).toBe("RED");
  });
});