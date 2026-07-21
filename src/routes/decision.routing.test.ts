import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { shouldSuppressShell } from "@/components/AppShell";

// Regression: /decision must resolve to the Decision Intelligence Engine,
// never the Live Astro Level Terminal, and must not render its own sidebar.
describe("decision route wiring", () => {
  const src = readFileSync("src/routes/decision.tsx", "utf8");

  it('binds createFileRoute("/decision") to DecisionPage', () => {
    expect(src).toMatch(/createFileRoute\("\/decision"\)\(\{[\s\S]*?component:\s*DecisionPage/);
  });

  it("does not import Live Terminal / Astro Layout components", () => {
    expect(src).not.toMatch(/LiveTerminal(Page|Layout)?|AstroLayout|TerminalLayout/);
  });

  it("does not render its own AppSidebar / eb-sidebar", () => {
    expect(src).not.toMatch(/AppSidebar|eb-sidebar/);
  });

  it("global AppShell wraps /decision (route is not self-shelled)", () => {
    expect(shouldSuppressShell("/decision")).toBe(false);
  });

  it("self-shelled routes suppress the global shell (no double sidebar)", () => {
    for (const p of ["/", "/astro", "/live-terminal", "/live-market-terminal", "/live-levels", "/option-strategy"]) {
      expect(shouldSuppressShell(p)).toBe(true);
    }
  });
});