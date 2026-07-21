// Phase 44B — Panchang & moon-context bundle.
// Reuses existing panchang helpers in `src/lib/panchang.ts` — no new formulas.

import { deriveTithi, deriveKarana, deriveYoga } from "@/lib/panchang";

export interface PanchangBundle {
  readonly date: string;
  readonly tithi: string;
  readonly paksha: string;
  readonly nakshatra: string;
  readonly yoga: string;
  readonly karana: string;
  readonly nextNewMoon: string;
  readonly daysToNewMoon: number;
  readonly nextFullMoon: string;
  readonly daysToFullMoon: number;
  readonly calculatedAt: string;
  readonly timezone: "Asia/Kolkata";
}

const NAKSHATRAS = [
  "Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu",
  "Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni","Hasta",
  "Chitra","Swati","Vishakha","Anuradha","Jyeshtha","Mula","Purva Ashadha",
  "Uttara Ashadha","Shravana","Dhanishta","Shatabhisha","Purva Bhadrapada",
  "Uttara Bhadrapada","Revati",
];

function deriveNakshatra(moonAbs: number): string {
  const m = ((moonAbs % 360) + 360) % 360;
  return NAKSHATRAS[Math.floor(m / (360 / 27)) % 27]!;
}

function projectLunarPhase(elongation: number, target: 0 | 180): number {
  const e = ((elongation % 360) + 360) % 360;
  const diff = ((target - e + 360) % 360);
  return (diff / 360) * 29.53059;
}

export interface PanchangInputs {
  readonly sunAbs: number;
  readonly moonAbs: number;
  readonly now?: number;
}

function todayIstYmd(now: number): string {
  const d = new Date(now + 5.5 * 3_600_000);
  return d.toISOString().slice(0, 10);
}

export function computePanchangBundle(input: PanchangInputs): PanchangBundle {
  const now = input.now ?? Date.now();
  const elongation = input.moonAbs - input.sunAbs;
  const { name: tithi, paksha } = deriveTithi(elongation);
  const karana = deriveKarana(elongation);
  const yoga = deriveYoga(input.sunAbs, input.moonAbs);
  const nakshatra = deriveNakshatra(input.moonAbs);

  const dNM = projectLunarPhase(elongation, 0);
  const dFM = projectLunarPhase(elongation, 180);
  const isoAt = (days: number) => new Date(now + days * 86_400_000).toISOString().slice(0, 10);

  return {
    date: todayIstYmd(now),
    tithi, paksha, nakshatra, yoga, karana,
    nextNewMoon: isoAt(dNM),
    daysToNewMoon: Math.round(dNM * 10) / 10,
    nextFullMoon: isoAt(dFM),
    daysToFullMoon: Math.round(dFM * 10) / 10,
    calculatedAt: new Date(now).toISOString(),
    timezone: "Asia/Kolkata",
  };
}