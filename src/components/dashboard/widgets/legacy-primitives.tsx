import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { DataFreshnessPill } from "../DataFreshnessPill";
import type { FreshnessResult } from "@/lib/data-freshness";

// Phase 24C · Shared presentation primitives for legacy dashboard cards.
// Extracted verbatim from `src/routes/index.tsx` so adapter widgets render
// the same visual as the pre-24C dashboard.
//
// Phase 24E · Card now accepts optional freshness / methodology / blocked
// metadata so every widget can consistently disclose data provenance and
// signal safety without touching its raw values.

export const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Card({
  title,
  sub,
  accent,
  children,
  freshness,
  methodology,
  provider,
  blocked,
  blockedReasons,
  collapsed,
  onToggleCollapse,
  collapsible,
}: {
  title: string;
  sub?: string;
  accent: string;
  children: ReactNode;
  freshness?: FreshnessResult | null;
  methodology?: string | null;
  provider?: string;
  blocked?: boolean;
  blockedReasons?: string[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  collapsible?: boolean;
}) {
  const hasMeta =
    !!freshness || !!methodology || !!blocked || !!collapsible;
  return (
    <div className="eb-card eb-glass" style={{ borderRadius: 12, overflow: "hidden" }}>
      <div
        style={{
          padding: "9px 13px",
          borderBottom: "1px solid var(--eb-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 12%, transparent), transparent 60%)`,
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontFamily: "var(--eb-head)", fontSize: 15, letterSpacing: 2, color: accent }}>
          {title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {sub ? (
            <span
              style={{
                fontFamily: "var(--eb-mono)",
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 3,
                background: "rgba(255,255,255,0.04)",
                color: "var(--eb-muted)",
              }}
            >
              {sub}
            </span>
          ) : null}
          {collapsible && onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={!collapsed}
              aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
              style={{
                background: "transparent",
                color: "var(--eb-muted)",
                border: "1px solid var(--eb-border)",
                borderRadius: 4,
                padding: "2px 6px",
                fontFamily: "var(--eb-mono)",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              {collapsed ? "▸" : "▾"}
            </button>
          ) : null}
        </div>
      </div>
      {hasMeta ? (
        <div
          style={{
            padding: "6px 13px",
            borderBottom: "1px solid var(--eb-border)",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            background: "rgba(255,255,255,0.015)",
          }}
          data-eb-card-meta
        >
          {methodology ? (
            <span
              title={`Methodology: ${methodology}`}
              aria-label={`Methodology ${methodology}`}
              style={{
                fontFamily: "var(--eb-mono)",
                fontSize: 9,
                letterSpacing: 0.8,
                padding: "2px 6px",
                borderRadius: 4,
                border: "1px solid var(--eb-border)",
                color: "var(--eb-muted)",
                textTransform: "uppercase",
              }}
            >
              {methodology}
            </span>
          ) : null}
          {freshness ? (
            <DataFreshnessPill result={freshness} provider={provider} compact />
          ) : null}
          {blocked ? (
            <span
              role="status"
              title={(blockedReasons ?? []).join(" · ")}
              style={{
                fontFamily: "var(--eb-mono)",
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                border: "1px solid var(--eb-muted)",
                color: "var(--eb-muted)",
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              SIGNAL BLOCKED
            </span>
          ) : null}
        </div>
      ) : null}
      <div style={{ padding: "12px 13px" }}>{children}</div>
    </div>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "7px 0",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--eb-muted)", fontFamily: "var(--eb-mono)" }}>{label}</span>
      {children}
    </div>
  );
}

export function FlashValue({ value, color }: { value: number; color?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value && ref.current) {
      ref.current.style.animation = "none";
      void ref.current.offsetWidth;
      ref.current.style.animation = "eb-flash 1.1s ease-out";
      prev.current = value;
    }
  }, [value]);
  return (
    <span
      ref={ref}
      style={{
        fontFamily: "var(--eb-mono)",
        fontSize: 15,
        fontWeight: 700,
        color: color ?? "var(--eb-text)",
        padding: "1px 4px",
        borderRadius: 3,
      }}
    >
      {fmt(value)}
    </span>
  );
}

export function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        padding: 9,
        borderRadius: 5,
        textAlign: "center",
        background: "rgba(255,255,255,0.025)",
        border: "1px solid var(--eb-border)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "var(--eb-muted)",
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: "var(--eb-mono)", fontSize: 15, fontWeight: 700, color, marginTop: 3 }}>
        {fmt(value)}
      </div>
    </div>
  );
}

export const thStyle: CSSProperties = {
  padding: "6px 9px",
  textAlign: "left",
  fontSize: 10,
  color: "var(--eb-muted)",
  fontFamily: "var(--eb-mono)",
  letterSpacing: 0.8,
  borderBottom: "1px solid var(--eb-border)",
  fontWeight: "normal",
  textTransform: "uppercase",
};

export const tdStyle: CSSProperties = {
  padding: "6px 9px",
  fontFamily: "var(--eb-mono)",
  fontSize: 13,
  borderBottom: "1px solid rgba(255,255,255,0.025)",
};