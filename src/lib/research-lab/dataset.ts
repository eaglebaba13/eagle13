// Phase 3E — Dataset construction and hashing.

import type {
  HistoricalDataset,
  HistoricalRow,
} from "./types";

/** Deterministic FNV-1a 64-bit hash (BigInt) rendered as hex. */
export function hashRows(rows: readonly HistoricalRow[]): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  const enc = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      h = ((h ^ BigInt(s.charCodeAt(i))) * prime) & mask;
    }
    h = ((h ^ 0x7cn) * prime) & mask; // separator
  };
  for (const r of rows) {
    enc(r.symbol);
    enc(r.sessionDate);
    enc(String(r.open));
    enc(String(r.high));
    enc(String(r.low));
    enc(String(r.close));
    enc(String(r.previousClose ?? "null"));
    enc(String(r.vix ?? "null"));
    enc(String(r.pcr ?? "null"));
    enc(r.gannGap?.outlook ?? "null");
    enc(r.decision?.state ?? "null");
    enc(String(r.smartAlerts.length));
    enc(r.institutionalFlow?.summary ?? "null");
  }
  return h.toString(16).padStart(16, "0");
}

export function buildDataset(input: {
  readonly datasetId: string;
  readonly symbol: string;
  readonly timezone: string;
  readonly rows: readonly HistoricalRow[];
  readonly generatedAt: string;
}): HistoricalDataset {
  const rows = [...input.rows].sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  const warnings: string[] = [];
  if (rows.length === 0) {
    warnings.push("DATASET_EMPTY");
  }
  return {
    datasetId: input.datasetId,
    symbol: input.symbol,
    timezone: input.timezone,
    startDate: rows[0]?.sessionDate ?? "",
    endDate: rows[rows.length - 1]?.sessionDate ?? "",
    rows,
    hash: hashRows(rows),
    generatedAt: input.generatedAt,
    warnings,
  };
}
