// Phase 26 · Stage 5 — Expiry engine.
//
// Classifies discovered expiries into Current Weekly / Next Weekly /
// Monthly buckets. Pure functions — no I/O. Validates freshness.

export type ExpiryBucket = "CURRENT_WEEKLY" | "NEXT_WEEKLY" | "MONTHLY";

export interface ClassifiedExpiry {
  readonly date: string;        // yyyy-mm-dd
  readonly bucket: ExpiryBucket;
  readonly daysToExpiry: number;
}

export interface ExpirySelection {
  readonly all: readonly ClassifiedExpiry[];
  readonly currentWeekly: string | null;
  readonly nextWeekly: string | null;
  readonly monthly: string | null;
}

function parseIsoDate(iso: string): number {
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isFinite(t) ? t : NaN;
}

/** True when `iso` is the last valid Thursday-or-later expiry of its calendar month. */
function isLastExpiryOfMonth(iso: string, sortedFutureIsos: readonly string[]): boolean {
  const t = parseIsoDate(iso);
  if (!Number.isFinite(t)) return false;
  const month = new Date(t).getUTCMonth();
  const year = new Date(t).getUTCFullYear();
  const sameMonth = sortedFutureIsos.filter((d) => {
    const dt = parseIsoDate(d);
    return Number.isFinite(dt) && new Date(dt).getUTCMonth() === month && new Date(dt).getUTCFullYear() === year;
  });
  if (sameMonth.length === 0) return false;
  return sameMonth[sameMonth.length - 1] === iso;
}

export function classifyExpiries(
  expiries: readonly string[],
  nowIso: string = new Date().toISOString(),
): ExpirySelection {
  const nowMs = Date.parse(nowIso);
  const valid = expiries
    .filter((e) => Number.isFinite(parseIsoDate(e)))
    .filter((e) => parseIsoDate(e) >= nowMs - 24 * 3600_000) // allow same-day
    .slice()
    .sort((a, b) => parseIsoDate(a) - parseIsoDate(b));

  const all: ClassifiedExpiry[] = valid.map((iso, idx) => {
    const days = Math.max(0, Math.round((parseIsoDate(iso) - nowMs) / 86_400_000));
    let bucket: ExpiryBucket;
    if (idx === 0) bucket = "CURRENT_WEEKLY";
    else if (idx === 1) bucket = "NEXT_WEEKLY";
    else bucket = "MONTHLY";
    if (isLastExpiryOfMonth(iso, valid)) bucket = "MONTHLY";
    return { date: iso, bucket, daysToExpiry: days };
  });

  return {
    all,
    currentWeekly: all.find((e) => e.bucket === "CURRENT_WEEKLY")?.date ?? null,
    nextWeekly: all.find((e) => e.bucket === "NEXT_WEEKLY")?.date ?? null,
    monthly: all.find((e) => e.bucket === "MONTHLY")?.date ?? null,
  };
}

export function selectExpiry(
  selection: ExpirySelection,
  preferred: string | null,
): string | null {
  if (preferred && selection.all.some((e) => e.date === preferred)) return preferred;
  return selection.currentWeekly ?? selection.all[0]?.date ?? null;
}

/** Freshness: reject if `snapshotIso` older than `maxAgeMs` versus `nowIso`. */
export function isExpiryFresh(snapshotIso: string, maxAgeMs: number, nowIso: string = new Date().toISOString()): boolean {
  const t = Date.parse(snapshotIso);
  const n = Date.parse(nowIso);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return false;
  return n - t <= maxAgeMs;
}