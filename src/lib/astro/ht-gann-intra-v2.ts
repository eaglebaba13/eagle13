/**
 * EagleBABA Navagraha 360° Harmonic Matrix & 4-Pillar Cube Engine.
 *
 * Proprietary institutional multi-pillar trading engine:
 * 1. Pillar 1: EagleBABA Navagraha Intraday 360° Absolute-Degree Calculator (36 matrix levels, EagleBABA Pivot Matrix, VIX confluence, Trade Levels)
 * 2. Pillar 2: 27 Nakshatras Historical Matrix + Daily RSI 14 Sync
 * 3. Pillar 3: Vakri Retrograde Cycles + Mandatory Daily EMA (13) Filter
 * 4. Pillar 4: Empirical 18 Graha Aspect Matrix (±3° Orb, Exclude Rahu-Ketu)
 * 5. Master Cube Verdict: 3/4 Rule (2 Positional + 1 Intra Safe Level) + Expiry Hero-or-Zero flag
 *
 * NOTE: The 8 baseline mathematical files remain byte-for-byte untouched.
 */

export const NAVAGRAHA_PLANETS = [
  "Rahu",
  "Mars",
  "Mercury",
  "Venus",
  "Sun",
  "Ketu",
  "Moon",
  "Saturn",
  "Jupiter",
] as const;

export type NavagrahaPlanet = (typeof NAVAGRAHA_PLANETS)[number];

// Backward-compatible alias
export const HT_GANN_PLANETS = NAVAGRAHA_PLANETS;
export type HTGannPlanet = NavagrahaPlanet;

export type SafetyCategory = "SAFE_BUY" | "SAFE_SELL" | "RISKY_INNER";

export interface TradeLevels {
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskPts: number;
  recommendedStrike: string;
}

export interface PlanetPositionInput {
  name: NavagrahaPlanet;
  absDegree: number; // 0° to 360° absolute longitude
  retro?: boolean;
  speed?: number;
  nakshatra?: string;
  sign?: string;
  pada?: number;
}

export interface IntradayMatrixCell {
  level: number;
  safety: SafetyCategory;
  isPrimary: boolean;
  isPreferredOuter?: boolean;
  confluenceBadge?: string;
  confluencePivot?: string;
  distanceFromPrevClose: number;
  tradeLevels?: TradeLevels;
}

export interface IntradayPlanetRow {
  planet: NavagrahaPlanet;
  absDegree: number;
  L1: IntradayMatrixCell; // upper360 + absDegree
  L2: IntradayMatrixCell; // lower360 + absDegree
  L3: IntradayMatrixCell; // upper360 - absDegree
  L4: IntradayMatrixCell; // lower360 - absDegree
  isPrimaryPlanet: boolean;
}

export interface FloorPivots {
  P: number;
  R1: number;
  S1: number;
  R2: number;
  S2: number;
  R3: number;
  S3: number;
}

export interface IntradayMatrixResult {
  symbol: "NIFTY" | "BANKNIFTY";
  prevClose: number;
  factor: number;
  upper360: number;
  lower360: number;
  safeBuffer: number;
  safeBuyThreshold: number;
  safeSellThreshold: number;
  rows: IntradayPlanetRow[];
  allLevelsSorted: Array<IntradayMatrixCell & { planet: NavagrahaPlanet; column: "L1" | "L2" | "L3" | "L4" }>;
  primarySafeBuySetup?: IntradayMatrixCell & { planet: NavagrahaPlanet; column: "L1" | "L2" | "L3" | "L4" };
  primarySafeSellSetup?: IntradayMatrixCell & { planet: NavagrahaPlanet; column: "L1" | "L2" | "L3" | "L4" };
  floorPivots?: FloorPivots;
  indiaVix?: number;
  riskRules: {
    spotSl: number;
    target1: number;
    description: string;
  };
}

// ============================================================================
// PILLAR 1: EAGLEBABA NAVAGRAHA 360° ABSOLUTE-DEGREE CALCULATOR
// ============================================================================

export function computeFloorPivots(high: number, low: number, close: number): FloorPivots {
  const P = Math.round(((high + low + close) / 3) * 100) / 100;
  const R1 = Math.round((2 * P - low) * 100) / 100;
  const S1 = Math.round((2 * P - high) * 100) / 100;
  const R2 = Math.round((P + (high - low)) * 100) / 100;
  const S2 = Math.round((P - (high - low)) * 100) / 100;
  const R3 = Math.round((high + 2 * (P - low)) * 100) / 100;
  const S3 = Math.round((low - 2 * (high - P)) * 100) / 100;
  return { P, R1, S1, R2, S2, R3, S3 };
}

