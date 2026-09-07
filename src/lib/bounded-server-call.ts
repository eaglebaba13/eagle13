// Bounded server function call with timeout.
// Prevents infinite loading when server/provider operations hang.
// Returns a typed result with explicit terminal states.

export interface BoundedResult<T> {
  readonly ok: boolean;
  readonly data: T | null;
  readonly error: string | null;
  readonly timedOut: boolean;
}

/**
 * Call a server function with a bounded timeout.
 * If the server function hangs, returns a typed TIMEOUT error.
 */
export async function callBounded<T>(
  fn: () => Promise<T>,
  timeoutMs: number = 30_000,
): Promise<BoundedResult<T>> {
  try {
    const data = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs),
      ),
    ]);
    return { ok: true, data, error: null, timedOut: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "request failed";
    const timedOut = msg === "TIMEOUT";
    return {
      ok: false,
      data: null,
      error: timedOut ? "Request timed out. Please try again." : msg,
      timedOut,
    };
  }
}
