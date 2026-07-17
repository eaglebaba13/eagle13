// Phase 3C — Deterministic alert fingerprints.

import type { AlertType } from "./types";

export interface FingerprintInput {
  readonly userId: string;
  readonly type: AlertType;
  readonly instrument?: string | null;
  readonly canonicalEntity?: string | null;
  readonly previousState?: string | null;
  readonly currentState?: string | null;
  readonly relevantLevel?: string | number | null;
  readonly expiry?: string | null;
  readonly tradingDate: string;
  readonly formulaVersion?: string | null;
  readonly configVersion?: string | null;
}

// FNV-1a 32-bit — cheap, stable, deterministic, no crypto dependency.
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function computeFingerprint(f: FingerprintInput): string {
  const parts = [
    f.userId,
    f.type,
    f.instrument ?? "-",
    f.canonicalEntity ?? "-",
    f.previousState ?? "-",
    f.currentState ?? "-",
    f.relevantLevel != null ? String(f.relevantLevel) : "-",
    f.expiry ?? "-",
    f.tradingDate,
    f.formulaVersion ?? "-",
    f.configVersion ?? "-",
  ].join("|");
  return `${f.type}:${fnv1a(parts)}`;
}