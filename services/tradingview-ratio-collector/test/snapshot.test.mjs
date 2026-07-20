import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySignal, computeFreshness, buildSnapshot, isValidRatio } from "../src/snapshot.mjs";

const base = {
  symbol: "TVC:GOLDSILVER",
  expectedSymbol: "TVC:GOLDSILVER",
  ratio: 70,
  marketTimestamp: 1_784_522_640,
  receivedAtMs: 1_000_000,
  now: 1_010_000,
  connectionStatus: "CONNECTED",
  staleAfterMs: 120_000,
  unavailableAfterMs: 600_000,
  formulaVersion: "GS_RATIO_50_80_V1",
};

test("ratio below 50 → BUY_GOLD", () => {
  assert.equal(classifySignal(49.9), "BUY_GOLD");
});
test("ratio exactly 50 → NEUTRAL", () => {
  assert.equal(classifySignal(50), "NEUTRAL");
});
test("ratio between → NEUTRAL", () => {
  assert.equal(classifySignal(65), "NEUTRAL");
});
test("ratio exactly 80 → NEUTRAL", () => {
  assert.equal(classifySignal(80), "NEUTRAL");
});
test("ratio above 80 → BUY_SILVER", () => {
  assert.equal(classifySignal(80.01), "BUY_SILVER");
});
test("invalid ratio → UNAVAILABLE", () => {
  for (const v of [NaN, Infinity, -Infinity, 0, -5, "70"]) {
    assert.equal(classifySignal(v), "UNAVAILABLE");
  }
  for (const v of [NaN, Infinity, 0, -5, null, undefined, "70"]) {
    assert.equal(isValidRatio(v), false);
  }
  assert.equal(isValidRatio(70), true);
});

test("freshness LIVE / STALE / UNAVAILABLE", () => {
  assert.equal(computeFreshness(1000, 120_000, 600_000), "LIVE");
  assert.equal(computeFreshness(120_001, 120_000, 600_000), "STALE");
  assert.equal(computeFreshness(600_001, 120_000, 600_000), "UNAVAILABLE");
  assert.equal(computeFreshness(-1, 120_000, 600_000), "UNAVAILABLE");
});

test("buildSnapshot LIVE actionable", () => {
  const s = buildSnapshot(base);
  assert.equal(s.freshness, "LIVE");
  assert.equal(s.signal, "NEUTRAL");
  assert.equal(s.ratio, 70);
  assert.equal(s.source, "TRADINGVIEW_UNOFFICIAL");
  assert.equal(s.symbol, "TVC:GOLDSILVER");
});

test("buildSnapshot STALE never emits actionable signal", () => {
  const s = buildSnapshot({ ...base, now: base.receivedAtMs + 300_000 });
  assert.equal(s.freshness, "STALE");
  assert.equal(s.signal, "UNAVAILABLE");
  assert.equal(s.ratio, 70, "stale ratio is preserved for information");
});

test("buildSnapshot UNAVAILABLE clears ratio and signal", () => {
  const s = buildSnapshot({ ...base, now: base.receivedAtMs + 900_000 });
  assert.equal(s.freshness, "UNAVAILABLE");
  assert.equal(s.signal, "UNAVAILABLE");
  assert.equal(s.ratio, null);
});

test("buildSnapshot rejects wrong symbol", () => {
  const s = buildSnapshot({ ...base, symbol: "TVC:OTHER" });
  assert.equal(s.ratio, null);
  assert.equal(s.signal, "UNAVAILABLE");
});

test("buildSnapshot rejects invalid ratio", () => {
  for (const bad of [NaN, -1, 0, "70", null, undefined]) {
    const s = buildSnapshot({ ...base, ratio: bad });
    assert.equal(s.ratio, null);
    assert.equal(s.signal, "UNAVAILABLE");
  }
});

test("buildSnapshot missing receivedAt → UNAVAILABLE", () => {
  const s = buildSnapshot({ ...base, receivedAtMs: null });
  assert.equal(s.freshness, "UNAVAILABLE");
  assert.equal(s.signal, "UNAVAILABLE");
  assert.equal(s.ratio, null);
  assert.equal(s.ageMs, null);
});