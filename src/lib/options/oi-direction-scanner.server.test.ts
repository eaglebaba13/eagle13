import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../option-chain/canonical-snapshot.server", () => ({
  fetchCanonicalOptionChain: vi.fn(),
}));
vi.mock("../provider-foundation/upstox/upstox-http.server", () => ({
  UpstoxHttpClient: class {
    async request({ path }: { path: string }) {
      if (path.startsWith("v2/market/status/")) {
        return { ok: true, data: { data: { status: "NORMAL_OPEN" } } };
      }
      return { ok: true, data: { data: {} } };
    }
  },
}));
import { fetchCanonicalOptionChain } from "../option-chain/canonical-snapshot.server";
import {
  OiSnapshotStore,
  candleContext,
  captureOiSymbol,
  parseOiCandles,
  scannerMarketHours,
} from "./oi-direction-scanner.server";
import { computeOiRows, oiTimeline, type OiObservation } from "./oi-direction-scanner";
import { makeStrike } from "../option-chain/types";
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

  it("captures consecutive minutes even under 60s timer drift, deduplicates within the same minute, and retries failed minutes after 20s", async () => {
    const mockedFetch = vi.mocked(fetchCanonicalOptionChain);
    mockedFetch.mockReset();

    const t0 = Date.parse("2026-11-17T09:50:10+05:30");
    const t0Dup = Date.parse("2026-11-17T09:50:35+05:30");
    const t1 = Date.parse("2026-11-17T09:51:02+05:30"); // only 52s after t0
    const t2Fail = Date.parse("2026-11-17T09:52:05+05:30");
    const t2Retry = Date.parse("2026-11-17T09:52:30+05:30"); // 25s after failure

    const makeSnap = (ts: number) =>
      ({
        ok: true as const,
        snapshot: {
          instrument: "NIFTY",
          expiry: "2026-11-19",
          availableExpiries: ["2026-11-19"],
          provider: "UPSTOX" as const,
          dataQuality: "OK" as const,
          marketSession: "OPEN" as const,
          spotPrice: 25000,
          timestamp: new Date(ts).toISOString(),
          strikes: [
            makeStrike(
              25000,
              { oi: 1000, changeOi: 100, ltp: 100 },
              { oi: 1200, changeOi: 200, ltp: 110 },
            ),
          ],
        },
      }) as unknown as Awaited<ReturnType<typeof fetchCanonicalOptionChain>>;

    mockedFetch
      .mockResolvedValueOnce(makeSnap(t0))
      .mockResolvedValueOnce(makeSnap(t1))
      .mockResolvedValueOnce({ ok: false, snapshot: null } as unknown as Awaited<ReturnType<typeof fetchCanonicalOptionChain>>)
      .mockResolvedValueOnce(makeSnap(t2Retry));

    await captureOiSymbol("NIFTY", "2026-11-19", t0);
    // Same minute: should skip without calling provider again
    await captureOiSymbol("NIFTY", "2026-11-19", t0Dup);
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    // Next minute only 52s later: must still capture (no 60s drift drop)
    await captureOiSymbol("NIFTY", "2026-11-19", t1);
    expect(mockedFetch).toHaveBeenCalledTimes(2);

    // Transient failure at 09:52:05, then retry at 09:52:30
    await captureOiSymbol("NIFTY", "2026-11-19", t2Fail);
    await captureOiSymbol("NIFTY", "2026-11-19", t2Retry);
    expect(mockedFetch).toHaveBeenCalledTimes(4);
  });

  it("marks unverified minutes as GAP in oiTimeline without fabricating OI changes", () => {
    const obs1 = { ...sample("CAPTURED"), snapshot: { ...sample().snapshot, timestamp: "2026-11-17T09:50:10+05:30" } };
    const obs2 = { ...sample("CAPTURED"), snapshot: { ...sample().snapshot, timestamp: "2026-11-17T09:52:05+05:30" } };
    const rows = computeOiRows([obs1, obs2], 1);
    const timeline = oiTimeline(rows, Date.parse("2026-11-17T09:52:30+05:30"), 1);
    const slice = timeline.slice(-3);
    expect(slice[0].row).not.toBeNull();
    expect(slice[1].row).toBeNull(); // 09:51 remains an honest GAP
    expect(slice[2].row).not.toBeNull();
  });
});
