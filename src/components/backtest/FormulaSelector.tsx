import { getStrategyAdapter, type StrategyId } from "@/lib/backtest/strategy";
import type { UnifiedFormulaId } from "@/lib/backtest/result";

export type FormulaSelectorProps = {
  strategy: StrategyId;
  value: UnifiedFormulaId | null;
  onChange: (id: UnifiedFormulaId) => void;
  className?: string;
};

const LABELS: Record<string, string> = {
  GANN_SIGN_DEGREE_TABLE_V1_1: "Sign-Degree Astro v1.1",
  LEGACY_EAGLEBABA_CASCADE_V1: "Legacy Cascade v1",
  GANN_ASTRO_INTRADAY_ABSOLUTE_V1: "Absolute-Degree Intraday v1",
  SMC_V1: "SMC Historical v1",
  ASTRO_SMC_HYBRID_V1: "Astro+SMC Hybrid v1",
};

/**
 * Phase 21.3c · Formula/methodology selector. Only lists formula versions
 * declared by the currently active strategy adapter — the two selectors are
 * kept explicitly separate so "strategy" and "formula version" never blur.
 */
export function FormulaSelector({ strategy, value, onChange, className }: FormulaSelectorProps) {
  const adapter = getStrategyAdapter(strategy);
  const options = adapter.supportedFormulaVersions;
  if (options.length === 0) {
    return (
      <div className={className} data-testid="formula-selector-empty">
        <span className="text-xs text-muted-foreground">
          COMING NEXT — no formulas registered for this strategy yet.
        </span>
      </div>
    );
  }
  return (
    <div
      role="radiogroup"
      aria-label="Formula version"
      className={className ?? "flex flex-wrap gap-2"}
    >
      {options.map((id) => {
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(id)}
            className={[
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-muted",
            ].join(" ")}
          >
            {LABELS[id] ?? id}
          </button>
        );
      })}
    </div>
  );
}