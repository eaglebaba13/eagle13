// Phase 28 — Institutional Flow & Probability Engine (research-only).
// Additive, deterministic, pure function. Consumer of canonical modules
// only. Never fabricates probabilities and never places orders.

import type { DecisionAction, IndicatorBias } from "./types";

export type PcrIndex = "NIFTY" | "BANKNIFTY" | "SENSEX";

export type VwapPosition = "ABOVE_VWAP" | "BELOW_VWAP" | "NEAR_VWAP" | "UNAVAILABLE";

export type PricePosition =
  | "NEAR_SUPPORT"
  | "NEAR_RESISTANCE"
  | "INSIDE_RANGE"
  | "BREAKOUT"
  | "BREAKDOWN"
  | "UNAVAILABLE";

export type OiClassification =
  | "LONG_BUILDUP"
  | "SHORT_BUILDUP"
  | "LONG_UNWINDING"
  | "SHORT_COVERING"
  | "UNAVAILABLE";

export type MarketRegime =
  | "TRENDING_BULL"
  | "TRENDING_BEAR"
  | "SIDEWAYS"
  | "RANGE_EXPANSION"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "UNKNOWN";

export type AgreementLevel = "VERY_STRONG" | "STRONG" | "MIXED" | "WEAK";
export type QualityGrade = "EXCELLENT" | "GOOD" | "WARNING" | "POOR";
export type CheckStatus = "PASS" | "FAIL" | "UNAVAILABLE";

export interface IndexPcrLeg {
  readonly index: PcrIndex;
  readonly pcr: number | null;
  readonly weight: number; // configured, 0..1
  readonly available: boolean;
}

export interface InstitutionalFlowEngineInput {
  readonly pcrIndices: readonly IndexPcrLeg[];
  readonly combinedPcrValue: number | null; // raw pcr OI value (e.g. 1.18)
  readonly combinedPcrScore: number | null; // signed score -1..+1
  readonly combinedPcrBias: IndicatorBias;
  readonly spot: number | null;
  readonly vwap: number | null;
  readonly atmStrike: number | null;
  readonly highestCallOiStrike: number | null;
  readonly highestPutOiStrike: number | null;
  readonly maxPain: number | null;
  readonly oi: {
    readonly totalCallChangeOi: number | null;
    readonly totalPutChangeOi: number | null;
    readonly priceChange: number | null;
    readonly buildUp: string | null;
    readonly available: boolean;
  };
  readonly breadthNet: number | null;
  readonly breadthAvailable: boolean;
  readonly sectors: readonly { readonly name: string; readonly bias: IndicatorBias }[];
  readonly vix: number | null;
  readonly vixRegime: "LOW" | "MEDIUM" | "ELEVATED" | "HIGH" | "UNKNOWN";
  readonly institutionalFlowBias: IndicatorBias;
  readonly institutionalFlowAvailable: boolean;
  readonly decisionAction: DecisionAction;
  readonly decisionConfidence: number; // 0..100
  readonly strikeRecommended: {
    readonly strike: number | null;
    readonly type: "CE" | "PE" | null;
    readonly moneyness: "ATM" | "ITM" | "OTM" | null;
    readonly available: boolean;
  };
  readonly dataFreshness: "FRESH" | "STALE" | "UNKNOWN";
  readonly providerHealth: "OK" | "DEGRADED" | "UNAVAILABLE";
  readonly generatedAt: string;
}

export interface PcrContribution {
  readonly index: PcrIndex;
  readonly pcr: number | null;
  readonly weight: number;
  readonly contributionPct: number;
  readonly available: boolean;
}

export interface CombinedPcrPanel {
  readonly value: number | null;
  readonly bias: IndicatorBias;
  readonly contributions: readonly PcrContribution[];
  readonly available: boolean;
}

export interface OiBuildUpPanel {
  readonly classification: OiClassification;
  readonly bias: IndicatorBias;
  readonly note: string;
  readonly available: boolean;
}

export interface VwapPanel {
  readonly position: VwapPosition;
  readonly distancePct: number | null;
  readonly scoreContribution: number; // -1..+1
  readonly available: boolean;
}

