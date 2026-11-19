import { describe, expect, it } from "vitest";
import { sanitizeAssistantOutput } from "./ai-assistant.functions";

describe("assistant output guard", () => {
  it("blocks credentials and implementation snippets", () => {
    expect(sanitizeAssistantOutput("api_key: highly-sensitive-value")).not.toContain("highly-sensitive-value");
    expect(sanitizeAssistantOutput("function calculate() { return 42; }")).not.toContain("calculate");
  });
  it("keeps ordinary market explanations", () => {
    expect(sanitizeAssistantOutput("PCR compares put and call open interest.")).toBe("PCR compares put and call open interest.");
  });
});
