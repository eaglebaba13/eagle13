// Phase 19 — Broker audit log (client-side, persisted in localStorage).

import type { BrokerId } from "./types";

export type AuditEventType =
  | "CONNECT"
  | "DISCONNECT"
  | "ORDER_PLACED"
  | "ORDER_MODIFIED"
  | "ORDER_CANCELLED"
  | "ORDER_REJECTED"
  | "PAPER_OPEN"
  | "PAPER_CLOSE";

export type AuditEntry = {
  id: string;
  ts: string;
  brokerId: BrokerId | "paper";
  type: AuditEventType;
  message: string;
  meta?: Record<string, unknown>;
};

const STORAGE_KEY = "eb_broker_audit_v1";
const MAX_ENTRIES = 500;

export function readAudit(): AuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AuditEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendAudit(entry: Omit<AuditEntry, "id" | "ts">): AuditEntry[] {
  const full: AuditEntry = {
    ...entry,
    id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
  };
  const next = [full, ...readAudit()].slice(0, MAX_ENTRIES);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* quota errors are non-fatal */
    }
  }
  return next;
}

export function clearAudit() {
  if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
}