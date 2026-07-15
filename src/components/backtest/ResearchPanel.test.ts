import { describe, it, expect } from "vitest";
import { classifyDegradation, RESEARCH_PANEL_MARKER, RESEARCH_TABS_MARKER } from "./ResearchPanel";

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