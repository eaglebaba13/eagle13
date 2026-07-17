// Phase 34 · Compact provider health bar.
// Consumes UxState per subsystem and rolls them up into a green/yellow/red
// pill. Presentation-only — never fetches, never mutates state.

import type { UxState } from "@/lib/ux-copy";
import { humaniseStatus, rollupHealth, type ProviderHealthLight } from "@/lib/ux-copy";

export interface ProviderHealthEntry {
  readonly id: string;
  readonly label: string;
  readonly state: UxState;
  readonly provider?: string;
}

export interface ProviderHealthBarProps {
  readonly entries: readonly ProviderHealthEntry[];
  readonly className?: string;
}

const LIGHT_STYLES: Record<ProviderHealthLight, string> = {
  GREEN: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  YELLOW: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  RED: "bg-red-500/15 text-red-300 border-red-500/30",
};

const DOT_STYLES: Record<ProviderHealthLight, string> = {
  GREEN: "bg-emerald-400",
  YELLOW: "bg-amber-400",
  RED: "bg-red-400",
};

function entryLight(state: UxState): ProviderHealthLight {
  return rollupHealth([state]);
}

export function ProviderHealthBar({ entries, className }: ProviderHealthBarProps) {
  const overall = rollupHealth(entries.map((e) => e.state));
  const overallCopy = humaniseStatus(
    overall === "GREEN" ? "READY" : overall === "YELLOW" ? "PROVIDER_DEGRADED" : "PROVIDER_UNAVAILABLE",
  );

  return (
    <div
      role="status"
      aria-label={`Provider health: ${overallCopy.label}`}
      className={`flex flex-wrap items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${LIGHT_STYLES[overall]} ${className ?? ""}`}
    >
      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT_STYLES[overall]}`} aria-hidden />
      <span className="font-medium">{overallCopy.label}</span>
      <span className="mx-1 h-3 w-px shrink-0 bg-current opacity-30" aria-hidden />
      <ul className="flex flex-wrap items-center gap-2">
        {entries.map((e) => {
          const light = entryLight(e.state);
          const copy = humaniseStatus(e.state, e.provider);
          return (
            <li key={e.id} className="flex items-center gap-1.5" title={copy.detail}>
              <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${DOT_STYLES[light]}`} aria-hidden />
              <span className="opacity-90">{e.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}