import { describe, expect, it, vi } from "vitest";
import {
  sanitizeAssistantOutput,
  buildDomainFallbackAnswer,
  resolveAiAssistantReply,
} from "./ai-assistant.functions";

describe("assistant output guard", () => {
  it("blocks credentials and implementation snippets", () => {
    expect(sanitizeAssistantOutput("api_key: highly-sensitive-value")).not.toContain("highly-sensitive-value");
    expect(sanitizeAssistantOutput("function calculate() { return 42; }")).not.toContain("calculate");
  });

  it("keeps ordinary market explanations", () => {
    expect(sanitizeAssistantOutput("PCR compares put and call open interest.")).toBe(
      "PCR compares put and call open interest.",
    );
  });
});

describe("resolveAiAssistantReply & bilingual domain fallback", () => {
  it("uses OpenAI when OPENAI_API_KEY is configured and returns sanitized response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "WTT stands for Weak Towards Top (>= 75% shift)." } }],
      }),
    }) as unknown as typeof fetch;

    const result = await resolveAiAssistantReply({
      question: "what is wtt",
      language: "en",
      env: { OPENAI_API_KEY: "test-placeholder-key" },
      fetchImpl: fetchMock,
    });

    expect(result.provider).toBe("openai");
    expect(result.answer).toContain("Weak Towards Top");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to Gemini when OpenAI fails and GEMINI_API_KEY is configured", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "WTT means upward OI/Volume pressure." }] } }],
        }),
      }) as unknown as typeof fetch;

    const result = await resolveAiAssistantReply({
      question: "what is wtt",
      language: "en",
      env: { OPENAI_API_KEY: "test-openai", GEMINI_API_KEY: "test-gemini" },
      fetchImpl: fetchMock,
    });

    expect(result.provider).toBe("gemini");
    expect(result.answer).toContain("WTT");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns helpful bilingual EagleBABA glossary guidance when providers are unconfigured or fail", async () => {
    const enRes = await resolveAiAssistantReply({
      question: "what is wtt",
      language: "en",
      env: {},
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(enRes.provider).toBe("glossary");
    expect(enRes.answer).toContain("Weak Towards Top");
    expect(enRes.answer).not.toContain("Assistant unavailable");

    const hiRes = await resolveAiAssistantReply({
      question: "what is wtt",
      language: "hi",
      env: {},
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(hiRes.provider).toBe("glossary");
    expect(hiRes.answer).toContain("Weak Towards Top");

    const unknownRes = buildDomainFallbackAnswer("random question", "en");
    expect(unknownRes).toContain("WTT, WTB, PAZ");
  });
});
