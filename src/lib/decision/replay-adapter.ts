// Phase 32 · Decision Replay adapter.
//
// Provider-neutral. Consumes ALREADY-persisted history from Combined PCR,
// Market Breadth, Decision history or Shadow observations. It never
// spawns a second replay engine and never fabricates observations.

export type ReplayCapability =
  | "SUPPORTED"
  | "NO_DATA"
  | "TOO_FEW_OBSERVATIONS"
  | "MIXED_SESSIONS"
  | "MIXED_PROVIDERS"
  | "MIXED_FORMULA_VERSIONS"
  | "INVALID";

export type ReplayState = "CE" | "PE" | "WAIT" | "UNKNOWN";

export interface ReplayObservation {
  readonly timestamp: string; // ISO
  readonly instrument: string;
  readonly session: string;   // e.g. "REGULAR" | "PREOPEN"
  readonly expiry?: string | null;
  readonly provider: string;
  readonly formulaVersion: string;
  readonly snapshotId: string;
  readonly state: ReplayState;
  readonly confidence: number; // 0..100
  readonly price?: number | null;
}

export interface ReplayAlignmentContext {
  readonly instrument: string;
  readonly session?: string;
  readonly expiry?: string | null;
  readonly provider?: string;
  readonly formulaVersion: string;
  readonly minObservations?: number; // default 5
  readonly expectedIntervalMs?: number; // used for "missing intervals" flag
}

export interface ReplayResult {
  readonly capability: ReplayCapability;
  readonly reason: string;
  readonly observationCount: number;
  readonly dedupeCount: number;
  readonly invalidCount: number;
  readonly missingIntervals: number;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly durationMs: number;
  readonly dominantDecision: ReplayState;
  readonly transitions: number;
  readonly ceDurationMs: number;
  readonly peDurationMs: number;
  readonly waitDurationMs: number;
  readonly confidenceHistory: readonly number[];
  readonly forwardMove: number | null;
  readonly mfe: number | null;
  readonly mae: number | null;
  readonly reversalCount: number;
  readonly weakeningCount: number;
  readonly quality: "OK" | "PARTIAL" | "DEGRADED" | "UNAVAILABLE";
  readonly provenance: {
    readonly provider: string | null;
    readonly formulaVersion: string | null;
    readonly snapshotIds: readonly string[];
  };
}

const EMPTY: ReplayResult = {
  capability: "NO_DATA",
  reason: "No replay observations available",
  observationCount: 0,
  dedupeCount: 0,
  invalidCount: 0,
  missingIntervals: 0,
  startTime: null,
  endTime: null,
  durationMs: 0,
  dominantDecision: "UNKNOWN",
  transitions: 0,
  ceDurationMs: 0,
  peDurationMs: 0,
  waitDurationMs: 0,
  confidenceHistory: [],
  forwardMove: null,
  mfe: null,
  mae: null,
  reversalCount: 0,
  weakeningCount: 0,
  quality: "UNAVAILABLE",
  provenance: { provider: null, formulaVersion: null, snapshotIds: [] },
};

function fail(cap: ReplayCapability, reason: string, base: Partial<ReplayResult> = {}): ReplayResult {
  return { ...EMPTY, ...base, capability: cap, reason };
}

