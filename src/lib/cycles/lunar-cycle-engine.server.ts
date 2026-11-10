// Phase 36.4 — Dynamic Lunar-Solar Cycle Mapping Engine (Gann & ChronoWheel)
// Computes exact Moon-Sun Longitudinal Separation Angle: Phase Angle = (Moon_Lon - Sun_Lon) mod 360 degrees.
// Backtracks historical Gregorian dates where the matching Lunar Phase / Tithi occurred across T-1 to T-10.
// Handles Adhik Maas (leap lunar months) and phase shift tolerances (+/- 1 degree / 1 trading session).

import * as julian from "astronomia/julian";
import * as solar from "astronomia/solar";
import * as moonposition from "astronomia/moonposition";
import * as base from "astronomia/base";

export interface LunarPhaseDetails {
  readonly phaseAngle: number; // 0.00 to 359.99 degrees
  readonly tithiNumber: number; // 1 to 30
  readonly tithiName: string; // e.g. "Shukla Ekadashi", "Purnima", "Amavasya"
  readonly paksha: "Shukla" | "Krishna";
  readonly phaseName: string; // Western phase: "New Moon", "Waxing Crescent", etc.
  readonly illumination: number; // 0 to 100%
  readonly sunLongitude: number; // 0 to 360 deg
  readonly moonLongitude: number; // 0 to 360 deg
}

export interface HistoricalLunarWindow {
  readonly year: number;
  readonly relativeYear: string; // "T-1", "T-2", ..., "T-10"
  readonly startDate: string; // "YYYY-MM-DD"
  readonly endDate: string; // "YYYY-MM-DD"
  readonly rawStartDate: string; // Exact astronomical date
  readonly rawEndDate: string;
  readonly tradingSessions: number;
  readonly phaseAngleStart: number;
  readonly phaseAngleEnd: number;
  readonly tithiStart: string;
  readonly tithiEnd: string;
  readonly isAdhikMaas: boolean;
  readonly weekendAdjusted: boolean;
  readonly phaseShiftToleranceDeg: number;
}

export interface LunarCycleScanRequest {
  readonly startDate: string; // "YYYY-MM-DD"
  readonly endDate: string; // "YYYY-MM-DD"
  readonly lookbackYears?: number; // default 10 (3, 5, or 10)
}

export interface LunarCycleScanResponse {
  readonly referenceWindow: {
    readonly startDate: string;
    readonly endDate: string;
    readonly durationDays: number;
    readonly startPhase: LunarPhaseDetails;
    readonly endPhase: LunarPhaseDetails;
  };
  readonly lookbackYears: number;
  readonly historicalWindows: readonly HistoricalLunarWindow[];
  readonly computedAt: string;
}

const TITHI_NAMES = [
  "Shukla Pratipada",
  "Shukla Dwitiya",
  "Shukla Tritiya",
  "Shukla Chaturthi",
  "Shukla Panchami",
  "Shukla Shashthi",
  "Shukla Saptami",
  "Shukla Ashtami",
  "Shukla Navami",
  "Shukla Dashami",
  "Shukla Ekadashi",
  "Shukla Dwadashi",
  "Shukla Trayodashi",
  "Shukla Chaturdashi",
  "Purnima (Full Moon)",
  "Krishna Pratipada",
  "Krishna Dwitiya",
  "Krishna Tritiya",
  "Krishna Chaturthi",
  "Krishna Panchami",
  "Krishna Shashthi",
  "Krishna Saptami",
  "Krishna Ashtami",
  "Krishna Navami",
  "Krishna Dashami",
  "Krishna Ekadashi",
  "Krishna Dwadashi",
  "Krishna Trayodashi",
  "Krishna Chaturdashi",
  "Amavasya (New Moon)",
] as const;

function normDeg(deg: number): number {
  deg = deg % 360;
  if (deg < 0) deg += 360;
  return deg;
}

function westernPhaseName(phaseAngle: number): string {
  if (phaseAngle < 15 || phaseAngle >= 345) return "New Moon";
  if (phaseAngle < 75) return "Waxing Crescent";
  if (phaseAngle < 105) return "First Quarter";
  if (phaseAngle < 165) return "Waxing Gibbous";
  if (phaseAngle < 195) return "Full Moon";
  if (phaseAngle < 255) return "Waning Gibbous";
  if (phaseAngle < 285) return "Last Quarter";
  return "Waning Crescent";
}

