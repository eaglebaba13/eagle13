import { memo, useEffect, useRef, useState } from "react";
import type ApexCharts from "apexcharts";
import type { ApexOptions } from "apexcharts";

type ApexChartProps = {
  type:
    "area" | "line" | "bar" | "candlestick" | "radialBar" | "donut" | "heatmap" | "treemap" | "pie";
  series: ApexOptions["series"];
  options: ApexOptions;
  height?: number | string;
};

/**
 * SSR-safe ApexCharts wrapper. ApexCharts touches `window`, so it is only
 * imported and rendered on the client after mount. Pure presentation — no
 * data logic lives here.
 */
function ApexChartImpl({ type, series, options, height = 260 }: ApexChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ApexCharts | null>(null);
  const [ready, setReady] = useState(false);

  // Store latest props in refs to prevent stale closure during async apexcharts import
  const latestPropsRef = useRef({ type, series, options, height });
  latestPropsRef.current = { type, series, options, height };

  useEffect(() => {
    let disposed = false;
    (async () => {
      const mod = await import("apexcharts");
      const ApexCharts = mod.default;
      if (disposed || !ref.current) return;

      const current = latestPropsRef.current;
      const chart = new ApexCharts(ref.current, {
        ...current.options,
        chart: {
          ...(current.options.chart ?? {}),
          type: current.type,
          height: current.height,
          background: "transparent",
        },
        series: current.series,
        theme: { mode: "dark", ...(current.options.theme ?? {}) },
      });

      await chart.render();

      if (disposed) {
        chart.destroy();
        return;
      }

      chartRef.current = chart;
      setReady(true);

      // If props updated while async import/render was pending, immediately sync
      const latest = latestPropsRef.current;
      if (
        JSON.stringify(latest.series) !== JSON.stringify(current.series) ||
        JSON.stringify(latest.options) !== JSON.stringify(current.options)
      ) {
        chart.updateOptions(
          {
            ...latest.options,
            chart: {
              ...(latest.options.chart ?? {}),
              type: latest.type,
              height: latest.height,
              background: "transparent",
            },
            series: latest.series,
          },
          true,
          false,
        );
      }
    })();

    return () => {
      disposed = true;
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // Live updates without a full re-mount.
  useEffect(() => {
    if (!chartRef.current || !ready) return;
    chartRef.current.updateOptions(
      {
        ...options,
        chart: {
          ...(options.chart ?? {}),
          type,
          height,
          background: "transparent",
        },
        series,
      },
      true,
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, JSON.stringify(series), JSON.stringify(options), height]);

  const resolvedHeight = typeof height === "number" ? height : undefined;

  return (
    <div className="w-full h-full relative" style={{ height, minHeight: resolvedHeight ?? 260 }}>
      <div
        ref={ref}
        className="w-full h-full"
        style={{ height: "100%", width: "100%", minHeight: resolvedHeight ?? 260 }}
      />
      {!ready ? (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{
            minHeight: resolvedHeight ?? 260,
            display: "grid",
            placeItems: "center",
            color: "var(--eb-muted)",
            fontFamily: "var(--eb-mono)",
            fontSize: 11,
          }}
        >
          <span className="eb-shimmer" style={{ padding: "6px 12px", borderRadius: 6 }}>
            rendering chart…
          </span>
        </div>
      ) : null}
    </div>
  );
}

// Memoized: parent re-renders (e.g. the 1s clock tick) must not re-run the
// chart unless its actual data/config changes. Compare by serialized value so
// callers passing fresh object literals each render still hit the cache.
export const ApexChart = memo(
  ApexChartImpl,
  (a, b) =>
    a.type === b.type &&
    a.height === b.height &&
    JSON.stringify(a.series) === JSON.stringify(b.series) &&
    JSON.stringify(a.options) === JSON.stringify(b.options),
);
