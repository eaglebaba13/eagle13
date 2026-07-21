import { describe, it, expect } from "vitest";
import { splitBriefIntoParts, TELEGRAM_MAX_CHARS } from "./telegram-splitter";
import { DISCLAIMER_GENERAL, DISCLAIMER_CRYPTO, DISCLAIMER_DERIVATIVES } from "./disclaimers";

const REPORT_ID = "R-2025-01-15-MORNING";
const GENERATED_AT = "2025-01-15T02:45:00Z";

describe("splitBriefIntoParts", () => {
  it("returns a single part when total content fits", () => {
    const parts = splitBriefIntoParts({
      reportId: REPORT_ID,
      generatedAt: GENERATED_AT,
      sections: [
        { id: "A_HEADER", title: "Header", body: "Morning brief" },
        { id: "B_PANCHANG", title: "Panchang", body: "Tithi: Panchami" },
      ],
    });
    expect(parts).toHaveLength(1);
    expect(parts[0].seq).toBe(1);
    expect(parts[0].total).toBe(1);
    expect(parts[0].text).toContain("Morning brief");
    expect(parts[0].sectionIds).toEqual(["A_HEADER", "B_PANCHANG"]);
  });

  it("splits into ordered parts sharing reportId + generatedAt", () => {
    const big = "X".repeat(1800);
    const parts = splitBriefIntoParts({
      reportId: REPORT_ID,
      generatedAt: GENERATED_AT,
      sections: [
        { id: "A", title: "A", body: big },
        { id: "B", title: "B", body: big },
        { id: "C", title: "C", body: big },
      ],
      maxChars: 2000,
    });
    expect(parts.length).toBeGreaterThan(1);
    for (const [i, p] of parts.entries()) {
      expect(p.reportId).toBe(REPORT_ID);
      expect(p.generatedAt).toBe(GENERATED_AT);
      expect(p.seq).toBe(i + 1);
      expect(p.total).toBe(parts.length);
    }
    // Ordered: sections appear in the same order across parts.
    const flatIds = parts.flatMap((p) => p.sectionIds);
    expect(flatIds).toEqual(["A", "B", "C"]);
  });

  it("keeps every section intact — never splits mid-section", () => {
    const disclaimers = [DISCLAIMER_GENERAL, DISCLAIMER_CRYPTO, DISCLAIMER_DERIVATIVES].join("\n\n");
    const parts = splitBriefIntoParts({
      reportId: REPORT_ID,
      generatedAt: GENERATED_AT,
      sections: [
        { id: "LEVELS", title: "Levels", body: "R3 24000\nR2 23950\nR1 23900\nPP 23850\nS1 23800\nS2 23750\nS3 23700" },
        { id: "DISCLAIMER", title: "Disclaimer", body: disclaimers, protectFromTruncation: true },
      ],
      maxChars: 400,
    });
    const combined = parts.map((p) => p.text).join("\n");
    expect(combined).toContain("R3 24000");
    expect(combined).toContain("S3 23700");
    expect(combined).toContain(DISCLAIMER_GENERAL);
    expect(combined).toContain(DISCLAIMER_CRYPTO);
    expect(combined).toContain(DISCLAIMER_DERIVATIVES);
  });

  it("uses safe budget under Telegram's 4096-char hard limit", () => {
    expect(TELEGRAM_MAX_CHARS).toBeLessThan(4096);
  });

  it("returns [] on empty sections", () => {
    expect(
      splitBriefIntoParts({ reportId: REPORT_ID, generatedAt: GENERATED_AT, sections: [] }),
    ).toEqual([]);
  });
});