import { describe, it, expect } from "vitest";
import {
  evaluateProviderEnvPresence,
  liveCredentialsComplete,
} from "./env-presence.server";

const FULL_LIVE = {
  UPSTOX_MARKET_DATA_MODE: "live",
  UPSTOX_API_KEY: "abc123",
  UPSTOX_API_SECRET: "xyz789",
  UPSTOX_ACCESS_TOKEN: "live-token",
};

describe("provider env-presence diagnostic", () => {
  it("reports PRESENT for all secrets in a production deployment", () => {
    const p = evaluateProviderEnvPresence({ ...FULL_LIVE, NODE_ENV: "production" });
    expect(p.UPSTOX_MARKET_DATA_MODE).toBe("PRESENT");
    expect(p.UPSTOX_API_KEY).toBe("PRESENT");
    expect(p.UPSTOX_API_SECRET).toBe("PRESENT");
    expect(p.UPSTOX_ACCESS_TOKEN).toBe("PRESENT");
    expect(p.runtimeEnvironment).toBe("production");
    expect(p.deploymentRestartRequired).toBe(false);
    expect(liveCredentialsComplete(p)).toBe(true);
  });

  it("reports preview runtime via LOVABLE_ENVIRONMENT and full presence", () => {
    const p = evaluateProviderEnvPresence({ ...FULL_LIVE, LOVABLE_ENVIRONMENT: "preview" });
    expect(p.runtimeEnvironment).toBe("preview");
    expect(liveCredentialsComplete(p)).toBe(true);
  });

  it("reports MISSING for absent secrets and does NOT expose values", () => {
    const p = evaluateProviderEnvPresence({ UPSTOX_MARKET_DATA_MODE: "live" });
    expect(p.UPSTOX_API_KEY).toBe("MISSING");
    expect(p.UPSTOX_API_SECRET).toBe("MISSING");
    expect(p.UPSTOX_ACCESS_TOKEN).toBe("MISSING");
    // Serialized diagnostic must never contain a value.
    const serialized = JSON.stringify(p);
    expect(serialized).not.toContain("live-token");
  });

  it("reports PLACEHOLDER when a well-known placeholder token is stored", () => {
    const p = evaluateProviderEnvPresence({
      UPSTOX_MARKET_DATA_MODE: "live",
      UPSTOX_API_KEY: "key",
      UPSTOX_API_SECRET: "secret",
      UPSTOX_ACCESS_TOKEN: "placeholder",
    });
    expect(p.UPSTOX_ACCESS_TOKEN).toBe("PLACEHOLDER");
    expect(liveCredentialsComplete(p)).toBe(false);
  });

  it("signals redeploy-required when live mode is set but credentials are missing", () => {
    const p = evaluateProviderEnvPresence({ UPSTOX_MARKET_DATA_MODE: "live" });
    expect(p.deploymentRestartRequired).toBe(true);
  });

  it("reports INVALID for an unrecognized mode value", () => {
    const p = evaluateProviderEnvPresence({ UPSTOX_MARKET_DATA_MODE: "banana" });
    expect(p.UPSTOX_MARKET_DATA_MODE).toBe("INVALID");
  });

  it("never returns raw secret values in its output", () => {
    const p = evaluateProviderEnvPresence(FULL_LIVE);
    const s = JSON.stringify(p);
    expect(s).not.toContain("abc123");
    expect(s).not.toContain("xyz789");
    expect(s).not.toContain("live-token");
  });
});