/**
 * Compute Julian Date from Date object.
 */
export function getJulianDate(date: Date): number {
  const frac = (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600) / 24;
  return julian.CalendarGregorianToJD(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate() + frac,
  );
}

/**
 * Convert Julian Date back to JavaScript Date object.
 */
export function julianDateToDate(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}

/**
 * Calculate exact Moon-Sun Longitudinal Separation Angle for a given Julian Date.
 * Phase Angle = (Moon_Lon - Sun_Lon) mod 360 degrees.
 */
export function calculateSeparationAngle(jd: number): {
  phaseAngle: number;
  sunLon: number;
  moonLon: number;
} {
  const t = base.J2000Century(jd);
  const sunLon = normDeg((solar.apparentLongitude(t) * 180) / Math.PI);
  const moonLon = normDeg((moonposition.position(jd).lon * 180) / Math.PI);
  const phaseAngle = normDeg(moonLon - sunLon);
  return { phaseAngle, sunLon, moonLon };
}

/**
 * Get comprehensive Lunar Phase Details for a given Date.
 */
export function getLunarPhaseDetails(date: Date): LunarPhaseDetails {
  const jd = getJulianDate(date);
  const { phaseAngle, sunLon, moonLon } = calculateSeparationAngle(jd);

  const tithiIndex = Math.min(29, Math.max(0, Math.floor(phaseAngle / 12)));
  const tithiNumber = tithiIndex + 1;
  const tithiName = TITHI_NAMES[tithiIndex];
  const paksha: "Shukla" | "Krishna" = tithiNumber <= 15 ? "Shukla" : "Krishna";
  const phaseName = westernPhaseName(phaseAngle);
  const illumination =
    Math.round(((1 - Math.cos((phaseAngle * Math.PI) / 180)) / 2) * 1000) / 10;

  return {
    phaseAngle: Math.round(phaseAngle * 100) / 100,
    tithiNumber,
    tithiName,
    paksha,
    phaseName,
    illumination,
    sunLongitude: Math.round(sunLon * 100) / 100,
    moonLongitude: Math.round(moonLon * 100) / 100,
  };
}

/**
 * Find the exact Julian Date in an approximate year/month where separation angle matches targetPhase.
 * Uses a grid scan followed by secant/binary search with tolerance < 0.05 degrees.
 */
