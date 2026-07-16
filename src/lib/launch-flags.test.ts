import { describe, it, expect } from "vitest";
import { DEFAULT_LAUNCH_FLAGS, resolveLaunchFlags } from "./launch-flags";

describe("launch-flags", () => {
  it("defaults incomplete markets to false", () => {
    expect(DEFAULT_LAUNCH_FLAGS.ENABLE_COMBINED_PCR).toBe(true);
    expect(DEFAULT_LAUNCH_FLAGS.ENABLE_MCX_COMMODITIES).toBe(false);
    expect(DEFAULT_LAUNCH_FLAGS.ENABLE_GLOBAL_METALS).toBe(false);
    expect(DEFAULT_LAUNCH_FLAGS.ENABLE_CRYPTO).toBe(false);
  });

  it("defaults NIFTY/BANKNIFTY/VIX to true", () => {
    expect(DEFAULT_LAUNCH_FLAGS.ENABLE_LAUNCH_NIFTY).toBe(true);
    expect(DEFAULT_LAUNCH_FLAGS.ENABLE_LAUNCH_BANKNIFTY).toBe(true);
    expect(DEFAULT_LAUNCH_FLAGS.ENABLE_LAUNCH_INDIA_VIX).toBe(true);
  });

  it("resolves from env with defaults", () => {
    const flags = resolveLaunchFlags({});
    expect(flags).toEqual(DEFAULT_LAUNCH_FLAGS);
  });

  it("parses truthy/falsy string values", () => {
    expect(resolveLaunchFlags({ ENABLE_CRYPTO: "true" }).ENABLE_CRYPTO).toBe(true);
    expect(resolveLaunchFlags({ ENABLE_CRYPTO: "1" }).ENABLE_CRYPTO).toBe(true);
    expect(resolveLaunchFlags({ ENABLE_LAUNCH_NIFTY: "false" }).ENABLE_LAUNCH_NIFTY).toBe(false);
    expect(resolveLaunchFlags({ ENABLE_LAUNCH_NIFTY: "0" }).ENABLE_LAUNCH_NIFTY).toBe(false);
  });

  it("ignores unknown values and keeps defaults", () => {
    expect(resolveLaunchFlags({ ENABLE_CRYPTO: "maybe" }).ENABLE_CRYPTO).toBe(false);
  });
});