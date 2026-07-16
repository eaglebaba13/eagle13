import type { ReactNode } from "react";
import { DataFreshnessPill } from "./DataFreshnessPill";
import type { FreshnessResult } from "@/lib/data-freshness";

// Phase 24D · Shared dashboard card header.
//
// Presentation-only. Consumers pass in freshness + methodology metadata
// but this component never fetches, never emits signals.

export type DashboardCardHeaderProps = {
  title: string;
  methodology?: string | null;
  freshness?: FreshnessResult | null;
  provider?: string;
  info?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  locked?: boolean;
  lockedReason?: string;
  statusIcon?: ReactNode;
  right?: ReactNode;
};

export function DashboardCardHeader({
  title,
  methodology,
  freshness,
  provider,
  info,
  collapsed,
  onToggleCollapse,
  locked,
  lockedReason,
  statusIcon,
  right,
}: DashboardCardHeaderProps) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {statusIcon}
        <h3
          className="eb-card-title"
          style={{ margin: 0, fontSize: 13, letterSpacing: 0.4, textTransform: "uppercase" }}
        >
          {title}
        </h3>
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
              border: "1px solid var(--eb-border, #1f2937)",
              color: "var(--eb-muted)",
            }}
          >
            {methodology}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {freshness ? (
          <DataFreshnessPill result={freshness} provider={provider} compact />
        ) : null}
        {info ? (
          <span
            title={info}
            aria-label={info}
            role="img"
            style={{
              fontFamily: "var(--eb-mono)",
              fontSize: 11,
              color: "var(--eb-muted)",
              cursor: "help",
            }}
          >
            ?
          </span>
        ) : null}
        {locked ? (
          <span
            title={lockedReason ?? "Locked"}
            aria-label={`Locked: ${lockedReason ?? ""}`}
            style={{ fontSize: 11, color: "var(--eb-muted)" }}
          >
            🔒
          </span>
        ) : null}
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand widget" : "Collapse widget"}
            style={{
              background: "transparent",
              color: "var(--eb-muted)",
              border: "1px solid var(--eb-border, #1f2937)",
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
        {right}
      </div>
    </header>
  );
}

export default DashboardCardHeader;