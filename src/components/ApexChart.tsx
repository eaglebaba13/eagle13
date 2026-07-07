import { useEffect, useRef, useState } from "react";
import type { ApexOptions } from "apexcharts";

/**
 * SSR-safe ApexCharts wrapper. ApexCharts touches `window`, so it is only
 * imported and rendered on the client after mount. Pure presentation — no
 * data logic lives here.
 */
export function ApexChart({
  type,
  series,
  options,
  height = 260,
}: {
  type:
    | "area"
    | "line"
    | "bar"
    | "candlestick"
    | "radialBar"
    | "donut"
    | "heatmap"
    | "treemap"
    | "pie";
  series: ApexOptions["series"];
  options: ApexOptions;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const mod = await import("apexcharts");
      const ApexCharts = mod.default;
      if (disposed || !ref.current) return;
      const chart = new ApexCharts(ref.current, {
        ...options,
        chart: { ...(options.chart ?? {}), type, height, background: "transparent" },
        series,
        theme: { mode: "dark", ...(options.theme ?? {}) },
      });
      chart.render();
      chartRef.current = chart;
      setReady(true);
    })();
    return () => {
      disposed = true;
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live updates without a full re-mount.
  useEffect(() => {
    if (chartRef.current && ready) {
      chartRef.current.updateOptions({ ...options, series }, false, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(series), JSON.stringify(options.labels)]);

  return (
    <div style={{ minHeight: height }}>
      <div ref={ref} />
      {!ready ? (
        <div
          style={{
            height,
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
