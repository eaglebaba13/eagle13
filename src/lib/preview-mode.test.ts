import { describe, it, expect } from "vitest";
import { resolvePreviewNav, categoriseNavItem, corePreviewNavIds } from "./preview-mode";

describe("preview-mode navigation filter", () => {
  it("returns full navigation when preview mode is off", () => {
    const full = resolvePreviewNav({ previewMode: false });
    const preview = resolvePreviewNav({ previewMode: true });
    expect(full.length).toBeGreaterThanOrEqual(preview.length);
  });

  it("keeps core research entries in preview mode", () => {
    const items = resolvePreviewNav({ previewMode: true });
    const ids = new Set(items.map((i) => i.id));
    for (const id of ["dashboard", "combined-pcr", "market-breadth", "decision"]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("categoriser flags admin ids", () => {
    expect(categoriseNavItem("admin.providers")).toBe("admin");
    expect(categoriseNavItem("dashboard")).toBe("core");
  });

  it("core preview ids are non-empty", () => {
    expect(corePreviewNavIds().length).toBeGreaterThan(0);
  });
});