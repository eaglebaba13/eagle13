// Phase 21.9 · Stage 2 — Research preset manager.
// Pure. Stores named optimizer presets. Every preset is explicitly a
// research artefact — never applied to any live/broker/production engine.

import type { OptimizerResult } from "./explainable-optimizer";
import type { ParameterCombination } from "./parameter-sensitivity";

export type OptimizerPreset = {
  readonly id: string;
  readonly name: string;
  readonly strategy: OptimizerResult["strategy"];
  readonly parameters: ParameterCombination;
  readonly runId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly note?: string;
  readonly readOnly: true;
  readonly disclaimer: "RESEARCH PRESET ONLY — NEVER APPLIED TO LIVE TRADING";
};

export type OptimizerPresetLibrary = {
  readonly presets: readonly OptimizerPreset[];
};

export function emptyPresetLibrary(): OptimizerPresetLibrary {
  return { presets: [] };
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("PRESET_NAME_REQUIRED");
  if (trimmed.length > 80) throw new Error("PRESET_NAME_TOO_LONG");
  return trimmed;
}

function ensureUniqueName(
  presets: readonly OptimizerPreset[],
  name: string,
  excludeId?: string,
): void {
  const clash = presets.some((p) => p.id !== excludeId && p.name === name);
  if (clash) throw new Error(`PRESET_NAME_TAKEN:${name}`);
}

export function savePreset(
  lib: OptimizerPresetLibrary,
  input: {
    readonly id: string;
    readonly name: string;
    readonly strategy: OptimizerResult["strategy"];
    readonly parameters: ParameterCombination;
    readonly runId: string;
    readonly createdAt: string;
    readonly note?: string;
  },
): OptimizerPresetLibrary {
  const name = normalizeName(input.name);
  ensureUniqueName(lib.presets, name);
  const preset: OptimizerPreset = {
    id: input.id,
    name,
    strategy: input.strategy,
    parameters: input.parameters,
    runId: input.runId,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    note: input.note,
    readOnly: true,
    disclaimer: "RESEARCH PRESET ONLY — NEVER APPLIED TO LIVE TRADING",
  };
  return { presets: [preset, ...lib.presets] };
}

export function renamePreset(
  lib: OptimizerPresetLibrary,
  id: string,
  nextName: string,
  now: string,
): OptimizerPresetLibrary {
  const name = normalizeName(nextName);
  ensureUniqueName(lib.presets, name, id);
  const idx = lib.presets.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error(`PRESET_NOT_FOUND:${id}`);
  const next = lib.presets.slice();
  next[idx] = { ...next[idx], name, updatedAt: now };
  return { presets: next };
}

export function deletePreset(
  lib: OptimizerPresetLibrary,
  id: string,
): OptimizerPresetLibrary {
  return { presets: lib.presets.filter((p) => p.id !== id) };
}

export function duplicatePreset(
  lib: OptimizerPresetLibrary,
  id: string,
  newId: string,
  now: string,
): OptimizerPresetLibrary {
  const src = lib.presets.find((p) => p.id === id);
  if (!src) throw new Error(`PRESET_NOT_FOUND:${id}`);
  let name = `${src.name} (copy)`;
  let n = 2;
  while (lib.presets.some((p) => p.name === name)) {
    name = `${src.name} (copy ${n++})`;
    if (n > 100) throw new Error("PRESET_DUPLICATE_LIMIT");
  }
  const clone: OptimizerPreset = { ...src, id: newId, name, createdAt: now, updatedAt: now };
  return { presets: [clone, ...lib.presets] };
}

export function serializePreset(preset: OptimizerPreset): string {
  return JSON.stringify(preset, null, 2);
}

export function serializePresetLibrary(lib: OptimizerPresetLibrary): string {
  return JSON.stringify(lib, null, 2);
}