// Phase 26 · Stage 5 — Lazy-loaded OI chart.
//
// Read-only. Strike vs Call OI / Put OI / ΔOI with spot & ATM markers.
// Deliberately inline SVG — no chart library required.

import type { OptionChainStrike } from "@/lib/option-chain/types";

interface Props {
  readonly strikes: readonly OptionChainStrike[];
  readonly spot: number | null;
  readonly atm: number | null;
}

const W = 800;
const H = 260;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 32;

export default function OptionChainChart({ strikes, spot, atm }: Props) {
  if (strikes.length === 0) return null;
  const sorted = strikes.slice().sort((a, b) => a.strike - b.strike);
  const xs = sorted.map((s) => s.strike);
  const maxOi = Math.max(
    1,
    ...sorted.flatMap((s) => [s.call.oi ?? 0, s.put.oi ?? 0, Math.abs(s.call.changeOi ?? 0), Math.abs(s.put.changeOi ?? 0)]),
  );
  const xMin = xs[0]!, xMax = xs[xs.length - 1]!;
  const xSpan = Math.max(1, xMax - xMin);
  const x = (v: number) => PAD_L + ((v - xMin) / xSpan) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - v / maxOi) * (H - PAD_T - PAD_B);
  const barW = Math.max(4, (W - PAD_L - PAD_R) / xs.length * 0.35);

  return (
    <div style={{ marginTop: 14, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 10, background: "rgba(255,255,255,0.03)" }}>
      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>
        Strike vs Open Interest (green = Call OI, red = Put OI, striped = ΔOI)
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Option chain OI chart">
        {/* axes */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="rgba(255,255,255,0.2)" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="rgba(255,255,255,0.2)" />
        {sorted.map((s) => {
          const cx = x(s.strike);
          const co = s.call.oi ?? 0;
          const po = s.put.oi ?? 0;
          const cCh = Math.abs(s.call.changeOi ?? 0);
          const pCh = Math.abs(s.put.changeOi ?? 0);
          const baseY = H - PAD_B;
          return (
            <g key={s.strike}>
              <rect x={cx - barW} y={y(co)} width={barW * 0.8} height={baseY - y(co)} fill="rgba(90,200,120,0.75)" />
              <rect x={cx + barW * 0.2} y={y(po)} width={barW * 0.8} height={baseY - y(po)} fill="rgba(220,90,90,0.75)" />
              <rect x={cx - barW} y={y(cCh)} width={barW * 0.8} height={baseY - y(cCh)} fill="url(#hatchG)" opacity={0.5} />
              <rect x={cx + barW * 0.2} y={y(pCh)} width={barW * 0.8} height={baseY - y(pCh)} fill="url(#hatchR)" opacity={0.5} />
            </g>
          );
        })}
        {/* markers */}
        {spot != null && (
          <line x1={x(spot)} y1={PAD_T} x2={x(spot)} y2={H - PAD_B} stroke="#6bd3ff" strokeDasharray="3 3" />
        )}
        {atm != null && (
          <line x1={x(atm)} y1={PAD_T} x2={x(atm)} y2={H - PAD_B} stroke="#f2b845" strokeDasharray="1 4" />
        )}
        {/* x labels */}
        {sorted.filter((_, i) => i % Math.ceil(sorted.length / 8) === 0).map((s) => (
          <text key={s.strike} x={x(s.strike)} y={H - PAD_B + 14} fontSize={9} textAnchor="middle" fill="rgba(255,255,255,0.55)">
            {s.strike}
          </text>
        ))}
        <defs>
          <pattern id="hatchG" width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(90,200,120,0.9)" strokeWidth={1} />
          </pattern>
          <pattern id="hatchR" width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(220,90,90,0.9)" strokeWidth={1} />
          </pattern>
        </defs>
      </svg>
      <div style={{ display: "flex", gap: 14, fontSize: 10, opacity: 0.7, marginTop: 4 }}>
        <span>● Call OI</span><span>● Put OI</span>
        {spot != null && <span>— Spot ({spot})</span>}
        {atm != null && <span>— ATM ({atm})</span>}
      </div>
    </div>
  );
}