export function alignReplay(
  observations: readonly ReplayObservation[],
  ctx: ReplayAlignmentContext,
): ReplayResult {
  if (observations.length === 0) return EMPTY;

  const min = ctx.minObservations ?? 5;
  // Filter by instrument (strict) & valid timestamps.
  const valid: ReplayObservation[] = [];
  let invalid = 0;
  for (const o of observations) {
    if (o.instrument !== ctx.instrument || !Number.isFinite(Date.parse(o.timestamp))) {
      invalid++;
      continue;
    }
    valid.push(o);
  }
  if (valid.length === 0)
    return fail("INVALID", "All observations invalid or wrong instrument", { invalidCount: invalid });

  // Dedupe by snapshotId+timestamp
  const seen = new Set<string>();
  const deduped: ReplayObservation[] = [];
  let dedupe = 0;
  for (const o of valid) {
    const k = `${o.snapshotId}@${o.timestamp}`;
    if (seen.has(k)) { dedupe++; continue; }
    seen.add(k);
    deduped.push(o);
  }
  deduped.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  // Session/provider/formula-version uniformity
  const sessions = new Set(deduped.map((o) => o.session));
  const providers = new Set(deduped.map((o) => o.provider));
  const formulas = new Set(deduped.map((o) => o.formulaVersion));
  if (sessions.size > 1)
    return fail("MIXED_SESSIONS", `Mixed sessions: ${[...sessions].join(", ")}`, {
      observationCount: deduped.length, dedupeCount: dedupe, invalidCount: invalid,
    });
  if (providers.size > 1)
    return fail("MIXED_PROVIDERS", `Mixed providers: ${[...providers].join(", ")}`, {
      observationCount: deduped.length, dedupeCount: dedupe, invalidCount: invalid,
    });
  if (formulas.size > 1)
    return fail("MIXED_FORMULA_VERSIONS", `Mixed formula versions: ${[...formulas].join(", ")}`, {
      observationCount: deduped.length, dedupeCount: dedupe, invalidCount: invalid,
    });
  const provider = [...providers][0];
  const formulaVersion = [...formulas][0];
  if (formulaVersion !== ctx.formulaVersion)
    return fail("MIXED_FORMULA_VERSIONS", `Formula ${formulaVersion} ≠ current ${ctx.formulaVersion}`, {
      observationCount: deduped.length, dedupeCount: dedupe, invalidCount: invalid,
    });

  if (deduped.length < min)
    return fail("TOO_FEW_OBSERVATIONS", `Only ${deduped.length} observations (<${min})`, {
      observationCount: deduped.length, dedupeCount: dedupe, invalidCount: invalid,
    });

  // Duration & state buckets
  const startTime = deduped[0].timestamp;
  const endTime = deduped[deduped.length - 1].timestamp;
  const durationMs = Date.parse(endTime) - Date.parse(startTime);
  const buckets: Record<ReplayState, number> = { CE: 0, PE: 0, WAIT: 0, UNKNOWN: 0 };
  let transitions = 0;
  let reversal = 0;
  let weakening = 0;
  for (let i = 0; i < deduped.length; i++) {
    const cur = deduped[i];
    const next = deduped[i + 1];
    const dt = next ? Date.parse(next.timestamp) - Date.parse(cur.timestamp) : 0;
    buckets[cur.state] += dt;
    if (next) {
      if (next.state !== cur.state) {
        transitions++;
        const isRev =
          (cur.state === "CE" && next.state === "PE") ||
          (cur.state === "PE" && next.state === "CE");
        if (isRev) reversal++;
      }
      if (next.confidence < cur.confidence - 5) weakening++;
    }
  }
  const dominant = (Object.entries(buckets) as [ReplayState, number][])
    .sort((a, b) => b[1] - a[1])[0][0];

  // Missing intervals estimate
  let missing = 0;
  if (ctx.expectedIntervalMs && deduped.length > 1) {
    for (let i = 1; i < deduped.length; i++) {
      const gap = Date.parse(deduped[i].timestamp) - Date.parse(deduped[i - 1].timestamp);
      if (gap > ctx.expectedIntervalMs * 1.5) missing++;
    }
  }

  // Forward move / MFE / MAE from price if present
  const prices = deduped.map((o) => o.price).filter((p): p is number => p != null);
  let forwardMove: number | null = null;
  let mfe: number | null = null;
  let mae: number | null = null;
  if (prices.length >= 2) {
    const open = prices[0];
    const close = prices[prices.length - 1];
    forwardMove = close - open;
    mfe = Math.max(...prices) - open;
    mae = Math.min(...prices) - open;
  }

  const quality: ReplayResult["quality"] =
    missing === 0 && invalid === 0 && dedupe === 0
      ? "OK"
      : missing + invalid + dedupe > deduped.length / 3
        ? "DEGRADED"
        : "PARTIAL";

  return {
    capability: "SUPPORTED",
    reason: `Aligned ${deduped.length} observations from ${provider}`,
    observationCount: deduped.length,
    dedupeCount: dedupe,
    invalidCount: invalid,
    missingIntervals: missing,
    startTime,
    endTime,
    durationMs,
    dominantDecision: dominant,
    transitions,
    ceDurationMs: buckets.CE,
    peDurationMs: buckets.PE,
    waitDurationMs: buckets.WAIT,
    confidenceHistory: deduped.map((o) => o.confidence),
    forwardMove,
    mfe,
    mae,
    reversalCount: reversal,
    weakeningCount: weakening,
    quality,
    provenance: {
      provider,
      formulaVersion,
      snapshotIds: deduped.map((o) => o.snapshotId),
    },
  };
}