export function computeHtGannIntraV2Matrix(params: {
  symbol: "NIFTY" | "BANKNIFTY";
  prevClose: number;
  planets: PlanetPositionInput[];
  ohlc?: { high: number; low: number; close: number };
  indiaVix?: number;
}): IntradayMatrixResult {
  const { symbol, prevClose, planets, ohlc, indiaVix } = params;

  if (!Number.isFinite(prevClose) || prevClose <= 0) {
    throw new Error(`Invalid prevClose: ${prevClose}`);
  }

  const factor = prevClose / 360;
  const upper360 = Math.ceil(factor) * 360;
  const lower360 = Math.floor(factor) * 360;

  const safeBuffer = symbol === "BANKNIFTY" ? 300 : 100;
  const safeBuyThreshold = prevClose - safeBuffer;
  const safeSellThreshold = prevClose + safeBuffer;

  const riskPts = symbol === "BANKNIFTY" ? 101 : 51;
  const strikeStep = symbol === "BANKNIFTY" ? 100 : 50;

  const floorPivots = ohlc ? computeFloorPivots(ohlc.high, ohlc.low, ohlc.close) : undefined;
  const tolerance = symbol === "BANKNIFTY" ? 40 : 15;
  const clusterDist = symbol === "BANKNIFTY" ? 15 : 5;

  function classifySafety(level: number): SafetyCategory {
    if (level <= safeBuyThreshold) return "SAFE_BUY";
    if (level >= safeSellThreshold) return "SAFE_SELL";
    return "RISKY_INNER";
  }

  function checkEbPivotConfluence(level: number, safety: SafetyCategory): { badge?: string; pivot?: string } {
    if (!floorPivots) return {};

    const isLowVix = indiaVix != null && indiaVix < 15;

    if (isLowVix) {
      if (safety === "SAFE_BUY" && Math.abs(level - floorPivots.S2) <= tolerance) {
        return { badge: "★ VERY SAFE EB PIVOT CONFLUENCE", pivot: `EB S2 (${floorPivots.S2})` };
      }
      if (safety === "SAFE_SELL" && Math.abs(level - floorPivots.R2) <= tolerance) {
        return { badge: "★ VERY SAFE EB PIVOT CONFLUENCE", pivot: `EB R2 (${floorPivots.R2})` };
      }
      if (safety === "RISKY_INNER") {
        if (Math.abs(level - floorPivots.S2) <= tolerance) {
          return { badge: "★ EB PIVOT CONFLUENCE", pivot: `EB S2 (${floorPivots.S2})` };
        }
        if (Math.abs(level - floorPivots.R2) <= tolerance) {
          return { badge: "★ EB PIVOT CONFLUENCE", pivot: `EB R2 (${floorPivots.R2})` };
        }
      }
    } else {
      // Normal/High VIX >= 15
      if (safety === "SAFE_BUY") {
        if (Math.abs(level - floorPivots.S2) <= tolerance) {
          return { badge: "★ EB PIVOT CONFLUENCE", pivot: `EB S2 (${floorPivots.S2})` };
        }
        if (Math.abs(level - floorPivots.S1) <= tolerance) {
          return { badge: "★ EB PIVOT CONFLUENCE", pivot: `EB S1 (${floorPivots.S1})` };
        }
      }
      if (safety === "SAFE_SELL") {
        if (Math.abs(level - floorPivots.R2) <= tolerance) {
          return { badge: "★ EB PIVOT CONFLUENCE", pivot: `EB R2 (${floorPivots.R2})` };
        }
        if (Math.abs(level - floorPivots.R1) <= tolerance) {
          return { badge: "★ EB PIVOT CONFLUENCE", pivot: `EB R1 (${floorPivots.R1})` };
        }
      }
    }

    return {};
  }

  const rows: IntradayPlanetRow[] = [];
  const allLevels: Array<IntradayMatrixCell & { planet: NavagrahaPlanet; column: "L1" | "L2" | "L3" | "L4" }> = [];

  const planetMap = new Map<NavagrahaPlanet, PlanetPositionInput>();
  for (const p of planets) {
    planetMap.set(p.name, p);
  }

  for (const name of NAVAGRAHA_PLANETS) {
    const input = planetMap.get(name);
    const absDegree = input ? ((input.absDegree % 360) + 360) % 360 : 0;
    const isPrimaryPlanet = name === "Moon" || name === "Sun";

    const makeCell = (rawLevel: number, column: "L1" | "L2" | "L3" | "L4"): IntradayMatrixCell => {
      const level = Math.round(rawLevel);
      const safety = classifySafety(level);
      const { badge, pivot } = checkEbPivotConfluence(level, safety);
      const isNear360 = Math.abs(level - upper360) <= 25 || Math.abs(level - lower360) <= 25;
      const isPrimary = isPrimaryPlanet || isNear360;

      let tradeLevels: TradeLevels | undefined;
      if (safety === "SAFE_BUY") {
        tradeLevels = {
          entry: level,
          sl: level - riskPts,
          tp1: level + riskPts,
          tp2: level + riskPts * 2,
          tp3: level + riskPts * 3,
          riskPts,
          recommendedStrike: `${Math.floor(level / strikeStep) * strikeStep} CE (ITM)`,
        };
      } else if (safety === "SAFE_SELL") {
        tradeLevels = {
          entry: level,
          sl: level + riskPts,
          tp1: level - riskPts,
          tp2: level - riskPts * 2,
          tp3: level - riskPts * 3,
          riskPts,
          recommendedStrike: `${Math.ceil(level / strikeStep) * strikeStep} PE (ITM)`,
        };
      }

      const cell: IntradayMatrixCell = {
        level,
        safety,
        isPrimary,
        confluenceBadge: badge,
        confluencePivot: pivot,
        distanceFromPrevClose: Math.round((level - prevClose) * 100) / 100,
        tradeLevels,
      };

      allLevels.push({ ...cell, planet: name, column });
      return cell;
    };

    const L1 = makeCell(upper360 + absDegree, "L1");
    const L2 = makeCell(lower360 + absDegree, "L2");
    const L3 = makeCell(upper360 - absDegree, "L3");
    const L4 = makeCell(lower360 - absDegree, "L4");

    rows.push({
      planet: name,
      absDegree,
      L1,
      L2,
      L3,
      L4,
      isPrimaryPlanet,
    });
  }

  // Detect Clustering within 5 pts (Nifty) / 15 pts (BankNifty)
  allLevels.sort((a, b) => a.level - b.level);
  for (let i = 0; i < allLevels.length - 1; i++) {
    const cur = allLevels[i];
    const nxt = allLevels[i + 1];
    if (nxt.level - cur.level <= clusterDist) {
      const distCur = Math.abs(cur.level - prevClose);
      const distNxt = Math.abs(nxt.level - prevClose);
      if (distCur >= distNxt) {
        cur.isPreferredOuter = true;
      } else {
        nxt.isPreferredOuter = true;
      }
    }
  }

  // Identify Primary Safe Buy Setup (Support Reversal)
  const safeBuys = allLevels.filter((l) => l.safety === "SAFE_BUY");
  safeBuys.sort((a, b) => {
    const aConf = a.confluenceBadge ? 1 : 0;
    const bConf = b.confluenceBadge ? 1 : 0;
    if (aConf !== bConf) return bConf - aConf;
    const aPrim = a.isPrimary ? 1 : 0;
    const bPrim = b.isPrimary ? 1 : 0;
    if (aPrim !== bPrim) return bPrim - aPrim;
    return Math.abs(a.level - prevClose) - Math.abs(b.level - prevClose);
  });
  const primarySafeBuySetup = safeBuys[0];

  // Identify Primary Safe Sell Setup (Resistance Reversal)
  const safeSells = allLevels.filter((l) => l.safety === "SAFE_SELL");
  safeSells.sort((a, b) => {
    const aConf = a.confluenceBadge ? 1 : 0;
    const bConf = b.confluenceBadge ? 1 : 0;
    if (aConf !== bConf) return bConf - aConf;
    const aPrim = a.isPrimary ? 1 : 0;
    const bPrim = b.isPrimary ? 1 : 0;
    if (aPrim !== bPrim) return bPrim - aPrim;
    return Math.abs(a.level - prevClose) - Math.abs(b.level - prevClose);
  });
  const primarySafeSellSetup = safeSells[0];

  const riskRules = {
    spotSl: riskPts,
    target1: riskPts,
    description:
      symbol === "BANKNIFTY"
        ? "Spot SL: 101 Pts | Target 1: 101 Pts (1:1 -> Trail) | Option: ITM Strike | Entry: Wait for 5m Confirmation Candle + Pullback"
        : "Spot SL: 51 Pts | Target 1: 51 Pts (1:1 -> Trail) | Option: ITM Strike | Entry: Wait for 5m Confirmation Candle + Pullback",
  };

  return {
    symbol,
    prevClose,
    factor,
    upper360,
    lower360,
    safeBuffer,
    safeBuyThreshold,
    safeSellThreshold,
    rows,
    allLevelsSorted: allLevels,
    primarySafeBuySetup,
    primarySafeSellSetup,
    floorPivots,
    indiaVix,
    riskRules,
  };
}

