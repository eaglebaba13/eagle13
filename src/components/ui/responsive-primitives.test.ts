import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Phase 46B — Guard responsive/accessibility rules on shared primitives.
// These are string-level assertions on the compiled class strings so the
// tests remain node-only (matching vitest config) and catch regressions if
// the primitives lose their mobile-safety rules.

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("shared UI responsive primitives", () => {
  it("Dialog content constrains width and height with scroll", () => {
    const src = read("src/components/ui/dialog.tsx");
    expect(src).toMatch(/w-\[calc\(100vw-1rem\)\]/);
    expect(src).toMatch(/max-h-\[calc\(100dvh-/);
    expect(src).toMatch(/overflow-y-auto/);
  });

  it("Sheet content scrolls internally and clamps width", () => {
    const src = read("src/components/ui/sheet.tsx");
    expect(src).toMatch(/overflow-y-auto/);
    expect(src).toMatch(/max-w-\[calc\(100vw-2rem\)\]/);
  });

  it("Popover respects collision padding and viewport width", () => {
    const src = read("src/components/ui/popover.tsx");
    expect(src).toMatch(/collisionPadding=\{8\}/);
    expect(src).toMatch(/max-w-\[calc\(100vw-1rem\)\]/);
  });

  it("Tabs list scrolls horizontally on narrow viewports", () => {
    const src = read("src/components/ui/tabs.tsx");
    expect(src).toMatch(/overflow-x-auto/);
  });

  it("Inputs meet 44px touch target on mobile", () => {
    const src = read("src/components/ui/input.tsx");
    expect(src).toMatch(/h-11 md:h-9/);
  });

  it("Textarea has larger min-height on mobile", () => {
    const src = read("src/components/ui/textarea.tsx");
    expect(src).toMatch(/min-h-\[80px\] md:min-h-\[60px\]/);
  });

  it("Table wrapper prevents vertical overflow spill", () => {
    const src = read("src/components/ui/table.tsx");
    expect(src).toMatch(/overflow-x-auto/);
    expect(src).toMatch(/overflow-y-hidden/);
  });

  it("Chart container is width-safe and legend wraps", () => {
    const src = read("src/components/ui/chart.tsx");
    expect(src).toMatch(/w-full min-w-0/);
    expect(src).toMatch(/flex flex-wrap items-center justify-center/);
  });
});