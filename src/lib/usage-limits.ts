/**
 * Phase 20.2 — Usage-limit tracking helpers.
 * Pure logic — DB persistence lives in cloud-sync.ts. This file is what
 * tests and UI meters consult.
 */
import type { UsageLimits } from "./plans";

export type UsageResource = keyof UsageLimits;

export interface UsageEntry {
  used: number;
  limit: number;
  resource: UsageResource;
  period: string;
}

export interface UsageCheck {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  ratio: number;
  reason?: string;
}

/** True iff another consumption is permitted right now. Never counts failed ops. */
export function checkUsage(
  used: number,
  limit: number,
  resource: UsageResource,
): UsageCheck {
  const clamped = Math.max(0, used);
  const remaining = Math.max(0, limit - clamped);
  const ratio = limit === 0 ? 1 : Math.min(1, clamped / limit);
  return {
    allowed: clamped < limit,
    used: clamped,
    limit,
    remaining,
    ratio,
    reason:
      clamped >= limit ? `Usage limit reached for ${resource} (${clamped}/${limit}).` : undefined,
  };
}

export function todayPeriod(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function monthPeriod(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Period a given resource is measured over. */
export function periodFor(resource: UsageResource, now: Date = new Date()): string {
  switch (resource) {
    case "backtestsPerDay":
    case "exportsPerDay":
      return todayPeriod(now);
    default:
      return "lifetime";
  }
}

export function meterLabel(entry: UsageEntry): string {
  return `${entry.used} / ${entry.limit}`;
}

export const USAGE_WARNING_THRESHOLD = 0.8;
export const USAGE_CRITICAL_THRESHOLD = 1.0;