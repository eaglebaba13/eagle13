// Phase 29 · Stage 1 — Production health aggregator.

export type HealthGrade = "GREEN" | "YELLOW" | "RED";

export interface HealthInputs {
  readonly providers: HealthGrade;
  readonly gti: HealthGrade;
  readonly combinedPcr: HealthGrade;
  readonly breadth: HealthGrade;
  readonly optionChain: HealthGrade;
  readonly dashboard: HealthGrade;
  readonly performance: HealthGrade;
  readonly cache: HealthGrade;
  readonly build: HealthGrade;
}

export interface HealthReport {
  readonly overall: HealthGrade;
  readonly reds: readonly (keyof HealthInputs)[];
  readonly yellows: readonly (keyof HealthInputs)[];
  readonly formulaVersion: string;
}

export const PROD_HEALTH_VERSION = "prod-health@1.0.0";

const KEYS: readonly (keyof HealthInputs)[] = [
  "providers","gti","combinedPcr","breadth","optionChain",
  "dashboard","performance","cache","build",
];

export function aggregateHealth(inp: HealthInputs): HealthReport {
  const reds: (keyof HealthInputs)[] = [];
  const yellows: (keyof HealthInputs)[] = [];
  for (const k of KEYS) {
    if (inp[k] === "RED") reds.push(k);
    else if (inp[k] === "YELLOW") yellows.push(k);
  }
  const overall: HealthGrade =
    reds.length > 0 ? "RED" : yellows.length > 0 ? "YELLOW" : "GREEN";
  return { overall, reds, yellows, formulaVersion: PROD_HEALTH_VERSION };
}