export function findMatchingPhaseJD(
  targetPhase: number,
  approxYear: number,
  approxMonth: number,
  approxDay: number,
): { jd: number; achievedPhase: number; isAdhikMaas: boolean } {
  // Center search on the same solar calendar window in target year
  const centerJD = julian.CalendarGregorianToJD(approxYear, approxMonth, approxDay + 0.39);

  // Search +/- 18 days (one full synodic month) for closest upward or matching crossing
  let bestJD = centerJD;
  let bestDiff = 999;

  for (let d = -18; d <= 18; d += 0.25) {
    const testJD = centerJD + d;
    const { phaseAngle } = calculateSeparationAngle(testJD);
    let diff = Math.abs(phaseAngle - targetPhase);
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      bestJD = testJD;
    }
  }

  // Refine with binary search
  let lo = bestJD - 0.25;
  let hi = bestJD + 0.25;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const { phaseAngle } = calculateSeparationAngle(mid);
    const diff = ((((phaseAngle - targetPhase + 180) % 360) + 360) % 360) - 180;
    if (diff < 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const finalJD = (lo + hi) / 2;
  const { phaseAngle: achievedPhase } = calculateSeparationAngle(finalJD);

  // Check if an Adhik Maas (intercalary month) shifted this cycle by > 20 days
  const targetCalDate = new Date(Date.UTC(approxYear, approxMonth - 1, approxDay));
  const achievedCalDate = julianDateToDate(finalJD);
  const dayDifference = Math.abs(
    (achievedCalDate.getTime() - targetCalDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const isAdhikMaas = dayDifference > 24;

  return { jd: finalJD, achievedPhase, isAdhikMaas };
}

/**
 * Adjust date to nearest market trading session if it lands on a weekend.
 * Saturday -> Friday (-1 day)
 * Sunday -> Monday (+1 day)
 */
function adjustToTradingSession(dateStr: string): { sessionDate: string; adjusted: boolean } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = dt.getUTCDay(); // 0 = Sun, 6 = Sat

  if (dayOfWeek === 6) {
    // Saturday -> adjust to Friday
    const adjusted = new Date(dt.getTime() - 24 * 60 * 60 * 1000);
    return { sessionDate: adjusted.toISOString().slice(0, 10), adjusted: true };
  }
  if (dayOfWeek === 0) {
    // Sunday -> adjust to Monday
    const adjusted = new Date(dt.getTime() + 24 * 60 * 60 * 1000);
    return { sessionDate: adjusted.toISOString().slice(0, 10), adjusted: true };
  }
  return { sessionDate: dateStr, adjusted: false };
}

/**
 * Count the number of trading sessions (weekdays) between two dates inclusive.
 */
function countTradingSessions(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (start > end) return 1;

  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getUTCDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return Math.max(1, count);
}

/**
 * Map a reference Gregorian window to historical matching Lunar Phase / Tithi windows
 * across the specified lookback depth (3, 5, or 10 years).
 */
export function mapHistoricalLunarWindows(request: LunarCycleScanRequest): LunarCycleScanResponse {
  const lookbackYears = Math.min(10, Math.max(1, request.lookbackYears ?? 10));

  const [refStartY, refStartM, refStartD] = request.startDate.split("-").map(Number);
  const [refEndY, refEndM, refEndD] = request.endDate.split("-").map(Number);

  // Reference dates at market open / close IST (03:45 UTC / 10:00 UTC)
  const refStartDate = new Date(Date.UTC(refStartY, refStartM - 1, refStartD, 3, 45, 0));
  const refEndDate = new Date(Date.UTC(refEndY, refEndM - 1, refEndD, 10, 0, 0));

  const startPhase = getLunarPhaseDetails(refStartDate);
  const endPhase = getLunarPhaseDetails(refEndDate);

  const durationDays = Math.max(
    1,
    Math.round((refEndDate.getTime() - refStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
  );

  const historicalWindows: HistoricalLunarWindow[] = [];

  for (let k = 1; k <= lookbackYears; k++) {
    const histYear = refStartY - k;

    // 1. Find historical matching start phase
    const matchStart = findMatchingPhaseJD(startPhase.phaseAngle, histYear, refStartM, refStartD);
    const rawStartDateObj = julianDateToDate(matchStart.jd);
    const rawStartDateStr = rawStartDateObj.toISOString().slice(0, 10);

    // 2. Find historical matching end phase
    let rawEndDateStr = rawStartDateStr;
    let matchEnd = matchStart;

    if (request.startDate !== request.endDate) {
      matchEnd = findMatchingPhaseJD(endPhase.phaseAngle, histYear, refEndM, refEndD);
      const rawEndDateObj = julianDateToDate(matchEnd.jd);
      rawEndDateStr = rawEndDateObj.toISOString().slice(0, 10);
    }

    // 3. Adjust for weekends (trading session tolerance)
    const adjStart = adjustToTradingSession(rawStartDateStr);
    const adjEnd = adjustToTradingSession(rawEndDateStr);

    const startDate = adjStart.sessionDate;
    let endDate = adjEnd.sessionDate;

    // Ensure endDate >= startDate
    if (new Date(endDate) < new Date(startDate)) {
      endDate = startDate;
    }

    const tradingSessions = countTradingSessions(startDate, endDate);
    const phaseShiftToleranceDeg = Math.round(Math.abs(matchStart.achievedPhase - startPhase.phaseAngle) * 100) / 100;

    historicalWindows.push({
      year: histYear,
      relativeYear: `T-${k}`,
      startDate,
      endDate,
      rawStartDate: rawStartDateStr,
      rawEndDate: rawEndDateStr,
      tradingSessions,
      phaseAngleStart: Math.round(matchStart.achievedPhase * 100) / 100,
      phaseAngleEnd: Math.round(matchEnd.achievedPhase * 100) / 100,
      tithiStart: getLunarPhaseDetails(rawStartDateObj).tithiName,
      tithiEnd: getLunarPhaseDetails(julianDateToDate(matchEnd.jd)).tithiName,
      isAdhikMaas: matchStart.isAdhikMaas || matchEnd.isAdhikMaas,
      weekendAdjusted: adjStart.adjusted || adjEnd.adjusted,
      phaseShiftToleranceDeg,
    });
  }

  return {
    referenceWindow: {
      startDate: request.startDate,
      endDate: request.endDate,
      durationDays,
      startPhase,
      endPhase,
    },
    lookbackYears,
    historicalWindows,
    computedAt: new Date().toISOString(),
  };
}
