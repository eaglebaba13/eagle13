// Panchang helpers (Tithi, Karana, Yoga) and a lightweight NOAA-approximation
// sunrise/sunset. Extracted verbatim from live-terminal.tsx and astro.tsx
// which previously defined identical copies. No formula changes.

export const PAKSHA_TITHI = [
  "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi",
  "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi",
  "Trayodashi", "Chaturdashi", "Purnima/Amavasya",
];

export const KARANAS = ["Bava", "Balava", "Kaulava", "Taitila", "Gara", "Vanija", "Vishti"];

export const YOGAS = [
  "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda",
  "Sukarma", "Dhriti", "Shula", "Ganda", "Vriddhi", "Dhruva", "Vyaghata",
  "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyan", "Parigha", "Shiva",
  "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti",
];

/** Tithi derived from Sun-Moon elongation (each tithi spans 12°). */
export function deriveTithi(elongation: number): { name: string; paksha: string } {
  const e = ((elongation % 360) + 360) % 360;
  const idx = Math.floor(e / 12);
  const paksha = idx < 15 ? "Shukla" : "Krishna";
  const within = idx % 15;
  const name = within === 14 ? (idx < 15 ? "Purnima" : "Amavasya") : PAKSHA_TITHI[within];
  return { name, paksha };
}

export function deriveKarana(elongation: number): string {
  const e = ((elongation % 360) + 360) % 360;
  const half = Math.floor(e / 6); // 0..59
  if (half === 0) return "Kimstughna";
  if (half >= 57) return ["Shakuni", "Chatushpada", "Naga"][half - 57] ?? "Naga";
  return KARANAS[(half - 1) % 7];
}

export function deriveYoga(sunAbs: number, moonAbs: number): string {
  const sum = ((sunAbs + moonAbs) % 360 + 360) % 360;
  return YOGAS[Math.floor(sum / (360 / 27)) % 27];
}

/** Lightweight NOAA-approximation sunrise/sunset for a lat/lng (IST). */
export function sunTimes(lat: number, lng: number): { sunrise: string; sunset: string } {
  const tz = 5.5;
  const now = new Date(Date.now() + tz * 3600 * 1000);
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const day = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start) / 86400000);
  const rad = Math.PI / 180;
  const decl = 23.45 * Math.sin(rad * (360 / 365) * (day - 81));
  const cosH = Math.max(-1, Math.min(1, -Math.tan(lat * rad) * Math.tan(decl * rad)));
  const H = Math.acos(cosH) / rad;
  const noon = 12 - lng / 15 + tz;
  const toHM = (h: number) => {
    const hh = Math.floor(((h % 24) + 24) % 24);
    const mm = Math.round((h - Math.floor(h)) * 60);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  };
  return { sunrise: toHM(noon - H / 15), sunset: toHM(noon + H / 15) };
}