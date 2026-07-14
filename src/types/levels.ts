// Shared level shape used by the Astro level terminals (live-terminal.tsx
// and live-levels.tsx). Extracted verbatim — every field, casing and
// literal-union member matches the previous inline definitions.

export type LevelKind = "R3" | "R2" | "R1" | "S1" | "S2" | "S3";
export type LevelStatus = "ACTIVE" | "TOUCHED" | "BROKEN" | "REJECTED" | "PENDING";
export type LevelSignal = "BUY" | "SELL" | "WATCH";

export type Lvl = {
  planet: string;
  kind: LevelKind;
  value: number;
  isResistance: boolean;
  distance: number;
  status: LevelStatus;
  signal: LevelSignal;
  confidence: number;
};