import { describe, it, expect } from "vitest";
import {
  cleanedCandlesToCsv,
  rejectedRowsToCsv,
  sessionSummaryToCsv,
  dqReportToJson,
  ingestExportFilename,
} from "./historical-ingest-export";
import type { ProvenanceHeader } from "./historical-ingest-export";
import type { BuildResult } from "./candle-session-builder";

const P: ProvenanceHeader = {
  source: "Zerodha",
  instrument: "NIFTY50",
  from: "2026-04-01",
  to: "2026-06-30",
  runId: "abc123",
  generatedAt: "2026-07-15T00:00:00.000Z",
};

describe("Phase 21.2 Stage 5.1 · ingest exports", () => {
  it("embeds provenance in every CSV", () => {
    const csv = cleanedCandlesToCsv([], P);
    expect(csv).toContain("ingestVersion=GANN_ABSOLUTE_INTRADAY_INGEST_V1");
    expect(csv).toContain("formulaVersion=GANN_ASTRO_INTRADAY_ABSOLUTE_V1");
    expect(csv).toContain("runId=abc123");
    expect(csv).toContain("VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION");
  });
  it("is deterministic", () => {
    expect(cleanedCandlesToCsv([], P)).toBe(cleanedCandlesToCsv([], P));
    expect(rejectedRowsToCsv([], P)).toBe(rejectedRowsToCsv([], P));
  });
  it("session summary includes rejection column", () => {
    const b: BuildResult = {
      ingestVersion: "GANN_ABSOLUTE_INTRADAY_INGEST_V1",
      formulaVersion: "GANN_ASTRO_INTRADAY_ABSOLUTE_V1",
      provider: "Zerodha", instrument: "NIFTY50",
      from: "2026-06-29", to: "2026-06-30",
      sessions: [{
        tradingDate: "2026-06-29", previousCloseDate: null, previousClose: null,
        candles: [], candlesCount: 75, hasPreviousClose: false,
        rejectionReason: "No previous-session close available",
      }],
      usable: [], rejected: [],
      generatedAt: "2026-07-15T00:00:00.000Z",
    };
    const csv = sessionSummaryToCsv(b, P);
    expect(csv).toContain("No previous-session close");
  });
  it("json report embeds ingest version", () => {
    const j = dqReportToJson(
      { totalRows: 0, validRows: 0, duplicateCount: 0, outOfOrderCount: 0, outOfWindowCount: 0,
        expectedCandlesPerSession: 75, sessionsDetected: 0, gaps: [], coveragePct: 0, causalityFailures: 0 },
      P,
    );
    expect(j).toContain("GANN_ABSOLUTE_INTRADAY_INGEST_V1");
  });
  it("filename follows convention", () => {
    expect(ingestExportFilename(P, "candles", "csv")).toBe(
      "GANN_ABSOLUTE_INTRADAY_INGEST_NIFTY50_candles_2026-04-01_2026-06-30.csv",
    );
  });
});