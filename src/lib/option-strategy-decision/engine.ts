// Phase 27 — Deterministic Option Strategy Decision Engine.
// Pure function. No I/O. No provider access.

import {
  DECISION_ENGINE_DISCLAIMER,
  DECISION_ENGINE_WEIGHTS,
  type DecisionAction,
  type DecisionEngineInput,
  type DecisionEngineOutput,
  type IndicatorBias,
  type IndicatorScore,
  type PositionSizingRecommendation,
  type RiskLevel,
  type StrikeRecommendation,
} from "./types";

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function round(x: number, digits = 1): number {
  const m = 10 ** digits;
  return Math.round(x * m) / m;
}

/** Split a signed score in [-1, +1] into (bullShare, bearShare) in [0, 1]. */
function signedShare(score: number): { bull: number; bear: number } {
  const s = clamp(score, -1, 1);
  return { bull: s > 0 ? s : 0, bear: s < 0 ? -s : 0 };
}

function biasFromShare(bull: number, bear: number, threshold = 0.1): IndicatorBias {
  if (bull - bear > threshold) return "BULLISH";
  if (bear - bull > threshold) return "BEARISH";
  return "NEUTRAL";
}

// ---------- Sub-scores (each returns signed score in [-1, +1]) ---------- //

function scorePcr(inp: DecisionEngineInput): {
  score: number | null;
  note: string;
} {
  if (!inp.pcr.available) return { score: null, note: "PCR unavailable" };
  const raw = inp.pcr.combinedScore;
  if (raw == null || !Number.isFinite(raw)) {
    // fall back to state
    const s = (inp.pcr.state ?? "").toUpperCase();
    if (s.includes("STRONG_PE")) return { score: 0.9, note: `PCR ${s}` };
    if (s.includes("PE_FOCUS")) return { score: 0.6, note: `PCR ${s}` };
    if (s.includes("BULLISH")) return { score: 0.5, note: `PCR ${s}` };
    if (s.includes("STRONG_CE")) return { score: -0.9, note: `PCR ${s}` };
    if (s.includes("CE_FOCUS")) return { score: -0.6, note: `PCR ${s}` };
    if (s.includes("BEARISH")) return { score: -0.5, note: `PCR ${s}` };
    return { score: 0, note: `PCR ${s || "NEUTRAL"}` };
  }
  // Combined PCR score convention: >0 puts-heavy (bullish), <0 calls-heavy (bearish).
  return { score: clamp(raw, -1, 1), note: `Combined PCR ${raw.toFixed(2)}` };
}

function scoreBreadth(inp: DecisionEngineInput): {
  score: number | null;
  note: string;
} {
  if (!inp.breadth.available) return { score: null, note: "Breadth unavailable" };
  if (inp.breadth.netBreadth != null && Number.isFinite(inp.breadth.netBreadth)) {
    const s = clamp(inp.breadth.netBreadth, -1, 1);
    return {
      score: s,
      note: `Net breadth ${round(s * 100)}%`,
    };
  }
  const a = inp.breadth.advances ?? 0;
  const d = inp.breadth.declines ?? 0;
  const total = a + d;
  if (total <= 0) return { score: null, note: "Breadth unavailable" };
  const s = (a - d) / total;
  return { score: s, note: `A/D ${a}/${d}` };
}

function biasWeight(b: IndicatorBias): number {
  if (b === "BULLISH") return 1;
  if (b === "BEARISH") return -1;
  return 0;
}

