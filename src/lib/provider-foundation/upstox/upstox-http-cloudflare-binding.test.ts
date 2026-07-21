// Regression: Phase 38 — Cloudflare Workers "Illegal invocation".
//
// Native `fetch` in the Cloudflare Workers runtime enforces that its `this`
// binding is the global object. Storing `globalThis.fetch` on a class field
// and calling it as `this.fetchImpl(...)` re-binds `this` to the instance
// and throws `TypeError: Illegal invocation`. The `UpstoxHttpClient` must
// bind `globalThis.fetch` to `globalThis` so the platform check passes.

import { describe, it, expect, afterEach } from "vitest";
import { UpstoxHttpClient } from "./upstox-http.server";

describe("UpstoxHttpClient — Cloudflare `this` binding", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("invokes globalThis.fetch with globalThis as `this` (no Illegal invocation)", async () => {
    let seenThis: unknown = "unset";
    // Emulate the Workers runtime check: throw when `this` is not globalThis.
    const strictFetch = function (this: unknown, _url: string, _init?: RequestInit) {
      seenThis = this;
      if (this !== globalThis && this !== undefined) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    } as unknown as typeof fetch;
    globalThis.fetch = strictFetch;

    const client = new UpstoxHttpClient({
      env: { UPSTOX_ACCESS_TOKEN: "test-token" },
    });
    const res = await client.request<{ ok: boolean }>({ path: "v2/ping" });

    expect(res.ok).toBe(true);
    // Must be globalThis (or undefined via bind), never the client instance.
    expect(seenThis === globalThis || seenThis === undefined).toBe(true);
  });
});
