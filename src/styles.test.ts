import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Celestial Terminal theme tokens", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

  it("defines distinct dark and daylight observatory foundations", () => {
    // Dark theme: deep charcoal surface
    expect(css).toContain('--background: oklch(0.19 0.005 260);');
    // Light theme: warm off-white surface
    expect(css).toContain('--background: oklch(0.972 0.008 85);');
    // Premium institutional light background
    expect(css).toContain('--eb-bg: #f7f4ee;');
  });

  it("keeps explicit semantic signal colors", () => {
    expect(css).toContain("--eb-status-buy");
    expect(css).toContain("--eb-status-sell");
    expect(css).toContain("--eb-status-wait");
    expect(css).toContain("--eb-status-astro");
  });
});
