import type { CSSProperties, ReactNode } from "react";

const baseCard: CSSProperties = {
  padding: 16,
  border: "1px solid var(--eb-border, #22314a)",
  borderRadius: 10,
  background: "var(--eb-card, #0b1220)",
  color: "var(--eb-text, #e6edf3)",
  fontFamily: "var(--eb-body)",
};

export function DashboardWidgetSkeleton({ title }: { title: string }) {
  return (
    <section role="status" aria-busy="true" aria-live="polite" style={baseCard}>
      <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13, letterSpacing: 0.5, color: "var(--eb-muted)" }}>{title}</h3>
        <span style={{ fontSize: 10, color: "var(--eb-muted)" }}>LOADING…</span>
      </header>
      <div style={{ display: "grid", gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: 14,
              width: `${90 - i * 12}%`,
              borderRadius: 4,
              background: "color-mix(in oklab, var(--eb-muted, #64748b) 20%, transparent)",
              opacity: 0.6,
            }}
          />
        ))}
      </div>
    </section>
  );
}

export function DashboardWidgetError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: string;
  onRetry?: () => void;
}) {
  return (
    <section role="alert" style={{ ...baseCard, borderColor: "var(--eb-bear, #ef4444)" }}>
      <h3 style={{ margin: 0, fontSize: 13, color: "var(--eb-bear, #ef4444)" }}>{title}</h3>
      <p style={{ fontSize: 12, color: "var(--eb-muted)" }}>{error}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 6,
            padding: "4px 10px",
            fontSize: 11,
            border: "1px solid var(--eb-border)",
            borderRadius: 6,
            background: "transparent",
            color: "var(--eb-text)",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      ) : null}
    </section>
  );
}

export function DashboardWidgetUnavailable({
  title,
  reason,
  children,
}: {
  title: string;
  reason: string;
  children?: ReactNode;
}) {
  return (
    <section aria-live="polite" style={baseCard}>
      <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 13 }}>{title}</h3>
        <span style={{ fontSize: 10, color: "var(--eb-bear, #ef4444)" }}>DATA UNAVAILABLE</span>
      </header>
      <p style={{ fontSize: 12, color: "var(--eb-muted)", margin: 0 }}>{reason}</p>
      {children}
    </section>
  );
}

export function DashboardWidgetLocked({
  title,
  requiredPlan,
  upgradeHref,
}: {
  title: string;
  requiredPlan: string;
  upgradeHref?: string;
}) {
  return (
    <section style={{ ...baseCard, borderStyle: "dashed" }}>
      <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 13 }}>{title}</h3>
        <span style={{ fontSize: 10, color: "var(--eb-accent, #f5b642)" }}>{requiredPlan.toUpperCase()}</span>
      </header>
      <p style={{ fontSize: 12, color: "var(--eb-muted)", margin: 0 }}>
        Upgrade to <b>{requiredPlan}</b> to unlock this widget.
      </p>
      {upgradeHref ? (
        <a
          href={upgradeHref}
          style={{
            display: "inline-block",
            marginTop: 8,
            fontSize: 11,
            padding: "4px 10px",
            border: "1px solid var(--eb-accent, #f5b642)",
            borderRadius: 6,
            color: "var(--eb-accent, #f5b642)",
            textDecoration: "none",
          }}
        >
          Upgrade
        </a>
      ) : null}
    </section>
  );
}