// Phase 3C — Priority helpers and ordering.

import type { AlertPriority, AlertType } from "./types";

const RANK: Record<AlertPriority, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function priorityRank(p: AlertPriority): number {
  return RANK[p] ?? 0;
}

export function meetsMinimumPriority(actual: AlertPriority, min: AlertPriority): boolean {
  return priorityRank(actual) >= priorityRank(min);
}

// CRITICAL is reserved for operational integrity issues.
// Market-direction signals must never be CRITICAL.
const CRITICAL_ALLOWED: ReadonlySet<AlertType> = new Set<AlertType>([
  "RUNTIME_MODULE_DEGRADED",
  "DATA_STALE",
]);

export function clampCriticalForType(type: AlertType, priority: AlertPriority): AlertPriority {
  if (priority === "CRITICAL" && !CRITICAL_ALLOWED.has(type)) return "HIGH";
  return priority;
}

export function comparePriorityDesc(a: AlertPriority, b: AlertPriority): number {
  return priorityRank(b) - priorityRank(a);
}