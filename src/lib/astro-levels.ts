// Client-safe types + Astro level and signal computations.
import { isBullNakshatra, isBearNakshatra } from "./astro-constants";

export type PlanetRow = {
  planet: string;
  degree: number; // degree within sign (0-30)
  absDegree: number; // sidereal longitude 0-360
  sign: string;
  nakshatra: string;
  lord: string;
  pada: number;
  speed: number; // deg/day
  motion: "Direct" | "Retrograde";
  retro: boolean;
  bull: boolean;
  bear: boolean;
  r1: number;
  s1: number;
  r2: number;
  s2: number;
};

export type Cycles = {
  base: number;
  upper: number;
  lower: number;
};

export function computeCycles(prevClose: number): Cycles {
  const base = Math.floor(prevClose / 360);
  return { base, upper: base * 360, lower: (base - 1) * 360 };
}

// Astro levels for a given planet degree-in-sign, per the spec formulas.
export function computeAstroLevels(cycles: Cycles, degree: number) {
  const { upper, lower } = cycles;
  return {
    r1: Math.round(upper + degree),
    s1: Math.round(lower + degree),
    r2: Math.round(upper - 360 + degree),
    s2: Math.round(lower - 360 + degree),
  };
}

/* --------------------------- signal engine --------------------------- */

export type LevelKind = "R1" | "S1" | "R2" | "S2";
export type LevelStatus = "ACTIVE" | "TOUCHED" | "BROKEN" | "PENDING";
export type Proximity = "FLASH" | "ORANGE" | "YELLOW" | "BLUE" | "NORMAL";

export type LevelEntry = {
  planet: string;
  kind: LevelKind;
  isResistance: boolean;
  label: string;
  value: number;
  distance: number;
  status: LevelStatus;
  proximity: Proximity;
  highlight: "red-glow" | "green-glow" | "red" | "green" | "yellow" | "none";
};

function proximityOf(distance: number): Proximity {
  if (distance <= 2) return "FLASH";
  if (distance <= 5) return "ORANGE";
  if (distance <= 10) return "YELLOW";
  if (distance <= 20) return "BLUE";
  return "NORMAL";
}

function statusOf(price: number, value: number, isResistance: boolean): LevelStatus {
  const distance = Math.abs(price - value);
  if (distance <= 2) return "TOUCHED";
  if (isResistance) {
    if (price > value) return "BROKEN";
    if (distance <= 20) return "ACTIVE";
    return "PENDING";
  }
  if (price < value) return "BROKEN";
  if (distance <= 20) return "ACTIVE";
  return "PENDING";
}

function highlightOf(price: number, value: number, isResistance: boolean): LevelEntry["highlight"] {
  const distance = Math.abs(price - value);
  if (isResistance) {
    if (distance <= 2) return "red-glow"; // touching resistance
    if (price > value) return "green"; // above resistance
    if (distance <= 10) return "yellow"; // approaching resistance from below
    return "none";
  }
  if (distance <= 2) return "green-glow"; // touching support
  if (price < value) return "red"; // below support
  if (distance <= 10) return "yellow"; // above support, close
  return "none";
}

export function buildLevelBoard(planets: PlanetRow[], price: number): LevelEntry[] {
  const entries: LevelEntry[] = [];
  for (const p of planets) {
    const defs: [LevelKind, number, boolean][] = [
      ["R1", p.r1, true],
      ["R2", p.r2, true],
      ["S1", p.s1, false],
      ["S2", p.s2, false],
    ];
    for (const [kind, value, isResistance] of defs) {
      const distance = Math.abs(price - value);
      entries.push({
        planet: p.planet,
        kind,
        isResistance,
        label: `${p.planet} ${kind}`,
        value,
        distance,
        status: statusOf(price, value, isResistance),
        proximity: proximityOf(distance),
        highlight: highlightOf(price, value, isResistance),
      });
    }
  }
  return entries.sort((a, b) => a.distance - b.distance);
}

export type SignalKind = "BUY" | "SELL" | "WAIT";
export type SignalStrength =
  | "Strong Buy" | "Buy" | "Neutral" | "Sell" | "Strong Sell";

export type AstroSignal = {
  signal: SignalKind;
  strength: SignalStrength;
  confidence: number;
  emoji: string;
  reasons: string[];
  nearest: LevelEntry | null;
};

export function computeSignal(params: {
  price: number;
  board: LevelEntry[];
  moonNakshatra: string;
  retroCount: number;
  totalPlanets: number;
}): AstroSignal {
  const { price, board, moonNakshatra, retroCount, totalPlanets } = params;
  const nearest = board[0] ?? null;
  const reasons: string[] = [];
  let score = 50;

  if (nearest) {
    const d = nearest.distance;
    if (nearest.isResistance) {
      if (price > nearest.value) {
        score += 18;
        reasons.push(`Price crossed above ${nearest.label}`);
      } else if (d <= 2) {
        score -= 6;
        reasons.push(`Testing resistance ${nearest.label}`);
      } else if (d <= 10) {
        score -= 10;
        reasons.push(`Rejection risk near ${nearest.label}`);
      }
    } else {
      if (price < nearest.value) {
        score -= 18;
        reasons.push(`Price broke below ${nearest.label}`);
      } else if (d <= 2) {
        score += 6;
        reasons.push(`Holding support ${nearest.label}`);
      } else if (d <= 10) {
        score += 10;
        reasons.push(`Bounce potential from ${nearest.label}`);
      }
    }
  }

  const moonBull = isBullNakshatra(moonNakshatra);
  const moonBear = isBearNakshatra(moonNakshatra);
  if (moonBull) {
    score += 12;
    reasons.push(`Moon in bull nakshatra (${moonNakshatra})`);
  }
  if (moonBear) {
    score -= 12;
    reasons.push(`Moon in bear nakshatra (${moonNakshatra})`);
  }

  if (retroCount >= 3) {
    score -= 10;
    reasons.push(`${retroCount} planets retrograde`);
  } else if (retroCount <= 1) {
    score += 6;
    reasons.push(`Majority planets direct`);
  }

  const confidence = Math.max(0, Math.min(100, Math.round(score)));

  let strength: SignalStrength;
  if (confidence >= 90) strength = "Strong Buy";
  else if (confidence >= 75) strength = "Buy";
  else if (confidence >= 50) strength = "Neutral";
  else if (confidence >= 25) strength = "Sell";
  else strength = "Strong Sell";

  let signal: SignalKind;
  let emoji: string;
  if (confidence >= 75) {
    signal = "BUY";
    emoji = "🟢";
  } else if (confidence <= 49) {
    signal = "SELL";
    emoji = "🔴";
  } else {
    signal = "WAIT";
    emoji = "🟡";
  }

  if (reasons.length === 0) reasons.push("Price ranging between levels");
  void totalPlanets;
  return { signal, strength, confidence, emoji, reasons, nearest };
}