function scoreSector(inp: DecisionEngineInput): {
  score: number | null;
  note: string;
  leading: string | null;
  weakest: string | null;
} {
  if (!inp.sector.available) {
    return { score: null, note: "Sector data unavailable", leading: null, weakest: null };
  }
  // Priority: Banking (3) > Oil&Gas (2) > IT (1)
  const items: { name: string; w: number; b: IndicatorBias }[] = [
    { name: "Banking", w: 3, b: inp.sector.banking },
    { name: "Oil & Gas", w: 2, b: inp.sector.oilGas },
    { name: "IT", w: 1, b: inp.sector.it },
  ];
  const known = items.filter((i) => i.b !== "UNAVAILABLE");
  if (known.length === 0) {
    return { score: null, note: "Sector data unavailable", leading: null, weakest: null };
  }
  const totalW = known.reduce((acc, i) => acc + i.w, 0);
  const sum = known.reduce((acc, i) => acc + i.w * biasWeight(i.b), 0);
  const score = sum / totalW; // in [-1, +1]
  const sorted = [...known].sort((x, y) => biasWeight(y.b) - biasWeight(x.b));
  const leadingItem = sorted[0];
  const weakestItem = sorted[sorted.length - 1];
  return {
    score,
    note: `${leadingItem.name} ${leadingItem.b.toLowerCase()}, ${weakestItem.name} ${weakestItem.b.toLowerCase()}`,
    leading: biasWeight(leadingItem.b) > 0 ? leadingItem.name : null,
    weakest: biasWeight(weakestItem.b) < 0 ? weakestItem.name : null,
  };
}

function scoreOi(inp: DecisionEngineInput): {
  score: number | null;
  note: string;
} {
  if (!inp.oi.available) return { score: null, note: "OI unavailable" };
  const call = inp.oi.totalCallChangeOi;
  const put = inp.oi.totalPutChangeOi;
  const build = (inp.oi.buildUp ?? "").toUpperCase();
  let base = 0;
  const notes: string[] = [];
  if (call != null && put != null) {
    const denom = Math.abs(call) + Math.abs(put);
    if (denom > 0) {
      // put writing (put ΔOI>0) = bullish; call writing = bearish
      base = clamp((put - call) / denom, -1, 1);
      notes.push(
        put > call ? "Put writing dominant" : call > put ? "Call writing dominant" : "OI balanced",
      );
    }
  }
  if (build === "LONG_BUILDUP") { base = clamp(base + 0.3, -1, 1); notes.push("Long build-up"); }
  else if (build === "SHORT_COVERING") { base = clamp(base + 0.2, -1, 1); notes.push("Short covering"); }
  else if (build === "SHORT_BUILDUP") { base = clamp(base - 0.3, -1, 1); notes.push("Short build-up"); }
  else if (build === "LONG_UNWINDING") { base = clamp(base - 0.2, -1, 1); notes.push("Long unwinding"); }
  if (notes.length === 0) return { score: null, note: "OI insufficient" };
  return { score: base, note: notes.join(" · ") };
}

function scoreVix(inp: DecisionEngineInput): {
  score: number | null;
  regime: DecisionEngineOutput["vixRegime"];
  note: string;
} {
  const v = inp.vix;
  if (v == null || !Number.isFinite(v)) {
    return { score: null, regime: "UNKNOWN", note: "VIX unavailable" };
  }
  if (v < 15) return { score: 0.4, regime: "LOW", note: `VIX ${v.toFixed(2)} — calm, risk-on` };
  if (v < 20) return { score: 0.1, regime: "MEDIUM", note: `VIX ${v.toFixed(2)} — normal` };
  if (v < 25) return { score: -0.3, regime: "ELEVATED", note: `VIX ${v.toFixed(2)} — elevated` };
  return { score: -0.8, regime: "HIGH", note: `VIX ${v.toFixed(2)} — high risk` };
}

function scoreMaxPain(inp: DecisionEngineInput): {
  score: number | null;
  note: string;
} {
  const mp = inp.maxPain;
  if (!mp.available || mp.value == null || mp.spot == null) {
    return { score: null, note: "Max Pain unavailable" };
  }
  const distPct = mp.distancePct;
  if (distPct == null || !Number.isFinite(distPct)) {
    return { score: 0, note: "Max Pain neutral" };
  }
  // spot > max pain → market above pain (bearish pull toward pain), and vice versa.
  // small distance = compression / neutral
  if (Math.abs(distPct) < 0.3) return { score: 0, note: `Near Max Pain (${round(distPct, 2)}%)` };
  const s = clamp(-distPct / 3, -1, 1); // 3% away → full pull
  return {
    score: s,
    note: `Spot ${mp.spot > mp.value ? "above" : "below"} Max Pain by ${round(Math.abs(distPct), 2)}%`,
  };
}

// ---------- Aggregation ---------- //

