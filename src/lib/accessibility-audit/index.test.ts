import { describe, expect, it } from "vitest";
import { evaluateA11y, A11Y_REPORT_VERSION } from "./index";

describe("a11y-audit", () => {
  it("PASS when every criterion true", () => {
    const r = evaluateA11y({
      keyboardNavigation: true, focusOrderLogical: true, focusVisible: true,
      screenReaderLandmarks: true, wcagContrastAA: true, reducedMotionRespected: true,
      iconButtonLabels: true, formLabelsAssociated: true,
    });
    expect(r.grade).toBe("PASS");
    expect(r.fail).toBe(0);
  });
  it("FAIL when any criterion false", () => {
    const r = evaluateA11y({
      keyboardNavigation: true, focusOrderLogical: true, focusVisible: false,
      screenReaderLandmarks: true, wcagContrastAA: true, reducedMotionRespected: true,
      iconButtonLabels: true, formLabelsAssociated: true,
    });
    expect(r.grade).toBe("FAIL");
    expect(r.fail).toBe(1);
  });
  it("version stable", () => {
    expect(A11Y_REPORT_VERSION).toBe("a11y-audit@1.0.0");
  });
});