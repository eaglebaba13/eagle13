import { describe, it, expect, beforeEach, vi } from "vitest";
import { cached, clearServerCache } from "./server-cache";

beforeEach(() => clearServerCache());

describe("server cache", () => {
  it("returns the loader value on a cold miss", async () => {
    const v = await cached("k", async () => 42, { ttlMs: 1000 });
    expect(v).toBe(42);
  });

  it("serves the fresh cached value without calling the loader again", async () => {
    const loader = vi.fn(async () => Math.random());
    const a = await cached("k", loader, { ttlMs: 10_000 });
    const b = await cached("k", loader, { ttlMs: 10_000 });
    expect(a).toBe(b);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent cold requests into one upstream call", async () => {
    let calls = 0;
    const loader = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return "x";
    };
    const [a, b, c] = await Promise.all([
      cached("k", loader, { ttlMs: 1000 }),
      cached("k", loader, { ttlMs: 1000 }),
      cached("k", loader, { ttlMs: 1000 }),
    ]);
    expect([a, b, c]).toEqual(["x", "x", "x"]);
    expect(calls).toBe(1);
  });

  it("serves stale immediately and refreshes in the background (SWR)", async () => {
    let n = 0;
    const loader = async () => ++n;
    const first = await cached("k", loader, { ttlMs: 5, swrMs: 10_000 });
    expect(first).toBe(1);
    await new Promise((r) => setTimeout(r, 15)); // now stale, still within SWR
    const stale = await cached("k", loader, { ttlMs: 5, swrMs: 10_000 });
    expect(stale).toBe(1); // stale value served instantly
    await new Promise((r) => setTimeout(r, 5)); // background refresh completes
    const fresh = await cached("k", loader, { ttlMs: 5, swrMs: 10_000 });
    expect(fresh).toBe(2);
  });

  it("falls back to an expired value when a refresh fails", async () => {
    let n = 0;
    const loader = async () => {
      n++;
      if (n === 1) return "good";
      throw new Error("upstream down");
    };
    const first = await cached("k", loader, { ttlMs: 1 });
    expect(first).toBe("good");
    await new Promise((r) => setTimeout(r, 5)); // fully expired (past SWR)
    const second = await cached("k", loader, { ttlMs: 1 });
    expect(second).toBe("good"); // served stale despite loader throwing
  });
});