// Backward-compatible alias
export const computeEagleBabaAstroMatrix = computeHtGannIntraV2Matrix;

// ============================================================================
// PILLAR 2: 27 NAKSHATRAS HISTORICAL DOMINANCE & DAILY RSI 14 SYNC
// ============================================================================

export interface BullBearStarInfo {
  name: string;
  tamilName: string;
  lord: string;
  nature: "BULL" | "BEAR" | "NEUTRAL";
  historicalRecord: string;
  description: string;
}

export const NAKSHATRA_DOMINANCE_MAP: Record<string, BullBearStarInfo> = {
  Krittika: {
    name: "Krittika",
    tamilName: "Kiruthikai",
    lord: "Sun",
    nature: "BULL",
    historicalRecord: "9 Monthly Lows",
    description: "Dominant Bull Star (Buy on Dips)",
  },
  "Uttara Phalguni": {
    name: "Uttara Phalguni",
    tamilName: "Uthiram",
    lord: "Sun",
    nature: "BULL",
    historicalRecord: "8 Monthly Lows",
    description: "Dominant Bull Star (Buy on Dips)",
  },
  Chitra: {
    name: "Chitra",
    tamilName: "Chithirai",
    lord: "Mars",
    nature: "BULL",
    historicalRecord: "7 Lows vs 1 High",
    description: "Dominant Bull Star (Buy on Dips)",
  },
  Dhanishta: {
    name: "Dhanishta",
    tamilName: "Avittam",
    lord: "Mars",
    nature: "BULL",
    historicalRecord: "6 Lows vs 1 High",
    description: "Dominant Bull Star (Buy on Dips)",
  },
  Pushya: {
    name: "Pushya",
    tamilName: "Poosam",
    lord: "Saturn",
    nature: "BULL",
    historicalRecord: "6 Lows vs 2 Highs",
    description: "Dominant Bull Star (Buy on Dips)",
  },
  Bharani: {
    name: "Bharani",
    tamilName: "Bharani",
    lord: "Venus",
    nature: "BEAR",
    historicalRecord: "7 Monthly Highs vs 4 Lows",
    description: "Dominant Bear Star (Sell on Rise)",
  },
  "Purva Bhadrapada": {
    name: "Purva Bhadrapada",
    tamilName: "Poorattathi",
    lord: "Jupiter",
    nature: "BEAR",
    historicalRecord: "6 Highs vs 3 Lows",
    description: "Dominant Bear Star (Sell on Rise)",
  },
  "Uttara Ashadha": {
    name: "Uttara Ashadha",
    tamilName: "Uthiradam",
    lord: "Sun",
    nature: "BEAR",
    historicalRecord: "6 Highs vs 1 Low (Strictly Bearish)",
    description: "Dominant Bear Star (Sell on Rise)",
  },
  Vishakha: {
    name: "Vishakha",
    tamilName: "Visakam",
    lord: "Jupiter",
    nature: "BEAR",
    historicalRecord: "5 Highs vs 3 Lows",
    description: "Dominant Bear Star (Sell on Rise)",
  },
  Shatabhisha: {
    name: "Shatabhisha",
    tamilName: "Sadayam",
    lord: "Rahu",
    nature: "BEAR",
    historicalRecord: "5 Highs vs 3 Lows",
    description: "Dominant Bear Star (Sell on Rise)",
  },
};

