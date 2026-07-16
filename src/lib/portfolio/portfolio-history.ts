// Phase 22 · Stage 2 — Portfolio research history. In-memory, deterministic,
// research-only. Records every portfolio run for timeline/comparison. Never
// writes production state, never mutates a completed research result.

import type { PortfolioResearchResult } from "./portfolio-types";

export type PortfolioHistoryEntry = {
  readonly id: string;
  readonly recordedAt: string;
  readonly note: string;
  readonly result: PortfolioResearchResult;
};

export class PortfolioHistory {
  private entries: PortfolioHistoryEntry[] = [];

  record(result: PortfolioResearchResult, note = "", now: string = new Date().toISOString()): PortfolioHistoryEntry {
    const id = `H_${this.entries.length + 1}_${result.runId}`;
    const entry: PortfolioHistoryEntry = { id, recordedAt: now, note, result };
    this.entries.push(entry);
    return entry;
  }
  list(): readonly PortfolioHistoryEntry[] {
    return [...this.entries].sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));
  }
  get(id: string): PortfolioHistoryEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }
  clear(): void {
    this.entries = [];
  }
  size(): number {
    return this.entries.length;
  }
  latest(): PortfolioHistoryEntry | undefined {
    return this.entries[this.entries.length - 1];
  }
}