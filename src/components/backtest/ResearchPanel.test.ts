import { describe, it, expect } from "vitest";
import { RESEARCH_PANEL_MARKER, RESEARCH_TABS_MARKER } from "./ResearchPanel";
import { classifyDegradation } from "./research-panel.utils";

describe("ResearchPanel · degradation classification", () => {
  it("exports lazy marker", () => {
    expect(RESEARCH_PANEL_MARKER).toBe("RESEARCH_V1_UI");
  });
  it("exports research-tabs marker", () => {
    expect(RESEARCH_TABS_MARKER).toBe("RESEARCH_TABS_V1");
  });
  it("flags insufficient data below 20 trades", () => {
    expect(classifyDegradation(0, 5)).toBe("INSUFFICIENT_DATA");
  });
  it("classifies by absolute delta thresholds", () => {
    expect(classifyDegradation(5, 100)).toBe("STABLE");
    expect(classifyDegradation(-20, 100)).toBe("MILD");
    expect(classifyDegradation(40, 100)).toBe("MATERIAL");
    expect(classifyDegradation(-80, 100)).toBe("SEVERE");
  });
});

import { afterEach, vi } from "vitest";
import { createCrossAssetExportActions } from "./research-panel.utils";
import {
  buildCrossAssetCsv,
  buildCrossAssetJson,
  CROSS_ASSET_ENGINE_VERSION,
  type CrossAssetRow,
} from "@/lib/backtest/cross-asset";

const exportRows: readonly CrossAssetRow[] = ["ASTRO", "SMC"].map((strategy) => ({
  instrument: "NIFTY50",
  timeframe: "1d",
  strategy,
  formula: "GANN_SIGN_DEGREE_TABLE_V1_1",
  regime: null,
  runId: "historical-run-unchanged",
  trades: 40,
  wins: 25,
  losses: 15,
  winRate: 62.5,
  profitFactor: 1.5,
  expectancy: 2,
  netPnl: 80,
  maxDrawdown: 10,
  recoveryFactor: 8,
  stability: 75,
  robustness: null,
  monteCarloP5: null,
  walkForwardOos: 1.5,
  sufficient: true,
}));

describe("ResearchPanel ? export action clock", () => {
  afterEach(() => vi.useRealTimers());
  it("captures action start rather than callback creation; one timestamp for all CSV rows", () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-10-10T10:00:00Z");
    const actions = createCrossAssetExportActions(exportRows, "R1", undefined);
    vi.setSystemTime("2026-10-10T10:05:00Z");
    const csv = actions.csv();
    expect(csv).toBe(
      buildCrossAssetCsv(exportRows, {
        researchRunId: "R1",
        generatedAt: "2026-10-10T10:05:00.000Z",
        engineVersion: CROSS_ASSET_ENGINE_VERSION,
      }),
    );
    expect(
      csv
        .split("\n")
        .slice(1)
        .map((row) => row.split(",")[1]),
    ).toEqual(["2026-10-10T10:05:00.000Z", "2026-10-10T10:05:00.000Z"]);
    vi.setSystemTime("2026-10-10T10:06:00Z");
    expect(actions.csv()).toBe(
      buildCrossAssetCsv(exportRows, {
        researchRunId: "R1",
        generatedAt: "2026-10-10T10:06:00.000Z",
        engineVersion: CROSS_ASSET_ENGINE_VERSION,
      }),
    );
  });
  it("separate JSON actions preserve Run IDs, engine and every numerical result", () => {
    vi.useFakeTimers();
    const actions = createCrossAssetExportActions(exportRows, "R1", undefined);
    for (const time of ["2026-10-10T10:05:00.000Z", "2026-10-10T10:06:00.000Z"]) {
      vi.setSystemTime(time);
      expect(actions.json()).toBe(
        buildCrossAssetJson(exportRows, {
          researchRunId: "R1",
          generatedAt: time,
          engineVersion: CROSS_ASSET_ENGINE_VERSION,
        }),
      );
      const output: { rows: CrossAssetRow[]; provenance: { researchRunId: string } } = JSON.parse(
        actions.json(),
      );
      expect(output.rows).toEqual(exportRows);
      expect(output.provenance.researchRunId).toBe("R1");
    }
  });
  it("recreating callbacks on tab remount does not establish a run timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-10-10T10:00:00Z");
    const firstMount = createCrossAssetExportActions(exportRows, "R1", undefined);
    vi.setSystemTime("2026-10-10T10:01:00Z");
    const remount = createCrossAssetExportActions(exportRows, "R1", undefined);
    vi.setSystemTime("2026-10-10T10:02:00Z");
    expect(remount.csv()).toBe(firstMount.csv());
    expect(remount.json()).toBe(firstMount.json());
    vi.setSystemTime("2026-10-10T10:03:00Z");
    expect(remount.json()).toBe(
      buildCrossAssetJson(exportRows, {
        researchRunId: "R1",
        generatedAt: "2026-10-10T10:03:00.000Z",
        engineVersion: CROSS_ASSET_ENGINE_VERSION,
      }),
    );
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MonteCarloSection } from "./ResearchPanel";

