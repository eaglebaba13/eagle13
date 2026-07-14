// Client-safe Vedic astrology constants and classification helpers.

export const NAKSHATRAS = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
  "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
  "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha",
  "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
  "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
] as const;

export const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra",
  "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
] as const;

// Vimshottari dasha lord order (repeats every 9 nakshatras).
export const NAKSHATRA_LORDS = [
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
] as const;

export const BULL_NAKSHATRAS = new Set([
  "Krittika", "Uttara Phalguni", "Chitra", "Dhanishta", "Pushya",
]);

// Original Gann Nifty Astro bear classification (Phase 21.0 correction).
// Bharani is NOT part of the authentic original spec and has been moved
// to EAGLEBABA_EXTENDED_BEAR_NAKSHATRAS.
export const BEAR_NAKSHATRAS = new Set([
  "Shatabhisha", "Uttara Ashadha", "Vishakha", "Purva Bhadrapada",
]);

export const EAGLEBABA_EXTENDED_BEAR_NAKSHATRAS = new Set([
  "Bharani",
]);

export function isBullNakshatra(nak: string): boolean {
  return BULL_NAKSHATRAS.has(nak);
}

export function isBearNakshatra(nak: string): boolean {
  return BEAR_NAKSHATRAS.has(nak);
}

/* ------------------------- retrograde bias ------------------------- */
// Trading bias when a planet is retrograde (Vakri):
//   Mars & Jupiter retrograde  -> Bullish
//   Mercury & Saturn retrograde -> Bearish
//   Venus retrograde           -> Neutral
// Other bodies (Sun/Moon/Rahu/Ketu) carry no retrograde bias here.
export type RetroBias = "bull" | "bear" | "neutral" | "none";

export const RETRO_BULL = new Set(["Mars", "Jupiter"]);
export const RETRO_BEAR = new Set(["Mercury", "Saturn"]);
export const RETRO_NEUTRAL = new Set(["Venus"]);

export function retroBiasOf(planet: string): RetroBias {
  if (RETRO_BULL.has(planet)) return "bull";
  if (RETRO_BEAR.has(planet)) return "bear";
  if (RETRO_NEUTRAL.has(planet)) return "neutral";
  return "none";
}