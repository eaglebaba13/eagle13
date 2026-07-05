import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getSeasonality } from "@/lib/seasonality.functions";

export const seasonalityQuery = () =>
  queryOptions({
    queryKey: ["seasonality"],
    queryFn: () => getSeasonality(),
    refetchInterval: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Heat colour: green for gains, red for losses, intensity by magnitude (cap 8%). */
function heat(v: number | null): { bg: string; fg: string } {
  if (v == null) return { bg: "transparent", fg: "var(--eb-muted)" };
  const t = Math.min(1, Math.abs(v) / 8);
  const pct = Math.round(18 + t * 62); // 18%..80%
  if (v >= 0) {
    return {
      bg: `color-mix(in srgb, var(--eb-bull) ${pct}%, transparent)`,
      fg: t > 0.55 ? "#04140b" : "var(--eb-text)",
    };
  }
  return {
    bg: `color-mix(in srgb, var(--eb-bear) ${pct}%, transparent)`,
    fg: t > 0.55 ? "#fff" : "var(--eb-text)",
  };
}

function Cell({ v, bold }: { v: number | null; bold?: boolean }) {
  const { bg, fg } = heat(v);
  return (
    <td
      style={{
        padding: "6px 8px",
        textAlign: "center",
        fontFamily: "var(--eb-mono)",
        fontSize: 11.5,
        fontWeight: bold ? 700 : 600,
        background: bg,
        color: fg,
        whiteSpace: "nowrap",
        minWidth: 46,
      }}
    >
      {v == null ? "—" : v.toFixed(1)}
    </td>
  );
}

const yearCellStyle: React.CSSProperties = {
  padding: "6px 10px",
  textAlign: "left",
  fontFamily: "var(--eb-mono)",
  fontSize: 11.5,
  fontWeight: 700,
  color: "var(--eb-text)",
  position: "sticky",
  left: 0,
  background: "var(--eb-card)",
  zIndex: 1,
  whiteSpace: "nowrap",
};

export function Seasonality() {
  const { data, isFetching } = useSuspenseQuery(seasonalityQuery());
  return (
    <section
      aria-label="Nifty 50 seasonality analysis"
      style={{
        marginTop: 18,
        background: "var(--eb-card)",
        border: "1px solid var(--eb-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--eb-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background:
            "linear-gradient(90deg, color-mix(in srgb, var(--eb-accent) 12%, transparent), transparent 60%)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--eb-head)",
            fontSize: 15,
            letterSpacing: 2,
            color: "var(--eb-accent)",
          }}
        >
          📅 NIFTY 50 SEASONALITY · MONTHLY % CHANGE
        </span>
        <span
          suppressHydrationWarning
          style={{
            fontSize: 10,
            fontFamily: "var(--eb-mono)",
            color: isFetching ? "var(--eb-accent)" : "var(--eb-muted)",
            letterSpacing: 0.6,
          }}
        >
          {isFetching ? "↻ updating…" : "open → close %"}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        {data.years.length === 0 ? (
          <div
            style={{
              padding: 16,
              fontSize: 12,
              color: "var(--eb-muted)",
              fontFamily: "var(--eb-mono)",
            }}
          >
            Seasonality data unavailable right now.
          </div>
        ) : (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--eb-border)" }}>
                <th style={{ ...yearCellStyle, color: "var(--eb-accent)", fontSize: 10, letterSpacing: 0.6 }}>
                  YEAR
                </th>
                {MONTHS.map((m) => (
                  <th
                    key={m}
                    style={{
                      padding: "8px 8px",
                      fontFamily: "var(--eb-mono)",
                      fontSize: 10,
                      letterSpacing: 0.6,
                      fontWeight: 700,
                      color: "var(--eb-accent)",
                      textAlign: "center",
                      textTransform: "uppercase",
                    }}
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "2px solid var(--eb-border)" }}>
                <td style={{ ...yearCellStyle, color: "var(--eb-accent)" }}>Avg %</td>
                {data.avg.map((v, i) => (
                  <Cell key={i} v={v} bold />
                ))}
              </tr>
              {data.years.map((row) => (
                <tr key={row.year} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={yearCellStyle}>{row.year}</td>
                  {row.months.map((v, i) => (
                    <Cell key={i} v={v} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}