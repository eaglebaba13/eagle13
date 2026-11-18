import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ error: false }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: undefined,
    isError: state.error,
    isPending: !state.error,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/options/oi-direction-scanner.functions", () => ({ getOiDirectionScanner: vi.fn() }));
import { OiDirectionScanner, scannerCsv } from "./OiDirectionScanner";
describe("shared OI scanner UI", () => {
  it("renders accessible controls and all required table columns without provider data", () => {
    state.error = false;
    const html = renderToStaticMarkup(createElement(OiDirectionScanner));
    for (const text of [
      "NIFTY 50",
      "BANK NIFTY",
      "MIDCPNIFTY",
      "F&amp;O stocks",
      "NET PCR",
      "CHNG. IN DIRECTION",
      "SUPPORT",
      "RESISTANCE",
      "Export CSV",
      "Research only",
      "Observation interval",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("NaN");
    expect(html).toContain('aria-label="Scrollable OI session log"');
  });
  it("keeps controls and a retryable error when the RPC fails", () => {
    state.error = true;
    const html = renderToStaticMarkup(createElement(OiDirectionScanner));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Retry / Refresh");
  });
  it("exports gaps explicitly instead of zero-valued observations", () => {
    const csv = scannerCsv([{ timestamp: "2026-11-17T03:45:00Z", row: null }]);
    expect(csv).toContain('"09:15:00","GAP"');
    expect(csv).toContain('"Coverage %"');
  });
});
