// Phase 21.0C · Paste parsers for reference fixtures.
// Extracts planet rows from Drik / MPanchang / Swiss / Prokerala pasted text
// into a normalized shape. NEVER guesses values — ambiguous rows are flagged
// and require manual confirmation before the audit accepts a fixture.

import { NAKSHATRAS, SIGNS } from "./astro-constants";
import type { ReferencePlanet } from "./astro-audit";

export type ParseSource = "SWISS" | "DRIK" | "MPANCHANG" | "PROKERALA" | "AUTO";

export type ParsedRow = {
  raw: string;
  planet?: string;
  siderealLongitude?: number;
  sign?: string;
  degreeInSign?: number;
  nakshatra?: string;
  pada?: number;
  retrograde?: boolean;
  ambiguous: boolean;
  reason?: string;
};

export type ParseResult = {
  source: ParseSource;
  rows: ParsedRow[];
  planets: ReferencePlanet[]; // only unambiguous rows are promoted
  confidence: number;         // 0..1
  warnings: string[];
  rawText: string;
};

const PLANET_ALIASES: Record<string, string> = {
  su: "Sun", sun: "Sun", surya: "Sun",
  mo: "Moon", moon: "Moon", chandra: "Moon",
  me: "Mercury", mer: "Mercury", mercury: "Mercury", budha: "Mercury",
  ve: "Venus", ven: "Venus", venus: "Venus", shukra: "Venus",
  ma: "Mars", mar: "Mars", mars: "Mars", mangala: "Mars", kuja: "Mars",
  ju: "Jupiter", jup: "Jupiter", jupiter: "Jupiter", guru: "Jupiter", brihaspati: "Jupiter",
  sa: "Saturn", sat: "Saturn", saturn: "Saturn", shani: "Saturn",
  ra: "Rahu", rahu: "Rahu",
  ke: "Ketu", ketu: "Ketu",
};

function normPlanet(s: string): string | undefined {
  return PLANET_ALIASES[s.trim().toLowerCase()];
}

function normSign(s: string): string | undefined {
  const key = s.trim().toLowerCase();
  return SIGNS.find((x) => x.toLowerCase() === key || x.toLowerCase().startsWith(key.slice(0, 3)));
}

function normNakshatra(s: string): string | undefined {
  const key = s.trim().toLowerCase();
  const exact = NAKSHATRAS.find((n) => n.toLowerCase() === key);
  if (exact) return exact;
  return NAKSHATRAS.find((n) => n.toLowerCase().startsWith(key));
}

/** Parse "16° 19' 12"" or "16 19 12" or "16.32" into decimal degrees. */
export function parseDegrees(s: string): number | undefined {
  const t = s.replace(/[°'"’′″]/g, " ").trim();
  const m = t.match(/^-?\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?){0,2}$/);
  if (!m) {
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }
  const parts = t.split(/\s+/).map(Number);
  if (parts.some((x) => !Number.isFinite(x))) return undefined;
  const [d, mm = 0, ss = 0] = parts;
  const sign = d < 0 ? -1 : 1;
  return sign * (Math.abs(d) + mm / 60 + ss / 3600);
}

/** Detect which source a paste looks like (heuristic; user should still pick). */
export function detectSource(text: string): ParseSource {
  const t = text.toLowerCase();
  if (t.includes("drikpanchang") || t.includes("drik panchang")) return "DRIK";
  if (t.includes("mpanchang")) return "MPANCHANG";
  if (t.includes("prokerala")) return "PROKERALA";
  if (t.includes("swiss") || t.includes("swe_")) return "SWISS";
  return "AUTO";
}

/** Generic row parser. Accepts tab, multi-space, or pipe separators. */
export function parsePlanetTable(text: string, source: ParseSource = "AUTO"): ParseResult {
  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const raw = line;
    // Split on tabs, pipes, or runs of 2+ spaces to preserve "Purva Ashadha" etc.
    const cells = line.split(/\t|\s*\|\s*|\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 3) continue;

    const planet = normPlanet(cells[0]);
    if (!planet) continue;

    // Attempt to identify columns.
    let siderealLongitude: number | undefined;
    let sign: string | undefined;
    let degreeInSign: number | undefined;
    let nakshatra: string | undefined;
    let pada: number | undefined;
    let retrograde: boolean | undefined;
    let reason: string | undefined;

    for (const cell of cells.slice(1)) {
      const lc = cell.toLowerCase();
      if (retrograde === undefined && /^(r|retro|retrograde)$/i.test(cell)) retrograde = true;
      else if (retrograde === undefined && /^(d|direct)$/i.test(cell)) retrograde = false;

      if (pada === undefined) {
        const pm = cell.match(/^(?:pada[\s:]*)?([1-4])$/i);
        if (pm) { pada = Number(pm[1]); continue; }
      }
      if (!sign) {
        const s = normSign(cell);
        if (s) { sign = s; continue; }
      }
      if (!nakshatra) {
        const n = normNakshatra(cell);
        if (n && !/^\d/.test(cell)) { nakshatra = n; continue; }
      }
      // Try to parse as degrees
      const deg = parseDegrees(cell);
      if (deg !== undefined && Number.isFinite(deg)) {
        if (deg >= 0 && deg < 30 && degreeInSign === undefined) degreeInSign = deg;
        else if (deg >= 0 && deg <= 360 && siderealLongitude === undefined) siderealLongitude = deg;
      }
      void lc;
    }

    // Derive sidereal from sign + degreeInSign when possible.
    if (siderealLongitude === undefined && sign && degreeInSign !== undefined) {
      siderealLongitude = SIGNS.indexOf(sign as (typeof SIGNS)[number]) * 30 + degreeInSign;
    }

    const missing: string[] = [];
    if (siderealLongitude === undefined) missing.push("longitude");
    if (!sign) missing.push("sign");
    if (degreeInSign === undefined) missing.push("degreeInSign");
    if (!nakshatra) missing.push("nakshatra");
    if (pada === undefined) missing.push("pada");
    if (retrograde === undefined) missing.push("retrograde");
    if (missing.length) reason = `missing: ${missing.join(", ")}`;

    rows.push({
      raw, planet, siderealLongitude, sign, degreeInSign, nakshatra, pada, retrograde,
      ambiguous: missing.length > 0, reason,
    });
  }

  const planets: ReferencePlanet[] = rows
    .filter((r) => !r.ambiguous)
    .map((r) => ({
      planet: r.planet!,
      siderealLongitude: r.siderealLongitude!,
      sign: r.sign!,
      degreeInSign: r.degreeInSign!,
      nakshatra: r.nakshatra!,
      pada: r.pada!,
      retrograde: r.retrograde!,
      source: source === "AUTO" ? "manual paste" : source,
    }));

  const total = rows.length || 1;
  const confidence = planets.length / total;
  if (planets.length === 0) warnings.push("No unambiguous planet rows extracted — verify separators and columns.");
  if (rows.length && rows.length !== planets.length) {
    warnings.push(`${rows.length - planets.length} row(s) flagged as ambiguous — manual confirmation required.`);
  }
  return { source, rows, planets, confidence, warnings, rawText: text };
}