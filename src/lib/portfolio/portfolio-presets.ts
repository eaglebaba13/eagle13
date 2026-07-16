// Phase 22 · Stage 1 — Portfolio preset library (research-only, in-memory).
// Never writes production/broker settings.

import type { PortfolioPreset } from "./portfolio-exports";

export class PortfolioPresetLibrary {
  private presets = new Map<string, PortfolioPreset>();

  list(): readonly PortfolioPreset[] {
    return [...this.presets.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  get(id: string): PortfolioPreset | undefined {
    return this.presets.get(id);
  }
  save(preset: PortfolioPreset): PortfolioPreset {
    if (this.presets.has(preset.id)) throw new Error(`Preset ${preset.id} already exists`);
    this.presets.set(preset.id, preset);
    return preset;
  }
  rename(id: string, name: string): PortfolioPreset {
    const p = this.presets.get(id);
    if (!p) throw new Error(`Preset ${id} not found`);
    const next = { ...p, name };
    this.presets.set(id, next);
    return next;
  }
  duplicate(id: string, newId: string, newName: string, now: string): PortfolioPreset {
    const p = this.presets.get(id);
    if (!p) throw new Error(`Preset ${id} not found`);
    const dup: PortfolioPreset = { ...p, id: newId, name: newName, createdAt: now };
    this.presets.set(newId, dup);
    return dup;
  }
  delete(id: string): void {
    this.presets.delete(id);
  }
  compare(idA: string, idB: string): { a: PortfolioPreset; b: PortfolioPreset } {
    const a = this.presets.get(idA);
    const b = this.presets.get(idB);
    if (!a || !b) throw new Error("Preset not found");
    return { a, b };
  }
}