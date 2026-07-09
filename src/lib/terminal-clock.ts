// LIVE ASTRO MARKET TERMINAL — client-safe presentation helpers.
// IMPORTANT: This file contains ONLY time/session/countdown presentation math
// and derivations from already-computed astro data. It does NOT modify any
// existing astro calculation, level formula, signal engine, API or database.
import {
  NAKSHATRAS,
  SIGNS,
  isBullNakshatra,
  isBearNakshatra,
} from "./astro-constants";

export const NAK_SIZE = 360 / 27; // 13.3333°
export const PADA_SIZE = NAK_SIZE / 4; // 3.3333°

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const DAY_MS = 86_400_000;

/* ------------------------------ time base ------------------------------ */

export type IstParts = {
  h: number;
  m: number;
  s: number;
  ms: number;
  dow: number; // 0 Sun .. 6 Sat
  secOfDay: number; // fractional seconds since IST midnight
  dateKey: string; // YYYY-MM-DD (IST)
  wall: Date; // Date whose UTC fields equal IST wall clock
};

export function istParts(now = Date.now()): IstParts {
  const w = new Date(now + IST_OFFSET_MS);
  const h = w.getUTCHours();
  const m = w.getUTCMinutes();
  const s = w.getUTCSeconds();
  const ms = w.getUTCMilliseconds();
  return {
    h,
    m,
    s,
    ms,
    dow: w.getUTCDay(),
    secOfDay: h * 3600 + m * 60 + s + ms / 1000,
    dateKey: w.toISOString().slice(0, 10),
    wall: w,
  };
}

export function fmtClock(now = Date.now(), tz = "Asia/Kolkata"): string {
  return new Date(now).toLocaleTimeString("en-GB", { hour12: false, timeZone: tz });
}

