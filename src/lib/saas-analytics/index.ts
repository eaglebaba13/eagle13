// Phase 30 — In-memory SaaS analytics event ring buffer.
//
// Complements src/lib/observability. Focuses on commercial metrics:
// DAU, subscription events, feature usage, retention, errors. Pure
// data structures — no external SDK.

export type SaasEventKind =
  | "dau.ping"
  | "subscription.started"
  | "subscription.renewed"
  | "subscription.canceled"
  | "subscription.expired"
  | "feature.used"
  | "dashboard.opened"
  | "export.performed"
  | "error.reported";

export interface SaasEvent {
  readonly kind: SaasEventKind;
  readonly userId: string | null;
  readonly plan: string | null;
  readonly detail: string | null;
  readonly timestampMs: number;
}

export const SAAS_ANALYTICS_VERSION = "saas-analytics@1.0.0";

const MAX = 1000;
const ring: SaasEvent[] = [];

export function recordSaasEvent(ev: SaasEvent): void {
  ring.push(ev);
  if (ring.length > MAX) ring.splice(0, ring.length - MAX);
}

export function snapshotSaasEvents(): readonly SaasEvent[] {
  return ring.slice();
}

export function resetSaasEvents(): void {
  ring.length = 0;
}

export interface SaasSummary {
  readonly total: number;
  readonly byKind: Readonly<Record<SaasEventKind, number>>;
  readonly uniqueUsers: number;
  readonly errors: number;
}

export function summariseSaas(events: readonly SaasEvent[] = snapshotSaasEvents()): SaasSummary {
  const byKind = {
    "dau.ping": 0, "subscription.started": 0, "subscription.renewed": 0,
    "subscription.canceled": 0, "subscription.expired": 0, "feature.used": 0,
    "dashboard.opened": 0, "export.performed": 0, "error.reported": 0,
  } as Record<SaasEventKind, number>;
  const users = new Set<string>();
  let errors = 0;
  for (const e of events) {
    byKind[e.kind]++;
    if (e.userId) users.add(e.userId);
    if (e.kind === "error.reported") errors++;
  }
  return { total: events.length, byKind, uniqueUsers: users.size, errors };
}