function buildIndicator(
  key: IndicatorScore["key"],
  label: string,
  weight: number,
  score: number | null,
  note: string,
): IndicatorScore {
  if (score == null) {
    return {
      key,
      label,
      weight,
      bias: "UNAVAILABLE",
      bullContribution: 0,
      bearContribution: 0,
      available: false,
      note,
    };
  }
  const { bull, bear } = signedShare(score);
  return {
    key,
    label,
    weight,
    bias: biasFromShare(bull, bear),
    bullContribution: round(bull * weight * 100),
    bearContribution: round(bear * weight * 100),
    available: true,
    note,
  };
}

function pickStrikeStep(underlying: DecisionEngineInput["underlying"]): number {
  return underlying === "BANKNIFTY" ? 100 : 50;
}

function nearestStrike(spot: number, step: number): number {
  return Math.round(spot / step) * step;
}

function buildStrike(
  inp: DecisionEngineInput,
  action: DecisionAction,
  vixRegime: DecisionEngineOutput["vixRegime"],
  reasons: readonly string[],
): StrikeRecommendation {
  if (action !== "BUY_CALL" && action !== "BUY_PUT") {
    return {
      strike: null,
      optionType: null,
      moneyness: null,
      label: "—",
      reasons: [],
      available: false,
    };
  }
  const spot = inp.maxPain.spot ?? null;
  const atm = inp.oi.atmStrike;
  const step = pickStrikeStep(inp.underlying);
  const anchor = atm ?? (spot != null ? nearestStrike(spot, step) : null);
  if (anchor == null) {
    return {
      strike: null,
      optionType: action === "BUY_CALL" ? "CE" : "PE",
      moneyness: "ATM",
      label: "ATM (spot unavailable)",
      reasons: [...reasons],
      available: false,
    };
  }
  let offsetSteps = 0;
  let moneyness: StrikeRecommendation["moneyness"] = "ATM";
  if (vixRegime === "LOW") { offsetSteps = 0; moneyness = "ATM"; }
  else if (vixRegime === "MEDIUM") { offsetSteps = 1; moneyness = "OTM"; }
  else if (vixRegime === "ELEVATED") { offsetSteps = 2; moneyness = "OTM"; }
  else if (vixRegime === "HIGH") { offsetSteps = 0; moneyness = "ATM"; }
  const dir = action === "BUY_CALL" ? 1 : -1;
  const strike = anchor + dir * offsetSteps * step;
  return {
    strike,
    optionType: action === "BUY_CALL" ? "CE" : "PE",
    moneyness,
    label: `${strike} ${action === "BUY_CALL" ? "CE" : "PE"} (${moneyness})`,
    reasons: [...reasons],
    available: true,
  };
}

function buildSizing(
  vixRegime: DecisionEngineOutput["vixRegime"],
  action: DecisionAction,
): PositionSizingRecommendation {
  if (action === "NO_TRADE" || action === "WAIT") {
    return { risk: "UNKNOWN", suggestedSizePct: 0, note: "Hold cash — no trade recommended." };
  }
  const risk: RiskLevel =
    vixRegime === "LOW" ? "LOW"
    : vixRegime === "MEDIUM" ? "MEDIUM"
    : vixRegime === "ELEVATED" ? "HIGH"
    : vixRegime === "HIGH" ? "VERY_HIGH"
    : "UNKNOWN";
  const size =
    vixRegime === "LOW" ? 100
    : vixRegime === "MEDIUM" ? 75
    : vixRegime === "ELEVATED" ? 50
    : vixRegime === "HIGH" ? 25
    : 25;
  return {
    risk,
    suggestedSizePct: size,
    note: `VIX regime ${vixRegime} → suggested size ${size}%.`,
  };
}

// ---------- Public entrypoint ---------- //

