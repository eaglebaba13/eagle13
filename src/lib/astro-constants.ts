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

export const BEAR_NAKSHATRAS = new Set([
  "Shatabhisha", "Uttara Ashadha", "Vishakha", "Purva Bhadrapada",
]);

export function isBullNakshatra(nak: string): boolean {
  return BULL_NAKSHATRAS.has(nak);
}

export function isBearNakshatra(nak: string): boolean {
  return BEAR_NAKSHATRAS.has(nak);
}