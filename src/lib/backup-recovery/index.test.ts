import { describe, it, expect } from "vitest";
import { RECOVERY_CHECKLIST, evaluateRecovery } from "./index";

describe("backup-recovery", () => {
  it("READY when all items completed", () => {
    const r = evaluateRecovery(RECOVERY_CHECKLIST.map((c) => c.id));
    expect(r.status).toBe("READY");
    expect(r.missing).toEqual([]);
  });

  it("PARTIAL when a few missing", () => {
    const done = RECOVERY_CHECKLIST.slice(0, RECOVERY_CHECKLIST.length - 2).map((c) => c.id);
    expect(evaluateRecovery(done).status).toBe("PARTIAL");
  });

  it("NOT_READY when many missing", () => {
    expect(evaluateRecovery([]).status).toBe("NOT_READY");
  });

  it("categories cover db, restore, secrets, disaster", () => {
    const cats = new Set(RECOVERY_CHECKLIST.map((c) => c.category));
    expect(cats.has("database")).toBe(true);
    expect(cats.has("restore")).toBe(true);
    expect(cats.has("secrets")).toBe(true);
    expect(cats.has("disaster")).toBe(true);
  });
});