export interface PriceConfirmationPanel {
  readonly position: PricePosition;
  readonly support: number | null;
  readonly resistance: number | null;
  readonly note: string;
  readonly available: boolean;
}

export interface TradeReadinessItem {
  readonly key: string;
  readonly label: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface TradeReadinessPanel {
  readonly items: readonly TradeReadinessItem[];
  readonly passed: number;
  readonly total: number;
  readonly unavailable: number;
}

export interface ConfidencePanel {
  readonly value: number; // 0..100
  readonly signalStrength: AgreementLevel;
  readonly dataQuality: QualityGrade;
  readonly components: {
    readonly signalAgreementPct: number;
    readonly dataAvailabilityPct: number;
    readonly conflictPenalty: number;
    readonly stabilityBonus: number;
  };
}

export interface SignalAgreementPanel {
  readonly level: AgreementLevel;
  readonly agree: number;
  readonly disagree: number;
  readonly neutral: number;
  readonly participants: readonly {
    readonly key: string;
    readonly label: string;
    readonly bias: IndicatorBias;
  }[];
}

export interface InstitutionalFlowSummaryPanel {
  readonly buyingPressurePct: number;
  readonly sellingPressurePct: number;
  readonly neutralFlowPct: number;
  readonly bias: IndicatorBias;
  readonly available: boolean;
}

export interface DataQualityPanel {
  readonly freshness: "FRESH" | "STALE" | "UNKNOWN";
  readonly providerHealth: "OK" | "DEGRADED" | "UNAVAILABLE";
  readonly missingCount: number;
  readonly calculationIntegrity: QualityGrade;
  readonly overall: QualityGrade;
}

export interface StrikeAdvicePanel {
  readonly strike: number | null;
  readonly optionType: "CE" | "PE" | null;
  readonly moneyness: "ATM" | "ITM" | "OTM" | null;
  readonly reason: string;
  readonly risk: string;
  readonly expectedEnvironment: string;
  readonly available: boolean;
}

export interface ExplainablePanel {
  readonly action: DecisionAction;
  readonly bullets: readonly string[];
  readonly confidence: number;
}

export interface InstitutionalFlowEngineOutput {
  readonly combinedPcr: CombinedPcrPanel;
  readonly oiClassifier: OiBuildUpPanel;
  readonly vwap: VwapPanel;
  readonly priceConfirmation: PriceConfirmationPanel;
  readonly tradeReadiness: TradeReadinessPanel;
  readonly confidence: ConfidencePanel;
  readonly signalAgreement: SignalAgreementPanel;
  readonly institutionalFlow: InstitutionalFlowSummaryPanel;
  readonly regime: MarketRegime;
  readonly dataQuality: DataQualityPanel;
  readonly strikeAdvice: StrikeAdvicePanel;
  readonly explanation: ExplainablePanel;
  readonly generatedAt: string;
  readonly disclaimer: string;
}

export const IFE_DISCLAIMER =
  "RESEARCH ONLY — NOT INVESTMENT ADVICE. Institutional Flow & Probability Engine reads canonical modules and never places orders.";

// ---------------- helpers ---------------- //

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
function round(x: number, d = 1): number {
  const m = 10 ** d;
  return Math.round(x * m) / m;
}
function biasFromScore(score: number | null, threshold = 0.1): IndicatorBias {
  if (score == null || !Number.isFinite(score)) return "UNAVAILABLE";
  if (score > threshold) return "BULLISH";
  if (score < -threshold) return "BEARISH";
  return "NEUTRAL";
}
function biasWeight(b: IndicatorBias): number {
  if (b === "BULLISH") return 1;
  if (b === "BEARISH") return -1;
  return 0;
}

// ---------------- section builders ---------------- //

function buildCombinedPcrPanel(inp: InstitutionalFlowEngineInput): CombinedPcrPanel {
  const availableLegs = inp.pcrIndices.filter((l) => l.available && l.weight > 0);
  const totalWeight = availableLegs.reduce((acc, l) => acc + l.weight, 0);
  const contributions: PcrContribution[] = inp.pcrIndices.map((l) => ({
    index: l.index,
    pcr: l.pcr,
    weight: l.weight,
    contributionPct:
      l.available && totalWeight > 0 ? round((l.weight / totalWeight) * 100, 0) : 0,
    available: l.available,
  }));
  return {
    value: inp.combinedPcrValue,
    bias: inp.combinedPcrBias,
    contributions,
    available: availableLegs.length > 0 && inp.combinedPcrBias !== "UNAVAILABLE",
  };
}

function buildOiPanel(inp: InstitutionalFlowEngineInput): OiBuildUpPanel {
  const build = (inp.oi.buildUp ?? "").toUpperCase();
  const call = inp.oi.totalCallChangeOi;
  const put = inp.oi.totalPutChangeOi;
  const priceChange = inp.oi.priceChange;

  let classification: OiClassification = "UNAVAILABLE";
  if (build === "LONG_BUILDUP" || build === "SHORT_BUILDUP" ||
      build === "LONG_UNWINDING" || build === "SHORT_COVERING") {
    classification = build as OiClassification;
  } else if (priceChange != null && call != null && put != null) {
    const oiUp = (put + call) > 0;
    if (priceChange > 0 && oiUp) classification = "LONG_BUILDUP";
    else if (priceChange < 0 && oiUp) classification = "SHORT_BUILDUP";
    else if (priceChange < 0 && !oiUp) classification = "LONG_UNWINDING";
    else if (priceChange > 0 && !oiUp) classification = "SHORT_COVERING";
  }

  let bias: IndicatorBias = "UNAVAILABLE";
  let note = "OI data unavailable";
  switch (classification) {
    case "LONG_BUILDUP":
      bias = "BULLISH"; note = "Long build-up — price up on rising OI"; break;
    case "SHORT_COVERING":
      bias = "BULLISH"; note = "Short covering — price up on falling OI"; break;
    case "SHORT_BUILDUP":
      bias = "BEARISH"; note = "Short build-up — price down on rising OI"; break;
    case "LONG_UNWINDING":
      bias = "BEARISH"; note = "Long unwinding — price down on falling OI"; break;
    default:
      bias = "UNAVAILABLE";
  }
  return {
    classification,
    bias,
    note,
    available: classification !== "UNAVAILABLE",
  };
}

function buildVwapPanel(inp: InstitutionalFlowEngineInput): VwapPanel {
  const spot = inp.spot;
  const vwap = inp.vwap;
  if (spot == null || vwap == null || !Number.isFinite(vwap) || vwap === 0) {
    return {
      position: "UNAVAILABLE",
      distancePct: null,
      scoreContribution: 0,
      available: false,
    };
  }
  const distPct = ((spot - vwap) / vwap) * 100;
  let position: VwapPosition = "NEAR_VWAP";
  if (Math.abs(distPct) < 0.1) position = "NEAR_VWAP";
  else if (distPct > 0) position = "ABOVE_VWAP";
  else position = "BELOW_VWAP";
  const score = clamp(distPct / 1.0, -1, 1); // 1% deviation ≈ full weight
  return {
    position,
    distancePct: round(distPct, 2),
    scoreContribution: round(score, 2),
    available: true,
  };
}

function buildPricePanel(inp: InstitutionalFlowEngineInput): PriceConfirmationPanel {
  const spot = inp.spot;
  const support = inp.highestPutOiStrike; // put OI = support
  const resistance = inp.highestCallOiStrike; // call OI = resistance
  const maxPain = inp.maxPain;
  if (spot == null || support == null || resistance == null) {
    return {
      position: "UNAVAILABLE",
      support,
      resistance,
      note: "Support/Resistance unavailable",
      available: false,
    };
  }
  const range = Math.abs(resistance - support);
  const near = range > 0 ? range * 0.15 : 0; // within 15% of range = "near"
  if (spot > resistance) {
    return {
      position: "BREAKOUT",
      support, resistance,
      note: `Spot ${spot} above call wall ${resistance}`,
      available: true,
    };
  }
  if (spot < support) {
    return {
      position: "BREAKDOWN",
      support, resistance,
      note: `Spot ${spot} below put wall ${support}`,
      available: true,
    };
  }
  if (Math.abs(spot - resistance) <= near) {
    return {
      position: "NEAR_RESISTANCE",
      support, resistance,
      note: `Spot ${spot} near call wall ${resistance}`,
      available: true,
    };
  }
  if (Math.abs(spot - support) <= near) {
    return {
      position: "NEAR_SUPPORT",
      support, resistance,
      note: `Spot ${spot} near put wall ${support}`,
      available: true,
    };
  }
  return {
    position: "INSIDE_RANGE",
    support, resistance,
    note: maxPain != null
      ? `Inside ${support}–${resistance} range · Max Pain ${maxPain}`
      : `Inside ${support}–${resistance} range`,
    available: true,
  };
}

interface Participant { key: string; label: string; bias: IndicatorBias; }

function participants(inp: InstitutionalFlowEngineInput, extra: {
  vwap: VwapPanel;
  oi: OiBuildUpPanel;
  price: PriceConfirmationPanel;
}): Participant[] {
  const priceBias: IndicatorBias =
    extra.price.position === "BREAKOUT" || extra.price.position === "NEAR_SUPPORT"
      ? "BULLISH"
      : extra.price.position === "BREAKDOWN" || extra.price.position === "NEAR_RESISTANCE"
      ? "BEARISH"
      : extra.price.position === "INSIDE_RANGE"
      ? "NEUTRAL"
      : "UNAVAILABLE";
  const maxPainBias: IndicatorBias =
    inp.maxPain != null && inp.spot != null
      ? Math.abs(inp.spot - inp.maxPain) / inp.maxPain < 0.003
        ? "NEUTRAL"
        : inp.spot < inp.maxPain
        ? "BULLISH"
        : "BEARISH"
      : "UNAVAILABLE";
  const sectorBias: IndicatorBias = (() => {
    const known = inp.sectors.filter((s) => s.bias !== "UNAVAILABLE");
    if (known.length === 0) return "UNAVAILABLE";
    const sum = known.reduce((acc, s) => acc + biasWeight(s.bias), 0);
    if (sum > 0) return "BULLISH";
    if (sum < 0) return "BEARISH";
    return "NEUTRAL";
  })();
  const vixBias: IndicatorBias =
    inp.vix == null ? "UNAVAILABLE"
    : inp.vix < 15 ? "BULLISH"
    : inp.vix > 25 ? "BEARISH"
    : "NEUTRAL";
  return [
    { key: "pcr", label: "Combined PCR", bias: inp.combinedPcrBias },
    { key: "sector", label: "Sector Heat", bias: sectorBias },
    { key: "breadth", label: "Market Breadth", bias: biasFromScore(inp.breadthNet) },
    { key: "oi", label: "OI Structure", bias: extra.oi.bias },
    { key: "vwap", label: "VWAP",
      bias: extra.vwap.available
        ? biasFromScore(extra.vwap.scoreContribution)
        : "UNAVAILABLE" },
    { key: "price", label: "Price Confirmation", bias: priceBias },
    { key: "maxPain", label: "Max Pain Magnet", bias: maxPainBias },
    { key: "vix", label: "India VIX", bias: vixBias },
    { key: "institutional", label: "Institutional Flow", bias: inp.institutionalFlowBias },
  ];
}

function buildAgreementPanel(parts: readonly Participant[]): SignalAgreementPanel {
  const known = parts.filter((p) => p.bias !== "UNAVAILABLE");
  const bulls = known.filter((p) => p.bias === "BULLISH").length;
  const bears = known.filter((p) => p.bias === "BEARISH").length;
  const neutral = known.filter((p) => p.bias === "NEUTRAL").length;
  const dominant = Math.max(bulls, bears);
  const opposing = bulls === dominant ? bears : bulls;
  let level: AgreementLevel = "WEAK";
  if (known.length === 0) level = "WEAK";
  else if (dominant === known.length && dominant >= 4) level = "VERY_STRONG";
  else if (dominant >= known.length * 0.66) level = "STRONG";
  else if (Math.abs(bulls - bears) <= 1 && dominant + opposing >= 4) level = "MIXED";
  else if (opposing >= dominant * 0.9 && dominant + opposing >= 3) level = "WEAK";
  else level = "MIXED";
  return {
    level,
    agree: dominant,
    disagree: opposing,
    neutral,
    participants: parts,
  };
}

function buildReadinessPanel(inp: InstitutionalFlowEngineInput, parts: {
  combined: CombinedPcrPanel;
  oi: OiBuildUpPanel;
  vwap: VwapPanel;
  price: PriceConfirmationPanel;
  sectors: IndicatorBias;
  breadth: IndicatorBias;
}): TradeReadinessPanel {
  const items: TradeReadinessItem[] = [];
  const push = (key: string, label: string, status: CheckStatus, detail: string) =>
    items.push({ key, label, status, detail });

  push("pcr", "Combined PCR",
    parts.combined.available ? (parts.combined.bias !== "NEUTRAL" ? "PASS" : "FAIL") : "UNAVAILABLE",
    parts.combined.value != null ? String(parts.combined.value.toFixed(2)) : "—");
  push("sector", "Sector Heat",
    parts.sectors === "UNAVAILABLE" ? "UNAVAILABLE" : (parts.sectors !== "NEUTRAL" ? "PASS" : "FAIL"),
    parts.sectors);
  push("breadth", "Advance/Decline",
    parts.breadth === "UNAVAILABLE" ? "UNAVAILABLE" : (parts.breadth !== "NEUTRAL" ? "PASS" : "FAIL"),
    inp.breadthNet != null ? `${round(inp.breadthNet * 100)}%` : "—");
  push("oi", "OI Structure",
    parts.oi.available ? (parts.oi.bias !== "NEUTRAL" ? "PASS" : "FAIL") : "UNAVAILABLE",
    parts.oi.classification);
  push("vwap", "VWAP",
    parts.vwap.available ? (parts.vwap.position !== "NEAR_VWAP" ? "PASS" : "FAIL") : "UNAVAILABLE",
    parts.vwap.position);
  push("vix", "India VIX",
    inp.vix == null ? "UNAVAILABLE" : (inp.vix <= 25 ? "PASS" : "FAIL"),
    inp.vix != null ? inp.vix.toFixed(2) : "—");
  push("support", "Support",
    inp.highestPutOiStrike != null ? "PASS" : "UNAVAILABLE",
    inp.highestPutOiStrike != null ? String(inp.highestPutOiStrike) : "—");
  push("resistance", "Resistance",
    inp.highestCallOiStrike != null ? "PASS" : "UNAVAILABLE",
    inp.highestCallOiStrike != null ? String(inp.highestCallOiStrike) : "—");
  push("maxPain", "Max Pain",
    inp.maxPain != null ? "PASS" : "UNAVAILABLE",
    inp.maxPain != null ? String(inp.maxPain) : "—");
  push("flow", "Institutional Flow",
    inp.institutionalFlowAvailable
      ? (inp.institutionalFlowBias !== "NEUTRAL" ? "PASS" : "FAIL")
      : "UNAVAILABLE",
    inp.institutionalFlowBias);
  push("price", "Price Confirmation",
    parts.price.available ? (parts.price.position !== "INSIDE_RANGE" ? "PASS" : "FAIL") : "UNAVAILABLE",
    parts.price.position);
  push("strike", "Strike Recommendation",
    inp.strikeRecommended.available ? "PASS" : "UNAVAILABLE",
    inp.strikeRecommended.strike != null
      ? `${inp.strikeRecommended.strike} ${inp.strikeRecommended.type ?? ""}`
      : "—");

  const passed = items.filter((i) => i.status === "PASS").length;
  const unavailable = items.filter((i) => i.status === "UNAVAILABLE").length;
  return { items, passed, total: items.length, unavailable };
}

function buildFlowSummary(inp: InstitutionalFlowEngineInput, oi: OiBuildUpPanel): InstitutionalFlowSummaryPanel {
  const call = inp.oi.totalCallChangeOi;
  const put = inp.oi.totalPutChangeOi;
  if (call == null || put == null) {
    return {
      buyingPressurePct: 0,
      sellingPressurePct: 0,
      neutralFlowPct: 100,
      bias: inp.institutionalFlowBias,
      available: inp.institutionalFlowAvailable,
    };
  }
  const absPut = Math.abs(put);
  const absCall = Math.abs(call);
  const total = absPut + absCall;
  if (total <= 0) {
    return {
      buyingPressurePct: 0,
      sellingPressurePct: 0,
      neutralFlowPct: 100,
      bias: "NEUTRAL",
      available: true,
    };
  }
  // Put writing (positive ΔOI on puts) => buying pressure.
  // Call writing (positive ΔOI on calls) => selling pressure.
  const buying = put > 0 ? (put / total) * 100 : 0;
  const selling = call > 0 ? (call / total) * 100 : 0;
  const neutral = clamp(100 - buying - selling, 0, 100);
  const bias: IndicatorBias =
    Math.abs(buying - selling) < 5
      ? "NEUTRAL"
      : buying > selling
      ? "BULLISH"
      : "BEARISH";
  return {
    buyingPressurePct: round(buying, 0),
    sellingPressurePct: round(selling, 0),
    neutralFlowPct: round(neutral, 0),
    bias: oi.available ? bias : bias,
    available: true,
  };
}

function buildRegime(inp: InstitutionalFlowEngineInput, agreement: SignalAgreementPanel): MarketRegime {
  const vix = inp.vix;
  if (vix != null && vix > 25) return "HIGH_VOLATILITY";
  if (vix != null && vix < 12) return "LOW_VOLATILITY";
  if (agreement.level === "VERY_STRONG" || agreement.level === "STRONG") {
    // Which side leads?
    const bulls = agreement.participants.filter((p) => p.bias === "BULLISH").length;
    const bears = agreement.participants.filter((p) => p.bias === "BEARISH").length;
    if (bulls > bears) return "TRENDING_BULL";
    if (bears > bulls) return "TRENDING_BEAR";
  }
  if (agreement.level === "MIXED") return "SIDEWAYS";
  if (vix != null && vix > 18) return "RANGE_EXPANSION";
  return "SIDEWAYS";
}

function buildDataQuality(inp: InstitutionalFlowEngineInput, missingCount: number): DataQualityPanel {
  const freshness = inp.dataFreshness;
  const providerHealth = inp.providerHealth;
  let calc: QualityGrade = "EXCELLENT";
  if (missingCount >= 5) calc = "POOR";
  else if (missingCount >= 3) calc = "WARNING";
  else if (missingCount >= 1) calc = "GOOD";
  let overall: QualityGrade = calc;
  if (freshness === "STALE" && overall === "EXCELLENT") overall = "GOOD";
  if (freshness === "UNKNOWN" && overall === "EXCELLENT") overall = "GOOD";
  if (providerHealth === "DEGRADED" && overall !== "POOR") overall = "WARNING";
  if (providerHealth === "UNAVAILABLE") overall = "POOR";
  return {
    freshness,
    providerHealth,
    missingCount,
    calculationIntegrity: calc,
    overall,
  };
}

function buildConfidence(
  agreement: SignalAgreementPanel,
  readiness: TradeReadinessPanel,
  quality: DataQualityPanel,
  decisionConfidence: number,
): ConfidencePanel {
  const known = agreement.agree + agreement.disagree + agreement.neutral;
  const agreementPct = known === 0 ? 0 : (agreement.agree / known) * 100;
  const availPct = readiness.total === 0
    ? 0
    : ((readiness.total - readiness.unavailable) / readiness.total) * 100;
  const conflictPenalty = agreement.disagree * 4;
  const stabilityBonus =
    quality.overall === "EXCELLENT" ? 5
    : quality.overall === "GOOD" ? 2
    : quality.overall === "WARNING" ? -3
    : -10;
  const raw = clamp(
    agreementPct * 0.55 + availPct * 0.35 + stabilityBonus - conflictPenalty,
    0, 100,
  );
  // Blend with the upstream decision engine confidence for stability.
  const value = clamp(round(raw * 0.7 + decisionConfidence * 0.3), 0, 100);
  return {
    value,
    signalStrength: agreement.level,
    dataQuality: quality.overall,
    components: {
      signalAgreementPct: round(agreementPct),
      dataAvailabilityPct: round(availPct),
      conflictPenalty: round(conflictPenalty),
      stabilityBonus: round(stabilityBonus),
    },
  };
}

function buildStrikeAdvice(
  inp: InstitutionalFlowEngineInput,
  agreement: SignalAgreementPanel,
): StrikeAdvicePanel {
  const rec = inp.strikeRecommended;
  if (!rec.available || rec.strike == null || rec.type == null) {
    return {
      strike: null, optionType: null, moneyness: null,
      reason: "No directional trade recommended",
      risk: inp.vixRegime === "HIGH" ? "VERY_HIGH" : inp.vixRegime,
      expectedEnvironment: inp.vixRegime === "LOW" ? "Calm, risk-on" : inp.vixRegime,
      available: false,
    };
  }
  const dominant =
    rec.type === "CE" ? "bullish confirmations" : "bearish confirmations";
  const bulls = agreement.participants.filter((p) => p.bias === (rec.type === "CE" ? "BULLISH" : "BEARISH"));
  const reason = `${agreement.level} ${dominant}: ${bulls.slice(0, 3).map((p) => p.label).join(", ") || "—"}`;
  const env =
    inp.vixRegime === "LOW" ? "Low VIX — favour ATM buying"
    : inp.vixRegime === "MEDIUM" ? "Medium VIX — 1-strike OTM"
    : inp.vixRegime === "ELEVATED" ? "Elevated VIX — 2-strike OTM"
    : inp.vixRegime === "HIGH" ? "High VIX — reduce size, ATM only"
    : "Unknown VIX regime";
  return {
    strike: rec.strike,
    optionType: rec.type,
    moneyness: rec.moneyness,
    reason,
    risk: inp.vixRegime === "HIGH" ? "VERY_HIGH" : inp.vixRegime,
    expectedEnvironment: env,
    available: true,
  };
}

function buildExplanation(
  inp: InstitutionalFlowEngineInput,
  agreement: SignalAgreementPanel,
  confidence: ConfidencePanel,
): ExplainablePanel {
  const side = inp.decisionAction === "BUY_CALL" ? "BULLISH"
    : inp.decisionAction === "BUY_PUT" ? "BEARISH"
    : null;
  const bullets: string[] = [];
  if (side) {
    for (const p of agreement.participants) {
      if (p.bias === side) bullets.push(`✓ ${p.label}: ${side.toLowerCase()}`);
    }
  } else {
    for (const p of agreement.participants) {
      if (p.bias !== "UNAVAILABLE") bullets.push(`• ${p.label}: ${p.bias.toLowerCase()}`);
    }
  }
  return {
    action: inp.decisionAction,
    bullets,
    confidence: confidence.value,
  };
}

// ---------------- public entry ---------------- //

export function computeInstitutionalFlow(
  inp: InstitutionalFlowEngineInput,
): InstitutionalFlowEngineOutput {
  const combined = buildCombinedPcrPanel(inp);
  const oi = buildOiPanel(inp);
  const vwap = buildVwapPanel(inp);
  const price = buildPricePanel(inp);
  const parts = participants(inp, { vwap, oi, price });
  const agreement = buildAgreementPanel(parts);
  const sectors = parts.find((p) => p.key === "sector")?.bias ?? "UNAVAILABLE";
  const breadth = parts.find((p) => p.key === "breadth")?.bias ?? "UNAVAILABLE";
  const readiness = buildReadinessPanel(inp, {
    combined, oi, vwap, price, sectors, breadth,
  });
  const flowSummary = buildFlowSummary(inp, oi);
  const regime = buildRegime(inp, agreement);
  const missingCount = readiness.unavailable;
  const quality = buildDataQuality(inp, missingCount);
  const confidence = buildConfidence(agreement, readiness, quality, inp.decisionConfidence);
  const strikeAdvice = buildStrikeAdvice(inp, agreement);
  const explanation = buildExplanation(inp, agreement, confidence);
  return {
    combinedPcr: combined,
    oiClassifier: oi,
    vwap,
    priceConfirmation: price,
    tradeReadiness: readiness,
    confidence,
    signalAgreement: agreement,
    institutionalFlow: flowSummary,
    regime,
    dataQuality: quality,
    strikeAdvice,
    explanation,
    generatedAt: inp.generatedAt,
    disclaimer: IFE_DISCLAIMER,
  };
}