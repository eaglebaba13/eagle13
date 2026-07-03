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

import { NAKSHATRAS, SIGNS, NAKSHATRA_LORDS, isBullNakshatra, isBearNakshatra } from "./astro-constants";
import type { PlanetRow } from "./astro-levels";

const R2D = 180 / Math.PI;
const NAK_SIZE = 360 / 27; // 13.3333...
const PADA_SIZE = NAK_SIZE / 4;

const earth = new Planet((vsopEarth as any).default ?? vsopEarth);
const bodies: Record<string, Planet> = {
  Mercury: new Planet((vsopMercury as any).default ?? vsopMercury),
  Venus: new Planet((vsopVenus as any).default ?? vsopVenus),
  Mars: new Planet((vsopMars as any).default ?? vsopMars),
  Jupiter: new Planet((vsopJupiter as any).default ?? vsopJupiter),
  Saturn: new Planet((vsopSaturn as any).default ?? vsopSaturn),
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
};

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
  };
}