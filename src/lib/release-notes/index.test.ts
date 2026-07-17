import { describe, expect, it } from "vitest";
import { latestRelease, PLATFORM_VERSION, RELEASE_HISTORY, versionInfo } from "./index";

describe("release notes", () => {
  it("latestRelease returns the top of history", () => {
    expect(latestRelease().version).toBe(RELEASE_HISTORY[0].version);
  });
  it("PLATFORM_VERSION matches latest release", () => {
    expect(PLATFORM_VERSION).toBe(latestRelease().version);
  });
  it("versionInfo includes formula + provider stack", () => {
    const v = versionInfo();
    expect(v.version).toBe("1.0.0");
    expect(v.formulaVersion).toMatch(/ASTRO/);
    expect(v.providerStack).toMatch(/Upstox/);
  });
  it("history is sorted newest-first", () => {
    const dates = RELEASE_HISTORY.map((r) => r.date);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });
});