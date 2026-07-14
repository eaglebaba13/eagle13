import { describe, expect, it } from "vitest";
import { LOCAL_KEYS, scanLocalData, pendingMigrations, hasLocalData } from "./local-migration";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

describe("local-migration", () => {
  it("scans local storage for known scopes", () => {
    const s = new MemStorage();
    s.setItem(LOCAL_KEYS.journal, JSON.stringify([{ id: 1 }, { id: 2 }]));
    s.setItem(LOCAL_KEYS.watchlists, JSON.stringify({ default: ["NIFTY"] }));
    const found = scanLocalData(s, "u1");
    expect(found.map((f) => f.scope).sort()).toEqual(["journal", "watchlists"]);
    expect(found.find((f) => f.scope === "journal")?.itemCount).toBe(2);
  });

  it("hasLocalData is false when storage is empty", () => {
    expect(hasLocalData(new MemStorage(), "u1")).toBe(false);
  });

  it("ignores empty/null entries", () => {
    const s = new MemStorage();
    s.setItem(LOCAL_KEYS.journal, "[]");
    s.setItem(LOCAL_KEYS.watchlists, "{}");
    expect(scanLocalData(s, "u1")).toHaveLength(0);
  });

  it("filters out already-applied migrations", () => {
    const s = new MemStorage();
    s.setItem(LOCAL_KEYS.journal, JSON.stringify([{ id: 1 }]));
    s.setItem(LOCAL_KEYS.riskSettings, JSON.stringify({ maxRisk: 2 }));
    const scan = scanLocalData(s, "u1");
    const pending = pendingMigrations(scan, ["local:journal:u1"]);
    expect(pending.map((p) => p.scope)).toEqual(["riskSettings"]);
  });

  it("migration keys are user-scoped", () => {
    const s = new MemStorage();
    s.setItem(LOCAL_KEYS.journal, JSON.stringify([1]));
    expect(scanLocalData(s, "u1")[0].migrationKey).toBe("local:journal:u1");
    expect(scanLocalData(s, "u2")[0].migrationKey).toBe("local:journal:u2");
  });
});