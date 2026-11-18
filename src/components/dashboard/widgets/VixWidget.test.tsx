import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../use-dashboard-data", () => ({ useDashboardData: () => ({
  data: { vix: { livePrice: 15.5, change: 0.5, changePct: 3.33, prevDay: { close: 15, high: 16, low: 14 } } },
  marketProviderMetadata: { vix: { status: "LIVE", dataQuality: "OK", name: "Fixture", providerTime: "2026-11-16T05:00:00Z" } },
}) }));
import VixWidget from "./VixWidget";

describe("India VIX collapse preference", () => {
  it("retains a single-line quote while hiding expanded metrics", () => {
    const html = renderToStaticMarkup(createElement(VixWidget, { collapsed: true }));
    expect(html).toContain("15.50");
    expect(html).toContain("data-vix-collapsed");
    expect(html).not.toContain("Prev High");
    expect(html).not.toContain("Provider time");
    expect(renderToStaticMarkup(createElement(VixWidget))).toContain("Prev High");
  });
});
