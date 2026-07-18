// Phase 3E — Research Lab types (research-only, canonical consumer).
//
// Deterministic, provider-neutral models. No broker, no live execution,
// no formula changes. Historical results are descriptive only and MUST
// NOT be presented as guaranteed future performance.

export const RESEARCH_LAB_VERSION = "research-lab@1.0.0";
export const OUTCOME_DEFINITION_VERSION = "outcomes@1.0.0";
export const RESEARCH_LAB_DISCLAIMER =
  "RESEARCH ONLY — HISTORICAL RESULTS DO NOT GUARANTEE FUTURE PERFORMANCE.";

export type DataQualityFlag =
  | "OK"
  | "PARTIAL"
  | "INVALID"
  | "LEAKAGE_DETECTED";

export type GapDirection = "GAP_UP" | "GAP_DOWN" | "FLAT";

export type SignalFamily =
  | "DECISION"
  | "GTI"
  | "COMBINED_PCR"
  | "BREADTH"
  | "GANN_GAP"
  | "SMART_ALERT"
  | "INSTITUTIONAL_FLOW"
  | "OPTION_STRATEGY";

export type ReadinessState =
  | "READY"
  | "PARTIAL"
  | "BLOCKED"
  | "STALE"
  | "UNAVAILABLE";

export interface DecisionSnapshot {
  readonly state:
    | "BULLISH"
    | "BEARISH"
    | "NEUTRAL"
    | "CONFLICT"
    | "UNAVAILABLE";
  readonly confidence: number | null;
  readonly formulaVersion: string;
}

export interface GannGapSnapshot {
  readonly outlook: "GAP_UP" | "GAP_DOWN" | "NO_TRADE" | "CONFLICT" | "UNAVAILABLE";
  readonly specialLevelTouched: boolean | null;
  readonly closeAboveMain: boolean | null;
  readonly closeBelowMain: boolean | null;
  readonly bothAdjacentTouched: boolean | null;
  readonly nearLevelIndecision: boolean | null;
  readonly distanceFromLevelPct: number | null;
  readonly closePctInsideZone: number | null;
  readonly formulaVersion: string;
}

export interface SmartAlertEventSnapshot {
  readonly id: string;
  readonly family: string;
  readonly severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";
  readonly fingerprint: string;
  readonly readinessBlocked: boolean;
  readonly staleData: boolean;
  readonly duplicateSuppressed: boolean;
}

export interface InstitutionalFlowSnapshot {
  readonly summary:
    | "PUT_WRITERS_ACTIVE"
    | "CALL_WRITERS_ACTIVE"
    | "BALANCED"
    | "CONFLICT"
    | "UNAVAILABLE";
  readonly maxPainDistancePct: number | null;
  readonly gammaAvailable: boolean;
  readonly sectorFlow: "BULLISH" | "BEARISH" | "MIXED" | "UNAVAILABLE";
}

export interface HistoricalRow {
  readonly symbol: string;
  readonly sessionDate: string; // YYYY-MM-DD
  readonly timestamp: string;   // ISO instant of the session close
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly previousClose: number | null;
  readonly volume: number | null;
  readonly vix: number | null;
  readonly pcr: number | null;
  readonly breadth: number | null; // e.g. net breadth
  readonly gti: number | null;
  readonly decision: DecisionSnapshot | null;
  readonly gannGap: GannGapSnapshot | null;
  readonly smartAlerts: readonly SmartAlertEventSnapshot[];
  readonly institutionalFlow: InstitutionalFlowSnapshot | null;
  readonly providerAlias: string;
  readonly providerTimestamp: string | null;
  readonly formulaVersions: Readonly<Record<string, string>>;
  readonly qualityFlags: readonly DataQualityFlag[];
  readonly weekday: number; // 0..6 (Sun..Sat)
  readonly month: number;   // 1..12
}

export interface HistoricalDataset {
  readonly datasetId: string;
  readonly symbol: string;
  readonly timezone: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly rows: readonly HistoricalRow[];
  readonly hash: string;
  readonly generatedAt: string;
  readonly warnings: readonly string[];
}

export interface SignalEvent {
  readonly family: SignalFamily;
  readonly label: string;
  readonly symbol: string;
  readonly sessionDate: string;
  readonly signalTimestamp: string;
  readonly formulaVersion: string;
  readonly readiness: ReadinessState;
  readonly confidence: number | null;
  readonly blockingWarnings: readonly string[];
  readonly eligible: boolean;
  readonly inputAvailability: "OK" | "PARTIAL" | "MISSING";
  // Prediction for classification-style metrics (optional).
  readonly predictedDirection?: GapDirection | null;
}

export interface OutcomeThresholds {
  readonly flatGapTolerancePct: number; // default 0.05% of previous close
  readonly minSampleSize: number;
}

export const DEFAULT_OUTCOME_THRESHOLDS: OutcomeThresholds = {
  flatGapTolerancePct: 0.0005,
  minSampleSize: 20,
};

export interface Outcome {
  readonly available: boolean;
  readonly nextGapPoints: number | null;
  readonly nextGapPct: number | null;
  readonly gapDirection: GapDirection | null;
  readonly nextOpenToClose: number | null;
  readonly nextHighExcursion: number | null;
  readonly nextLowExcursion: number | null;
  readonly return1Session: number | null;
  readonly return3Session: number | null;
  readonly return5Session: number | null;
  readonly mfe: number;
  readonly mae: number;
  readonly reason?: string;
}

