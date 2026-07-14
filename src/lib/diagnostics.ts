// In-memory diagnostics registry. Passive collectors only — every recorder
// is O(1), bounded, and side-effect free. Behaviour of instrumented callers
// (http.ts, server-cache.ts, scheduler.ts) is unchanged: they hand this
// module a copy of what they were already going to return.
//
// Split between server and client isolates: the server registry lives in the
// module scope of whichever isolate handles a request; the client registry
// lives in the browser tab. Diagnostics UI pulls both and displays them side
// by side.

export type ApiRequestRecord = {
  ts: number;
  host: string;
  url: string;
  method: string;
  status: number | null;
  durationMs: number;
  retries: number;
  ok: boolean;
  error?: string;
};

export type ErrorRecord = {
  ts: number;
  severity: "error" | "warning" | "info";
  message: string;
  source?: string;
  stack?: string;
};

const API_LOG_LIMIT = 100;
const ERROR_LOG_LIMIT = 100;

const apiLog: ApiRequestRecord[] = [];
const errorLog: ErrorRecord[] = [];

const apiTotals = {
  total: 0,
  ok: 0,
  failed: 0,
  retries: 0,
  totalMs: 0,
};

const perHost = new Map<
  string,
  {
    host: string;
    total: number;
    ok: number;
    failed: number;
    retries: number;
    totalMs: number;
    lastStatus: number | null;
    lastSuccessTs: number | null;
    lastFailureTs: number | null;
    lastError?: string;
  }
>();

function hostBucket(host: string) {
  let b = perHost.get(host);
  if (!b) {
    b = {
      host,
      total: 0, ok: 0, failed: 0, retries: 0, totalMs: 0,
      lastStatus: null, lastSuccessTs: null, lastFailureTs: null,
    };
    perHost.set(host, b);
  }
  return b;
}

export function recordApiRequest(rec: ApiRequestRecord): void {
  apiLog.push(rec);
  if (apiLog.length > API_LOG_LIMIT) apiLog.shift();

  apiTotals.total += 1;
  apiTotals.totalMs += rec.durationMs;
  apiTotals.retries += rec.retries;
  if (rec.ok) apiTotals.ok += 1;
  else apiTotals.failed += 1;

  const b = hostBucket(rec.host);
  b.total += 1;
  b.totalMs += rec.durationMs;
  b.retries += rec.retries;
  b.lastStatus = rec.status;
  if (rec.ok) {
    b.ok += 1;
    b.lastSuccessTs = rec.ts;
  } else {
    b.failed += 1;
    b.lastFailureTs = rec.ts;
    b.lastError = rec.error;
  }
}

export function recordError(rec: Omit<ErrorRecord, "ts"> & { ts?: number }): void {
  const full: ErrorRecord = { ts: rec.ts ?? Date.now(), ...rec };
  errorLog.push(full);
  if (errorLog.length > ERROR_LOG_LIMIT) errorLog.shift();
}

export type ApiHealthEntry = {
  host: string;
  total: number;
  ok: number;
  failed: number;
  retries: number;
  avgMs: number;
  errorRate: number;
  lastStatus: number | null;
  lastSuccessTs: number | null;
  lastFailureTs: number | null;
  lastError?: string;
};

export function getApiHealth(): ApiHealthEntry[] {
  const out: ApiHealthEntry[] = [];
  for (const b of perHost.values()) {
    out.push({
      host: b.host,
      total: b.total,
      ok: b.ok,
      failed: b.failed,
      retries: b.retries,
      avgMs: b.total > 0 ? Math.round(b.totalMs / b.total) : 0,
      errorRate: b.total > 0 ? Math.round((b.failed / b.total) * 1000) / 10 : 0,
      lastStatus: b.lastStatus,
      lastSuccessTs: b.lastSuccessTs,
      lastFailureTs: b.lastFailureTs,
      lastError: b.lastError,
    });
  }
  return out.sort((a, b) => b.total - a.total);
}

export function getApiTotals() {
  return {
    ...apiTotals,
    avgMs: apiTotals.total > 0 ? Math.round(apiTotals.totalMs / apiTotals.total) : 0,
    errorRate:
      apiTotals.total > 0
        ? Math.round((apiTotals.failed / apiTotals.total) * 1000) / 10
        : 0,
  };
}

export function getApiLog(): ApiRequestRecord[] {
  return apiLog.slice().reverse();
}

export function getErrorLog(): ErrorRecord[] {
  return errorLog.slice().reverse();
}

export function clearDiagnostics(): void {
  apiLog.length = 0;
  errorLog.length = 0;
  apiTotals.total = 0;
  apiTotals.ok = 0;
  apiTotals.failed = 0;
  apiTotals.retries = 0;
  apiTotals.totalMs = 0;
  perHost.clear();
}