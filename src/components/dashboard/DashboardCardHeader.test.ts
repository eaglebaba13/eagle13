import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardCardHeader } from "./DashboardCardHeader";
import type { FreshnessResult } from "@/lib/data-freshness";

const fresh: FreshnessResult = {
  status: "LIVE",
  ageMs: 5_000,
  threshold: { live: 30_000, fresh: 90_000, delayed: 300_000 },
  reason: "ok",
  nextExpectedAt: Date.now() + 30_000,
  version: "DATA_FRESHNESS_V1",
};

describe("Phase 24D · DashboardCardHeader", () => {
  it("renders title and methodology badge", () => {
    const html = renderToStaticMarkup(
      createElement(DashboardCardHeader, {
        title: "Gold Silver",
        methodology: "GOLD_SILVER_RATIO_V1",
      }),
    );
    expect(html).toContain("Gold Silver");
    expect(html).toContain("GOLD_SILVER_RATIO_V1");
  });

  it("renders freshness pill when provided", () => {
    const html = renderToStaticMarkup(
      createElement(DashboardCardHeader, {
        title: "X",
        freshness: fresh,
        provider: "Yahoo",
      }),
    );
    expect(html).toContain("LIVE");
    expect(html).toContain("Yahoo");
  });

  it("collapse button exposes aria-expanded", () => {
    const html = renderToStaticMarkup(
      createElement(DashboardCardHeader, {
        title: "X",
        collapsed: false,
        onToggleCollapse: () => {},
      }),
    );
    expect(html).toContain('aria-expanded="true"');
  });

  it("locked state renders lock icon with reason", () => {
    const html = renderToStaticMarkup(
      createElement(DashboardCardHeader, {
        title: "X",
        locked: true,
        lockedReason: "Pro plan required",
      }),
    );
    expect(html).toContain("Pro plan required");
  });
});