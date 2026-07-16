import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/combined-pcr")({
  head: () => ({
    meta: [
      { title: "Combined PCR — Coming Next · EagleBABA Research" },
      {
        name: "description",
        content:
          "Combined Put/Call Ratio research module for NIFTY, BANKNIFTY and SENSEX. Currently in provider verification — no live option signals emitted.",
      },
      { property: "og:title", content: "Combined PCR — Coming Next" },
      {
        property: "og:description",
        content:
          "PCR research module for NIFTY, BANKNIFTY and SENSEX — pending option-chain provider verification.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CombinedPcrPage,
});

const READINESS_CHECKLIST = [
  "NIFTY option chain",
  "BANKNIFTY option chain",
  "SENSEX option chain",
  "Open Interest (OI)",
  "Change in Open Interest",
  "Strike coverage",
  "Expiry metadata",
  "Provider timestamps",
];

function CombinedPcrPage() {
  return (
    <div className="eb-page eb-content" style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.6,
          padding: "4px 10px",
          borderRadius: 999,
          background: "rgba(255, 174, 0, 0.14)",
          color: "#f2b845",
          border: "1px solid rgba(255, 174, 0, 0.28)",
          marginBottom: 16,
        }}
      >
        RESEARCH · COMING NEXT
      </div>
      <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 700 }}>Combined PCR</h1>
      <p style={{ margin: "0 0 24px", opacity: 0.75, lineHeight: 1.55 }}>
        A combined Put/Call Ratio research module for NIFTY, BANKNIFTY, and SENSEX will publish
        here once every required option-chain field is verified against a live provider. Until
        then, no CE/PE signals are emitted and this page is not wired to the Signal or Decision
        engines.
      </p>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: 20,
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.85, marginBottom: 12 }}>
          Provider readiness checklist
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, fontSize: 14 }}>
          {READINESS_CHECKLIST.map((item) => (
            <li key={item} style={{ opacity: 0.85 }}>
              <span aria-hidden style={{ display: "inline-block", width: 14 }}>
                ○
              </span>{" "}
              {item}
            </li>
          ))}
        </ul>
      </div>

      <p style={{ marginTop: 20, fontSize: 12, opacity: 0.55 }}>
        This route ships intentionally read-only — no live data, no strategy output.
      </p>
    </div>
  );
}