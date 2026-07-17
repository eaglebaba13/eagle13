// Phase 29 · Stage 1 — Subscription launch checklist verdict.
//
// Never returns READY_FOR_PUBLIC automatically; requires explicit
// manual sign-off.

export interface LaunchChecklistInputs {
  readonly authentication: boolean;
  readonly authorization: boolean;
  readonly dashboard: boolean;
  readonly mobile: boolean;
  readonly desktop: boolean;
  readonly performanceOk: boolean;
  readonly caching: boolean;
  readonly diagnostics: boolean;
  readonly featureFlags: boolean;
  readonly providerHealth: boolean;
  readonly noMockData: boolean;
  readonly noBrokerExecution: boolean;
  readonly a11yPass: boolean;
  readonly testsPassing: boolean;
  readonly manualPublicSignoff: boolean;
}

export type LaunchVerdict =
  | "NOT_READY"
  | "READY_FOR_BETA"
  | "READY_FOR_SUBSCRIPTION"
  | "READY_FOR_PUBLIC";

export interface LaunchChecklistReport {
  readonly verdict: LaunchVerdict;
  readonly missing: readonly (keyof LaunchChecklistInputs)[];
  readonly formulaVersion: string;
}

export const LAUNCH_CHECKLIST_VERSION = "launch-checklist@1.0.0";

const HARD: readonly (keyof LaunchChecklistInputs)[] = [
  "authentication","authorization","noMockData","noBrokerExecution","testsPassing",
];
const SUBSCRIPTION: readonly (keyof LaunchChecklistInputs)[] = [
  "dashboard","mobile","desktop","performanceOk","caching",
  "diagnostics","featureFlags","providerHealth","a11yPass",
];

export function evaluateLaunchChecklist(inp: LaunchChecklistInputs): LaunchChecklistReport {
  const missing: (keyof LaunchChecklistInputs)[] = [];
  for (const k of HARD) if (!inp[k]) missing.push(k);
  if (missing.length > 0) {
    return { verdict: "NOT_READY", missing, formulaVersion: LAUNCH_CHECKLIST_VERSION };
  }
  const subMissing = SUBSCRIPTION.filter((k) => !inp[k]);
  if (subMissing.length > 0) {
    return { verdict: "READY_FOR_BETA", missing: subMissing, formulaVersion: LAUNCH_CHECKLIST_VERSION };
  }
  if (!inp.manualPublicSignoff) {
    return {
      verdict: "READY_FOR_SUBSCRIPTION",
      missing: ["manualPublicSignoff"],
      formulaVersion: LAUNCH_CHECKLIST_VERSION,
    };
  }
  return { verdict: "READY_FOR_PUBLIC", missing: [], formulaVersion: LAUNCH_CHECKLIST_VERSION };
}