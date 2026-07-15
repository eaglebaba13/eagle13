// Phase 21.2 · Stage 4 — deterministic JSON + CSV export for validation runs.
// Spec §20.

import { INTRADAY_FORMULA_VERSIONS } from "./engine-version";
import type { SessionSimulation } from "./gann-intraday-simulator";
import type { InstrumentSymbol } from "./gann-intraday-policy";

export type ValidationExportArgs = {
  instrument: InstrumentSymbol;
  tradingDate: string; // YYYY-MM-DD
  anchorIst: string;
  previousClose: number;
  ambiguousPolicy: string;
  simulation: SessionSimulation;
};

export const VALIDATION_CSV_COLUMNS = [
  "formulaVersion",
  "instrument",
  "tradingDate",
  "anchorIst",
  "previousClose",
  "planet",
  "sourceLevel",
  "absoluteDegree",
  "levelValue",
  "side",
  "safety",
  "pivotConfluence",
  "clusterCount",
  "touchTime",
  "confirmTime",
  "retestTime",
  "entry",
  "stop",
  "target",
  "outcome",
  "mfe",
  "mae",
  "cubeGrade",
  "cubeAction",
  "cubeReasons",
  "ambiguousPolicy",
  "ambiguousCandleCount",
] as const;

function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function validationExportFilename(
  instrument: InstrumentSymbol,
  tradingDate: string,
  ext: "csv" | "json",
): string {
  return `GANN_ABSOLUTE_INTRADAY_VALIDATION_${instrument}_${tradingDate}.${ext}`;
}

export function toValidationCsv(args: ValidationExportArgs): string {
  const rows: string[] = [VALIDATION_CSV_COLUMNS.join(",")];
  for (const p of args.simulation.perLevel) {
    const cells: Record<(typeof VALIDATION_CSV_COLUMNS)[number], string | number | null> = {
      formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
      instrument: args.instrument,
      tradingDate: args.tradingDate,
      anchorIst: args.anchorIst,
      previousClose: args.previousClose,
      planet: p.level.planet,
      sourceLevel: p.level.sourceLevel,
      absoluteDegree: p.level.absoluteDegree,
      levelValue: p.level.value,
      side: p.level.side,
      safety: p.level.safety,
      pivotConfluence: p.level.pivotConfluence,
      clusterCount: p.level.clusterCount,
      touchTime: p.entryTimeIst && p.retestIndex == null ? p.entryTimeIst : "",
      confirmTime: p.confirmIndex != null ? String(p.confirmIndex) : "",
      retestTime: p.retestIndex != null ? String(p.retestIndex) : "",
      entry: p.entry ?? "",
      stop: p.stopLoss ?? "",
      target: p.target ?? "",
      outcome: p.outcome,
      mfe: p.mfe,
      mae: p.mae,
      cubeGrade: p.cube.cubeGrade,
      cubeAction: p.cube.action,
      cubeReasons: p.cube.reasons.join(" | "),
      ambiguousPolicy: args.ambiguousPolicy,
      ambiguousCandleCount: p.ambiguousCandleCount,
    };
    rows.push(VALIDATION_CSV_COLUMNS.map((k) => csvEscape(cells[k])).join(","));
  }
  return rows.join("\n");
}

export function toValidationJson(args: ValidationExportArgs): string {
  return JSON.stringify(
    {
      formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
      instrument: args.instrument,
      tradingDate: args.tradingDate,
      anchorIst: args.anchorIst,
      previousClose: args.previousClose,
      ambiguousPolicy: args.ambiguousPolicy,
      counters: args.simulation.counters,
      totalCandles: args.simulation.totalCandles,
      perLevel: args.simulation.perLevel.map((p) => ({
        planet: p.level.planet,
        sourceLevel: p.level.sourceLevel,
        absoluteDegree: p.level.absoluteDegree,
        value: p.level.value,
        side: p.level.side,
        safety: p.level.safety,
        pivotConfluence: p.level.pivotConfluence,
        touchIndex: p.touchIndex,
        confirmIndex: p.confirmIndex,
        retestIndex: p.retestIndex,
        entry: p.entry,
        stop: p.stopLoss,
        target: p.target,
        entryTimeIst: p.entryTimeIst,
        exitTimeIst: p.exitTimeIst,
        outcome: p.outcome,
        mfe: p.mfe,
        mae: p.mae,
        ambiguousCandleCount: p.ambiguousCandleCount,
        cube: p.cube,
      })),
    },
    null,
    2,
  );
}