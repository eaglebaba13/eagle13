// Phase 21.2 · Stage 3 — Bharani source metadata (Part-One transcript evidence).
// Kept isolated from the existing EagleBaba nakshatra classification in
// `astro-constants.ts` so the two systems can be displayed side by side.

export type Part1StarEvidence = {
  nakshatra: string;
  classification: "BEAR_DOMINANT_SOURCE_CONFIRMED";
  evidenceSource: "Part-One transcript";
  historicalObservationCount: number;
  monthlyTops: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

export const GANN_PART1_BEAR_STARS: Part1StarEvidence[] = [
  {
    nakshatra: "Bharani",
    classification: "BEAR_DOMINANT_SOURCE_CONFIRMED",
    evidenceSource: "Part-One transcript",
    historicalObservationCount: 11,
    monthlyTops: 7,
    confidence: "HIGH",
  },
];

export function findPart1BearStar(nakshatra: string): Part1StarEvidence | undefined {
  return GANN_PART1_BEAR_STARS.find((s) => s.nakshatra === nakshatra);
}