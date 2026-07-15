import { listStrategies, type StrategyId } from "@/lib/backtest/strategy";

export type StrategySelectorProps = {
  value: StrategyId;
  onChange: (id: StrategyId) => void;
  className?: string;
};

/**
 * Phase 21.3c · Strategy selector. Renders every registered strategy; COMING
 * NEXT strategies are visible but disabled so users see the roadmap.
 */
export function StrategySelector({ value, onChange, className }: StrategySelectorProps) {
  const strategies = listStrategies();
  return (
    <div
      role="radiogroup"
      aria-label="Backtest strategy"
      className={className ?? "flex flex-wrap gap-2"}
    >
      {strategies.map((s) => {
        const disabled = s.availability !== "AVAILABLE";
        const active = s.strategyId === value;
        return (
          <button
            key={s.strategyId}
            type="button"
            role="radio"
            aria-checked={active}
            aria-disabled={disabled}
            disabled={disabled}
            onClick={() => !disabled && onChange(s.strategyId)}
            title={
              disabled ? "COMING NEXT — engine adapter not yet wired" : s.methodology
            }
            className={[
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-muted",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            ].join(" ")}
          >
            {s.label}
            {disabled ? <span className="ml-1 opacity-70">· COMING NEXT</span> : null}
          </button>
        );
      })}
    </div>
  );
}