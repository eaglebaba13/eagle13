import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { OptionsChainResponse, OptionsSymbol } from "../options-chain.functions";
import { normalizeOptionLegs } from "../options-analytics";

const file = (symbol: OptionsSymbol) => resolve(process.env.OPTIONS_ANALYTICS_LKG_DIR || "config/options-analytics-lkg", `${symbol}.json`);
const writes = new Map<OptionsSymbol, Promise<void>>();

export function saveAnalyticsSnapshot(response: OptionsChainResponse): Promise<void> {
  const symbol = response.snapshot.symbol as OptionsSymbol;
  if (response.snapshot.source !== "UPSTOX" || !response.snapshot.legs.length) return Promise.resolve();
  const next = (writes.get(symbol) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const destination = file(symbol);
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(response), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, destination);
  });
  writes.set(symbol, next);
  return next;
}

/** Authentic bounded EOD/LKG only; no synthesized OI, contracts or provider timestamps. */
export async function readAnalyticsSnapshot(symbol: OptionsSymbol, expiry?: string, now = Date.now()): Promise<OptionsChainResponse | null> {
  try {
    await writes.get(symbol)?.catch(() => {});
    const saved = JSON.parse(await readFile(file(symbol), "utf8")) as OptionsChainResponse;
    const snapshot = saved.snapshot;
    const age = now - Date.parse(snapshot.fetchedAt);
    if (snapshot.symbol !== symbol || snapshot.source !== "UPSTOX" || !Number.isFinite(age) || age < -60_000 || age > 4 * 86400_000 || (expiry && expiry !== snapshot.expiry)) return null;
    const legs = normalizeOptionLegs(snapshot.legs);
    if (!legs.length || !Number.isFinite(snapshot.spot) || snapshot.spot <= 0) return null;
    return { ...saved, snapshot: { ...snapshot, legs, strikes: [...new Set(legs.map((leg) => leg.strike))].sort((a, b) => a - b), source: "LAST_KNOWN_GOOD" },
      degraded: true, errorMessage: "Live contracts unavailable. Showing the last verified EOD/session option-chain snapshot.",
      integrity: { ...saved.integrity, sourceStatus: "STALE", isTradable: false, cacheStatus: "LAST_KNOWN_GOOD", dataAgeSeconds: Math.max(0, Math.floor(age / 1000)), receivedAt: new Date(now).toISOString() } };
  } catch { return null; }
}
