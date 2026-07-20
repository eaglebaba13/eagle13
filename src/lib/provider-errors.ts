// Phase 36.2 — Typed provider error taxonomy.
//
// Every provider/network failure is normalised into a `ProviderError` at
// its origin (currently `src/lib/http.ts`). Downstream server functions
// catch these and convert them into typed degraded UI states — they never
// escape as raw promise rejections. The root-level `unhandledrejection`
// safety net in `src/routes/__root.tsx` uses `isProviderError` to decide
// whether to suppress the Vite runtime overlay, so *expected* provider
// failures are contained while genuine programming errors still surface.

export type ProviderErrorCategory =
  | "ProviderUnavailable"
  | "NetworkTimeout"
  | "HTTPError"
  | "RateLimited"
  | "InvalidResponse"
  | "UnexpectedApplicationError";

export type ProviderRequestStage =
  | "connect"
  | "response"
  | "parse"
  | "validate"
  | "unknown";

export interface ProviderErrorDiagnostics {
  readonly provider: string;
  readonly endpoint: string;
  readonly httpStatus: number | null;
  readonly latencyMs: number;
  readonly retryCount: number;
  readonly timestamp: string;
  readonly stage: ProviderRequestStage;
}

export class ProviderError extends Error {
  readonly name = "ProviderError";
  readonly category: ProviderErrorCategory;
  readonly diagnostics: ProviderErrorDiagnostics;

  constructor(
    message: string,
    category: ProviderErrorCategory,
    diagnostics: ProviderErrorDiagnostics,
  ) {
    super(message);
    this.category = category;
    this.diagnostics = diagnostics;
  }
}

export function isProviderError(value: unknown): value is ProviderError {
  return (
    value instanceof Error &&
    (value as { name?: string }).name === "ProviderError" &&
    typeof (value as { category?: unknown }).category === "string"
  );
}

export function categorizeHttpStatus(status: number): ProviderErrorCategory {
  if (status === 429) return "RateLimited";
  if (status >= 400) return "HTTPError";
  return "ProviderUnavailable";
}

export function categorizeFetchFailure(err: unknown): ProviderErrorCategory {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  if (/aborted|AbortError|timeout|timed out/i.test(msg)) return "NetworkTimeout";
  return "ProviderUnavailable";
}

export function safeProviderHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "data source";
  }
}

export function makeProviderError(opts: {
  message: string;
  category: ProviderErrorCategory;
  url: string;
  httpStatus?: number | null;
  latencyMs: number;
  retryCount: number;
  stage: ProviderRequestStage;
}): ProviderError {
  const diagnostics: ProviderErrorDiagnostics = {
    provider: safeProviderHost(opts.url),
    endpoint: opts.url,
    httpStatus: opts.httpStatus ?? null,
    latencyMs: Math.max(0, Math.round(opts.latencyMs)),
    retryCount: Math.max(0, opts.retryCount),
    timestamp: new Date().toISOString(),
    stage: opts.stage,
  };
  return new ProviderError(opts.message, opts.category, diagnostics);
}