export function fmtDur(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${p(h)}:${p(m)}:${p(s)}`;
  return `${p(h)}:${p(m)}:${p(s)}`;
}

/* ---------------------------- NSE holidays ----------------------------- */
// Presentation-only static list (NSE trading holidays). Used purely to label
// "Closed / Holiday" and compute the next trading day in the UI.
export const NSE_HOLIDAYS_2026 = new Set<string>([
  "2026-01-26", "2026-02-16", "2026-03-04", "2026-03-25", "2026-04-01",
  "2026-04-03", "2026-04-14", "2026-05-01", "2026-08-15", "2026-08-28",
  "2026-10-02", "2026-10-21", "2026-11-09", "2026-11-24", "2026-12-25",
]);

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isTradingDay(wall: Date): boolean {
  const dow = wall.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !NSE_HOLIDAYS_2026.has(ymd(wall));
}

export function nextTradingDay(fromWall: Date): { date: Date; label: string } {
  const d = new Date(fromWall.getTime());
  d.setUTCHours(0, 0, 0, 0);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (!isTradingDay(d));
  const label = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
  return { date: d, label };
}

/* ------------------------------ sessions ------------------------------- */

export type SessionColor = "green" | "red" | "yellow" | "blue" | "muted";

export type SessionState = {
  market: string;
  status: string;
  color: SessionColor;
  isOpen: boolean;
  open: string;
  close: string;
  next: string;
  countdownMs: number; // to next transition
  progressPct: number; // 0..100 across the current active window
  note?: string;
};

function minToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Milliseconds from `now` until IST minute-of-day `targetMin` (next occurrence).
function msUntilMin(p: IstParts, targetMin: number): number {
  const targetSec = targetMin * 60;
  let diff = targetSec - p.secOfDay;
  if (diff <= 0) diff += 86400;
  return diff * 1000;
}

type Seg = { from: number; to: number; status: string; color: SessionColor };

export function nseSession(now = Date.now()): SessionState {
  const p = istParts(now);
  const trading = isTradingDay(p.wall);
  const nt = nextTradingDay(p.wall);
  const base: SessionState = {
    market: "NSE / BSE",
    status: "CLOSED",
    color: "muted",
    isOpen: false,
    open: "09:15",
    close: "15:30",
    next: "Pre-Open 09:00",
    countdownMs: 0,
    progressPct: 0,
  };

  if (!trading) {
    return {
      ...base,
      status: p.dow === 0 || p.dow === 6 ? "WEEKEND" : "HOLIDAY",
      note: `Next trading day: ${nt.label}`,
      next: `Pre-Open ${nt.label} 09:00`,
      countdownMs:
        nt.date.getTime() - (p.wall.getTime() - p.secOfDay * 1000) + 9 * 3600 * 1000,
    };
  }

  const segs: Seg[] = [
    { from: 540, to: 548, status: "PRE-OPEN", color: "yellow" },
    { from: 548, to: 555, status: "ORDER MATCHING", color: "blue" },
    { from: 555, to: 930, status: "LIVE MARKET", color: "green" },
    { from: 930, to: 960, status: "POST MARKET", color: "yellow" },
  ];
  const nowMin = p.secOfDay / 60;

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (nowMin >= seg.from && nowMin < seg.to) {
      const nxt = i + 1 < segs.length ? segs[i + 1].status : "CLOSED";
      return {
        ...base,
        status: seg.status,
        color: seg.color,
        isOpen: seg.status === "LIVE MARKET",
        next: nxt,
        countdownMs: msUntilMin(p, seg.to),
        progressPct: ((nowMin - seg.from) / (seg.to - seg.from)) * 100,
      };
    }
  }

  if (nowMin < 540) {
    return {
      ...base,
      status: "PRE-MARKET",
      color: "blue",
      next: "Pre-Open 09:00",
      countdownMs: msUntilMin(p, 540),
      progressPct: (nowMin / 540) * 100,
    };
  }

  // after 16:00
  return {
    ...base,
    status: "CLOSED",
    note: `Next trading day: ${nt.label}`,
    next: `Pre-Open ${nt.label} 09:00`,
    countdownMs:
      nt.date.getTime() - (p.wall.getTime() - p.secOfDay * 1000) + 9 * 3600 * 1000,
  };
}

// MCX commodities (Gold/Silver) India session ~09:00 to 23:30 IST.
export function mcxSession(market: string, now = Date.now()): SessionState {
  const p = istParts(now);
  const OPEN = 540; // 09:00
  const CLOSE = 1410; // 23:30
  const nowMin = p.secOfDay / 60;
  const base: SessionState = {
    market,
    status: "CLOSED",
    color: "muted",
    isOpen: false,
    open: minToLabel(OPEN),
    close: minToLabel(CLOSE),
    next: "Opens 09:00",
    countdownMs: msUntilMin(p, OPEN),
    progressPct: 0,
  };
  const weekend = p.dow === 0 || p.dow === 6;
  if (weekend) return { ...base, status: "WEEKEND", note: "Reopens Monday 09:00" };

  if (nowMin >= OPEN && nowMin < CLOSE) {
    return {
      ...base,
      status: "LIVE MARKET",
      color: "green",
      isOpen: true,
      next: "Close 23:30",
      countdownMs: msUntilMin(p, CLOSE),
      progressPct: ((nowMin - OPEN) / (CLOSE - OPEN)) * 100,
    };
  }
  return base;
}

export function cryptoSession(now = Date.now()): SessionState {
  const p = istParts(now);
  const weekend = p.dow === 0 || p.dow === 6;
  return {
    market: "CRYPTO",
    status: "OPEN 24×7",
    color: "green",
    isOpen: true,
    open: "24×7",
    close: "Never",
    next: weekend ? "Weekend session" : "Weekday session",
    countdownMs: 0,
    progressPct: (p.secOfDay / 86400) * 100,
    note: weekend ? "Weekend — thinner liquidity" : "Weekday — full liquidity",
  };
}

/* --------------------------- astro countdowns -------------------------- */

export type BoundaryEvent = {
  degRemaining: number;
  msRemaining: number;
  target: string;
};

function norm360(d: number): number {
  d %= 360;
  if (d < 0) d += 360;
  return d;
}

// Forward crossing time for a body at `abs`° moving at `speed` (deg/day) to the
// next multiple of `size`. Purely derived from the already-computed position.
function nextBoundary(abs: number, speed: number, size: number): { deg: number; ms: number } {
  const spd = Math.abs(speed) || 1e-6;
  const forward = speed >= 0;
  const idx = Math.floor(abs / size);
  const boundary = forward ? (idx + 1) * size : idx * size;
  let degRemaining = forward ? boundary - abs : abs - boundary;
  if (degRemaining <= 0) degRemaining += size;
  const ms = (degRemaining / spd) * DAY_MS;
  return { deg: degRemaining, ms };
}

export type MoonEvents = {
  nakshatra: string;
  pada: number;
  degree: number;
  nextPada: BoundaryEvent & { padaNum: number };
  nextNakshatra: BoundaryEvent & { name: string; bias: "Bull" | "Bear" | "Neutral" };
  nextSign: BoundaryEvent & { name: string };
};

export function moonEvents(abs: number, speed: number, pada: number): MoonEvents {
  const a = norm360(abs);
  const nakIdx = Math.floor(a / NAK_SIZE);
  const nak = nextBoundary(a, speed, NAK_SIZE);
  const nextNakName = NAKSHATRAS[(nakIdx + 1) % 27];
  const padaB = nextBoundary(a, speed, PADA_SIZE);
  const signIdx = Math.floor(a / 30);
  const signB = nextBoundary(a, speed, 30);
  const bias: "Bull" | "Bear" | "Neutral" = isBullNakshatra(nextNakName)
    ? "Bull"
    : isBearNakshatra(nextNakName)
      ? "Bear"
      : "Neutral";
  return {
    nakshatra: NAKSHATRAS[nakIdx],
    pada,
    degree: a % NAK_SIZE,
    nextPada: { target: "Next Pada", msRemaining: padaB.ms, degRemaining: padaB.deg, padaNum: (pada % 4) + 1 },
    nextNakshatra: { target: "Next Nakshatra", msRemaining: nak.ms, degRemaining: nak.deg, name: nextNakName, bias },
    nextSign: { target: "Next Sign", msRemaining: signB.ms, degRemaining: signB.deg, name: SIGNS[(signIdx + 1) % 12] },
  };
}

export type PlanetEvent = {
  planet: string;
  kind: "Sign" | "Nakshatra";
  from: string;
  to: string;
  msRemaining: number;
  retro: boolean;
};

// Soonest upcoming sign / nakshatra ingress across a set of bodies.
export function planetEvents(
  bodies: { planet: string; absDegree: number; speed: number; sign: string; nakshatra: string; retro: boolean }[],
): { signChanges: PlanetEvent[]; nakChanges: PlanetEvent[] } {
  const signChanges: PlanetEvent[] = [];
  const nakChanges: PlanetEvent[] = [];
  for (const b of bodies) {
    if (b.planet === "Moon") continue; // Moon handled by moonEvents
    const a = norm360(b.absDegree);
    const s = nextBoundary(a, b.speed, 30);
    const si = Math.floor(a / 30);
    signChanges.push({
      planet: b.planet,
      kind: "Sign",
      from: b.sign,
      to: SIGNS[(((b.speed >= 0 ? si + 1 : si - 1) % 12) + 12) % 12],
      msRemaining: s.ms,
      retro: b.retro,
    });
    const n = nextBoundary(a, b.speed, NAK_SIZE);
    const ni = Math.floor(a / NAK_SIZE);
    nakChanges.push({
      planet: b.planet,
      kind: "Nakshatra",
      from: b.nakshatra,
      to: NAKSHATRAS[(((b.speed >= 0 ? ni + 1 : ni - 1) % 27) + 27) % 27],
      msRemaining: n.ms,
      retro: b.retro,
    });
  }
  signChanges.sort((x, y) => x.msRemaining - y.msRemaining);
  nakChanges.sort((x, y) => x.msRemaining - y.msRemaining);
  return { signChanges, nakChanges };
}
