// Client-safe resilient HTTP helpers (no secrets, no server-only imports).
// Adds request timeouts and bounded retries with backoff so transient
// upstream failures (rate limits, network blips) don't crash the app.

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export type FetchOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  /** Use exponential backoff (2^attempt) instead of linear. Default true. */
  exponential?: boolean;
  headers?: Record<string, string>;
  accept?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Backoff delay with optional exponential growth + jitter. */
function backoff(base: number, attempt: number, exponential: boolean): number {
  const growth = exponential ? base * 2 ** attempt : base * (attempt + 1);
  const jitter = Math.random() * base * 0.3;
  return Math.min(growth + jitter, 8000);
}

/**
 * Fetch with an abort-based timeout and bounded retries.
 * Retries on network errors, timeouts, and 429/5xx responses.
 * Throws a descriptive Error only after all attempts are exhausted.
 */
export async function fetchWithRetry(
  url: string,
  opts: FetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 8000,
    retries = 2,
    retryDelayMs = 500,
    exponential = true,
    headers = {},
    accept = "application/json",
  } = opts;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": DEFAULT_UA, Accept: accept, ...headers },
        signal: controller.signal,
      });
      clearTimeout(timer);

      // Retry transient server-side / rate-limit responses.
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        lastError = new Error(`Upstream ${res.status} for ${safeHost(url)}`);
        await sleep(backoff(retryDelayMs, attempt, exponential));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) {
        await sleep(backoff(retryDelayMs, attempt, exponential));
        continue;
      }
    }
  }

  const reason =
    lastError instanceof Error ? lastError.message : String(lastError ?? "unknown error");
  throw new Error(`Request failed for ${safeHost(url)}: ${reason}`);
}

/** Fetch and parse JSON with retry/timeout. Throws on non-OK or invalid JSON. */
export async function fetchJson<T = unknown>(
  url: string,
  opts?: FetchOptions,
): Promise<T> {
  const res = await fetchWithRetry(url, opts);
  if (!res.ok) throw new Error(`Data source error ${res.status} for ${safeHost(url)}`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(`Invalid JSON from ${safeHost(url)}`);
  }
}

/** Fetch text with retry/timeout. Returns null instead of throwing on failure. */
export async function fetchTextSafe(
  url: string,
  opts?: FetchOptions,
): Promise<string | null> {
  try {
    const res = await fetchWithRetry(url, { accept: "text/xml, */*", ...opts });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "data source";
  }
}
