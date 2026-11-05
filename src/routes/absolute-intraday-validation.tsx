import { createFileRoute, Link } from "@tanstack/react-router";
import { AbsoluteValidationPanel } from "@/components/backtest/AbsoluteValidationPanel";

export const Route = createFileRoute("/absolute-intraday-validation")({
  component: ValidationPage,
  head: () => ({
    meta: [
      { title: "Absolute Intraday · Historical Validation | EagleBABA" },
      {
        name: "description",
        content:
          "Validation-only historical evidence for the Absolute-Degree Intraday methodology. Not a live trade recommendation.",
      },
      { property: "og:title", content: "Absolute Intraday · Historical Validation" },
      {
        property: "og:description",
        content:
          "Historical multi-session replay of the Absolute-Degree Intraday engine. Validation only.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ValidationPage() {
  return (
    <div
      className="w-full max-w-[1800px] mx-auto px-2 sm:px-4 lg:px-6 py-4 flex flex-col gap-4 overflow-x-hidden"
      style={{
        background: "var(--eb-bg)",
        color: "var(--eb-text)",
        minHeight: "100vh",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Absolute Intraday · Historical Validation</h1>
        <Link to="/absolute-intraday" style={{ color: "var(--eb-accent)", fontSize: 13 }}>
          ← Snapshot preview
        </Link>
      </div>
      <AbsoluteValidationPanel />
    </div>
  );
}
