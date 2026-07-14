// Server-only Vedic ephemeris engine (pure JS, edge-safe via astronomia).
import { Planet } from "astronomia/planetposition";
import * as julian from "astronomia/julian";
import * as solar from "astronomia/solar";
import * as moonposition from "astronomia/moonposition";
import * as base from "astronomia/base";

import vsopEarth from "astronomia/data/vsop87Dearth";
import vsopMercury from "astronomia/data/vsop87Dmercury";
import vsopVenus from "astronomia/data/vsop87Dvenus";
import vsopMars from "astronomia/data/vsop87Dmars";
import vsopJupiter from "astronomia/data/vsop87Djupiter";
import vsopSaturn from "astronomia/data/vsop87Dsaturn";

import { NAKSHATRAS, SIGNS, NAKSHATRA_LORDS, isBullNakshatra, isBearNakshatra, retroBiasOf } from "./astro-constants";
import type { PlanetRow, MoonPhaseInfo } from "./astro-levels";

const R2D = 180 / Math.PI;
const NAK_SIZE = 360 / 27; // 13.3333...
const PADA_SIZE = NAK_SIZE / 4;

// astronomia's VSOP87 data modules are published as CJS/ESM interop; normalize
// a possible `.default` wrapper before handing the dataset to Planet.
type VsopData = ConstructorParameters<typeof Planet>[0];
function vsop(data: unknown): VsopData {
  const d = data as { default?: VsopData };
  return (d?.default ?? (data as VsopData));
}
const earth = new Planet(vsop(vsopEarth));
const bodies: Record<string, Planet> = {
  Mercury: new Planet(vsop(vsopMercury)),
  Venus: new Planet(vsop(vsopVenus)),
  Mars: new Planet(vsop(vsopMars)),
  Jupiter: new Planet(vsop(vsopJupiter)),
  Saturn: new Planet(vsop(vsopSaturn)),
};

function norm(d: number): number {
  d %= 360;
  if (d < 0) d += 360;
  return d;
}

// Geocentric ecliptic longitude (tropical, of date) via light-time iteration.
function geoLon(pl: Planet, jde: number): number {
  const e = earth.position(jde);
  const xe = e.range * Math.cos(e.lat) * Math.cos(e.lon);
  const ye = e.range * Math.cos(e.lat) * Math.sin(e.lon);
  const ze = e.range * Math.sin(e.lat);
  let tau = 0;
  let lon = 0;
  for (let i = 0; i < 3; i++) {
    const p = pl.position(jde - tau);
    const xh = p.range * Math.cos(p.lat) * Math.cos(p.lon);
    const yh = p.range * Math.cos(p.lat) * Math.sin(p.lon);
    const zh = p.range * Math.sin(p.lat);
    const x = xh - xe;
    const y = yh - ye;
    const z = zh - ze;
    const dist = Math.sqrt(x * x + y * y + z * z);
    tau = 0.0057755183 * dist;
    lon = Math.atan2(y, x);
  }
  return norm(lon * R2D);
}

function sunLon(jde: number): number {
  return norm(solar.apparentLongitude(base.J2000Century(jde)) * R2D);
}
function moonLon(jde: number): number {
  return norm(moonposition.position(jde).lon * R2D);
}
// Mean lunar ascending node (Rahu), tropical.
function rahuLon(jde: number): number {
  const T = base.J2000Century(jde);
  return norm(125.04452 - 1934.136261 * T + 0.0020708 * T * T + (T * T * T) / 450000);
}

// Lahiri (Chitrapaksha) ayanamsa approximation.
function ayanamsa(jde: number): number {
  return 23.85222 + 0.0139638 * ((jde - 2451545.0) / 365.25);
}

function tropical(name: string, jde: number): number {
  if (name === "Sun") return sunLon(jde);
  if (name === "Moon") return moonLon(jde);
  if (name === "Rahu") return rahuLon(jde);
  if (name === "Ketu") return norm(rahuLon(jde) + 180);
  return geoLon(bodies[name], jde);
}

function jdFromDate(date: Date): number {
  const frac =
    (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600) / 24;
  return julian.CalendarGregorianToJD(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate() + frac,
  );
}

const PLANET_ORDER = [
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu",
];

