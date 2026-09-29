// Source labels for the runtime status badge.
// Extracted from `RuntimeStatusBadge.tsx` so that module only exports its
// component (React Fast Refresh). Behavior is unchanged.

import type { ModuleSource } from "@/lib/runtime-readiness/runtime-evidence";

export const SOURCE_LABEL: Record<ModuleSource, string> = {
  LIVE: "Live",
  MIXED: "Mixed",
  RESEARCH_DEMO: "Research Demo",
  CONFIGURATION: "Configured",
  STATIC: "Static",
  UNKNOWN: "Unknown",
};

export function sourceLabel(source: ModuleSource): string {
  return SOURCE_LABEL[source];
}