const renderedExportButtons = vi.hoisted(() => new Map<string, unknown>());
vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react/jsx-runtime")>();
  const capture = (...args: Parameters<typeof actual.jsx>) => {
    const [type, props] = args;
    if (
      type === "button" &&
      props &&
      typeof props === "object" &&
      "children" in props &&
      typeof props.children === "string" &&
      "onClick" in props
    ) {
      renderedExportButtons.set(props.children.trim(), props.onClick);
    }
    return actual.jsx(...args);
  };
  return { ...actual, jsx: capture, jsxs: capture };
});

describe("ResearchPanel ? mounted cross-asset export buttons", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    renderedExportButtons.clear();
  });
  it("actual CSV/JSON handlers use click time across tab remounts", async () => {
    vi.useFakeTimers();
    const downloads: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      if (!(blob instanceof Blob)) throw new Error("Expected Blob");
      downloads.push(blob);
      return "blob:test";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.stubGlobal("document", {
      createElement: () => ({ href: "", download: "", click: vi.fn() }),
    });
    const mountTab = () =>
      renderToStaticMarkup(
        createElement(MonteCarloSection, {
          walkByStrategy: {},
          rows: [],
          researchRunId: "R1",
          instrument: "NIFTY50",
          from: "2026-01-01",
          to: "2026-10-10",
          tab: "cx",
        }),
      );
    const click = (label: string) => {
      const handler = renderedExportButtons.get(label);
      if (typeof handler !== "function") throw new Error("Missing export handler: " + label);
      handler();
    };
    vi.setSystemTime("2026-10-10T10:00:00Z");
    mountTab();
    vi.setSystemTime("2026-10-10T10:05:00Z");
    click("Cross-Asset JSON");
    const first: {
      provenance: { researchRunId: string; generatedAt: string; engineVersion: string };
      rows: CrossAssetRow[];
    } = JSON.parse(await downloads[0].text());
    expect(first.provenance).toEqual({
      researchRunId: "R1",
      generatedAt: "2026-10-10T10:05:00.000Z",
      engineVersion: CROSS_ASSET_ENGINE_VERSION,
    });
    expect(first.rows).toEqual([]);
    renderedExportButtons.clear();
    vi.setSystemTime("2026-10-10T10:06:00Z");
    mountTab();
    vi.setSystemTime("2026-10-10T10:07:00Z");
    click("Cross-Asset JSON");
    const second: {
      provenance: { researchRunId: string; generatedAt: string; engineVersion: string };
      rows: CrossAssetRow[];
    } = JSON.parse(await downloads[1].text());
    expect(second.provenance).toEqual({
      researchRunId: "R1",
      generatedAt: "2026-10-10T10:07:00.000Z",
      engineVersion: CROSS_ASSET_ENGINE_VERSION,
    });
    expect(second.rows).toEqual([]);
    click("Cross-Asset CSV");
    expect(await downloads[2].text()).toBe(buildCrossAssetCsv([], second.provenance));
  });
});

vi.mock("react/jsx-dev-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react/jsx-dev-runtime")>();
  return {
    ...actual,
    jsxDEV: (...args: Parameters<typeof actual.jsxDEV>) => {
      const [type, props] = args;
      if (
        type === "button" &&
        props &&
        typeof props === "object" &&
        "children" in props &&
        typeof props.children === "string" &&
        "onClick" in props
      )
        renderedExportButtons.set(props.children.trim(), props.onClick);
      return actual.jsxDEV(...args);
    },
  };
});
