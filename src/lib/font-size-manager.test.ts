import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  clampFontScale,
  getStoredFontScale,
  applyFontScaleToDOM,
  increaseFontScale,
  decreaseFontScale,
  resetFontScale,
  MIN_FONT_SCALE,
  MAX_FONT_SCALE,
  DEFAULT_FONT_SCALE,
} from "./font-size-manager";

describe("EagleBABA Dynamic Font Scale Manager", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const fakeLocalStorage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
      length: 0,
      key: () => null,
    } as unknown as Storage;

    const fakeDocumentElement = {
      style: {
        fontSize: "",
        setProperty: (_name: string, _value: string) => {},
      },
    } as unknown as HTMLElement;

    // Attach mocks to global
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: fakeLocalStorage,
      dispatchEvent: () => true,
    };
    (globalThis as unknown as { document: unknown }).document = {
      documentElement: fakeDocumentElement,
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it("clamps font scale within [85, 125] range", () => {
    expect(clampFontScale(50)).toBe(MIN_FONT_SCALE);
    expect(clampFontScale(85)).toBe(85);
    expect(clampFontScale(100)).toBe(100);
    expect(clampFontScale(125)).toBe(125);
    expect(clampFontScale(200)).toBe(MAX_FONT_SCALE);
    expect(clampFontScale(NaN)).toBe(DEFAULT_FONT_SCALE);
  });

  it("reads default font scale when localStorage is empty", () => {
    expect(getStoredFontScale()).toBe(DEFAULT_FONT_SCALE);
  });

  it("applies font scale to documentElement and saves to localStorage", () => {
    const applied = applyFontScaleToDOM(110);
    expect(applied).toBe(110);
    expect(globalThis.document.documentElement.style.fontSize).toBe("110%");
    expect(globalThis.window.localStorage.getItem("eb-font-scale")).toBe("110");
  });

  it("increases font scale in 5% step increments up to maximum", () => {
    applyFontScaleToDOM(120);
    const inc1 = increaseFontScale();
    expect(inc1).toBe(125);

    // Should not exceed 125
    const inc2 = increaseFontScale();
    expect(inc2).toBe(125);
  });

  it("decreases font scale in 5% step increments down to minimum", () => {
    applyFontScaleToDOM(90);
    const dec1 = decreaseFontScale();
    expect(dec1).toBe(85);

    // Should not go below 85
    const dec2 = decreaseFontScale();
    expect(dec2).toBe(85);
  });

  it("resets font scale cleanly to 100%", () => {
    applyFontScaleToDOM(115);
    const reset = resetFontScale();
    expect(reset).toBe(DEFAULT_FONT_SCALE);
    expect(globalThis.document.documentElement.style.fontSize).toBe("100%");
    expect(globalThis.window.localStorage.getItem("eb-font-scale")).toBe("100");
  });
});