export type Pillar2SyncStatus =
  | "SYNCED_BULLISH"
  | "SYNCED_BEARISH"
  | "NON_SYNC"
  | "BULL_AWAITING_RSI"
  | "BEAR_AWAITING_RSI"
  | "NEUTRAL";

export interface Pillar2StarwiseResult {
  moonNakshatra: string;
  starInfo?: BullBearStarInfo;
  nature: "BULL" | "BEAR" | "NEUTRAL";
  dailyRsi14?: number | null;
  syncStatus: Pillar2SyncStatus;
  badge: string;
  starDayHigh?: number;
  starDayLow?: number;
  holdingRule: string;
}

export function evaluatePillar2Starwise(params: {
  moonNakshatra: string;
  dailyRsi14?: number | null;
  starDayHigh?: number;
  starDayLow?: number;
}): Pillar2StarwiseResult {
  const { moonNakshatra, dailyRsi14, starDayHigh, starDayLow } = params;

  const cleanName = Object.keys(NAKSHATRA_DOMINANCE_MAP).find(
    (k) =>
      k.toLowerCase() === moonNakshatra.toLowerCase() ||
      k.replace(/\s+/g, "").toLowerCase() === moonNakshatra.replace(/\s+/g, "").toLowerCase(),
  );

  const starInfo = cleanName ? NAKSHATRA_DOMINANCE_MAP[cleanName] : undefined;
  const nature = starInfo?.nature ?? "NEUTRAL";

  let syncStatus: Pillar2SyncStatus = "NEUTRAL";
  let badge = "⚪ NEUTRAL STAR";

  if (nature === "BULL") {
    if (dailyRsi14 != null) {
      if (dailyRsi14 <= 35) {
        syncStatus = "SYNCED_BULLISH";
        badge = "✅ SYNCED BULLISH";
      } else if (dailyRsi14 >= 70) {
        syncStatus = "NON_SYNC";
        badge = "⚠️ NON-SYNC (Avoid Positional Trade)";
      } else {
        syncStatus = "BULL_AWAITING_RSI";
        badge = "🟢 BULL STAR (Awaiting RSI <= 35)";
      }
    } else {
      syncStatus = "BULL_AWAITING_RSI";
      badge = "🟢 BULL STAR (Awaiting Daily RSI)";
    }
  } else if (nature === "BEAR") {
    if (dailyRsi14 != null) {
      if (dailyRsi14 >= 65) {
        syncStatus = "SYNCED_BEARISH";
        badge = "✅ SYNCED BEARISH";
      } else if (dailyRsi14 <= 30) {
        syncStatus = "NON_SYNC";
        badge = "⚠️ NON-SYNC (Avoid Positional Trade)";
      } else {
        syncStatus = "BEAR_AWAITING_RSI";
        badge = "🔴 BEAR STAR (Awaiting RSI >= 65)";
      }
    } else {
      syncStatus = "BEAR_AWAITING_RSI";
      badge = "🔴 BEAR STAR (Awaiting Daily RSI)";
    }
  }

  const holdingRule =
    nature === "BULL"
      ? "Hold Bullish Positional until Star Day Low breaks on Daily Candle Close."
      : nature === "BEAR"
        ? "Hold Bearish Positional until Star Day High breaks on Daily Candle Close."
        : "No dominant directional holding rule for neutral star.";

  return {
    moonNakshatra,
    starInfo,
    nature,
    dailyRsi14,
    syncStatus,
    badge,
    starDayHigh,
    starDayLow,
    holdingRule,
  };
}

