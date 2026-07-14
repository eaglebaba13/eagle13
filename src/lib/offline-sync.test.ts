import { describe, it, expect } from "vitest";
import { collapseByScope, emptyState, enqueue, markSynced } from "./offline-sync";

describe("offline-sync", () => {
  it("enqueues ops with ids and timestamps", () => {
    const s = enqueue(emptyState(), { scope: "settings", payload: { theme: "dark" } });
    expect(s.queue).toHaveLength(1);
    expect(s.queue[0]!.id).toContain("settings:");
  });

  it("collapses to latest per scope (last-write-wins)", () => {
    let s = emptyState();
    s = enqueue(s, { scope: "settings", payload: { theme: "light" } });
    s = enqueue(s, { scope: "watchlist", payload: ["NIFTY"] });
    s = enqueue(s, { scope: "settings", payload: { theme: "dark" } });
    const c = collapseByScope(s);
    expect(c.queue).toHaveLength(2);
    const settings = c.queue.find((o) => o.scope === "settings")!;
    expect((settings.payload as { theme: string }).theme).toBe("dark");
  });

  it("marks ops synced and stamps lastSyncAt", () => {
    let s = emptyState();
    s = enqueue(s, { scope: "a", payload: 1 });
    s = enqueue(s, { scope: "b", payload: 2 });
    const idA = s.queue[0]!.id;
    const after = markSynced(s, [idA], 1_000);
    expect(after.queue).toHaveLength(1);
    expect(after.lastSyncAt).toBe(1_000);
  });
});