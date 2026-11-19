import { describe, expect, it } from "vitest";
import { formatAlertNarrative } from "./alert-narrative";
import { alertJobIds } from "./modular-alert-schedule";
import { ALERT_DISCLAIMER } from "./types";

describe("alert narrative", () => {
  it.each(alertJobIds)("adds research framing to %s", (id) => {
    const message = formatAlertNarrative(id, "Provider facts\nhttps://eaglebaba.lwill.in/astro");
    expect(message).toContain("Aaj Ka Crux: Provider facts");
    expect(message).toContain("Why It Matters:");
    expect(message).toContain("Discipline Guardrail:");
    expect(message).toContain("https://eaglebaba.lwill.in/astro");
    expect(message.endsWith(ALERT_DISCLAIMER)).toBe(true);
  });

  it("labels operator pings and suppresses trading guidance", () => {
    expect(formatAlertNarrative("navagraha", "Operator delivery check.", true))
      .toMatch(/^\[Test Dispatch\][\s\S]+No research signal was generated/);
  });

  it("keeps long messages within Telegram limits and preserves the disclaimer", () => {
    const message = formatAlertNarrative("terminal", "🧪".repeat(3100));
    expect(message.length).toBeLessThanOrEqual(4096);
    expect(message).not.toMatch(/[\uD800-\uDFFF]/u);
    expect(message.endsWith(ALERT_DISCLAIMER)).toBe(true);
  });
});
