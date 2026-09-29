// Shared table style constants for legacy dashboard widgets.
// Extracted from `legacy-primitives.tsx` so that module only exports components
// (React Fast Refresh). Values are unchanged.

import type { CSSProperties } from "react";

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
