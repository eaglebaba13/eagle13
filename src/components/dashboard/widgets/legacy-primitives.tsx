import { useEffect, useRef, type ReactNode } from "react";
import { DataFreshnessPill } from "../DataFreshnessPill";
import type { FreshnessResult } from "@/lib/data-freshness";
import { fmt } from "@/lib/format";

// Phase 24C · Shared presentation primitives for legacy dashboard cards.
// Extracted verbatim from `src/routes/index.tsx` so adapter widgets render
// the same visual as the pre-24C dashboard.
//
// Phase 24E · Card now accepts optional freshness / methodology / blocked
// metadata so every widget can consistently disclose data provenance and
// signal safety without touching its raw values.

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
  const hasMeta = !!freshness || !!methodology || !!blocked;
  return (
    <div
      className="eb-card"
      style={{
        borderRadius: 12,
        overflow: "hidden",
        background: "var(--eb-card, #11161f)",
        border: "1px solid var(--eb-border, rgba(148, 163, 184, 0.14))",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--eb-border, rgba(148, 163, 184, 0.14))",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--eb-bg3, #141b26)",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            style={{
              fontFamily: "var(--eb-head)",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 1.2,
              color: "var(--eb-text, #e8edf5)",
            }}
          >
            {title}
          </span>
          {methodology ? (
            <span
              title={`Methodology: ${methodology}`}
              aria-label={`Methodology ${methodology}`}
              style={{
                fontFamily: "var(--eb-mono)",
                fontSize: 10,
                letterSpacing: 0.4,
                color: "var(--eb-muted, #94a3b8)",
                textTransform: "uppercase",
              }}
            >
              · {methodology}
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {sub ? (
            <span
              style={{
                fontFamily: "var(--eb-mono)",
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 4,
                background: "rgba(148, 163, 184, 0.08)",
                border: "1px solid rgba(148, 163, 184, 0.14)",
                color: "var(--eb-muted, #94a3b8)",
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
      {hasMeta && (freshness || blocked) ? (
        <div
          style={{
            padding: "6px 14px",
            borderBottom: "1px solid var(--eb-border, rgba(148, 163, 184, 0.14))",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            background: "rgba(15, 23, 42, 0.25)",
          }}
          data-eb-card-meta
        >
          {freshness ? <DataFreshnessPill result={freshness} provider={provider} compact /> : null}
          {blocked ? (
            <span
              role="status"
              title={(blockedReasons ?? []).join(" · ")}
              style={{
                fontFamily: "var(--eb-mono)",
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                border: "1px solid rgba(148, 163, 184, 0.24)",
                color: "var(--eb-muted)",
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              SIGNAL BLOCKED
            </span>
          ) : null}
        </div>
      ) : null}
      <div style={{ padding: "12px 14px" }}>{children}</div>
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
      <span style={{ fontSize: 12, color: "var(--eb-muted)", fontFamily: "var(--eb-mono)" }}>
        {label}
      </span>
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
        fontVariantNumeric: "tabular-nums",
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
        padding: 10,
        borderRadius: 6,
        textAlign: "center",
        background: "var(--eb-bg3, #141b26)",
        border: "1px solid var(--eb-border, rgba(148, 163, 184, 0.14))",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--eb-muted, #94a3b8)",
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--eb-mono)",
          fontVariantNumeric: "tabular-nums",
          fontSize: 15,
          fontWeight: 700,
          color,
          marginTop: 3,
        }}
      >
        {fmt(value)}
      </div>
    </div>
  );
}