// ============================================================================
// PILLAR 3: RETROGRADE CYCLES + MANDATORY DAILY EMA (13) FILTER
// ============================================================================

export type Pillar3RetroStatus =
  | "ACTIVE_CONFIRMED"
  | "EXIT_SIGNAL"
  | "ACTIVE_UNCONFIRMED"
  | "NEUTRAL"
  | "NONE";

export interface Pillar3RetrogradeResult {
  activeRetrogrades: string[];
  bullishRetrogrades: string[];
  bearishRetrogrades: string[];
  neutralRetrogrades: string[];
  spotClose?: number;
  dailyEma13?: number | null;
  bias: "BULLISH" | "BEARISH" | "NEUTRAL" | "NONE";
  status: Pillar3RetroStatus;
  badge: string;
  exitWarning?: string;
}

export function evaluatePillar3Retrograde(params: {
  retroPlanets: string[]; // names of planets with speed < 0
  spotClose?: number;
  dailyEma13?: number | null;
}): Pillar3RetrogradeResult {
  const { retroPlanets, spotClose, dailyEma13 } = params;

  const normalized = retroPlanets.map((p) => p.trim());
  const bullishRetrogrades = normalized.filter((p) => p === "Mars" || p === "Jupiter");
  const bearishRetrogrades = normalized.filter((p) => p === "Mercury" || p === "Saturn");
  const neutralRetrogrades = normalized.filter((p) => p === "Venus");

  let bias: "BULLISH" | "BEARISH" | "NEUTRAL" | "NONE" = "NONE";
  let status: Pillar3RetroStatus = "NONE";
  let badge = "⚪ NO MAJOR RETROGRADES ACTIVE";
  let exitWarning: string | undefined;

  // Bullish Retrograde priority if active
  if (bullishRetrogrades.length > 0 && bearishRetrogrades.length === 0) {
    bias = "BULLISH";
    if (spotClose != null && dailyEma13 != null) {
      if (spotClose >= dailyEma13) {
        status = "ACTIVE_CONFIRMED";
        badge = `🟢 BULLISH VAKRI (${bullishRetrogrades.join(", ")}) CONFIRMED (Above EMA 13)`;
      } else {
        status = "EXIT_SIGNAL";
        badge = "⚠️ EMA 13 EXIT SIGNAL — Exit Positional Longs";
        exitWarning = `Spot Close (${spotClose}) < Daily EMA 13 (${dailyEma13}). Bullish retrograde holding rule broken.`;
      }
    } else {
      status = "ACTIVE_UNCONFIRMED";
      badge = `🟢 BULLISH VAKRI (${bullishRetrogrades.join(", ")}) (Awaiting Daily EMA 13)`;
    }
  } else if (bearishRetrogrades.length > 0 && bullishRetrogrades.length === 0) {
    bias = "BEARISH";
    if (spotClose != null && dailyEma13 != null) {
      if (spotClose <= dailyEma13) {
        status = "ACTIVE_CONFIRMED";
        badge = `🔴 BEARISH VAKRI (${bearishRetrogrades.join(", ")}) CONFIRMED (Below EMA 13)`;
      } else {
        status = "EXIT_SIGNAL";
        badge = "⚠️ EMA 13 EXIT SIGNAL — Exit Positional Shorts";
        exitWarning = `Spot Close (${spotClose}) > Daily EMA 13 (${dailyEma13}). Bearish retrograde holding rule broken.`;
      }
    } else {
      status = "ACTIVE_UNCONFIRMED";
      badge = `🔴 BEARISH VAKRI (${bearishRetrogrades.join(", ")}) (Awaiting Daily EMA 13)`;
    }
  } else if (bullishRetrogrades.length > 0 && bearishRetrogrades.length > 0) {
    if (spotClose != null && dailyEma13 != null) {
      if (spotClose >= dailyEma13) {
        bias = "BULLISH";
        status = "ACTIVE_CONFIRMED";
        badge = `🟢 MIXED VAKRI: Bullish Dominance (${bullishRetrogrades.join(", ")}) Above EMA 13`;
      } else {
        bias = "BEARISH";
        status = "ACTIVE_CONFIRMED";
        badge = `🔴 MIXED VAKRI: Bearish Dominance (${bearishRetrogrades.join(", ")}) Below EMA 13`;
      }
    } else {
      bias = "NEUTRAL";
      status = "NEUTRAL";
      badge = `⚪ MIXED VAKRI (${[...bullishRetrogrades, ...bearishRetrogrades].join(", ")})`;
    }
  } else if (neutralRetrogrades.length > 0) {
    bias = "NEUTRAL";
    status = "NEUTRAL";
    badge = "⚪ NEUTRAL VAKRI (Venus)";
  }

  return {
    activeRetrogrades: normalized,
    bullishRetrogrades,
    bearishRetrogrades,
    neutralRetrogrades,
    spotClose,
    dailyEma13,
    bias,
    status,
    badge,
    exitWarning,
  };
}

