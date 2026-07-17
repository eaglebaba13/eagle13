// Phase 29 · Stage 1 — Static accessibility audit checklist.

export interface A11yInputs {
  readonly keyboardNavigation: boolean;
  readonly focusOrderLogical: boolean;
  readonly focusVisible: boolean;
  readonly screenReaderLandmarks: boolean;
  readonly wcagContrastAA: boolean;
  readonly reducedMotionRespected: boolean;
  readonly iconButtonLabels: boolean;
  readonly formLabelsAssociated: boolean;
}

export type A11yGrade = "PASS" | "FAIL";

export interface A11yReport {
  readonly grade: A11yGrade;
  readonly pass: number;
  readonly fail: number;
  readonly criteria: readonly { key: keyof A11yInputs; ok: boolean }[];
  readonly formulaVersion: string;
}

export const A11Y_REPORT_VERSION = "a11y-audit@1.0.0";

const KEYS: readonly (keyof A11yInputs)[] = [
  "keyboardNavigation","focusOrderLogical","focusVisible","screenReaderLandmarks",
  "wcagContrastAA","reducedMotionRespected","iconButtonLabels","formLabelsAssociated",
];

export function evaluateA11y(inp: A11yInputs): A11yReport {
  const criteria = KEYS.map((k) => ({ key: k, ok: inp[k] === true }));
  const pass = criteria.filter((c) => c.ok).length;
  const fail = criteria.length - pass;
  return {
    grade: fail === 0 ? "PASS" : "FAIL",
    pass, fail, criteria,
    formulaVersion: A11Y_REPORT_VERSION,
  };
}