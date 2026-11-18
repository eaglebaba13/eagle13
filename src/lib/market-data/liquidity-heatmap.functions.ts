import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { isHeatmapAsset } from "./liquidity-heatmap";

export const getLiquidityHeatmap = createServerFn({ method: "POST" })
  .validator((raw: unknown) => {
    const asset = (raw as { asset?: unknown } | null)?.asset;
    if (typeof asset !== "string" || !isHeatmapAsset(asset)) throw new Error("Unsupported heatmap asset");
    return { asset };
  })
  .handler(async ({ data }) => {
    const { collectLiquiditySnapshot, getLiquidityHistory } = await import("./liquidity-heatmap.server");
    const history = await getLiquidityHistory(data.asset);
    if (!history.length || Date.now() - history.at(-1)!.timestamp > 60_000) await collectLiquiditySnapshot(data.asset);
    const snapshots = await getLiquidityHistory(data.asset);
    return { ok: snapshots.length > 0, snapshots: snapshots.slice(-120), stale: !snapshots.length || Date.now() - snapshots.at(-1)!.timestamp > 180_000 };
  });

export const liquidityHeatmapQuery = (asset: string) => queryOptions({
  queryKey: ["liquidity-heatmap", asset],
  queryFn: () => getLiquidityHeatmap({ data: { asset } }),
  staleTime: 30_000,
  refetchInterval: 60_000,
});