// ============================================================================
// PILLAR 4: EMPIRICAL 18 PLANET ASPECT MATRIX (±3° Orb, Exclude Rahu-Ketu)
// ============================================================================

export interface DefinedAspect {
  id: string;
  planet1: NavagrahaPlanet;
  planet2: NavagrahaPlanet;
  targetAngle: number;
  nature: "BULL" | "BEAR";
  hits: number;
  description: string;
}

export const EMPIRICAL_18_ASPECTS: DefinedAspect[] = [
  // 5 Proven Bullish Aspects
  { id: "moon-jup-60", planet1: "Moon", planet2: "Jupiter", targetAngle: 60, nature: "BULL", hits: 17, description: "Moon – Jupiter @ 60° (17 hits — Most Powerful)" },
  { id: "sun-rahu-60", planet1: "Sun", planet2: "Rahu", targetAngle: 60, nature: "BULL", hits: 9, description: "Sun – Rahu @ 60° (9 hits)" },
  { id: "mars-jup-0", planet1: "Mars", planet2: "Jupiter", targetAngle: 0, nature: "BULL", hits: 5, description: "Mars – Jupiter @ 0° (5 hits)" },
  { id: "jup-ven-180", planet1: "Jupiter", planet2: "Venus", targetAngle: 180, nature: "BULL", hits: 2, description: "Jupiter – Venus @ 180° (2 hits)" },
  { id: "ven-sat-180", planet1: "Venus", planet2: "Saturn", targetAngle: 180, nature: "BULL", hits: 2, description: "Venus – Saturn @ 180° (2 hits)" },

  // 13 Proven Bearish Aspects
  { id: "mars-merc-30", planet1: "Mars", planet2: "Mercury", targetAngle: 30, nature: "BEAR", hits: 19, description: "Mars – Mercury @ 30° (19 hits)" },
  { id: "sun-jup-30", planet1: "Sun", planet2: "Jupiter", targetAngle: 30, nature: "BEAR", hits: 16, description: "Sun – Jupiter @ 30° (16 hits)" },
  { id: "mars-rahu-180", planet1: "Mars", planet2: "Rahu", targetAngle: 180, nature: "BEAR", hits: 10, description: "Mars – Rahu @ 180° (10 hits)" },
  { id: "merc-moon-90", planet1: "Mercury", planet2: "Moon", targetAngle: 90, nature: "BEAR", hits: 10, description: "Mercury – Moon @ 90° (10 hits)" },
  { id: "mars-jup-90", planet1: "Mars", planet2: "Jupiter", targetAngle: 90, nature: "BEAR", hits: 9, description: "Mars – Jupiter @ 90° (9 hits)" },
  { id: "merc-moon-180", planet1: "Mercury", planet2: "Moon", targetAngle: 180, nature: "BEAR", hits: 9, description: "Mercury – Moon @ 180° (9 hits)" },
  { id: "moon-mars-180", planet1: "Moon", planet2: "Mars", targetAngle: 180, nature: "BEAR", hits: 9, description: "Moon – Mars @ 180° (9 hits)" },
  { id: "sun-ven-0", planet1: "Sun", planet2: "Venus", targetAngle: 0, nature: "BEAR", hits: 8, description: "Sun – Venus @ 0° (8 hits)" },
  { id: "sun-rahu-90", planet1: "Sun", planet2: "Rahu", targetAngle: 90, nature: "BEAR", hits: 8, description: "Sun – Rahu @ 90° (8 hits)" },
  { id: "sun-rahu-0", planet1: "Sun", planet2: "Rahu", targetAngle: 0, nature: "BEAR", hits: 7, description: "Sun – Rahu @ 0° (7 hits)" },
  { id: "mars-ven-0", planet1: "Mars", planet2: "Venus", targetAngle: 0, nature: "BEAR", hits: 7, description: "Mars – Venus @ 0° (7 hits)" },
  { id: "mars-sat-180", planet1: "Mars", planet2: "Saturn", targetAngle: 180, nature: "BEAR", hits: 5, description: "Mars – Saturn @ 180° (5 hits)" },
  { id: "jup-rahu-0", planet1: "Jupiter", planet2: "Rahu", targetAngle: 0, nature: "BEAR", hits: 5, description: "Jupiter – Rahu @ 0° (5 hits)" },
];

