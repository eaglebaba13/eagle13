// Phase 3C — Deduplication and cooldown logic. Pure.

import type { AlertCheckpoint, AlertEvent, AlertSubscription } from "./types";

export const DEFAULT_COOLDOWN_SEC = 60 * 15; // 15 minutes
export const MIN_COOLDOWN_SEC = 60;
export const MAX_COOLDOWN_SEC = 60 * 60 * 4;

export function effectiveCooldownSec(sub: AlertSubscription | null): number {
  if (!sub || sub.cooldownOverrideSec == null) return DEFAULT_COOLDOWN_SEC;
  return Math.min(
    MAX_COOLDOWN_SEC,
    Math.max(MIN_COOLDOWN_SEC, Math.floor(sub.cooldownOverrideSec)),
  );
}

export function isDuplicate(checkpoint: AlertCheckpoint, ev: AlertEvent): boolean {
  return checkpoint.lastFingerprintsByType[ev.type] === ev.fingerprint;
}

export function isInSameSession(checkpoint: AlertCheckpoint, ev: AlertEvent): boolean {
  return checkpoint.emittedFingerprintsThisSession.includes(ev.fingerprint);
}

export function isInCooldown(
  checkpoint: AlertCheckpoint,
  ev: AlertEvent,
  cooldownSec: number,
  nowMs: number,
): boolean {
  const last = checkpoint.lastEmittedAtByFingerprint[ev.fingerprint];
  if (!last) return false;
  const lastMs = Date.parse(last);
  if (Number.isNaN(lastMs)) return false;
  return nowMs - lastMs < cooldownSec * 1000;
}

export function isInQuietHours(
  sub: AlertSubscription | null,
  nowIso: string,
): boolean {
  if (!sub?.quietHours) return false;
  const { start, end } = sub.quietHours;
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return false;
  const d = new Date(nowIso);
  if (Number.isNaN(d.getTime())) return false;
  const cur = d.getUTCHours() * 60 + d.getUTCMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  if (s === e) return false;
  if (s < e) return cur >= s && cur < e;
  // Wrap over midnight.
  return cur >= s || cur < e;
}

export function mergeCheckpointAfterEmit(
  checkpoint: AlertCheckpoint,
  ev: AlertEvent,
  nowIso: string,
): AlertCheckpoint {
  const sessionSet = new Set(checkpoint.emittedFingerprintsThisSession);
  sessionSet.add(ev.fingerprint);
  return {
    ...checkpoint,
    updatedAt: nowIso,
    lastFingerprintsByType: { ...checkpoint.lastFingerprintsByType, [ev.type]: ev.fingerprint },
    lastEmittedAtByFingerprint: {
      ...checkpoint.lastEmittedAtByFingerprint,
      [ev.fingerprint]: nowIso,
    },
    emittedFingerprintsThisSession: Array.from(sessionSet),
  };
}

export function makeEmptyCheckpoint(userId: string, nowIso: string): AlertCheckpoint {
  return {
    userId,
    updatedAt: nowIso,
    lastFingerprintsByType: {},
    lastEmittedAtByFingerprint: {},
    emittedFingerprintsThisSession: [],
    previous: {},
  };
}