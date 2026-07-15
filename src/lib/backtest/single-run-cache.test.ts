import { describe, it, expect } from "vitest";
import { createSingleRunCache } from "./single-run-cache";

describe("Phase 21.4 Stage 4C · single-run cache", () => {
  it("calls the producer at most once per key across concurrent consumers", async () => {
    const cache = createSingleRunCache<string, number>();
    let calls = 0;
    const produce = async () => {
      calls += 1;
      return 42;
    };
    const [a, b, c] = await Promise.all([
      cache.get("k", produce),
      cache.get("k", produce),
      cache.get("k", produce),
    ]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(c).toBe(42);
    expect(calls).toBe(1);
    expect(cache.calls("k")).toBe(1);
  });

  it("sync memoisation runs producer once", () => {
    const cache = createSingleRunCache<string, number>();
    let n = 0;
    const v1 = cache.getSync("x", () => ++n);
    const v2 = cache.getSync("x", () => ++n);
    expect(v1).toBe(1);
    expect(v2).toBe(1);
    expect(cache.calls("x")).toBe(1);
  });

  it("clear() resets state", () => {
    const cache = createSingleRunCache<string, number>();
    cache.getSync("x", () => 1);
    cache.clear();
    expect(cache.calls("x")).toBe(0);
    expect(cache.getSync("x", () => 2)).toBe(2);
  });
});