export type AstroPositions = {
  planets: Omit<PlanetRow, "r1" | "s1" | "r2" | "s2">[];
  ayanamsa: number;
  moonSign: string;
  moonNakshatra: string;
  moonDegree: number;
  retroCount: number;
  bullCount: number;
  bearCount: number;
  bullRetroCount: number;
  bearRetroCount: number;
  moonPhase: MoonPhaseInfo;
};

function elongation(jde: number): number {
  return norm(tropical("Moon", jde) - tropical("Sun", jde));
}

function jdToDate(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}

// Find the next JD after jd0 where elongation crosses `target` (deg) upward.
function nextPhaseJd(jd0: number, target: number): number {
  const f = (jd: number) => {
    let d = elongation(jd) - target;
    d = ((((d + 180) % 360) + 360) % 360) - 180; // -> [-180,180)
    return d;
  };
  const step = 0.25;
  let prev = f(jd0);
  for (let jd = jd0 + step; jd < jd0 + 45; jd += step) {
    const cur = f(jd);
    if (prev < 0 && cur >= 0) {
      let lo = jd - step;
      let hi = jd;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (f(mid) < 0) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
    prev = cur;
  }
  return jd0 + 29.530588; // synodic-month fallback
}

function phaseName(e: number): string {
  if (e < 15 || e >= 345) return "New Moon";
  if (e < 75) return "Waxing Crescent";
  if (e < 105) return "First Quarter";
  if (e < 165) return "Waxing Gibbous";
  if (e < 195) return "Full Moon";
  if (e < 255) return "Waning Gibbous";
  if (e < 285) return "Last Quarter";
  return "Waning Crescent";
}

function computeMoonPhase(jd: number): MoonPhaseInfo {
  const e = elongation(jd);
  const newJd = nextPhaseJd(jd, 0);
  const fullJd = nextPhaseJd(jd, 180);
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    phaseName: phaseName(e),
    illumination: Math.round(((1 - Math.cos((e * Math.PI) / 180)) / 2) * 1000) / 10,
    elongation: Math.round(e * 100) / 100,
    nextNewMoon: jdToDate(newJd).toISOString(),
    daysToNewMoon: Math.max(0, round1(newJd - jd)),
    nextFullMoon: jdToDate(fullJd).toISOString(),
    daysToFullMoon: Math.max(0, round1(fullJd - jd)),
  };
}

export function computeAstroPositions(date: Date): AstroPositions {
  const jd = jdFromDate(date);
  const ay = ayanamsa(jd);

  const planets = PLANET_ORDER.map((name) => {
    const t = tropical(name, jd);
    const sid = norm(t - ay);

    // speed via central difference (±0.5 day), wrap-safe
    const t2 = tropical(name, jd + 0.5);
    const t1 = tropical(name, jd - 0.5);
    let speed = t2 - t1;
    if (speed > 180) speed -= 360;
    if (speed < -180) speed += 360;

    const nakIdx = Math.floor(sid / NAK_SIZE);
    const nakshatra = NAKSHATRAS[nakIdx];
    const pada = Math.floor((sid % NAK_SIZE) / PADA_SIZE) + 1;
    const retro = speed < 0;

    return {
      planet: name,
      degree: Math.round((sid % 30) * 100) / 100,
      absDegree: Math.round(sid * 100) / 100,
      sign: SIGNS[Math.floor(sid / 30)],
      nakshatra,
      lord: NAKSHATRA_LORDS[nakIdx % 9],
      pada,
      speed: Math.round(speed * 10000) / 10000,
      motion: (retro ? "Retrograde" : "Direct") as "Direct" | "Retrograde",
      retro,
      retroBias: retroBiasOf(name),
      bull: isBullNakshatra(nakshatra),
      bear: isBearNakshatra(nakshatra),
    };
  });

  const moon = planets.find((p) => p.planet === "Moon")!;

  return {
    planets,
    ayanamsa: Math.round(ay * 10000) / 10000,
    moonSign: moon.sign,
    moonNakshatra: moon.nakshatra,
    moonDegree: moon.degree,
    retroCount: planets.filter((p) => p.retro).length,
    bullCount: planets.filter((p) => p.bull).length,
    bearCount: planets.filter((p) => p.bear).length,
    bullRetroCount: planets.filter((p) => p.retro && p.retroBias === "bull").length,
    bearRetroCount: planets.filter((p) => p.retro && p.retroBias === "bear").length,
    moonPhase: computeMoonPhase(jd),
  };
}