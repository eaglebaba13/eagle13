// Phase 21.3 · Unified historical backtest — formula adapter interface.
// Adapters wrap existing engines. The shared runner never touches formula math.

import type {
  CausalityMode,
  DataGranularity,
  HistoricalBacktestResult,
  HistoricalTrade,
  UnifiedFormulaId,
} from "./result";

export type AdapterConfig = {
  instrument: string;
  from: string;
  to: string;
  policy?: string;
  costs?: {
    slippagePct: number;
    brokerageFlat: number;
    brokeragePct: number;
    taxesPct: number;
  };
  source?: string;
  ambiguousPolicy?: string;
  /** Adapter-defined free-form knobs (starBias, cube inputs, etc.). */
  extras?: Record<string, unknown>;
};

export type AdapterSessionPlan = {
  /** Dates (YYYY-MM-DD IST) the runner should iterate. Adapters build this. */
  dates: readonly string[];
  causality: CausalityMode;
};

export type AdapterEvaluation = {
  trades: readonly HistoricalTrade[];
  /** Optional per-session diagnostic payload for the runner to aggregate. */
  diagnostics?: Readonly<Record<string, unknown>>;
};

export type HistoricalFormulaAdapter = {
  id: UnifiedFormulaId;
  label: string;
  dataGranularity: DataGranularity;
  causality: CausalityMode;
  supportedInstruments: readonly string[];
  /** Throws if the config is unsupported by this adapter. */
  validateConfig(cfg: AdapterConfig): void;
  /** Build the list of trading dates for this run. Pure/deterministic. */
  planSessions(cfg: AdapterConfig): AdapterSessionPlan | Promise<AdapterSessionPlan>;
  /** Load + evaluate a single trading date and emit zero or more trades. */
  evaluateSession(
    cfg: AdapterConfig,
    date: string,
  ): Promise<AdapterEvaluation>;
  /** Return adapter-specific per-run metadata to attach to the shared result. */
  buildMetadata(
    cfg: AdapterConfig,
    all: readonly HistoricalTrade[],
  ): Readonly<Record<string, unknown>>;
  /** Engine/execution/cube/policy version tokens for provenance. */
  versions: Pick<
    HistoricalBacktestResult,
    "engineVersion" | "executionVersion" | "cubeVersion" | "policyVersion"
  >;
  methodology: string;
  disclaimers: readonly string[];
};
