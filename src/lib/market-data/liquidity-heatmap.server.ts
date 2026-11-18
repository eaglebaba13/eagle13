import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { HEATMAP_ASSETS, isHeatmapAsset, normalizeDepth, normalizeOptionChain, type HeatmapAsset, type LiquiditySnapshot } from "./liquidity-heatmap";

const buffers = new Map<HeatmapAsset, LiquiditySnapshot[]>();
const pending = new Map<HeatmapAsset, Promise<LiquiditySnapshot | null>>();
const path = resolve(process.env.LIQUIDITY_SNAPSHOT_PATH || "config/liquidity-heatmap-snapshots.json");
let loaded: Promise<void> | null = null;
let writing = Promise.resolve();
const MAX_SNAPSHOTS = 480;

async function load() {
  loaded ??= (async () => {
    try {
      const data = JSON.parse(await readFile(path, "utf8"));
      if (data.version !== 1 || !Array.isArray(data.snapshots)) return;
      for (const entry of data.snapshots as LiquiditySnapshot[]) {
        if (!entry || !isHeatmapAsset(entry.asset) || !Number.isFinite(entry.timestamp) || !Array.isArray(entry.levels)) continue;
        const list = buffers.get(entry.asset) ?? [];
        list.push(entry); buffers.set(entry.asset, list.slice(-MAX_SNAPSHOTS));
      }
    } catch { /* No persisted snapshot yet. */ }
  })();
  await loaded;
}
export async function getLiquidityHistory(asset: HeatmapAsset): Promise<LiquiditySnapshot[]> { await load(); return [...(buffers.get(asset) ?? [])]; }
async function persist() {
  const payload = JSON.stringify({ version: 1, snapshots: [...buffers.values()].flat() });
  writing = writing.then(async () => { await mkdir(dirname(path), { recursive: true }); await writeFile(`${path}.tmp`, payload, { mode: 0o600 }); await rename(`${path}.tmp`, path); });
  await writing;
}
export async function collectLiquiditySnapshot(asset: HeatmapAsset, save = false): Promise<LiquiditySnapshot | null> {
  await load();
  const active = pending.get(asset); if (active) return active;
  const task = (async () => {
    let snapshot: LiquiditySnapshot;
    if (asset === "NIFTY50" || asset === "BANKNIFTY") {
      const { fetchCanonicalOptionChain } = await import("../option-chain/canonical-snapshot.server");
      const result = await fetchCanonicalOptionChain({ underlying: asset === "NIFTY50" ? "NIFTY" : "BANKNIFTY" });
      if (!result.ok || !result.snapshot || result.snapshot.provider !== "UPSTOX" || result.snapshot.dataQuality === "FAILED" || result.snapshot.dataQuality === "STALE") return null;
      snapshot = normalizeOptionChain(asset, result.snapshot);
    } else {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`https://api.binance.com/api/v3/depth?symbol=${asset}&limit=500`, { signal: controller.signal });
        if (!response.ok) return null;
        snapshot = normalizeDepth(asset, await response.json(), Date.now());
      } finally { clearTimeout(timeout); }
    }
    if (!snapshot.levels.length || !Number.isFinite(snapshot.timestamp)) return null;
    const list = buffers.get(asset) ?? [];
    if (list.at(-1)?.timestamp !== snapshot.timestamp) buffers.set(asset, [...list, snapshot].slice(-MAX_SNAPSHOTS));
    if (save) await persist();
    return snapshot;
  })().catch(() => null).finally(() => pending.delete(asset));
  pending.set(asset, task); return task;
}
export async function persistLiquiditySnapshots() { await load(); await persist(); }
export async function collectScheduledLiquidity() {
  const now = new Date(); const minutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440;
  const indianOpen = now.getUTCDay() !== 0 && now.getUTCDay() !== 6 && minutes >= 555 && minutes <= 930;
  await Promise.allSettled((indianOpen ? HEATMAP_ASSETS : HEATMAP_ASSETS.slice(2)).map((asset) => collectLiquiditySnapshot(asset)));
  await persistLiquiditySnapshots();
}