export interface ConfusionMatrix {
  readonly gapUpTruePositive: number;
  readonly gapUpFalsePositive: number;
  readonly gapUpFalseNegative: number;
  readonly gapDownTruePositive: number;
  readonly gapDownFalsePositive: number;
  readonly gapDownFalseNegative: number;
  readonly flatCount: number;
  readonly noTradeCount: number;
  readonly conflictCount: number;
  readonly total: number;
}

export interface StudyMetrics {
  readonly samples: number;
  readonly eligible: number;
  readonly excluded: number;
  readonly coverage: number; // eligible/samples
  readonly accuracy: number | null;
  readonly balancedAccuracy: number | null;
  readonly precisionGapUp: number | null;
  readonly recallGapUp: number | null;
  readonly precisionGapDown: number | null;
  readonly recallGapDown: number | null;
  readonly f1GapUp: number | null;
  readonly f1GapDown: number | null;
  readonly specificity: number | null;
  readonly falsePositiveRate: number | null;
  readonly falseNegativeRate: number | null;
  readonly avgGapPoints: number | null;
  readonly medianGapPoints: number | null;
  readonly stdev: number | null;
  readonly mfeAvg: number;
  readonly maeAvg: number;
  readonly maxConsecutiveCorrect: number;
  readonly maxConsecutiveIncorrect: number;
  readonly insufficientSample: boolean;
}

export interface RegimeBucket {
  readonly key: string;
  readonly label: string;
  readonly metrics: StudyMetrics;
}

export interface WalkForwardSplit {
  readonly index: number;
  readonly trainStart: string;
  readonly trainEnd: string;
  readonly validationStart: string;
  readonly validationEnd: string;
  readonly trainSamples: number;
  readonly validationSamples: number;
}

export interface WalkForwardConfig {
  readonly mode: "EXPANDING" | "ROLLING";
  readonly trainWindowSessions: number;
  readonly validationWindowSessions: number;
  readonly step: number;
}

export interface WalkForwardResult {
  readonly config: WalkForwardConfig;
  readonly splits: readonly WalkForwardSplit[];
}

export interface ResearchRunManifest {
  readonly runId: string;
  readonly createdAt: string;
  readonly datasetId: string;
  readonly datasetHash: string;
  readonly symbol: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly timezone: string;
  readonly formulaVersions: Readonly<Record<string, string>>;
  readonly outcomeDefinitionVersion: string;
  readonly flatGapTolerancePct: number;
  readonly minSampleSize: number;
  readonly includedFamilies: readonly SignalFamily[];
  readonly exclusionRules: readonly string[];
  readonly walkForward: WalkForwardConfig | null;
  readonly buildVersion: string | null;
}

export interface DataQualityReport {
  readonly duplicates: number;
  readonly missingSessions: number;
  readonly nonMonotonicTimestamps: number;
  readonly invalidOhlc: number;
  readonly negativePrices: number;
  readonly futureTimestamps: number;
  readonly missingPreviousClose: number;
  readonly missingNextSession: number;
  readonly staleSignals: number;
  readonly formulaVersionMismatches: number;
  readonly providerDiscontinuities: number;
  readonly partialCanonical: number;
  readonly leakageDetections: number;
  readonly overall: DataQualityFlag;
  readonly warnings: readonly string[];
}

export interface GannGapStudyReport {
  readonly metrics: StudyMetrics;
  readonly confusionMatrix: ConfusionMatrix;
  readonly byMonth: readonly RegimeBucket[];
  readonly byVixRegime: readonly RegimeBucket[];
  readonly byWeekday: readonly RegimeBucket[];
  readonly byDistanceBucket: readonly RegimeBucket[];
  readonly byClosePercentileBucket: readonly RegimeBucket[];
  readonly noTradeFrequency: number;
  readonly conflictFrequency: number;
  readonly warnings: readonly string[];
}

export interface SmartAlertStudyReport {
  readonly totalAlerts: number;
  readonly byFamily: Readonly<Record<string, number>>;
  readonly bySeverity: Readonly<Record<string, number>>;
  readonly duplicateSuppressed: number;
  readonly readinessBlocked: number;
  readonly staleData: number;
  readonly falsePositives: number;
  readonly alignedOutcomes: number;
  readonly averageResolutionSessions: number | null;
  readonly warnings: readonly string[];
}

export interface InstitutionalFlowStudyReport {
  readonly byClass: Readonly<Record<string, StudyMetrics>>;
  readonly gammaAvailableSamples: number;
  readonly gammaUnavailableSamples: number;
  readonly maxPainBuckets: readonly RegimeBucket[];
  readonly sectorAvailability: Readonly<Record<string, number>>;
  readonly warnings: readonly string[];
}

export interface ResearchRunReport {
  readonly manifest: ResearchRunManifest;
  readonly dataQuality: DataQualityReport;
  readonly signals: {
    readonly [key in SignalFamily]?: StudyMetrics;
  };
  readonly gannGap: GannGapStudyReport | null;
  readonly smartAlerts: SmartAlertStudyReport | null;
  readonly institutionalFlow: InstitutionalFlowStudyReport | null;
  readonly walkForward: WalkForwardResult | null;
  readonly diagnostics: readonly string[];
  readonly warnings: readonly string[];
  readonly disclaimer: string;
  readonly generatedAt: string;
}
