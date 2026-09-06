// Indicator selector and parameter controls.
// Lightweight UI for enabling/configuring indicators on the live chart.
// Provider-neutral. Uses registry for available indicators.

import { useState, useCallback, useMemo } from "react";
import { listIndicators, getIndicator } from "@/lib/indicators/registry";
import type { IndicatorDefinition, IndicatorId } from "@/lib/indicators/types";
import {
  createDefaultActiveIndicator,
  clampParams,
  type ActiveIndicator,
} from "@/lib/indicators/ui-state";

export interface IndicatorControlsProps {
  readonly active: readonly ActiveIndicator[];
  readonly onChange: (active: readonly ActiveIndicator[]) => void;
}

export function IndicatorControls({ active, onChange }: IndicatorControlsProps) {
  const allIndicators = useMemo(() => listIndicators(), []);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const addIndicator = useCallback(
    (id: IndicatorId) => {
      const def = getIndicator(id);
      if (!def) return;
      if (active.some((a) => a.id === id)) return; // already active
      const newIndicator = createDefaultActiveIndicator(id, def.params);
      onChange([...active, newIndicator]);
      setSelectorOpen(false);
    },
    [active, onChange],
  );

  const removeIndicator = useCallback(
    (id: IndicatorId) => {
      onChange(active.filter((a) => a.id !== id));
    },
    [active, onChange],
  );

  const toggleIndicator = useCallback(
    (id: IndicatorId) => {
      onChange(active.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
    },
    [active, onChange],
  );

  const updateParam = useCallback(
    (id: IndicatorId, key: string, value: number) => {
      const def = getIndicator(id);
      if (!def) return;
      onChange(
        active.map((a) => {
          if (a.id !== id) return a;
          const clamped = clampParams({ ...a.params, [key]: value }, def.params);
          return { ...a, params: clamped };
        }),
      );
    },
    [active, onChange],
  );

  const availableToAdd = allIndicators.filter((d) => !active.some((a) => a.id === d.id));

  return (
    <div className="flex flex-col gap-2">
      {/* Active indicators */}
      {active.map((ind) => {
        const def = getIndicator(ind.id);
        if (!def) return null;
        return (
          <IndicatorRow
            key={ind.id}
            indicator={ind}
            definition={def}
            onToggle={() => toggleIndicator(ind.id)}
            onRemove={() => removeIndicator(ind.id)}
            onParamChange={(key, value) => updateParam(ind.id, key, value)}
          />
        );
      })}

      {/* Add indicator button */}
      {availableToAdd.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setSelectorOpen(!selectorOpen)}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-accent text-muted-foreground"
          >
            + Add Indicator
          </button>
          {selectorOpen && (
            <div className="absolute z-10 mt-1 bg-popover border border-border rounded shadow-lg p-1 min-w-[160px]">
              {availableToAdd.map((def) => (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => addIndicator(def.id)}
                  className="block w-full text-left text-xs px-2 py-1 hover:bg-accent rounded"
                >
                  {def.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────── Indicator Row ──────────────────────────────

interface IndicatorRowProps {
  readonly indicator: ActiveIndicator;
  readonly definition: IndicatorDefinition;
  readonly onToggle: () => void;
  readonly onRemove: () => void;
  readonly onParamChange: (key: string, value: number) => void;
}

function IndicatorRow({ indicator, definition, onToggle, onRemove, onParamChange }: IndicatorRowProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {/* Enable/disable toggle */}
      <button
        type="button"
        onClick={onToggle}
        className={`w-3 h-3 rounded-full border ${
          indicator.enabled ? "bg-green-500 border-green-500" : "bg-transparent border-muted-foreground"
        }`}
        title={indicator.enabled ? "Disable" : "Enable"}
      />

      {/* Name */}
      <span className={indicator.enabled ? "text-foreground" : "text-muted-foreground"}>
        {definition.name}
      </span>

      {/* Parameters */}
      {definition.params.map((param) => (
        <label key={param.key} className="flex items-center gap-1">
          <span className="text-muted-foreground">{param.label}:</span>
          <input
            type="number"
            value={indicator.params[param.key] ?? param.default}
            min={param.min}
            max={param.max}
            step={param.type === "int" ? 1 : 0.1}
            onChange={(e) => onParamChange(param.key, Number(e.target.value))}
            className="w-12 bg-transparent border border-border rounded px-1 py-0.5 text-xs"
          />
        </label>
      ))}

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-red-500 ml-1"
        title="Remove indicator"
      >
        ×
      </button>
    </div>
  );
}
