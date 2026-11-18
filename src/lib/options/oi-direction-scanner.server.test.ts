import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../option-chain/canonical-snapshot.server", () => ({
  fetchCanonicalOptionChain: vi.fn(),
}));
import {
  OiSnapshotStore,
  candleContext,
  parseOiCandles,
  scannerMarketHours,
} from "./oi-direction-scanner.server";
import type { OiObservation } from "./oi-direction-scanner";
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
const now = Date.parse("2026-11-17T10:00:00+05:30");
function sample(source: OiObservation["source"] = "CAPTURED"): OiObservation {
  return {
    source,
    context: {
      open: null,
      high: null,
      low: null,
      previousClose: null,
      vwap: null,
      priorHigh: null,
      priorLow: null,
    },
    snapshot: {
      instrument: "NIFTY",
      expiry: "2026-11-19",
      availableExpiries: [],
      provider: "UPSTOX",
      dataQuality: "OK",
      marketSession: "OPEN",
      spotPrice: 25000,
      timestamp: "2026-11-17T03:45:00.000Z",
      strikes: [],
    },
  };
}
describe("OI persistent session store", () => {
  it("atomically persists, survives restart, deduplicates and prioritizes captured data", async () => {
    const dir = await mkdtemp(join(tmpdir(), "oi-scanner-"));
    dirs.push(dir);
    const path = join(dir, "snapshots.json");
    const store = new OiSnapshotStore(path);
    await store.append([sample()], now);
    await store.append([sample("CANDLE_HISTORY")], now);
    const restarted = new OiSnapshotStore(path);
    await restarted.load();
    expect(restarted.get("NIFTY", undefined, now)).toHaveLength(1);
    expect(restarted.get("NIFTY", undefined, now)[0].source).toBe("CAPTURED");
    expect(JSON.parse(await readFile(path, "utf8")).version).toBe(1);
    expect(restarted.get("BANKNIFTY", undefined, now)).toEqual([]);
    expect(restarted.get("NIFTY", "2026-11-26", now)).toEqual([]);
    expect(restarted.get("NIFTY", undefined, now + 86400000)).toEqual([]);
  });
  it("reports corrupted persistence without crashing collection", async () => {
    const dir = await mkdtemp(join(tmpdir(), "oi-scanner-"));
    dirs.push(dir);
    const path = join(dir, "snapshots.json");
    await writeFile(path, "invalid");
    const store = new OiSnapshotStore(path);
    await store.load();
    expect(store.error).toContain("could not be read");
    await store.append([sample()], now);
    expect(store.error).toBeNull();
  });
  it("rejects old sessions, malformed and incomplete candles", () => {
    const data = parseOiCandles(
      [
        ["2026-11-17T09:59:00+05:30", 10, 12, 9, 11, 100, 50],
        ["2026-11-17T10:00:00+05:30", 10, 12, 9, 11, 100, 50],
        ["2026-11-16T09:59:00+05:30", 10, 12, 9, 11, 100, 50],
        ["invalid", 1, 2, 1, 2, 1],
      ],
      now,
    );
    expect(data).toHaveLength(1);
    expect(data[0].oi).toBe(50);
    expect(candleContext(data).vwap).toBeCloseTo(32 / 3);
    expect(candleContext(data.map((c) => ({ ...c, volume: 0 }))).vwap).toBeNull();
  });
  it("gates session endpoints and weekends", () => {
    expect(scannerMarketHours(Date.parse("2026-11-17T09:14:00+05:30"))).toBe(false);
    expect(scannerMarketHours(Date.parse("2026-11-17T09:15:00+05:30"))).toBe(true);
    expect(scannerMarketHours(Date.parse("2026-11-17T15:31:00+05:30"))).toBe(false);
    expect(scannerMarketHours(Date.parse("2026-11-22T10:00:00+05:30"))).toBe(false);
  });
});
