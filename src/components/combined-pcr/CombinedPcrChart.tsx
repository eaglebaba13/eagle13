// Phase 27 · Stage 1 — Combined PCR chart (lazy, client-only).
//
// Renders Combined Score + per-instrument scores + EMA fast/slow +
// zero / ±20 guides. Pure SVG. No external chart lib.

import { useMemo } from "react";
import type { CombinedPcrReading } from "@/lib/combined-pcr/types";
import { computeEmaSeries } from "@/lib/combined-pcr/ema-engine";

export interface CombinedPcrChartProps {
  readonly reading: CombinedPcrReading;
  /** Optional historical series (combined, nifty, banknifty). */
  readonly history?: {
    readonly combined: readonly (number | null)[];
    readonly nifty: readonly (number | null)[];
    readonly banknifty: readonly (number | null)[];
  };
}

const W = 720;
const H = 260;
const PAD_X = 40;
const PAD_Y = 20;

function toPath(values: readonly (number | null)[]): string {
  if (values.length === 0) return "";
  const stepX = (W - PAD_X * 2) / Math.max(1, values.length - 1);
  const yOf = (v: number) => PAD_Y + ((100 - v) / 200) * (H - PAD_Y * 2);
  let d = "";
  let pen = false;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null) { pen = false; continue; }
    const x = PAD_X + i * stepX;
    const y = yOf(v);
    d += `${pen ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)} `;
    pen = true;
  }
  return d.trim();
}

export default function CombinedPcrChart({ reading, history }: CombinedPcrChartProps) {
  const series = useMemo(() => {
    const combined = history?.combined ?? (reading.combinedScore != null ? [reading.combinedScore] : []);
    const nifty = history?.nifty ?? [];
    const banknifty = history?.banknifty ?? [];
    const ema = computeEmaSeries(combined);
    return { combined, nifty, banknifty, ema };
  }, [reading, history]);

  const yLine = (v: number) => PAD_Y + ((100 - v) / 200) * (H - PAD_Y * 2);

  return (
    <svg
      role="img"
      aria-label="Combined PCR chart"
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}
    >
      {/* Guides */}
      {[100, 60, 20, 0, -20, -60, -100].map((v) => (
        <g key={v}>
          <line
            x1={PAD_X} x2={W - PAD_X} y1={yLine(v)} y2={yLine(v)}
            stroke={v === 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)"}
            strokeDasharray={v === 20 || v === -20 ? "3,4" : undefined}
          />
          <text x={4} y={yLine(v) + 3} fontSize={10} fill="rgba(255,255,255,0.5)">{v}</text>
        </g>
      ))}
      {/* Combined */}
      <path d={toPath(series.combined)} stroke="#f2b845" strokeWidth={2} fill="none" />
      {/* Per-instrument */}
      <path d={toPath(series.nifty)} stroke="#4dabff" strokeWidth={1.25} fill="none" opacity={0.85} />
      <path d={toPath(series.banknifty)} stroke="#c084fc" strokeWidth={1.25} fill="none" opacity={0.85} />
      {/* EMA fast/slow */}
      <path d={toPath(series.ema.fast)} stroke="#22d3ee" strokeWidth={1} fill="none" opacity={0.8} strokeDasharray="4,3" />
      <path d={toPath(series.ema.slow)} stroke="#fb7185" strokeWidth={1} fill="none" opacity={0.8} strokeDasharray="4,3" />

      {/* Signal marker */}
      {reading.combinedScore != null && (
        <g>
          <circle
            cx={W - PAD_X} cy={yLine(reading.combinedScore)} r={4}
            fill={reading.direction === "PE" ? "#22c55e" : reading.direction === "CE" ? "#ef4444" : "#9ca3af"}
          />
          <title>{`${reading.signalState} · score=${reading.combinedScore.toFixed(2)}`}</title>
        </g>
      )}

      {/* Legend */}
      <g fontSize={10} fill="rgba(255,255,255,0.75)">
        <rect x={PAD_X} y={H - 16} width={10} height={2} fill="#f2b845" />
        <text x={PAD_X + 14} y={H - 12}>Combined</text>
        <rect x={PAD_X + 78} y={H - 16} width={10} height={2} fill="#4dabff" />
        <text x={PAD_X + 92} y={H - 12}>NIFTY</text>
        <rect x={PAD_X + 138} y={H - 16} width={10} height={2} fill="#c084fc" />
        <text x={PAD_X + 152} y={H - 12}>BANKNIFTY</text>
        <rect x={PAD_X + 220} y={H - 16} width={10} height={2} fill="#22d3ee" />
        <text x={PAD_X + 234} y={H - 12}>EMA fast</text>
        <rect x={PAD_X + 288} y={H - 16} width={10} height={2} fill="#fb7185" />
        <text x={PAD_X + 302} y={H - 12}>EMA slow</text>
      </g>
    </svg>
  );
}