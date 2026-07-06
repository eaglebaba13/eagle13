import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getFiiDii, type FiiDiiRow } from "@/lib/fiidii.functions";

export const fiiDiiQuery = () =>
  queryOptions({
    queryKey: ["fii-dii"],
    queryFn: () => getFiiDii(),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

const fmtCr = (n: number) => {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `${sign}${abs}`;
};

function NetCell({ value }: { value: number }) {
  const color =
    value > 0 ? "var(--eb-bull)" : value < 0 ? "var(--eb-bear)" : "var(--eb-muted)";
  return (
    <td
      style={{
        padding: "8px 10px",
        textAlign: "right",
        fontFamily: "var(--eb-mono)",
        fontSize: 12.5,
        fontWeight: 600,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {fmtCr(value)}
    </td>
  );
}

function Row({ r }: { r: FiiDiiRow }) {
  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <td
        style={{
          padding: "8px 10px",
          fontFamily: "var(--eb-mono)",
          fontSize: 12.5,
          color: "var(--eb-text)",
          whiteSpace: "nowrap",
        }}
      >
        {r.label}
      </td>
      <NetCell value={r.fiiCash} />
      <NetCell value={r.diiCash} />
      <NetCell value={r.fiiFuture} />
    </tr>
  );
}

const TH: React.CSSProperties = {
  padding: "9px 10px",
  fontFamily: "var(--eb-mono)",
  fontSize: 10,
  letterSpacing: 0.6,
  fontWeight: 700,
  color: "var(--eb-muted)",
  textAlign: "right",
  textTransform: "uppercase",
};

export function FiiDiiActivity() {
  const { data, isFetching } = useSuspenseQuery(fiiDiiQuery());
  return (
    <section
      aria-label="FII and DII activity"
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
          🏦 FII &amp; DII ACTIVITY
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
          {isFetching ? "↻ updating…" : "₹ crore · net"}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        {data.rows.length === 0 ? (
          <div
            style={{
              padding: 16,
              fontSize: 12,
              color: "var(--eb-muted)",
              fontFamily: "var(--eb-mono)",
            }}
          >
            Activity data unavailable right now.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--eb-border)" }}>
                <th style={{ ...TH, textAlign: "left" }}>Date</th>
                <th style={TH}>FII Cash</th>
                <th style={TH}>DII Cash</th>
                <th style={TH}>FII Fut (OI)</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <Row key={r.date} r={r} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}