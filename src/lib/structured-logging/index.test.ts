import { describe, it, expect } from "vitest";
import {
  StructuredLogger,
  formatEntry,
  newAuditId,
  newCorrelationId,
  newErrorId,
  newRequestId,
} from "./index";

describe("structured-logging", () => {
  it("generates prefixed IDs", () => {
    expect(newCorrelationId(() => 0.5)).toMatch(/^cid_/);
    expect(newRequestId(() => 0.5)).toMatch(/^req_/);
    expect(newErrorId(() => 0.5)).toMatch(/^err_/);
    expect(newAuditId(() => 0.5)).toMatch(/^aud_/);
  });

  it("logger emits entries with base + call context", () => {
    const entries: any[] = [];
    const log = new StructuredLogger({ correlationId: "cid_1" }, (e) => entries.push(e));
    log.info("hello", { k: 1 }, { requestId: "req_1" });
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("info");
    expect(entries[0].context.correlationId).toBe("cid_1");
    expect(entries[0].context.requestId).toBe("req_1");
    expect(entries[0].data).toEqual({ k: 1 });
  });

  it("child inherits base context", () => {
    const entries: any[] = [];
    const root = new StructuredLogger({ correlationId: "c" }, (e) => entries.push(e));
    const child = root.child({ requestId: "r" });
    child.error("boom");
    expect(entries[0].context).toMatchObject({ correlationId: "c", requestId: "r" });
  });

  it("formatEntry produces valid JSON", () => {
    const parsed = JSON.parse(
      formatEntry({ level: "warn", message: "m", at: "t", context: {} }),
    );
    expect(parsed.level).toBe("warn");
  });
});