export interface ActiveAspectEvaluation {
  aspect: DefinedAspect;
  actualSeparation: number;
  orbDifference: number;
  isActive: boolean;
}

export interface Pillar4AspectResult {
  allEvaluations: ActiveAspectEvaluation[];
  activeBullishAspects: ActiveAspectEvaluation[];
  activeBearishAspects: ActiveAspectEvaluation[];
  totalBullHits: number;
  totalBearHits: number;
  netBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  summary: string;
}

export function evaluatePillar4Aspects(planets: PlanetPositionInput[]): Pillar4AspectResult {
  const planetMap = new Map<string, number>();
  for (const p of planets) {
    planetMap.set(p.name, ((p.absDegree % 360) + 360) % 360);
  }

  const allEvaluations: ActiveAspectEvaluation[] = [];
  const activeBullishAspects: ActiveAspectEvaluation[] = [];
  const activeBearishAspects: ActiveAspectEvaluation[] = [];

  let totalBullHits = 0;
  let totalBearHits = 0;

  for (const asp of EMPIRICAL_18_ASPECTS) {
    // Strictly exclude Rahu-Ketu pairing
    if (
      (asp.planet1 === "Rahu" && asp.planet2 === "Ketu") ||
      (asp.planet1 === "Ketu" && asp.planet2 === "Rahu")
    ) {
      continue;
    }

    const deg1 = planetMap.get(asp.planet1);
    const deg2 = planetMap.get(asp.planet2);

    if (deg1 == null || deg2 == null) continue;

    let sep = Math.abs(deg1 - deg2);
    if (sep > 180) sep = 360 - sep;
    sep = Math.round(sep * 100) / 100;

    const orbDiff = Math.round(Math.abs(sep - asp.targetAngle) * 100) / 100;
    const isActive = orbDiff <= 3.0;

    const evaluation: ActiveAspectEvaluation = {
      aspect: asp,
      actualSeparation: sep,
      orbDifference: orbDiff,
      isActive,
    };

    allEvaluations.push(evaluation);

    if (isActive) {
      if (asp.nature === "BULL") {
        activeBullishAspects.push(evaluation);
        totalBullHits += asp.hits;
      } else {
        activeBearishAspects.push(evaluation);
        totalBearHits += asp.hits;
      }
    }
  }

  let netBias: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  if (totalBullHits > totalBearHits) {
    netBias = "BULLISH";
  } else if (totalBearHits > totalBullHits) {
    netBias = "BEARISH";
  }

  const summary =
    activeBullishAspects.length === 0 && activeBearishAspects.length === 0
      ? "No active empirical aspects within ±3° orb."
      : `Active Aspects: ${activeBullishAspects.length} Bullish (${totalBullHits} hits) vs ${activeBearishAspects.length} Bearish (${totalBearHits} hits). Net: ${netBias}`;

  return {
    allEvaluations,
    activeBullishAspects,
    activeBearishAspects,
    totalBullHits,
    totalBearHits,
    netBias,
    summary,
  };
}

// ============================================================================
// MASTER "CUBE SETUP" VERDICT (3/4 RULE: 2 POSITIONAL + 1 INTRA)
// ============================================================================

export interface MasterCubeVerdict {
  positionalDirection: "BULLISH" | "BEARISH" | "NEUTRAL";
  positionalVotes: {
    pillar2Starwise: "BULLISH" | "BEARISH" | "NEUTRAL";
    pillar3Retrograde: "BULLISH" | "BEARISH" | "NEUTRAL";
    pillar4Aspects: "BULLISH" | "BEARISH" | "NEUTRAL";
    bullishCount: number;
    bearishCount: number;
  };
  hasIntraConfluence: boolean;
  confluentIntraLevels: Array<IntradayMatrixCell & { planet: NavagrahaPlanet }>;
  isMasterCubeActive: boolean;
  isExpiryWindow: boolean;
  verdictBadge: string;
  expiryBadge?: string;
  executionPlan: string;
}

