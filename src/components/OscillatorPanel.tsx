// Oscillator panel — renders RSI/MACD in a separate panel below the price chart.
// Provider-neutral. Uses ApexChart wrapper.

import { ApexChart } from "@/components/ApexChart";
import type { IndicatorSeriesConfig, OscillatorChartOptions } from "@/lib/indicators/chart-adapter";

export interface OscillatorPanelProps {
  readonly config: IndicatorSeriesConfig;
  readonly options: OscillatorChartOptions;
}

export function OscillatorPanel({ config, options }: OscillatorPanelProps) {
  const chartOptions = buildOscillatorOptions(options);

  return (
    <div className="mt-1">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-muted-foreground">{options.title}</span>
      </div>
      <ApexChart
        type="line"
        height={options.height}
        series={config.series.map((s) => ({
          name: s.name,
          data: [...s.data],
          type: s.type,
        }))}
        options={chartOptions}
      />
    </div>
  );
}

function buildOscillatorOptions(opts: OscillatorChartOptions) {
  const annotations: Record<string, unknown> = {};

  if (opts.referenceLines && opts.referenceLines.length > 0) {
    annotations.yaxis = opts.referenceLines.map((line) => ({
      y: line.y,
      borderColor: line.color,
      strokeDashArray: 3,
      label: {
        text: line.label,
        style: { color: line.color, background: "transparent", fontSize: "10px" },
      },
    }));
  }

  return {
    chart: {
      background: "transparent",
      toolbar: { show: false },
      zoom: { enabled: false },
    },
    title: { text: undefined },
    xaxis: {
      type: "datetime" as const,
      labels: { show: false }, // hide x-axis on oscillator (synced with main chart)
    },
    yaxis: {
      min: opts.yaxisMin,
      max: opts.yaxisMax,
      labels: { style: { colors: "#888", fontSize: "10px" } },
    },
    stroke: {
      width: [2, 2, 0], // line widths for macd/signal/histogram
    },
    plotOptions: {
      bar: {
        columnWidth: "80%",
      },
    },
    colors: ["#3b82f6", "#ef4444", "#6b7280"],
    grid: {
      borderColor: "#333",
      strokeDashArray: 3,
    },
    tooltip: {
      theme: "dark" as const,
    },
    annotations,
  };
}