export function computeOptionDecision(inp: DecisionEngineInput): DecisionEngineOutput {
  const pcr = scorePcr(inp);
  const breadth = scoreBreadth(inp);
  const sector = scoreSector(inp);
  const oi = scoreOi(inp);
  const vix = scoreVix(inp);
  const mp = scoreMaxPain(inp);

  const indicators: IndicatorScore[] = [
    buildIndicator("pcr", "Combined PCR", DECISION_ENGINE_WEIGHTS.pcr, pcr.score, pcr.note),
    buildIndicator("sector", "Sector Heat", DECISION_ENGINE_WEIGHTS.sector, sector.score, sector.note),
    buildIndicator("breadth", "Market Breadth", DECISION_ENGINE_WEIGHTS.breadth, breadth.score, breadth.note),
    buildIndicator("oi", "OI Structure", DECISION_ENGINE_WEIGHTS.oi, oi.score, oi.note),
    buildIndicator("vix", "India VIX", DECISION_ENGINE_WEIGHTS.vix, vix.score, vix.note),
    buildIndicator("maxPain", "Max Pain", DECISION_ENGINE_WEIGHTS.maxPain, mp.score, mp.note),
  ];

  const bullScore = round(
    indicators.reduce((acc, i) => acc + i.bullContribution, 0),
  );
  const bearScore = round(
    indicators.reduce((acc, i) => acc + i.bearContribution, 0),
  );

  const warnings: string[] = [];
  const conflicts: string[] = [];

  const missing = indicators.filter((i) => !i.available).map((i) => i.label);
  if (missing.length > 0) warnings.push(`Missing inputs: ${missing.join(", ")}`);

  const bulls = indicators.filter((i) => i.bias === "BULLISH");
  const bears = indicators.filter((i) => i.bias === "BEARISH");
  if (bulls.length > 0 && bears.length > 0) {
    for (const b of bulls) {
      for (const r of bears) {
        if (Math.abs(b.weight - r.weight) < 0.01 || b.weight >= 0.15 && r.weight >= 0.15) {
          conflicts.push(`${b.label} bullish vs ${r.label} bearish`);
        }
      }
    }
  }

  // Decision rules
  let action: DecisionAction = "WAIT";
  const vixVal = inp.vix;
  const highVix = vixVal != null && vixVal > 25;
  if (highVix) {
    action = "NO_TRADE";
    warnings.push("VIX above 25 — option buying suspended.");
  } else if (missing.length >= 4) {
    action = "NO_TRADE";
    warnings.push("Too many missing indicators for a directional call.");
  } else if (bullScore >= 75 && bearScore < 40) {
    action = "BUY_CALL";
  } else if (bearScore >= 75 && bullScore < 40) {
    action = "BUY_PUT";
  } else if (Math.abs(bullScore - bearScore) < 10) {
    action = "WAIT";
  } else if (conflicts.length >= 2) {
    action = "NO_TRADE";
  } else {
    action = "WAIT";
  }

  // Confidence = winner margin scaled 0..100
  const winner = Math.max(bullScore, bearScore);
  const loser = Math.min(bullScore, bearScore);
  const margin = winner - loser; // 0..100
  const availabilityFactor = clamp(
    indicators.filter((i) => i.available).length / indicators.length,
    0,
    1,
  );
  const confidenceRaw = margin * availabilityFactor;
  const confidence =
    action === "BUY_CALL" || action === "BUY_PUT"
      ? clamp(round(Math.max(confidenceRaw, winner * 0.7)), 0, 100)
      : clamp(round(confidenceRaw), 0, 100);

  const reasoning: string[] = [];
  const contributingBias = action === "BUY_CALL" ? "BULLISH" : action === "BUY_PUT" ? "BEARISH" : null;
  if (contributingBias) {
    for (const i of indicators) {
      if (i.bias === contributingBias) reasoning.push(`✓ ${i.label}: ${i.note}`);
    }
  } else {
    for (const i of indicators) {
      if (i.available) reasoning.push(`• ${i.label}: ${i.note}`);
    }
  }

  const strike = buildStrike(inp, action, vix.regime, reasoning);
  const sizing = buildSizing(vix.regime, action);

  return {
    action,
    confidence,
    bullScore,
    bearScore,
    indicators,
    reasoning,
    warnings,
    conflicts,
    strike,
    sizing,
    vixRegime: vix.regime,
    leadingSector: sector.leading,
    weakestSector: sector.weakest,
    generatedAt: inp.generatedAt,
    disclaimer: DECISION_ENGINE_DISCLAIMER,
  };
}

export * from "./types";