export function evaluateMasterCube(params: {
  intraMatrix: IntradayMatrixResult;
  pillar2: Pillar2StarwiseResult;
  pillar3: Pillar3RetrogradeResult;
  pillar4: Pillar4AspectResult;
  targetDate?: Date | string;
}): MasterCubeVerdict {
  const { intraMatrix, pillar2, pillar3, pillar4, targetDate } = params;

  // 1. Pillar 2 vote
  let p2Vote: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  if (pillar2.syncStatus === "SYNCED_BULLISH" || pillar2.nature === "BULL") {
    p2Vote = "BULLISH";
  } else if (pillar2.syncStatus === "SYNCED_BEARISH" || pillar2.nature === "BEAR") {
    p2Vote = "BEARISH";
  }

  // 2. Pillar 3 vote
  let p3Vote: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  if (pillar3.bias === "BULLISH" && pillar3.status === "ACTIVE_CONFIRMED") {
    p3Vote = "BULLISH";
  } else if (pillar3.bias === "BEARISH" && pillar3.status === "ACTIVE_CONFIRMED") {
    p3Vote = "BEARISH";
  }

  // 3. Pillar 4 vote
  let p4Vote: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  if (pillar4.netBias === "BULLISH") {
    p4Vote = "BULLISH";
  } else if (pillar4.netBias === "BEARISH") {
    p4Vote = "BEARISH";
  }

  let bullVotes = 0;
  let bearVotes = 0;
  for (const v of [p2Vote, p3Vote, p4Vote]) {
    if (v === "BULLISH") bullVotes++;
    if (v === "BEARISH") bearVotes++;
  }

  let positionalDirection: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  if (bullVotes >= 2) positionalDirection = "BULLISH";
  else if (bearVotes >= 2) positionalDirection = "BEARISH";

  // 4. Intra Safe Level Confluence matching positional direction
  const confluentLevels: Array<IntradayMatrixCell & { planet: NavagrahaPlanet }> = [];
  for (const row of intraMatrix.rows) {
    for (const col of [row.L1, row.L2, row.L3, row.L4]) {
      if (col.confluenceBadge) {
        if (positionalDirection === "BULLISH" && col.safety === "SAFE_BUY") {
          confluentLevels.push({ ...col, planet: row.planet });
        } else if (positionalDirection === "BEARISH" && col.safety === "SAFE_SELL") {
          confluentLevels.push({ ...col, planet: row.planet });
        }
      }
    }
  }

  const hasIntraConfluence = confluentLevels.length > 0;
  const isMasterCubeActive = positionalDirection !== "NEUTRAL" && hasIntraConfluence;

  // Day of week check (Wednesday = 3, Thursday = 4)
  const d = targetDate ? new Date(targetDate) : new Date();
  const dayOfWeek = d.getUTCDay();
  const isExpiryWindow = dayOfWeek === 3 || dayOfWeek === 4;

  let verdictBadge = "⚪ CUBE AWAITING CONFLUENCE";
  if (isMasterCubeActive) {
    const syncGrade = bullVotes === 3 || bearVotes === 3 ? "4/4 Sync" : "3/4 Sync";
    verdictBadge = `🔥 EAGLEBABA A+ CUBE SETUP ACTIVE (${positionalDirection} · ${syncGrade})`;
  } else if (positionalDirection !== "NEUTRAL") {
    verdictBadge = `⚠️ POSITIONAL SYNC (${positionalDirection}) — Awaiting Intra EB Pivot Confluence Level`;
  }

  const expiryBadge = isExpiryWindow && isMasterCubeActive ? "⚡ HERO-OR-ZERO EXPIRY CUBE" : undefined;

  const executionPlan = isMasterCubeActive
    ? positionalDirection === "BULLISH"
      ? `BUY CALL / LONG: Target safe support level around ${confluentLevels[0]?.level ?? "S2"}. ${intraMatrix.riskRules.description}`
      : `BUY PUT / SHORT: Target safe resistance level around ${confluentLevels[0]?.level ?? "R2"}. ${intraMatrix.riskRules.description}`
    : `Observe: Wait for 2+ Positional Pillars to align with a qualified Safe Zone EB Pivot Confluence level.`;

  return {
    positionalDirection,
    positionalVotes: {
      pillar2Starwise: p2Vote,
      pillar3Retrograde: p3Vote,
      pillar4Aspects: p4Vote,
      bullishCount: bullVotes,
      bearishCount: bearVotes,
    },
    hasIntraConfluence,
    confluentIntraLevels: confluentLevels,
    isMasterCubeActive,
    isExpiryWindow,
    verdictBadge,
    expiryBadge,
    executionPlan,
  };
}
